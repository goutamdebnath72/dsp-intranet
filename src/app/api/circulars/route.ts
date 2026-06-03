// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model"; // TypeORM entity blueprint
import { DateTime } from "luxon"; // Pure Luxon replacement for native Date initialization
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { saveEmbeddingToVectorTable } from "@/lib/ai/saveEmbedding";
import { fromPath } from "pdf2pic";
import Tesseract from "tesseract.js";

/* ============================================================
   Extract textual content from PDF buffer (original logic preserved)
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
   POST: Upload a circular (pdf2pic + OCR + Vector Embedding)
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();

  try {
    const formData = await req.formData();
    const headline = formData.get("headline") as string;
    const file = formData.get("file") as File;

    if (!headline || !file) {
      console.warn("POST /api/circulars missing headline or file");
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 },
      );
    }

    console.log(`UPLOAD START: filename="${file.name}", type=${file.type}`);

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
        console.log("DEBUG: Running OCR on image...");
        const {
          data: { text },
        } = await Tesseract.recognize(fileBytes, "eng");
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
          console.log(`DEBUG: Running OCR on PDF page ${page}...`);
          const {
            data: { text },
          } = await Tesseract.recognize(pngBuffer, "eng");
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

    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      console.log(
        "DEBUG: Calculated",
        Math.ceil(words.length / chunkSize),
        "chunks to save",
      );
    }

    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      try {
        // ✅ Capped input text at 4,000 characters to protect local Ollama setups from model context limits
        const safeEmbeddingText =
          extractedText.length > 4000
            ? extractedText.slice(0, 4000)
            : extractedText;

        embedding = await generateEmbedding(safeEmbeddingText);
        if (!Array.isArray(embedding)) {
          console.warn(
            "DEBUG: generateEmbedding returned non-array:",
            typeof embedding,
          );
        } else {
          console.log("DEBUG: generateEmbedding length =", embedding.length);
        }
      } catch (err: any) {
        console.error("DEBUG: generateEmbedding threw:", err?.message || err);
        embedding = null;
      }
    }

    /* ============================
       CREATE DB ROW VIA TYPEORM REPOSITORY
    ============================ */
    // ✅ Swapped to string identity lookup to secure stability against Next.js dynamic hot reloads
    const circularRepository = dataSource.getRepository<Circular>("Circular");
    const newCircular = circularRepository.create({
      headline,
      fileUrls,
      embedding,
      publishedAt: DateTime.now(),
    });

    const circular = await circularRepository.save(newCircular);
    console.log("DEBUG: DB created circular id =", circular?.id);

    /* === SAVE CHUNKS VIA PARAMETERIZED RAW SQL QUERY === */
    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");

        await dataSource.query(
          `
            INSERT INTO public.circular_chunks (circular_id, chunk_index, text)
            VALUES ($1, $2, $3)
          `,
          [circular.id, chunkIndex, chunkText],
        );

        chunkIndex++;
      }
      console.log(
        "DEBUG: Saved",
        Math.ceil(words.length / chunkSize),
        "chunks to database",
      );
    }

    /* ============================
       Save embedding into Postgres vector via helper
    ============================ */
    if (embedding && circular && circular.id) {
      console.log(
        "DEBUG: Preparing to save embedding to vector for id",
        circular.id,
      );
      try {
        await saveEmbeddingToVectorTable(
          circular.id,
          embedding,
          Number(process.env.EMBEDDING_DIM || 768),
        );
        console.log(
          "DEBUG: saveEmbeddingToVectorTable completed for id",
          circular.id,
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
   GET: Fetch all circulars (TypeORM Performance Optimized)
============================================================ */
export async function GET() {
  const dataSource = await getDb();

  try {
    // ✅ Swapped to string identity lookup here as well
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
