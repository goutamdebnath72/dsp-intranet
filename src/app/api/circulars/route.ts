// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
// import { fromPath } from "pdf2pic"; // 👈 --- REMOVED
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";

// 👇 +++ ADDED: New imports for pdfjs-dist and canvas
import * as pdfjsLib from "pdfjs-dist";
import { createCanvas, Image } from "canvas";

/* ============================================================
   NEW HELPER: Allows pdf.js to use node-canvas
   (This is standard boilerplate for using pdfjs-dist in Node)
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
   (POST handler unchanged, except for the PDF logic block)
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

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileUrls: string[] = [];
    // (Image upload logic, unchanged)
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, bytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    }
    //
    // 👇 === THIS BLOCK IS THE REPLACEMENT === 👇
    //
    else if (file.type === "application/pdf") {
      // 1. Load the PDF document from the buffer
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;

      // 2. This is the array your old code used. We will fill it.
      const pages: { buffer: Buffer }[] = [];
      const canvasFactory = new NodeCanvasFactory();

      // 3. Loop through each page
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        // We use a scale of 2.0 to match your old high-density setting
        const viewport = page.getViewport({ scale: 2.0 });

        // 4. Create a canvas and render the page
        const canvasAndContext = canvasFactory.create(
          viewport.width,
          viewport.height
        );
        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport: viewport,
          canvasFactory: canvasFactory,
        } as any; // 👈 Adding this type assertion

        await page.render(renderContext).promise;

        // 5. Convert the canvas to a PNG buffer
        const buffer = canvasAndContext.canvas.toBuffer("image/png");
        pages.push({ buffer });

        // 6. Clean up
        page.cleanup();
        canvasFactory.destroy(canvasAndContext);
      }

      // 👇 === REPLACEMENT ENDS HERE === 👆
      //
      // (Your existing loop for uploading buffers, unchanged)
      // This works perfectly with the new `pages` array.
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
