// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
// import { fromPath } from "pdf2pic"; // 👈 --- REMOVED
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";

// 👇 +++ ADDED: New imports for pdfjs-dist and canvas
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"; // Using legacy build to fix Vercel warning
import { createCanvas } from "canvas";

/* ============================================================
   NEW HELPER: Allows pdf.js to use node-canvas
============================================================ */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas: canvas,
      context: context,
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/* ============================================================
   Extract textual content from PDF buffer
   (Your code, unchanged)
============================================================ */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // ... (Your text extraction code is unchanged) ...
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

    // Get ArrayBuffer for @vercel/blob
    const fileArrayBuffer = await file.arrayBuffer();
    // Create Buffer for pdfjs-dist and text extraction
    const bytes = Buffer.from(fileArrayBuffer);
    const fileUrls: string[] = [];

    // Image upload
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      // Pass the ArrayBuffer (this part was correct)
      const { url } = await put(key, fileArrayBuffer, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    }
    //
    // PDF conversion logic (unchanged)
    //
    else if (file.type === "application/pdf") {
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pages: { buffer: Buffer }[] = [];
      const canvasFactory = new NodeCanvasFactory();
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvasAndContext = canvasFactory.create(
          viewport.width,
          viewport.height
        );
        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport: viewport,
          canvasFactory: canvasFactory,
        } as any;
        // 👈 Fix for ts(2345) type mismatch

        await page.render(renderContext).promise;
        // page.buffer is a Node.js Buffer
        const buffer = canvasAndContext.canvas.toBuffer("image/png");
        pages.push({ buffer });
        page.cleanup();
        canvasFactory.destroy(canvasAndContext);
      }

      // Loop for uploading PDF pages
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        // page.buffer is a Node.js Buffer
        if (!page || !page.buffer) continue;
        const imgName = `circular_${Date.now()}_page_${i + 1}.png`;

        //
        // 👇 --- THIS IS THE FINAL FIX --- 👇
        //
        // 1. Create the Uint8Array the RUNTIME error asked for.
        const pageUint8Array = new Uint8Array(page.buffer);

        // 2. Pass it to put() and use 'as any' to bypass the
        //    mismatched TYPE error from the library.
        const { url } = await put(
          `circulars/${imgName}`,
          pageUint8Array as any,
          {
            access: "public",
            contentType: "image/png",
          }
        );
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

    // (Your database create logic, unchanged)
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
   (Your code, unchanged)
============================================================ */
export async function GET() {
  const db = await getDb();
  try {
    // ✅ THIS IS THE FIX:
    // We 'exclude' the 'embedding' column from the query.
    // This will make the JSON response small and fix the 413 error.
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