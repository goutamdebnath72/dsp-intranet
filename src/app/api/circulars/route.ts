import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { fromPath } from "pdf2pic";
import { Circular } from "@/lib/db/models/circular.model";
import { generateEmbedding } from "@/lib/ai/embedding.service";

/**
 * NOTE:
 * We perform dynamic imports for pdf-parse and pdf-to-text because:
 *  - Both are CommonJS / untyped packages in your node_modules.
 *  - Static `import` causes TypeScript / ESLint errors in your project.
 *  - Dynamic import defers resolving to runtime and allows us to treat them as `any`.
 */

/* ============================================================
   Extract textual content from PDF buffer
   - Try pdf-to-text (system/poppler) first (if available)
   - Fallback to pdf-parse for digital PDFs
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

  // 1) Try pdf-to-text if available (it shells out to pdftotext/poppler)
  try {
    // dynamic import returns 'any' shape, avoid TS compile-time type checks
    const pdfToTextModule: any = await import("pdf-to-text");
    const pdfToTextFn: any =
      pdfToTextModule?.pdfToText ?? pdfToTextModule?.default ?? pdfToTextModule;

    if (typeof pdfToTextFn === "function") {
      const rawText: string = await new Promise((resolve, reject) => {
        // pdfToText(filepath, options, cb)
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
    // pdf-to-text not available or failed — fallback to pdf-parse
  }

  // 2) Fallback: pdf-parse (works for digital PDFs)
  try {
    const pdfParseModule: any = await import("pdf-parse");
    // pdf-parse exports the parsing function as module default or function
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
   - Converts each PDF page to a single PNG (A4 at 300 DPI)
   - Uploads pages to Vercel Blob and returns URLs in array
============================================================ */
export async function POST(req: Request) {
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

    // If uploaded file is an image, upload directly
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, bytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    }

    // If PDF, convert each page to PNG with correct aspect ratio and high DPI
    else if (file.type === "application/pdf") {
      const tempPdfPath = `/tmp/circular_${Date.now()}.pdf`;
      await fs.writeFile(tempPdfPath, bytes);

      // Best clarity: A4 at 300 DPI → 2480 x 3508 px
      const options = {
        density: 300, // high DPI
        format: "png",
        savePath: "/tmp",
        useGM: true, // force GraphicsMagick (pdf2pic supports GM)
        width: 2480, // exact A4 pixel width @ 300dpi
        height: 3508, // exact A4 pixel height @ 300dpi
      };

      const converter = fromPath(tempPdfPath, options);

      // bulk(-1) -> convert all pages. responseType: 'buffer' gives raw buffer
      const pages: any[] = await converter.bulk(-1, { responseType: "buffer" });

      // remove the temp pdf
      await fs.unlink(tempPdfPath).catch(() => {});

      // Upload each page buffer to Vercel Blob
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

    // Extract text for embeddings (works on original PDF bytes)
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
    const newCircular = await Circular.create({
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
  try {
    const circulars = await Circular.findAll({
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
