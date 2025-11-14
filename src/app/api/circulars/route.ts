// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { fromPath } from "pdf2pic";
// ⛔️ REMOVED: Direct model import
// import { Circular } from "@/lib/db/models/circular.model";
// ✅ ADDED: Import the single connection function
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";

/**
 * NOTE:
 * (Your code, unchanged)
 */

/* ============================================================
   Extract textual content from PDF buffer
   (Your code, unchanged)
============================================================ */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tempPdfPath = `/tmp/circular_${Date.now()}.pdf`;

  const safeUnlink = async () => {
    try {
      await fs.unlink(tempPdfPath);
    } catch {
      /* ignore */
    }
  };

  try {
    await fs.writeFile(tempPdfPath, buffer);
  } catch (err) {
    // if writing fails, give up on pdf-to-text route and try pdf-parse directly
  }

  // 1) Try pdf-to-text (Your code, unchanged)
  try {
    const pdfToTextModule: any = await import("pdf-to-text");
    const pdfToTextFn: any =
      pdfToTextModule?.pdfToText ?? pdfToTextModule?.default ?? pdfToTextModule;

    if (typeof pdfToTextFn === "function") {
      const rawText: string = await new Promise((resolve, reject) => {
        try {
          pdfToTextFn(tempPdfPath, null, (err: any, data: string) => {
            if (err) return reject(err);
            resolve(data ?? "");
          });
        } catch (e) {
          reject(e);
        }
      });

      const cleaned = (rawText || "").replace(/\s+/g, " ").trim();
      if (cleaned.length > 20) {
        await safeUnlink();
        return cleaned;
      }
    }
  } catch (err) {
    // pdf-to-text not available or failed
  }

  // 2) Fallback: pdf-parse (Your code, unchanged)
  try {
    const pdfParseModule: any = await import("pdf-parse");
    const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
    if (typeof parseFn === "function") {
      const parsed: any = await parseFn(buffer);
      const text = (parsed?.text || "").replace(/\s+/g, " ").trim();
      await safeUnlink();
      return text;
    }
  } catch (err) {
    // give up gracefully
  } finally {
    await safeUnlink();
  }

  return "";
}

/* ============================================================
   POST: Upload a circular (PDF or image)
============================================================ */
export async function POST(req: Request) {
  // ✅ ADDED: Get the shared DB connection
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

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileUrls: string[] = [];

    // (Your image upload logic, unchanged)
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, bytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    }
    // (Your PDF conversion logic, unchanged)
    else if (file.type === "application/pdf") {
      const tempPdfPath = `/tmp/circular_${Date.now()}.pdf`;
      await fs.writeFile(tempPdfPath, bytes);

      const options = {
        density: 300,
        format: "png",
        savePath: "/tmp",
        useGM: false, // ✅ This is your correct fix from before
        width: 2480,
        height: 3508,
      };

      const converter = fromPath(tempPdfPath, options);
      const pages: any[] = await converter.bulk(-1, { responseType: "buffer" });
      await fs.unlink(tempPdfPath).catch(() => {});

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page || !page.buffer) continue;
        const imgName = `circular_${Date.now()}_page_${i + 1}.png`;
        const { url } = await put(`circulars/${imgName}`, page.buffer, {
          access: "public",
          contentType: "image/png",
        });
        fileUrls.push(url);
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 }
      );
    }

    // (Your embedding logic, unchanged)
    const text = await extractTextFromPDF(bytes);
    let embedding: number[] | null = null;
    if (text && text.length > 0) {
      try {
        embedding = await generateEmbedding(text);
      } catch {
        // continue even if embedding fails
      }
    }

    // Save to DB
    // ✅ CHANGED: Use the shared db.Circular model
    const newCircular = await db.Circular.create({
      headline,
      fileUrls,
      publishedAt: new Date(),
      embedding,
    });

    return NextResponse.json({
      message: "Circular uploaded successfully",
      circular: newCircular,
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
   GET: Fetch all circulars
============================================================ */
export async function GET() {
  // ✅ ADDED: Get the shared DB connection
  const db = await getDb();

  try {
    // ✅ CHANGED: Use the shared db.Circular model
    const circulars = await db.Circular.findAll({
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
