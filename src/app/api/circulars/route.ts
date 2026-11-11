// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { promises as fs } from "fs";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { createGeminiOcr, geminiOcrReaders, readingSummary, type OcrResult } from "@/lib/ingestion/geminiOcr";
import { buildPageUnits, planChunks } from "@/lib/ingestion/chunking";
import { detectHolidayListCircular } from "@/lib/holidays/circularDetection";
import { authorityForTicket, sessionActor } from "@/lib/circulars/admin/access";
import { isSameOrigin } from "@/lib/circulars/admin/api";
import { begin, Forbidden } from "@/lib/facility/authority";
import { writeAudit } from "@/lib/facility/audit";
import { IST } from "@/lib/dates";
import { createRosterProbe } from "@/lib/ingestion/schedule/rosterProbe";
import { checkRowsFor, savePageChecks } from "@/lib/search/pageChecks";
import { combineChecks, twinChecksFor } from "@/lib/ingestion/crossCheck";
import { slotChecksFor } from "@/lib/ingestion/currency";
import { applyScheduleStage, logIngest, runScheduleStage, stageDetail, type IngestKind, type IngestStatus, type ScheduleStage, type Sql } from "@/lib/ingestion/schedule/ingest";

// This route reads every page with Gemini (two models per page, a primary and a checker) plus an embedding call per ~200-word chunk, so a
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
// The Gemini page readings (a primary and a checker model per page) must be back by this time; the rest of the request is for assembling, embedding and the commit.
const OCR_STOP_AFTER_MS = 200_000;

/** A page that neither Gemini reader could read: the circular is not stored (a circular with an unread page would silently lose its content). */
class OcrUnavailableError extends Error {
  constructor(public readonly pages: Array<{ page: number; reason: string }>) {
    super(`Gemini could not read page(s) ${pages.map((p) => p.page).join(", ")}: ${pages[0]?.reason ?? ""}`);
    this.name = "OcrUnavailableError";
  }
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

   EXCEPTION: a detected employee holiday-list circular skips OCR, text
   extraction and body chunking entirely -- see the detectHolidayListCircular
   call and skipOcrAndEmbedding flag just after the headline is parsed
   below. Its page images are still rendered and stored so it displays and
   pages correctly in the Circulars Archive, and it still gets ONE
   embedding computed from its headline alone (see the TOP-LEVEL embedding
   section further down and headlineEmbeddingSearch.ts on the read side) --
   but it is never OCR'd, never chunked, and its actual body content never
   becomes searchable, because its real facts are seeded separately and far
   more reliably from a human-curated JSON file.
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
    // WHO MAY UPLOAD, decided before any file is read or any OCR is paid for: a logged-in HOD of C&IT or an active
    // delegate of the Circular manager (authority read from the database, never from the cookie). The author is the
    // SESSION's ticket: the old form field `authorTicketNo` let anyone sign a circular as any ticket, and this route
    // had no login check at all.
    if (!isSameOrigin(req.headers.get("origin"), req.headers.get("host"))) {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
    const actor = await sessionActor(dataSource);
    if (!actor) return NextResponse.json({ error: "Please sign in to upload circulars." }, { status: 401 });
    if (!(await authorityForTicket(dataSource, actor.ticket))) {
      return NextResponse.json({ error: "Only the HOD of C&IT, or an authorised delegate, can upload circulars." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawHeadline = formData.get("headline") as string;
    // Circular's own issue date, sent by the date picker as an ISO date
    // string (e.g. "2024-08-20"). This drives the year tab.
    const rawPublishedAt = formData.get("publishedAt")?.toString() || "";

    const authorTicketNo: string = actor.ticket;

    if (!rawHeadline || !file) {
      console.warn("POST /api/circulars missing headline or file");
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 },
      );
    }

    // The limits the screen shows are enforced HERE too (a direct request skips the screen): 15 MB, PDF / PNG / JPEG.
    const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 413 });
    }
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      return NextResponse.json({ error: "Unsupported file type. Upload a PDF, PNG or JPG." }, { status: 400 });
    }

    // Auto-cleaner: strips leading numbers/dots (e.g., "108. ")
    const headline = rawHeadline.replace(/^\s*\d+[\.\-\s]+/, "").trim();

    // HOLIDAY-LIST CIRCULAR DETECTION -- decided upfront, before any blob or
    // OCR work happens, not after the fact. The employee holiday-list
    // circular (as opposed to the separate contract-worker holiday/leave
    // circular) is uploaded through this same form purely so the original
    // document is visible and downloadable in the Circulars Archive -- its
    // actual holiday facts are seeded separately and far more reliably
    // from a human-curated JSON file.
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

    // A circular cannot be issued in the future, nor before 2000 (the old date picker blocked both; the server did not).
    if (publishedAt.year < 2000 || publishedAt.toISODate()! > DateTime.now().setZone(IST).toISODate()!) {
      return NextResponse.json({ error: "The circular date cannot be in the future or before the year 2000." }, { status: 400 });
    }

    // Server-stamped upload time — tamper-proof, never from the client.
    const uploadedAt = DateTime.now();

    console.log(
      `UPLOAD START: filename="${file.name}", cleaned headline="${headline}"`,
    );

    const fileBytes = Buffer.from(await file.arrayBuffer());
    // The declared type is only a claim: the first bytes must really be a PDF, a PNG or a JPEG.
    const magicOk =
      (file.type === "application/pdf" && fileBytes.subarray(0, 5).toString("latin1") === "%PDF-") ||
      (file.type === "image/png" && fileBytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
      (file.type === "image/jpeg" && fileBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
    if (!magicOk) {
      return NextResponse.json({ error: "The file content does not match its type." }, { status: 400 });
    }
    const fileUrls: string[] = [];
    let ocrAccumulatedText = "";
    // Per-page OCR text (index 0 = page 1). Used to chunk PER PAGE so each
    // stored chunk can record the page it came from, enabling the viewer to
    // jump to the matching page. ocrAccumulatedText stays for the top-level
    // circular embedding (whole-document vector), unchanged.
    const perPageText: string[] = [];

    // ROSTER CIRCULARS (a health check-up schedule): decided from the PAGES, not from the headline (see rosterProbe.ts). The pages that hold the
    // roster table are not stored as text (their text would be a second, unstructured copy of data that is stored properly as rows): the schedule is read by
    // Gemini, checked against HR and stored (see ingest.ts). Ordinary circulars never get here: every page is read exactly as before.
    const rosterProbe = createRosterProbe();

    // THE READING: every page image is read by Gemini (a primary model and, at the same time, a checker model); the primary reading is the page's text, and the numbers the
    // checker does not confirm are recorded as unconfirmed (src/lib/ingestion/geminiOcr.ts). Off for a holiday-list circular (no OCR at all).
    if (!skipOcrAndEmbedding && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Circulars are read by Gemini, and GEMINI_API_KEY is not set on the server. Nothing was saved." }, { status: 503 });
    }
    const gemOcr = skipOcrAndEmbedding ? null : createGeminiOcr({ readers: geminiOcrReaders(), deadlineAt: startedAt + OCR_STOP_AFTER_MS, concurrency: 4 });
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

      gemOcr?.start(1, fileBytes); // single-image circular == page 1
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

          if (gemOcr) {
            gemOcr.start(page, pngBuffer); // both Gemini readers begin on the page at once, while the next page is rendered
            // Is this page the roster table of a health check-up schedule? (An image check of the first pages, then, for a page that looks like one, the heading
            // row of Gemini's reading of it: see rosterProbe.ts. A failure of the check just means "an ordinary page".)
            let isRosterPage = false;
            try {
              const verdict = await rosterProbe.classify(pngBuffer, page, () => gemOcr.textOf(page));
              isRosterPage = verdict.roster;
            } catch (err) {
              console.warn(`UPLOAD: the roster check failed on page ${page} (treated as an ordinary page):`, (err as any)?.message || err);
            }
            if (rosterProbe.isRoster === false) pagePngs.length = 0; // not a roster: the images kept so far are not needed
            else pagePngs[page - 1] = pngBuffer;
            if (isRosterPage) rosterPageNumbers.push(page);
          }
        }
      } finally {
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
        // A schedule that could not be stored now keeps the circular fully searchable: its roster pages stay in the text (their Gemini reading is already there).
      }
    } else {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 },
      );
    }

    // The page texts: Gemini's primary reading of each page (the checker's where the primary failed). A page that neither could read stops the upload.
    // The pages of a roster that was stored as rows are left out of the text.
    const storedAsRows = new Set<number>(scheduleStage?.status === "ready" ? rosterPageNumbers : []);
    let ocrResult: OcrResult | null = null;
    if (gemOcr) {
      ocrResult = await gemOcr.finish();
      const failed = ocrResult.failedPages.filter((f) => !storedAsRows.has(f.page));
      if (failed.length) throw new OcrUnavailableError(failed);
      for (const [pg, text] of ocrResult.texts) if (!storedAsRows.has(pg)) perPageText[pg - 1] = text;
      ocrAccumulatedText = perPageText.filter((t) => t && t.trim()).join(" \n") + " \n";
    }
    const secondSummary = {
      enabled: !!ocrResult,
      checks: (ocrResult?.checks ?? []).filter((c) => !storedAsRows.has(c.page)),
      log: ocrResult?.log ?? null,
    };
    if (ocrResult) console.log(`UPLOAD: reading: ${readingSummary(ocrResult.log) || "no page was read"}`);

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
      // Everything STORED is embedded as a DOCUMENT (RETRIEVAL_DOCUMENT); only questions are embedded as queries. The upload
      // used the default (query) type, so a circular uploaded after the Gemini re-read of the archive sat in a different
      // vector distribution from the other 57 and its scores could not be compared with theirs.
      embedding = await generateEmbedding(headline, "search_document");
    } else if (scheduleStage?.status === "ready" && !(extractedText && extractedText.length > 20)) {
      // A schedule circular with no letter pages: its rows are stored, but it still needs one semantic signal to be findable, so, like a holiday
      // list, it gets a headline-only embedding (headlineEmbeddingSearch.ts reads it for circulars with no chunks).
      embedding = await generateEmbedding(headline, "search_document");
    } else if (extractedText && extractedText.length > 20) {
      const safeEmbeddingText =
        extractedText.length > 8192
          ? extractedText.slice(0, 8192)
          : extractedText;
      embedding = await generateEmbedding(safeEmbeddingText, "search_document");
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
        const rawVector = await generateEmbedding(c.text, "search_document"); // fatal on throw
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

          // THE AUDIT ROW, in the same transaction as the circular: both commit or neither does. begin() takes the
          // Circular manager's lock and decides the authority AGAIN now: someone withdrawn while the (long) OCR was
          // running cannot commit. (The screen used to send a separate "record-audit" request afterwards: it read a
          // response field that does not exist, so no upload was ever audited.)
          const q = async (sql: string, params?: unknown[]) => manager.query(sql, params as never[]);
          const role = await begin(q, "circular", actor);
          await writeAudit(q, "circular", actor, role, "add", {
            targetId: saved.id,
            after: { id: saved.id, headline, serialNumber: nextSerial, year, pages: fileUrls.length, chunks: preparedChunks.length },
            note: "Circular uploaded",
          });

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
    // holiday data is seeded directly from a human-curated JSON file -- a
    // review-and-approve staging step for an LLM's guess at the same data
    // added risk without adding value once that direct path existed. The
    // staging routes and the extraction module were removed (they stay in
    // git history). If this project ever needs to reconstruct a circular's
    // holiday data automatically again, start from
    // holidays/circularDetection.ts.

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
        // step 42b: an amount with a stray leading digit that the same page also states without it (the rupee sign read as a digit) is unconfirmed too
        const checkRows = checkRowsFor(combineChecks(combineChecks(secondSummary.enabled ? secondSummary.checks : [], twin), slotChecksFor(storedChunks)), storedChunks);
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

    // Saved but unreadable: no text became chunks, so search can never find it. Say so instead of a plain success.
    const unreadable = !skipOcrAndEmbedding && preparedChunks.length === 0 && rosterPageNumbers.length === 0;
    return NextResponse.json({
      message: "Circular uploaded successfully",
      ...(unreadable ? { warning: "No text could be read from this document, so search will not find it. Check the file, or upload a clearer copy." } : {}),
      circular,
      ingest,
      secondReading: secondSummary.log,
      readingLine: readingSummary(secondSummary.log),
    });
  } catch (err: any) {
    console.error(
      "Upload failed — rolling back all bytes:",
      err?.message || err,
    );
    // The DB transaction (if any) has already rolled back; remove blob bytes.
    await cleanupBlobs();
    await cleanupTempFiles();
    if (err instanceof Forbidden) {
      return NextResponse.json({ error: "Your authority to upload circulars was withdrawn. Nothing was saved." }, { status: 403 });
    }
    if (err instanceof OcrUnavailableError) {
      const why = err.pages[0]?.reason ?? "";
      const credits = /\b402\b|credits? (are )?depleted|billing/i.test(why);
      const limit = /429|quota|limit/i.test(why);
      return NextResponse.json({ error: `The circular could not be read by Gemini (page ${err.pages.map((p) => p.page).join(", ")})${credits ? ": the Gemini credits are used up, so the administrator must add credit" : limit ? ": the Gemini usage limit was reached" : ""}. Nothing was saved.${credits ? "" : " Please try again in a few minutes."}` }, { status: 503 });
    }
    // The real cause is in the log above; the browser gets a plain sentence (no internals).
    return NextResponse.json({ error: "Upload failed. Nothing was saved. Please try again." }, { status: 500 });
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
      : DateTime.now().setZone("Asia/Kolkata").year;

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
