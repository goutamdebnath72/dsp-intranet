// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { saveEmbeddingToVectorTable } from "@/lib/ai/saveEmbedding";
import { fromPath } from "pdf2pic";
import { chunkTextByWords } from "@/lib/ai/chunkText";
import * as db from "@/lib/db";
//import CircularChunk from "@/lib/db/models/circularChunk.model"; // I will create this file later

/* ============================================================
   Extract textual content from PDF buffer (original logic)
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
   POST: Upload a circular (pdf2pic, unchanged behaviour),
   with additional debug logs to diagnose embedding saving.
============================================================ */
export async function POST(req: Request) {
  const db = await getDb();

  try {
    const formData = await req.formData();
    const headline = formData.get("headline") as string;
    const file = formData.get("file") as File;

    if (!headline || !file) {
      console.warn("POST /api/circulars missing headline or file");
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 }
      );
    }

    console.log(`UPLOAD START: filename="${file.name}", type=${file.type}`);

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const fileUrls: string[] = [];

    /* IMAGE */
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, fileBytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    } else if (file.type === "application/pdf") {
      /* PDF via pdf2pic (unchanged) */
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

      // get number of pages
      const pdfParseModule: any = await import("pdf-parse");
      const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
      const parsed: any = await parseFn(fileBytes);
      const numPages = parsed.numpages || 1;

      for (let page = 1; page <= numPages; page++) {
        const output = await convert(page);
        const pngPath: string | undefined = output?.path;
        if (!pngPath) {
          console.warn(
            `Skipping page ${page}: pdf2pic returned undefined path`
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
        await fs.unlink(pngPath).catch(() => {});
      }

      await fs.unlink(tempPdfPath).catch(() => {});
    } else {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 }
      );
    }

    /* ============================
       TEXT extraction + embedding (with debug)
    ============================ */
    const extractedText = await extractTextFromPDF(fileBytes);
    console.log("DEBUG: extractedText length =", extractedText?.length);
    if (extractedText && extractedText.length > 200) {
      console.log(
        "DEBUG: extractedText preview:",
        extractedText.slice(0, 200).replace(/\s+/g, " ")
      );
    } else {
      console.log(
        "DEBUG: extractedText (short) preview:",
        extractedText.slice(0, 200).replace(/\s+/g, " ")
      );
    }

    // ---------------------------------------------------------------
    // NEW: Split into chunks (200 words) and save to circular_chunks
    // ---------------------------------------------------------------
    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");

        // save each chunk (embedding = null for now — will embed later)

        chunkIndex++;
      }

      console.log(
        "DEBUG: Saved",
        Math.ceil(words.length / chunkSize),
        "chunks"
      );
    }
    // ---------------------------------------------------------------

    let embedding: number[] | null = null;
    if (extractedText && extractedText.length > 20) {
      try {
        embedding = await generateEmbedding(extractedText);
        if (!Array.isArray(embedding)) {
          console.warn(
            "DEBUG: generateEmbedding returned non-array:",
            typeof embedding
          );
        } else {
          console.log("DEBUG: generateEmbedding length =", embedding.length);
          console.log(
            "DEBUG: generateEmbedding sample[0..4] =",
            embedding.slice(0, 5)
          );
        }
      } catch (err: any) {
        console.error("DEBUG: generateEmbedding threw:", err?.message || err);
        embedding = null;
      }
    } else {
      console.log(
        "DEBUG: Skipping embedding generation because extractedText is too short"
      );
    }

    /* ============================
       CREATE DB ROW
    ============================ */
    const circular = await db.Circular.create({
      headline,
      fileUrls,
      embedding, // this may be null; helper will overwrite vector column if available
      publishedAt: new Date(),
    });

    console.log("DEBUG: DB created circular id =", circular?.id);
    console.log("DEBUG: DB created circular id =", circular?.id);

    /* === NOW IT IS SAFE TO SAVE CHUNKS === */
    if (extractedText && extractedText.length > 0) {
      const words = extractedText.split(/\s+/);
      const chunkSize = 200;
      let chunkIndex = 0;

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");

        await db.query(
          `
        INSERT INTO public.circular_chunks (circular_id, chunk_index, text)
        VALUES ($1, $2, $3)
      `,
          {
            bind: [circular.id, chunkIndex, chunkText],
          }
        );

        chunkIndex++;
      }

      console.log(
        "DEBUG: Saved",
        Math.ceil(words.length / chunkSize),
        "chunks"
      );
    }

    /* ============================
       Save embedding into Postgres vector via helper
       (with debug logs)
    ============================ */
    if (embedding && circular && circular.id) {
      console.log(
        "DEBUG: Preparing to save embedding to vector for id",
        circular.id
      );
      try {
        await saveEmbeddingToVectorTable(
          circular.id,
          embedding,
          Number(process.env.EMBEDDING_DIM || 768)
        );
        console.log(
          "DEBUG: saveEmbeddingToVectorTable completed for id",
          circular.id
        );
      } catch (err: any) {
        console.error(
          "DEBUG: saveEmbeddingToVectorTable failed:",
          err?.message || err
        );
      }
    } else {
      console.log(
        "DEBUG: Not saving embedding: embedding present?",
        Boolean(embedding),
        "circular.id?",
        circular?.id
      );
    }

    return NextResponse.json({
      message: "Circular uploaded successfully",
      circular,
    });
  } catch (err: any) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 }
    );
  }
}

/* ============================================================
   GET: Fetch all circulars (unchanged)
============================================================ */
export async function GET() {
  const db = await getDb();

  try {
    const circulars = await db.Circular.findAll({
      attributes: { exclude: ["embedding"] },
      order: [["publishedAt", "DESC"]],
    });

    return NextResponse.json(circulars);
  } catch (err: any) {
    console.error("GET circulars failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch circulars" },
      { status: 500 }
    );
  }
}
