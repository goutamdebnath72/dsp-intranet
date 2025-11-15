// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";

import { fromPath } from "pdf2pic";

/* ============================================================
   Extract textual content from PDF buffer (unchanged)
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

  // try pdf-to-text
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
  } catch {}

  // fallback: pdf-parse
  try {
    const pdfParseModule: any = await import("pdf-parse");
    const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
    const parsed: any = await parseFn(buffer);
    const text = (parsed?.text || "").replace(/\s+/g, " ").trim();
    await safeUnlink();
    return text;
  } catch {}

  await safeUnlink();
  return "";
}

/* ============================================================
   POST: Upload circular (pdf2pic stable version)
============================================================ */
export async function POST(req: Request) {
  const db = await getDb();

  try {
    const formData = await req.formData();
    const headline = formData.get("headline") as string;
    const file = formData.get("file") as File;

    if (!headline || !file) {
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileUrls: string[] = [];

    // IMAGE upload (unchanged)
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, buffer, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    }

    // PDF upload (pdf2pic - restored)
    else if (file.type === "application/pdf") {
      const tempPdf = `/tmp/pdf_${Date.now()}.pdf`;
      await fs.writeFile(tempPdf, buffer);

      const options = {
        density: 300,
        format: "png",
        savePath: "/tmp",
        width: 2480, // A4 ratio (your stable working values)
        height: 3508,
      };

      const convert = fromPath(tempPdf, options);

      // get page count using pdf-parse
      const pdfParseModule: any = await import("pdf-parse");
      const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
      const parsed: any = await parseFn(buffer);
      const numPages = parsed.numpages || 1;

      for (let page = 1; page <= numPages; page++) {
        const output = await convert(page);
        const pngPath: string | undefined = output?.path;

        if (!pngPath) {
          console.warn(`Skipping page ${page}: undefined path`);
          continue;
        }

        const pngBuffer = await fs.readFile(pngPath);

        const key = `circulars/${Date.now()}_pg_${page}.png`;
        const uploaded = await put(key, pngBuffer, {
          access: "public",
          contentType: "image/png",
        });

        fileUrls.push(uploaded.url);
        await fs.unlink(pngPath);
      }

      await fs.unlink(tempPdf);
    } else {
      return NextResponse.json(
        { error: "Unsupported file format" },
        { status: 400 }
      );
    }

    // extract text + embedding (unchanged)
    const extractedText = await extractTextFromPDF(buffer);
    let embedding: number[] | null = null;

    if (extractedText && extractedText.length > 20) {
      try {
        embedding = await generateEmbedding(extractedText);
      } catch {}
    }

    const circular = await db.Circular.create({
      headline,
      fileUrls,
      embedding,
      publishedAt: new Date(),
    });

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
   GET: fetch circulars (unchanged)
============================================================ */
export async function GET() {
  const db = await getDb();

  try {
    const circulars = await db.Circular.findAll({
      attributes: { exclude: ["embedding"] },
      order: [["publishedAt", "DESC"]],
    });

    return NextResponse.json(circulars);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch circulars" },
      { status: 500 }
    );
  }
}
