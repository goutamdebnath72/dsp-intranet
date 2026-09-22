// src/app/api/circulars/process/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { promises as fs } from "fs";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import Tesseract from "tesseract.js";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

// This route does two full Tesseract OCR passes PER PAGE (English, then
// Hindi+English+Bengali) plus an embedding call per ~200-word chunk, so a
// multi-page circular can easily take well past a short default duration.
// CONFIRMED (not assumed): 300 seconds is a hard platform ceiling on the
// Hobby plan -- Vercel's own dashboard rejects any value above it outright
// ("Max duration for Hobby projects must be between 1 and 300. Upgrade to
// Pro."). This route runs as its own decoupled invocation (triggered by
// QStash, not the original upload request), so hitting this ceiling no
// longer produces a 504 in the user's browser -- it just means THIS
// specific job needs to finish its work within 300s, same as before, but
// with none of the client-facing consequences.
export const maxDuration = 300;

const OCR_LANGS = ["eng", "hin+eng+ben"] as const;
type OcrWorkerPool = Record<(typeof OCR_LANGS)[number], any>;

/** Create both language workers ONCE per invocation, reused across every
 *  page of a document -- see the original route's history for why this
 *  matters (a fresh worker per page/pass measurably added tens of seconds
 *  on multi-page documents). */
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

   This dual-pass design is UNCHANGED by the async rewrite — only where and
   when it runs changed, not what it does or how accurate it is.
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

/** A short, explicit, reviewable list of error signatures worth QStash
 *  automatically retrying — connection-level and rate-limit issues that
 *  are very likely to succeed on a subsequent attempt. Everything else
 *  (a corrupt/unreadable PDF, OCR structurally failing, an unsupported
 *  file that slipped through) is treated as permanent: retrying it would
 *  never succeed no matter how many times QStash tried, so it would only
 *  waste compute and leave the circular stuck at "processing" for longer
 *  with no benefit. QStash's own retry count is bounded regardless, so an
 *  imperfect classification here cannot cause a runaway retry storm. */
function isRetryableError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = (err && (err.code as string)) || "";
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(code))
    return true;
  if (/rate limit|too many requests|\b429\b|\b503\b|temporarily unavailable/.test(msg))
    return true;
  if (/connection terminated|connection timeout|pool is draining|econnreset/.test(msg))
    return true;
  return false;
}

type ProcessPayload = {
  circularId: number;
  rawBlobUrl: string;
  fileType: string;
  fileName: string;
};

async function handler(req: Request): Promise<Response> {
  const dataSource = await getDb();
  const body = (await req.json()) as ProcessPayload;
  const { circularId, rawBlobUrl, fileType } = body;

  const repo = dataSource.getRepository<Circular>("Circular");
  const existing = await repo.findOne({ where: { id: circularId } });

  if (!existing) {
    // Row is gone (e.g. deleted before the job ran) -- nothing to do, and
    // this is not something retrying will ever fix.
    console.warn(`process: circular ${circularId} no longer exists, skipping.`);
    return NextResponse.json({ skipped: true });
  }

  if (existing.status !== "processing") {
    // Idempotency guard: QStash is at-least-once delivery, so this handler
    // can run more than once for the same job. If a previous delivery
    // already finished (ready or failed), this is a no-op, not a redo.
    console.log(
      `process: circular ${circularId} already status=${existing.status}, skipping.`,
    );
    return NextResponse.json({ skipped: true, status: existing.status });
  }

  // Per-page rendered images uploaded THIS invocation, for compensating
  // cleanup if this specific attempt fails. The original raw upload
  // (rawBlobUrl) is never touched here -- it stays as the circular's
  // fileUrls[0] fallback regardless of outcome.
  const uploadedBlobUrls: string[] = [];
  const cleanupBlobs = async () => {
    if (uploadedBlobUrls.length === 0) return;
    await del(uploadedBlobUrls).catch((e) =>
      console.error("process: blob cleanup failed:", e?.message || e),
    );
  };

  try {
    const fileBytes = Buffer.from(
      await (await fetch(rawBlobUrl)).arrayBuffer(),
    );
    const fileUrls: string[] = [];
    let ocrAccumulatedText = "";
    const perPageText: string[] = [];

    if (fileType.startsWith("image/")) {
      // The single image already lives at rawBlobUrl -- no need to
      // re-upload it a second time.
      fileUrls.push(rawBlobUrl);
      try {
        console.log(`process ${circularId}: running dual-pass OCR on image...`);
        const ocrWorkers = await createOcrWorkerPool();
        try {
          const text = await ocrPageDualPass(fileBytes, "image", ocrWorkers);
          ocrAccumulatedText += text + " ";
          perPageText[0] = text;
        } finally {
          await destroyOcrWorkerPool(ocrWorkers);
        }
      } catch (err) {
        console.error("OCR failed on image:", err);
      }
    } else if (fileType === "application/pdf") {
      // scale = 300/72 reproduces ~300dpi output while preserving each
      // page's real aspect ratio (see route history for why this replaced
      // the old pdf2pic/GraphicsMagick approach).
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
              `process ${circularId}: running dual-pass OCR on page ${page}...`,
            );
            const text = await ocrPageDualPass(
              pngBuffer,
              `page ${page}`,
              ocrWorkers,
            );
            ocrAccumulatedText += text + " \n";
            perPageText[page - 1] = text;
          } catch (err) {
            console.error(`OCR failed on page ${page}:`, err);
          }
        }
      } finally {
        await destroyOcrWorkerPool(ocrWorkers);
        await doc.destroy();
      }
    } else {
      throw new Error(`Unsupported file type reached process route: ${fileType}`);
    }

    /* TEXT extraction — identical logic to the old synchronous route */
    let extractedText = await extractTextFromPDF(fileBytes);
    if (!extractedText || extractedText.trim().length < 50) {
      extractedText = ocrAccumulatedText;
    } else if (ocrAccumulatedText.length > extractedText.length) {
      extractedText = ocrAccumulatedText;
    }
    extractedText = (extractedText || "").replace(/\s+/g, " ").trim();
    console.log(
      `process ${circularId}: final extractedText length =`,
      extractedText?.length,
    );

    /* TOP-LEVEL embedding — fatal if it throws, same as before: a circular
       that is not searchable must not be saved as "ready". */
    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      const safeEmbeddingText =
        extractedText.length > 8192
          ? extractedText.slice(0, 8192)
          : extractedText;
      embedding = await generateEmbedding(safeEmbeddingText);
    }

    /* ALL CHUNK embeddings, computed before any DB write — identical
       chunking/page-attribution logic to the old route. */
    type PreparedChunk = {
      index: number;
      page: number;
      text: string;
      embedding: string;
    };
    const preparedChunks: PreparedChunk[] = [];
    const chunkSize = 200;
    let chunkIndex = 0;

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
    console.log(
      `process ${circularId}: prepared`,
      preparedChunks.length,
      "chunk embeddings",
    );

    const vectorLiteral = embedding ? `[${embedding.join(",")}]` : null;

    /* ============================================================
       Single transaction: update the placeholder row + insert chunks +
       vector column. Identical serial-number-assignment logic to the old
       route (advisory lock, unique-index guard, whole-transaction retry
       on collision) — only difference is this is now an UPDATE against
       the existing placeholder row instead of a fresh INSERT.
    ============================================================ */
    const year = existing.publishedAt!.year;

    const isUniqueViolation = (e: any) =>
      e?.code === "23505" ||
      /duplicate key value|unique constraint/i.test(e?.message || "");

    let finalCircular: Circular | null = null;
    const MAX_ATTEMPTS = 5;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        finalCircular = await dataSource.transaction(async (manager) => {
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

          const mRepo = manager.getRepository<Circular>("Circular");
          await mRepo.update(circularId, {
            fileUrls,
            embedding: embedding as any,
            serialNumber: nextSerial,
            status: "ready",
            processingError: null,
          });

          for (const c of preparedChunks) {
            await manager.query(
              `
                INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding)
                VALUES ($1, $2, $3, $4, $5)
              `,
              [circularId, c.index, c.page, c.text, c.embedding],
            );
          }

          if (vectorLiteral) {
            await manager.query(
              `UPDATE public.circulars SET embedding = $1::vector WHERE id = $2`,
              [vectorLiteral, circularId],
            );
          }

          return (await mRepo.findOne({ where: { id: circularId } }))!;
        });
        break; // committed
      } catch (e: any) {
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) {
          console.warn(
            `Serial collision for year ${year}, retry ${attempt}/${MAX_ATTEMPTS}`,
          );
          continue;
        }
        throw e; // -> outer catch
      }
    }

    if (!finalCircular) {
      throw new Error("Failed to assign a serial number after retries");
    }

    console.log(
      "process: committed circular id =",
      finalCircular.id,
      "serial =",
      finalCircular.serialNumber,
      "chunks =",
      preparedChunks.length,
    );

    return NextResponse.json({
      message: "Processed successfully",
      circular: finalCircular,
    });
  } catch (err: any) {
    console.error(
      `process: failed for circular ${circularId}:`,
      err?.message || err,
    );
    await cleanupBlobs();

    if (isRetryableError(err)) {
      // Leave status as "processing" -- QStash will retry this same job,
      // and the idempotency check at the top means a later successful
      // attempt just proceeds normally. A non-2xx response is what tells
      // QStash to retry.
      return NextResponse.json(
        { error: err?.message || "Transient failure, will retry" },
        { status: 500 },
      );
    }

    // Permanent failure -- mark it so, and deliberately respond 200 so
    // QStash does NOT keep retrying something that can never succeed.
    await repo
      .update(circularId, {
        status: "failed",
        processingError: String(err?.message || err).slice(0, 2000),
      })
      .catch((e) =>
        console.error("process: failed to mark circular as failed:", e),
      );

    return NextResponse.json({
      message: "Marked as failed (permanent error)",
      error: err?.message,
    });
  }
}

// verifySignatureAppRouter throws IMMEDIATELY (at module-evaluation time,
// not request time) if these are undefined -- and Next.js evaluates this
// during its build-time "Collecting page data" step, which means an
// unconfigured QStash integration would break the ENTIRE build/deployment,
// not just this one endpoint, if the real env vars aren't set yet.
// Falling back to placeholders keeps the build (and every other route)
// working regardless of QStash setup status; if the real keys are
// genuinely still missing at runtime, a real QStash request will safely
// fail signature verification against the placeholder (401, rejected) —
// never silently processed unverified, and never a build-breaking crash.
export const POST = verifySignatureAppRouter(handler, {
  currentSigningKey:
    process.env.QSTASH_CURRENT_SIGNING_KEY || "unset-current-signing-key",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "unset-next-signing-key",
});
