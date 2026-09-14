// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { saveEmbeddingToVectorTable } from "@/lib/ai/saveEmbedding";
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
   POST: Upload a circular (pdf2pic + Trilingual OCR + Vectors)
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();

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

    /* IMAGE HANDLING */
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, fileBytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);

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
          console.warn(
            `Skipping page ${page}: pdf2pic returned undefined path`,
          );
          continue;
        }
        const pngBuffer = await fs.readFile(pngPath);
        const key = `circulars/${Date.now()}_page_${page}.png`;
        const { url } = await put(key, pngBuffer, {
          access: "public",
          contentType: "image/png",
        });
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

        await fs.unlink(pngPath).catch(() => {});
      }

      await fs.unlink(tempPdfPath).catch(() => {});
    } else {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 },
      );
    }

    /* ============================
       TEXT extraction + embedding
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

    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      try {
        const safeEmbeddingText =
          extractedText.length > 8192
            ? extractedText.slice(0, 8192)
            : extractedText;

        embedding = await generateEmbedding(safeEmbeddingText);
      } catch (err: any) {
        console.error("DEBUG: generateEmbedding threw:", err?.message || err);
        embedding = null;
      }
    }

    /* ============================
       CREATE DB ROW VIA TYPEORM
       serialNumber is auto-assigned as MAX+1 for the circular's YEAR.
       Two layers protect against duplicate serials:
         1) A transaction with FOR UPDATE locks that year's existing rows.
         2) A UNIQUE INDEX on (year, serialNumber) in Postgres is the final
            guard — it also covers the "first upload of a brand-new year"
            race, where there are no rows yet to lock. If two uploads collide
            there, the DB rejects the loser and we retry with a fresh MAX+1.
    ============================ */
    const year = publishedAt.year;

    // Postgres unique_violation
    const isUniqueViolation = (e: any) =>
      e?.code === "23505" ||
      /duplicate key value|unique constraint/i.test(e?.message || "");

    let circular: Circular | null = null;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        circular = await dataSource.transaction(async (manager) => {
          // Serialize concurrent uploads for the SAME year with a
          // transaction-scoped advisory lock keyed on the year. This avoids
          // the illegal "MAX() ... FOR UPDATE" (aggregate + row lock) combo
          // and also covers the empty-year case (no rows to lock yet).
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
          return repo.save(newCircular);
        });
        break; // success
      } catch (e: any) {
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) {
          console.warn(
            `Serial collision for year ${year}, retry ${attempt}/${MAX_ATTEMPTS}`,
          );
          continue; // another upload took our number — recompute and retry
        }
        throw e;
      }
    }

    if (!circular) {
      throw new Error("Failed to assign a serial number after retries");
    }

    console.log(
      "DEBUG: DB created circular id =",
      circular?.id,
      "serial =",
      circular?.serialNumber,
    );

    /* === SAVE CHUNKS VIA PARAMETERIZED RAW SQL QUERY === */
    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");

        let chunkEmbeddingString = null;
        try {
          const rawVector = await generateEmbedding(chunkText);
          chunkEmbeddingString = `[${rawVector.join(",")}]`;
        } catch (err) {
          console.error(`DEBUG: Failed to embed chunk ${chunkIndex}`);
        }

        await dataSource.query(
          `
            INSERT INTO public.circular_chunks (circular_id, chunk_index, text, embedding)
            VALUES ($1, $2, $3, $4)
          `,
          [circular.id, chunkIndex, chunkText, chunkEmbeddingString],
        );

        chunkIndex++;
      }
      console.log(
        "DEBUG: Saved",
        Math.ceil(words.length / chunkSize),
        "vectorized chunks to database",
      );
    }

    if (embedding && circular && circular.id) {
      try {
        await saveEmbeddingToVectorTable(
          circular.id,
          embedding,
          Number(process.env.EMBEDDING_DIM || 768),
        );
      } catch (err: any) {
        console.error(
          "DEBUG: saveEmbeddingToVectorTable failed:",
          err?.message || err,
        );
      }
    }

    return NextResponse.json({
      message: "Circular uploaded successfully",
      circular,
    });
  } catch (err: any) {
    console.error("Upload failed:", err);
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
        uploadedAt: true,
        serialNumber: true,
        authorTicketNo: true,
      },
      order: {
        publishedAt: "DESC", // 1. Groups by the parsed year/date first
        serialNumber: "DESC", // 2. Within a year, highest serial first
        id: "DESC", // 3. Final tie-breaker: newest insertion
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
