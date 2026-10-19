// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { promises as fs } from "fs";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { createOcrWorkerPool, destroyOcrWorkerPool, ocrPageDualPass } from "@/lib/ingestion/ocr";
import { buildPageUnits, planChunks } from "@/lib/ingestion/chunking";
import { detectHolidayListCircular } from "@/lib/holidays/circularDetection";
import { createRosterProbe } from "@/lib/ingestion/schedule/rosterProbe";
import { createSecondReading, readingLine, uploadSecondReader } from "@/lib/ingestion/uploadSecondReading";
import { checkRowsFor, savePageChecks } from "@/lib/search/pageChecks";
import { combineChecks, twinChecksFor } from "@/lib/ingestion/crossCheck";
import { applyScheduleStage, logIngest, runScheduleStage, stageDetail, type IngestKind, type IngestStatus, type ScheduleStage, type Sql } from "@/lib/ingestion/schedule/ingest";

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

// ---- Time budget of a roster circular (a health check-up schedule). The schedule is read inside this same request, and these numbers keep that from
// ever costing the upload: the reading stops (status "timeout") once the request has run SCHEDULE_STOP_AFTER_MS; the roster pages are read the normal
// way afterwards only if there is clearly time for it. The circular itself is saved whatever happens to the schedule.
const SCHEDULE_STOP_AFTER_MS = 235_000;
const MAX_UPLOAD_MS = 270_000;
const FALLBACK_MS_PER_PAGE = 20_000;
const FALLBACK_RESERVE_MS = 40_000;
// The second reading (Gemini, per page, next to Tesseract) must be back by this time; the rest of the request is for assembling, embedding and the commit.
const SECOND_READING_STOP_AFTER_MS = 200_000;

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

   EXCEPTION: a detected employee holiday-list circular skips OCR, text
   extraction and body chunking entirely -- see the detectHolidayListCircular
   call and skipOcrAndEmbedding flag just after the headline is parsed
   below. Its page images are still rendered and stored so it displays and
   pages correctly in the Circulars Archive, and it still gets ONE
   embedding computed from its headline alone (see the TOP-LEVEL embedding
   section further down and headlineEmbeddingSearch.ts on the read side) --
   but it is never OCR'd, never chunked, and its actual body content never
   becomes searchable, because its real facts are seeded separately and far
   more reliably via /api/holidays/upload-and-seed.
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();
  const startedAt = Date.now();

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

    // HOLIDAY-LIST CIRCULAR DETECTION -- decided upfront, before any blob or
    // OCR work happens, not after the fact. The employee holiday-list
    // circular (as opposed to the separate contract-worker holiday/leave
    // circular) is uploaded through this same form purely so the original
    // document is visible and downloadable in the Circulars Archive -- its
    // actual holiday facts are seeded separately and far more reliably
    // through /api/holidays/upload-and-seed from a human-curated JSON file.
    // OCR-ing, chunking and embedding it here would create a second,
    // unstructured, error-prone copy of facts that already live correctly
    // in holidaymaster/holidayyear/holiday_policy_chunks -- exactly the
    // "two conflicting sources of truth" failure pattern this project spent
    // an entire session diagnosing and fixing in the executive synthesis
    // engine (see executiveSynthesis.ts's header comment). So for a
    // detected holiday-list circular, every OCR/text-extraction/embedding
    // step below is skipped -- only the page-image blobs and their
    // sequencing are saved, which is all the Archive viewer needs to
    // display and page through the original document.
    const holidayDetection = detectHolidayListCircular(headline);
    const skipOcrAndEmbedding = holidayDetection.isHolidayListCircular;
    if (skipOcrAndEmbedding) {
      console.log(
        `UPLOAD: "${headline}" detected as the employee holiday-list circular` +
          (holidayDetection.year ? ` (for ${holidayDetection.year})` : "") +
          ` -- skipping OCR/text-extraction and body chunking; saving as a display-only circular with a headline-only embedding.`,
      );
    }

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

    // ROSTER CIRCULARS (a health check-up schedule): decided from the PAGES, not from the headline (see rosterProbe.ts). The pages that hold the
    // roster table skip the slow generic OCR (their text would be a second, unstructured copy of data that is stored properly as rows) and the
    // schedule is read, checked against HR and stored (see ingest.ts). Ordinary circulars never get here: every page is read exactly as before.
    const rosterProbe = createRosterProbe();

    // SECOND READING (step 39a): a second reader (Gemini) reads each page image next to Tesseract; after the last page the two readings are reconciled and the
    // better text is what gets chunked, embedded and stored (src/lib/ingestion/uploadSecondReading.ts). Off for a holiday-list circular (no OCR at all), without
    // GEMINI_API_KEY, and with UPLOAD_SECOND_READING=false. A failure of this step never fails the upload: the page keeps the Tesseract text, as before.
    const secondReading = createSecondReading({ reader: skipOcrAndEmbedding ? null : uploadSecondReader(), deadlineAt: startedAt + SECOND_READING_STOP_AFTER_MS });
    const rosterPageNumbers: number[] = [];
    const pagePngs: Buffer[] = []; // kept only while the circular could still turn out to be a roster
    let scheduleStage: ScheduleStage | null = null;

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

      if (!skipOcrAndEmbedding) {
        try {
          secondReading.start(1, fileBytes); // the second reader looks at the same image while Tesseract works
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
      // Not created at all for a detected holiday-list circular -- nothing
      // below will use it, and spinning up Tesseract workers is real,
      // avoidable cost for a document whose text is never embedded.
      const ocrWorkers = skipOcrAndEmbedding ? null : await createOcrWorkerPool();

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

          // Is this page the roster table of a health check-up schedule? (An image check of the first pages, then one small OCR of the table's
          // headings: see rosterProbe.ts. A failure of the check just means "an ordinary page".)
          let isRosterPage = false;
          if (ocrWorkers) {
            try {
              const verdict = await rosterProbe.classify(pngBuffer, page, async (png) => {
                const r = await ocrWorkers.eng.recognize(png, {}, { text: false, tsv: true });
                return (r?.data?.tsv as string) || "";
              });
              isRosterPage = verdict.roster;
            } catch (err) {
              console.warn(`UPLOAD: the roster check failed on page ${page} (treated as an ordinary page):`, (err as any)?.message || err);
            }
            if (rosterProbe.isRoster === false) pagePngs.length = 0; // not a roster: the images kept so far are not needed
            else pagePngs[page - 1] = pngBuffer;
            if (isRosterPage) rosterPageNumbers.push(page);
          }

          if (ocrWorkers && !isRosterPage) secondReading.start(page, pngBuffer); // second reader and Tesseract work on the page at the same time
          if (ocrWorkers && !isRosterPage) {
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
        }
      } finally {
        if (ocrWorkers) await destroyOcrWorkerPool(ocrWorkers);
        await doc.destroy();
      }

      if (rosterPageNumbers.length > 0) {
        const sql: Sql = (text, params) => dataSource.query(text, params);
        scheduleStage = await runScheduleStage({ pages: pagePngs, sql, deadlineAt: startedAt + SCHEDULE_STOP_AFTER_MS });
        console.log(
          `UPLOAD: roster circular (roster pages ${rosterPageNumbers.join(",")}): schedule ${scheduleStage.status} after ${scheduleStage.seconds}s` +
            (scheduleStage.prepared ? `, ${scheduleStage.prepared.rows.length} rows` : "") +
            (scheduleStage.problems.length ? `, problems: ${scheduleStage.problems.slice(0, 3).join(" | ")}` : "") +
            (scheduleStage.error ? `, error: ${scheduleStage.error}` : ""),
        );
        if (scheduleStage.status !== "ready") {
          // The schedule could not be stored now. Keep the circular fully searchable: read its roster pages the normal way, if clearly there is time.
          const timeLeft = startedAt + MAX_UPLOAD_MS - Date.now();
          if (timeLeft > rosterPageNumbers.length * FALLBACK_MS_PER_PAGE + FALLBACK_RESERVE_MS) {
            const fallbackWorkers = await createOcrWorkerPool();
            try {
              for (const pn of rosterPageNumbers) {
                try {
                  const text = await ocrPageDualPass(pagePngs[pn - 1], `page ${pn}`, fallbackWorkers);
                  ocrAccumulatedText += text + " \n";
                  perPageText[pn - 1] = text;
                } catch (err) {
                  console.error(`OCR failed on roster page ${pn}:`, err);
                }
              }
            } finally {
              await destroyOcrWorkerPool(fallbackWorkers);
            }
          } else {
            console.warn("UPLOAD: no time left to read the roster pages the normal way; the schedule can be read afterwards with scripts/import-health-checkups.ts");
          }
        }
      }
    } else {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 },
      );
    }

    // The pages the second reader read take its text where it is the better one; the assembled text is rebuilt from the pages (it feeds the circular's own vector).
    const secondSummary = await secondReading.finish(perPageText);
    if (secondSummary.changedPages > 0) ocrAccumulatedText = perPageText.filter((t) => t && t.trim()).join(" \n") + " \n";
    if (secondSummary.enabled) console.log(`UPLOAD: second reading: ${readingLine(secondSummary.log) || "no page was read"}`);

    /* ============================
       TEXT extraction -- skipped entirely for a detected holiday-list
       circular (see the detection block above for why).
    ============================ */
    let extractedText = skipOcrAndEmbedding ? "" : await extractTextFromPDF(fileBytes);

    if (!skipOcrAndEmbedding) {
      if (!extractedText || extractedText.trim().length < 50) {
        console.log(
          "DEBUG: Standard extraction yielded little text. Using OCR text instead.",
        );
        extractedText = ocrAccumulatedText;
      } else if (ocrAccumulatedText.length > extractedText.length) {
        extractedText = ocrAccumulatedText;
      }
      extractedText = (extractedText || "").replace(/\s+/g, " ").trim();
    }
    console.log("DEBUG: Final extractedText length =", extractedText?.length);

    /* ============================
       TOP-LEVEL embedding (fatal if it throws — a circular that is not
       searchable must not be saved as a success).

       For a detected holiday-list circular, this is a HEADLINE-ONLY
       embedding, not a body embedding -- deliberately narrow. Body
       OCR/chunking is skipped entirely for these (see the detection block
       above), so without this, such a circular would have ZERO semantic-
       similarity signal at all -- findable only by an exact headline
       substring match (executeTitleSearch), never by a query that means
       the same thing without sharing its words. A headline embedding is
       cheap (one short string, no OCR) and gives it that one semantic
       signal without ever re-introducing the unreliable OCR'd table/body
       content this whole change exists to keep out of general search. See
       src/lib/search/headlineEmbeddingSearch.ts for the read side that
       actually uses this.
    ============================ */
    let embedding: number[] | null = null;
    if (skipOcrAndEmbedding) {
      embedding = await generateEmbedding(headline);
    } else if (scheduleStage?.status === "ready" && !(extractedText && extractedText.length > 20)) {
      // A schedule circular with no letter pages: its rows are stored, but it still needs one semantic signal to be findable, so, like a holiday
      // list, it gets a headline-only embedding (headlineEmbeddingSearch.ts reads it for circulars with no chunks).
      embedding = await generateEmbedding(headline);
    } else if (extractedText && extractedText.length > 20) {
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
       Skipped entirely for a detected holiday-list circular -- preparedChunks
       stays empty, so the circular row is saved with zero circular_chunks
       rows (display-only).
    ============================ */
    type PreparedChunk = {
      index: number;
      page: number; // 1-based page this chunk came from (0 if unknown)
      text: string;
      embedding: string;
    };
    const preparedChunks: PreparedChunk[] = [];

    if (!skipOcrAndEmbedding) {
      // Same chunking as the archive re-read tool: see src/lib/ingestion/chunking.ts
      for (const c of planChunks(buildPageUnits(perPageText, extractedText))) {
        const rawVector = await generateEmbedding(c.text); // fatal on throw
        preparedChunks.push({
          index: c.index,
          page: c.page,
          text: c.text,
          embedding: `[${rawVector.join(",")}]`,
        });
      }
      console.log("DEBUG: Prepared", preparedChunks.length, "chunk embeddings");
    }

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

    // NOTE: this used to run a post-commit "holiday-list detection +
    // extraction" job here -- staging an LLM-generated draft of the
    // circular's holidays for human review. That facility has been removed:
    // holiday-list circulars are now caught upfront (see skipOcrAndEmbedding
    // above) and never OCR'd/embedded in the first place, and the real
    // holiday data is seeded directly from a human-curated JSON file via
    // /api/holidays/upload-and-seed -- a review-and-approve staging step for
    // an LLM's guess at the same data added risk without adding value once
    // that direct path existed. If this project ever needs to reconstruct a
    // circular's holiday data automatically again, start from
    // holidays/circularDetection.ts and holidays/extraction.ts, both still
    // present but unused.

    // ---- What the backend decided about this circular: store its schedule if it is a roster circular, and write the decision to the log.
    // The circular is already committed: nothing in this block can make the upload fail.
    let ingest: { kind: IngestKind; status: IngestStatus } = { kind: holidayDetection.isHolidayListCircular ? "holiday-list" : "general", status: "saved" };
    try {
      const sql: Sql = (text, params) => dataSource.query(text, params);
      let detail: Record<string, unknown> = { pages: fileUrls.length, chunks: preparedChunks.length };
      {
        // step 42a: the pages of a circular that say the same thing in English, Hindi and Bengali check each other: a number two pages agree on is
        // confirmed, a reading another page contradicts is unconfirmed (src/lib/ingestion/crossCheck.ts). Free and offline, so it protects the circular
        // even when the second reader is off or failed. It is merged with the second reading's checks, which are stored with the fingerprint of the
        // text that was really stored.
        const storedChunks = preparedChunks.map((c) => ({ page: c.page, index: c.index, text: c.text }));
        // what the second reading decided, page by page, goes to the log
        if (secondSummary.enabled) detail = { ...detail, secondReading: secondSummary.log };
        const twin = twinChecksFor(storedChunks);
        if (twin.length) detail = { ...detail, twinPages: twin.length };
        const checkRows = checkRowsFor(combineChecks(secondSummary.enabled ? secondSummary.checks : [], twin), storedChunks);
        if (secondSummary.enabled || checkRows.length) detail.pageChecksSaved = await savePageChecks(sql, circular.id, checkRows);
      }
      if (scheduleStage) {
        const stage: ScheduleStage = scheduleStage;
        let status: IngestStatus = stage.status === "ready" ? "applied" : stage.status;
        detail = { ...detail, ...stageDetail(stage, rosterPageNumbers) };
        if (stage.status === "ready") {
          try {
            const stored = await applyScheduleStage((fn) => dataSource.transaction((manager) => fn((text, params) => manager.query(text, params))), circular.id, stage);
            detail.stored = stored.stored;
          } catch (e: any) {
            status = "failed";
            detail.error = String(e?.message || e).split("\n")[0];
            console.error("UPLOAD: the schedule could not be stored (the circular is saved; run scripts/import-health-checkups.ts):", e?.message || e);
          }
        }
        ingest = { kind: "health-schedule", status };
      }
      await logIngest(sql, circular.id, ingest.kind, ingest.status, detail);
    } catch (e: any) {
      console.error("UPLOAD: the schedule/log step failed (the circular itself is saved):", e?.message || e);
    }

    await cleanupTempFiles();

    return NextResponse.json({
      message: "Circular uploaded successfully",
      circular,
      ingest,
      secondReading: secondSummary.log,
      readingLine: readingLine(secondSummary.log),
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
