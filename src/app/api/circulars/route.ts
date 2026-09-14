// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { fromPath } from "pdf2pic";
import Tesseract from "tesseract.js";

/* ============================================================
   Extract textual content from PDF buffer
============================================================ */
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
   POST: Upload a circular — FULLY ATOMIC.

   A single upload is a queue of segmented jobs (blob writes, OCR,
   embeddings, DB row, DB chunks, vector column). If ANY job fails, the
   whole upload is considered failed and EVERY byte written anywhere for
   this circular is removed:
     - Vercel Blob objects  -> deleted via del()
     - circulars row        -> never committed (single transaction)
     - circular_chunks rows -> never committed (same transaction)
     - embedding column     -> written inside that same transaction

   Strategy:
     PHASE A (persist blobs + compute everything that can fail cheaply):
       validate -> render/upload blobs -> OCR -> extract text ->
       compute top-level embedding -> compute ALL chunk embeddings.
       A failure to embed ANY chunk aborts the upload (no null-embedding
       chunk is ever stored). Blob URLs are tracked for cleanup.
     PHASE B (single DB transaction):
       assign serial (retry on unique collision) -> insert row ->
       insert all chunks -> set vector column. Commit or rollback as one.
     On ANY throw: delete all tracked blobs, return 500. The transaction
     has already rolled back, so no DB trace remains.
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();

  // Every blob byte written during this upload, for compensating cleanup.
  const uploadedBlobUrls: string[] = [];
  // Temp files on disk to remove regardless of outcome.
  const tempFiles: string[] = [];

  const cleanupTempFiles = async () => {
    await Promise.all(tempFiles.map((p) => fs.unlink(p).catch(() => {})));
  };

  const cleanupBlobs = async () => {
    if (uploadedBlobUrls.length === 0) return;
    try {
      // del() accepts a single URL or an array of URLs.
      await del(uploadedBlobUrls);
      console.log(
        `ROLLBACK: deleted ${uploadedBlobUrls.length} orphan blob(s).`,
      );
    } catch (e: any) {
      // Cleanup itself failed — surface loudly but don't mask the original error.
      console.error(
        "ROLLBACK WARNING: failed to delete some blobs:",
        e?.message || e,
        uploadedBlobUrls,
      );
    }
  };

  try {
    /* ============================================================
       VALIDATION (no bytes written yet)
    ============================================================ */
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawHeadline = formData.get("headline") as string;
    const rawPublishedAt = formData.get("publishedAt")?.toString() || "";
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

    // publishedAt is REQUIRED and comes only from the picker.
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

    /* ============================================================
       PHASE A — bytes to blob + all fallible compute.
       Any throw here jumps to catch -> cleanupBlobs().
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

      // OCR failure here is NOT fatal on its own (text can still come from
      // the PDF/text extractor path); but for a pure image, empty text will
      // be caught by the "no embeddable text" guard below.
      try {
        console.log("DEBUG: Running Trilingual OCR on image...");
        const {
          data: { text },
        } = await Tesseract.recognize(fileBytes, "hin+eng+ben");
        ocrAccumulatedText += text + " ";
      } catch (err) {
        console.error("OCR failed on image:", err);
      }
    } else if (file.type === "application/pdf") {
      /* PDF via pdf2pic */
      const tempPdfPath = `/tmp/pdf_${Date.now()}.pdf`;
      tempFiles.push(tempPdfPath);
      await fs.writeFile(tempPdfPath, fileBytes);

      const options = {
        density: 300,
        format: "png",
        savePath: "/tmp",
        width: 2480,
        height: 3508,
      };
      const convert = fromPath(tempPdfPath, options);

      const pdfParseModule: any = await import("pdf-parse");
      const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
      const parsed: any = await parseFn(fileBytes);
      const numPages = parsed.numpages || 1;

      for (let page = 1; page <= numPages; page++) {
        const output = await convert(page);
        const pngPath: string | undefined = output?.path;
        if (!pngPath) {
          console.warn(`Skipping page ${page}: pdf2pic returned undefined path`);
          continue;
        }
        tempFiles.push(pngPath);
        const pngBuffer = await fs.readFile(pngPath);
        const key = `circulars/${Date.now()}_page_${page}.png`;
        const { url } = await put(key, pngBuffer, {
          access: "public",
          contentType: "image/png",
        });
        uploadedBlobUrls.push(url);
        fileUrls.push(url);

        try {
          console.log(`DEBUG: Running Trilingual OCR on PDF page ${page}...`);
          const {
            data: { text },
          } = await Tesseract.recognize(pngBuffer, "hin+eng+ben");
          ocrAccumulatedText += text + " \n";
        } catch (err) {
          console.error(`OCR failed on page ${page}:`, err);
        }
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
       TOP-LEVEL embedding (fatal if it throws)
    ============================ */
    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      const safeEmbeddingText =
        extractedText.length > 8192
          ? extractedText.slice(0, 8192)
          : extractedText;
      // No try/catch: a failure means the circular is not searchable ->
      // fail the whole upload and clean up.
      embedding = await generateEmbedding(safeEmbeddingText);
    }

    /* ============================
       ALL CHUNK embeddings, computed BEFORE any DB write.
       If any chunk fails to embed, abort — we never store a
       null-embedding (unsearchable) chunk.
    ============================ */
    type PreparedChunk = { index: number; text: string; embedding: string };
    const preparedChunks: PreparedChunk[] = [];

    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");
        // Fatal on failure — no swallow.
        const rawVector = await generateEmbedding(chunkText);
        preparedChunks.push({
          index: chunkIndex,
          text: chunkText,
          embedding: `[${rawVector.join(",")}]`,
        });
        chunkIndex++;
      }
      console.log("DEBUG: Prepared", preparedChunks.length, "chunk embeddings");
    }

    const vectorLiteral = embedding ? `[${embedding.join(",")}]` : null;

    /* ============================================================
       PHASE B — single DB transaction: row + chunks + vector.
       Serial assignment retried on unique collision by re-running
       the whole transaction (row+chunks+vector together).
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
          // Serialize concurrent uploads for the SAME year.
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
            authorTicketNo,
          });
          const saved = await repo.save(newCircular);

          // Insert all chunks in the SAME transaction.
          for (const c of preparedChunks) {
            await manager.query(
              `
                INSERT INTO public.circular_chunks (circular_id, chunk_index, text, embedding)
                VALUES ($1, $2, $3, $4)
              `,
              [saved.id, c.index, c.text, c.embedding],
            );
          }

          // Set the top-level vector column in the SAME transaction.
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
          continue; // whole transaction rolled back; recompute serial and retry
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
    // DB transaction already rolled back (or never opened). Remove blob bytes.
    await cleanupBlobs();
    await cleanupTempFiles();
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 },
    );
  }
}

/* ============================================================
   GET: Fetch all circulars
============================================================ */
export async function GET() {
  const dataSource = await getDb();

  try {
    const circularRepository = dataSource.getRepository<Circular>("Circular");

    const circulars = await circularRepository.find({
      select: {
        id: true,
        headline: true,
        fileUrls: true,
        publishedAt: true,
      },
      order: {
        publishedAt: "DESC",
        id: "DESC",
      },
    });

    return NextResponse.json(circulars);
  } catch (err: any) {
    console.error("GET circulars failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch circulars" },
      { status: 500 },
    );
  }
}
