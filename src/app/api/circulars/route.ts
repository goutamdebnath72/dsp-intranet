// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { promises as fs } from "fs";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import Tesseract from "tesseract.js";
import { detectHolidayListCircular } from "@/lib/holidays/circularDetection";
import { extractHolidaysFromCircular } from "@/lib/holidays/extraction";
import { HolidayExtractionStaging } from "@/lib/db/models/holiday-extraction-staging.model";

// This route does two full Tesseract OCR passes PER PAGE (English, then
// Hindi+English+Bengali) plus an embedding call per ~200-word chunk, so a
// multi-page circular can easily take well past Vercel's default function
// duration. CONFIRMED: 300 seconds is a hard platform ceiling on the Hobby
// plan -- Vercel's own dashboard rejects any value above it outright
// ("Max duration for Hobby projects must be between 1 and 300. Upgrade to
// Pro."). A background/async architecture (QStash) was tried to work
// around this ceiling entirely, but was reverted -- the added complexity
// (a second route, a callback URL, deployment-protection interactions,
// local dev needing a public tunnel) didn't end up solving the actual
// problem for documents that genuinely exceed 300s, so this is back to the
// simpler synchronous version. Documents that fit within 300s (the common
// case) work fine; a document that doesn't will fail with a clear error
// rather than a silent background job that can be misleading about status.
export const maxDuration = 300;

const OCR_LANGS = ["eng", "hin+eng+ben"] as const;
type OcrWorkerPool = Record<(typeof OCR_LANGS)[number], any>;

/** Create both language workers ONCE per upload, reused across every page
 *  of a document -- a fresh worker per page/pass measurably added tens of
 *  seconds on multi-page documents. */
async function createOcrWorkerPool(): Promise<OcrWorkerPool> {
  const pool = {} as OcrWorkerPool;
  for (const langs of OCR_LANGS) {
    const worker = await Tesseract.createWorker(langs);
    // PSM 3 = fully automatic page segmentation (the value the CLI uses).
    await worker.setParameters({ tessedit_pageseg_mode: "3" as any });
    pool[langs] = worker;
  }
  return pool;
}

async function destroyOcrWorkerPool(pool: OcrWorkerPool) {
  await Promise.all(
    OCR_LANGS.map((langs) => pool[langs]?.terminate().catch(() => {})),
  );
}

/* ============================================================
   Dual-pass OCR for one page/image.

   Two hard-won facts drove this:
   1) tesseract.js's DEFAULT page-seg mode differs from the tesseract CLI and
      mangles dense tables — it silently drops values like "20995.30". We must
      set PSM 3 (fully automatic) EXPLICITLY; the old Tesseract.recognize(buf,
      langs) call could not set it, which is why those values were lost.
   2) Running hin+eng+ben on an ENGLISH page corrupts Latin alphanumerics —
      the Devanagari/Bengali models hallucinate on codes, so a policy number
      like "0315054224P110856231" came out garbled. An eng-only pass reads it
      cleanly.

   So each page is OCR'd twice at PSM 3 — once "eng" (clean Latin codes/
   numbers), once "hin+eng+ben" (Indic content) — and both texts are kept.
   Slower, but every script and every code survives. Display/search dedupe
   downstream; recall is what matters here.
============================================================ */
async function ocrPageDualPass(
  input: Buffer | Uint8Array,
  label: string,
  workers: OcrWorkerPool,
): Promise<string> {
  let combined = "";
  for (const langs of OCR_LANGS) {
    try {
      const worker = workers[langs];
      const {
        data: { text },
      } = await worker.recognize(input);
      combined += (text || "") + "\n";
    } catch (err) {
      console.error(
        `OCR pass "${langs}" failed${label ? " on " + label : ""}:`,
        (err as any)?.message || err,
      );
    }
  }
  return combined;
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tempPdfPath = `/tmp/circular_${Date.now()}.pdf`;
  const safeUnlink = async () => {
    try {
      await fs.unlink(tempPdfPath);
    } catch {}
  };

  try {
    await fs.writeFile(tempPdfPath, buffer);
  } catch {}

  try {
    const pdfToTextModule: any = await import("pdf-to-text");
    const pdfToTextFn: any =
      pdfToTextModule?.pdfToText ?? pdfToTextModule?.default ?? pdfToTextModule;
    if (typeof pdfToTextFn === "function") {
      const rawText: string = await new Promise((resolve, reject) => {
        pdfToTextFn(tempPdfPath, null, (err: any, data: string) => {
          if (err) return reject(err);
          resolve(data ?? "");
        });
      });
      const cleaned = (rawText || "").replace(/\s+/g, " ").trim();
      if (cleaned.length > 20) {
        await safeUnlink();
        return cleaned;
      }
    }
  } catch (e) {
    console.warn("pdf-to-text extraction failed:", (e as any)?.message || e);
  }

  try {
    const pdfParseModule: any = await import("pdf-parse");
    const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
    if (typeof parseFn === "function") {
      const parsed: any = await parseFn(buffer);
      const text = (parsed?.text || "").replace(/\s+/g, " ").trim();
      await safeUnlink();
      return text;
    }
  } catch (e) {
    console.warn("pdf-parse fallback failed:", (e as any)?.message || e);
  }

  await safeUnlink();
  return "";
}

/* ============================================================
   POST: Upload a circular (pdf-to-img + Trilingual OCR + Vectors)
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();

  // Every blob byte written this request, for compensating cleanup on failure.
  const uploadedBlobUrls: string[] = [];
  // Temp files on disk to remove regardless of outcome.
  const tempFiles: string[] = [];

  const cleanupTempFiles = async () => {
    await Promise.all(tempFiles.map((p) => fs.unlink(p).catch(() => {})));
  };

  const cleanupBlobs = async () => {
    if (uploadedBlobUrls.length === 0) return;
    try {
      await del(uploadedBlobUrls); // accepts one URL or an array
      console.log(
        `ROLLBACK: deleted ${uploadedBlobUrls.length} orphan blob(s).`,
      );
    } catch (e: any) {
      console.error(
        "ROLLBACK WARNING: failed to delete some blobs:",
        e?.message || e,
        uploadedBlobUrls,
      );
    }
  };

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawHeadline = formData.get("headline") as string;
    // Circular's own issue date, sent by the date picker as an ISO date
    // string (e.g. "2024-08-20"). This drives the year tab.
    const rawPublishedAt = formData.get("publishedAt")?.toString() || "";

    // Safely cast to string or undefined to satisfy TypeORM
    const authorTicketNo =
      formData.get("authorTicketNo")?.toString() || undefined;

    if (!rawHeadline || !file) {
      console.warn("POST /api/circulars missing headline or file");
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 },
      );
    }

    // Auto-cleaner: strips leading numbers/dots (e.g., "108. ")
    const headline = rawHeadline.replace(/^\s*\d+[\.\-\s]+/, "").trim();

    // publishedAt is REQUIRED and comes only from the picker — no more
    // guessing the year from the headline. Reject if missing or unparseable.
    if (!rawPublishedAt) {
      return NextResponse.json(
        { error: "Missing circular date" },
        { status: 400 },
      );
    }
    const publishedAt = DateTime.fromISO(rawPublishedAt);
    if (!publishedAt.isValid) {
      return NextResponse.json(
        { error: "Invalid circular date" },
        { status: 400 },
      );
    }

    // Server-stamped upload time — tamper-proof, never from the client.
    const uploadedAt = DateTime.now();

    console.log(
      `UPLOAD START: filename="${file.name}", cleaned headline="${headline}"`,
    );

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const fileUrls: string[] = [];
    let ocrAccumulatedText = "";
    // Per-page OCR text (index 0 = page 1). Used to chunk PER PAGE so each
    // stored chunk can record the page it came from, enabling the viewer to
    // jump to the matching page. ocrAccumulatedText stays for the top-level
    // circular embedding (whole-document vector), unchanged.
    const perPageText: string[] = [];

    /* ============================================================
       PHASE A — persist blobs + run every fallible step. Any throw
       here jumps to the catch, which deletes all tracked blobs. No DB
       row exists yet, so a failure leaves ZERO database trace.
    ============================================================ */

    /* IMAGE HANDLING */
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, fileBytes, {
        access: "public",
        contentType: file.type,
      });
      uploadedBlobUrls.push(url);
      fileUrls.push(url);

      try {
        console.log("DEBUG: Running dual-pass OCR (PSM 3) on image...");
        const ocrWorkers = await createOcrWorkerPool();
        try {
          const text = await ocrPageDualPass(fileBytes, "image", ocrWorkers);
          ocrAccumulatedText += text + " ";
          perPageText[0] = text; // single-image circular == page 1
        } finally {
          await destroyOcrWorkerPool(ocrWorkers);
        }
      } catch (err) {
        console.error("OCR failed on image:", err);
      }
    } else if (file.type === "application/pdf") {
      /* PDF via pdf-to-img (pure JS/WASM, built on pdfjs-dist — no
         GraphicsMagick/ImageMagick binary required). scale = 300/72
         reproduces ~300dpi output and preserves each page's real aspect
         ratio. */
      const PDF_RENDER_SCALE = 300 / 72;
      const { pdf: renderPdfToImages } = await import("pdf-to-img");
      const doc = await renderPdfToImages(fileBytes, {
        scale: PDF_RENDER_SCALE,
        format: "png",
      });

      const pdfParseModule: any = await import("pdf-parse");
      const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
      const parsed: any = await parseFn(fileBytes);
      const numPages = parsed.numpages || doc.length || 1;

      // Created ONCE for the whole document, not per page -- see
      // createOcrWorkerPool's comment for why this matters for duration.
      const ocrWorkers = await createOcrWorkerPool();

      try {
        for (let page = 1; page <= numPages; page++) {
          const pngBuffer = await doc.getPage(page);
          const key = `circulars/${Date.now()}_page_${page}.png`;
          const { url } = await put(key, pngBuffer, {
            access: "public",
            contentType: "image/png",
          });
          uploadedBlobUrls.push(url);
          fileUrls.push(url);

          try {
            console.log(
              `DEBUG: Running dual-pass OCR (PSM 3) on PDF page ${page}...`,
            );
            const text = await ocrPageDualPass(
              pngBuffer,
              `page ${page}`,
              ocrWorkers,
            );
            ocrAccumulatedText += text + " \n";
            perPageText[page - 1] = text; // page is 1-based; store 0-based
          } catch (err) {
            console.error(`OCR failed on page ${page}:`, err);
          }
        }
      } finally {
        await destroyOcrWorkerPool(ocrWorkers);
        await doc.destroy();
      }
    } else {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 },
      );
    }

    /* ============================
       TEXT extraction
    ============================ */
    let extractedText = await extractTextFromPDF(fileBytes);

    if (!extractedText || extractedText.trim().length < 50) {
      console.log(
        "DEBUG: Standard extraction yielded little text. Using OCR text instead.",
      );
      extractedText = ocrAccumulatedText;
    } else if (ocrAccumulatedText.length > extractedText.length) {
      extractedText = ocrAccumulatedText;
    }

    extractedText = (extractedText || "").replace(/\s+/g, " ").trim();
    console.log("DEBUG: Final extractedText length =", extractedText?.length);

    /* ============================
       TOP-LEVEL embedding (fatal if it throws — a circular that is not
       searchable must not be saved as a success).
    ============================ */
    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      const safeEmbeddingText =
        extractedText.length > 8192
          ? extractedText.slice(0, 8192)
          : extractedText;
      embedding = await generateEmbedding(safeEmbeddingText);
    }

    /* ============================
       ALL CHUNK embeddings, computed BEFORE any DB write. A failure to
       embed ANY chunk aborts the whole upload — we never store a
       null-embedding (unsearchable) chunk and then report success.
    ============================ */
    type PreparedChunk = {
      index: number;
      page: number; // 1-based page this chunk came from (0 if unknown)
      text: string;
      embedding: string;
    };
    const preparedChunks: PreparedChunk[] = [];

    const chunkSize = 200;
    let chunkIndex = 0;

    // Build the list of (page, pageText) to chunk. Prefer per-page OCR text so
    // each chunk keeps its page number. If no per-page text exists (e.g. a
    // born-digital PDF whose text came from extractTextFromPDF, not OCR), fall
    // back to the whole document as a single page-less unit (page 0).
    const pageUnits: Array<{ page: number; text: string }> = [];
    const havePageText = perPageText.some((t) => t && t.trim().length > 0);
    if (havePageText) {
      for (let pi = 0; pi < perPageText.length; pi++) {
        const t = (perPageText[pi] || "").replace(/\s+/g, " ").trim();
        if (t.length > 0) pageUnits.push({ page: pi + 1, text: t });
      }
    } else if (extractedText && extractedText.length > 0) {
      pageUnits.push({ page: 0, text: extractedText });
    }

    for (const unit of pageUnits) {
      const words = unit.text.split(/\s+/);
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");
        if (!chunkText.trim()) continue;
        const rawVector = await generateEmbedding(chunkText); // fatal on throw
        preparedChunks.push({
          index: chunkIndex,
          page: unit.page,
          text: chunkText,
          embedding: `[${rawVector.join(",")}]`,
        });
        chunkIndex++;
      }
    }
    console.log("DEBUG: Prepared", preparedChunks.length, "chunk embeddings");

    const vectorLiteral = embedding ? `[${embedding.join(",")}]` : null;

    /* ============================================================
       PHASE B — single transaction: row + chunks + vector column.
       Serial is assigned MAX+1 per YEAR under a transaction-scoped
       advisory lock; a unique index on (year, serialNumber) is the final
       guard. On a unique collision the WHOLE transaction is retried, so
       row+chunks+vector always commit together or not at all.
    ============================================================ */
    const year = publishedAt.year;

    const isUniqueViolation = (e: any) =>
      e?.code === "23505" ||
      /duplicate key value|unique constraint/i.test(e?.message || "");

    let circular: Circular | null = null;
    const MAX_ATTEMPTS = 5;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        circular = await dataSource.transaction(async (manager) => {
          // Serialize concurrent uploads for the SAME year; also covers the
          // empty-year case (no rows to lock yet).
          await manager.query(`SELECT pg_advisory_xact_lock($1)`, [year]);

          const rows: Array<{ max: number | null }> = await manager.query(
            `
              SELECT MAX("serialNumber") AS max
              FROM public.circulars
              WHERE EXTRACT(YEAR FROM "publishedAt") = $1
            `,
            [year],
          );
          const nextSerial = (rows?.[0]?.max ?? 0) + 1;

          const repo = manager.getRepository<Circular>("Circular");
          const newCircular = repo.create({
            headline,
            fileUrls,
            embedding,
            publishedAt,
            uploadedAt,
            serialNumber: nextSerial,
            authorTicketNo, // strictly string | undefined
          });
          const saved = await repo.save(newCircular);

          // Insert every chunk in the SAME transaction.
          for (const c of preparedChunks) {
            await manager.query(
              `
                INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding)
                VALUES ($1, $2, $3, $4, $5)
              `,
              [saved.id, c.index, c.page, c.text, c.embedding],
            );
          }

          // Set the top-level vector column in the SAME transaction, using an
          // explicit ::vector cast (this is what saveEmbeddingToVectorTable
          // used to do post-commit; folded in so it is atomic too).
          if (vectorLiteral) {
            await manager.query(
              `UPDATE public.circulars SET embedding = $1::vector WHERE id = $2`,
              [vectorLiteral, saved.id],
            );
          }

          return saved;
        });
        break; // committed
      } catch (e: any) {
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) {
          console.warn(
            `Serial collision for year ${year}, retry ${attempt}/${MAX_ATTEMPTS}`,
          );
          continue; // whole transaction rolled back; recompute serial + retry
        }
        throw e; // -> outer catch -> blob cleanup
      }
    }

    if (!circular) {
      throw new Error("Failed to assign a serial number after retries");
    }

    console.log(
      "DEBUG: Committed circular id =",
      circular.id,
      "serial =",
      circular.serialNumber,
      "chunks =",
      preparedChunks.length,
    );

    // ============================================================
    // ADDITIONAL JOB — holiday-list detection + extraction. Runs strictly
    // AFTER the circular itself has committed successfully, and is wrapped
    // so nothing here can ever fail or delay a normal circular upload -- a
    // bug in this block must never become an upload-breaking bug. This
    // ONLY stages the extracted data (holiday_extraction_staging) for an
    // admin to review -- it deliberately never writes to
    // holidaymaster/holidayyear directly. See extraction.ts's header
    // comment for why (LLM output feeding a database real employees' leave
    // calculations depend on).
    // ============================================================
    try {
      const detection = detectHolidayListCircular(headline);
      if (detection.isHolidayListCircular) {
        if (detection.year) {
          console.log(
            `HOLIDAY DETECTION: circular id=${circular.id} ("${headline}") ` +
              `recognized as the employee holiday-list circular for ${detection.year}. ` +
              `Running extraction...`,
          );
          const payload = await extractHolidaysFromCircular(detection.year, perPageText);
          const stagingRepo = (await getDb()).getRepository(HolidayExtractionStaging);
          const staged = stagingRepo.create({
            circularId: circular.id,
            year: detection.year,
            status: "pending",
            payload,
            createdAt: new Date(),
          });
          await stagingRepo.save(staged);
          console.log(
            `HOLIDAY EXTRACTION: staged id=${staged.id} for year ${detection.year} -- ` +
              `${payload.holidays.length} holidays (` +
              `${payload.holidays.filter((h) => h.isNewMaster).length} new masters), ` +
              `${payload.rhQuota.length} RH quota rows. Awaiting admin review -- ` +
              `no holidaymaster/holidayyear write has happened.`,
          );
        } else {
          console.warn(
            `HOLIDAY DETECTION: circular id=${circular.id} ("${headline}") ` +
              `matched the holiday-list pattern but no target year could be ` +
              `parsed from the headline -- skipping, nothing acted on.`,
          );
        }
      }
    } catch (e) {
      console.warn(
        "HOLIDAY DETECTION/EXTRACTION: non-fatal error, circular upload unaffected:",
        (e as any)?.message ?? e,
      );
    }

    await cleanupTempFiles();

    return NextResponse.json({
      message: "Circular uploaded successfully",
      circular,
    });
  } catch (err: any) {
    console.error(
      "Upload failed — rolling back all bytes:",
      err?.message || err,
    );
    // The DB transaction (if any) has already rolled back; remove blob bytes.
    await cleanupBlobs();
    await cleanupTempFiles();
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 },
    );
  }
}

/* ============================================================
   GET: Fetch circulars, scoped by year.

   Fetches only the requested year's circulars instead of every circular
   from every year in one request -- with ~500 circulars/year in practice,
   fetching everything only gets slower and heavier every year the archive
   grows. This part is unrelated to the sync/async upload question and was
   kept as-is.

   Two modes:
   - ?meta=years  -> just the distinct years that have circulars, cheap and
     rarely-changing, used to render the year-tab selector without pulling
     any circular rows at all.
   - ?year=YYYY   -> only that year's circulars (the normal case).
   No params defaults to the current calendar year.
============================================================ */
export async function GET(req: Request) {
  const dataSource = await getDb();
  const { searchParams } = new URL(req.url);

  try {
    if (searchParams.get("meta") === "years") {
      const rows: Array<{ year: string }> = await dataSource.query(`
        SELECT DISTINCT EXTRACT(YEAR FROM "publishedAt")::int::text AS year
        FROM public.circulars
        WHERE "publishedAt" IS NOT NULL
        ORDER BY year DESC
      `);
      return NextResponse.json(rows.map((r) => r.year));
    }

    const yearParam = searchParams.get("year");
    const year = yearParam
      ? Number.parseInt(yearParam, 10)
      : new Date().getFullYear();

    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const circulars = await dataSource.query(
      `
        SELECT
          id,
          headline,
          "fileUrls",
          "publishedAt",
          "uploadedAt",
          "serialNumber",
          "authorTicketNo"
        FROM public.circulars
        WHERE EXTRACT(YEAR FROM "publishedAt") = $1
        ORDER BY "serialNumber" DESC, id DESC
      `,
      [year],
    );

    return NextResponse.json(circulars);
  } catch (err: any) {
    console.error("GET circulars failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch circulars" },
      { status: 500 },
    );
  }
}
