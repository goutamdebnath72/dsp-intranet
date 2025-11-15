// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { put } from "@vercel/blob";
import { fromPath } from "pdf2pic";
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";

/* ============================================================
   Extract textual content from PDF buffer  (UNCHANGED)
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
  } catch {}

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
   POST: Upload a circular (WORKING PDF2PIC VERSION)
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

    /* ============================
       IMAGE UPLOAD (UNCHANGED)
    ============================ */
    if (file.type.startsWith("image/")) {
      const key = `circulars/${Date.now()}_${file.name}`;
      const { url } = await put(key, bytes, {
        access: "public",
        contentType: file.type,
      });
      fileUrls.push(url);
    } else if (file.type === "application/pdf") {
      /* ============================
       PDF UPLOAD (RESTORED WORKING VERSION)
       ⭐ NO COMPRESSION — EXACT BEHAVIOR RESTORED ⭐
    ============================ */
      const tempPdfPath = `/tmp/circular_${Date.now()}.pdf`;
      await fs.writeFile(tempPdfPath, bytes);

      const options = {
        density: 300,
        format: "png",
        savePath: "/tmp",
        useGM: false,
        width: 2480, // ⭐ EXACTLY FROM YOUR STABLE FILE
        height: 3508, // ⭐ EXACTLY FROM YOUR STABLE FILE
      };

      const converter = fromPath(tempPdfPath, options);

      // ⭐ BULK conversion (this prevents compression)
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

    /* ============================
       TEXT + EMBEDDING (UNCHANGED)
    ============================ */
    const extractedText = await extractTextFromPDF(bytes);

    let embedding: number[] | null = null;

    if (extractedText && extractedText.length > 0) {
      try {
        embedding = await generateEmbedding(extractedText);
      } catch {}
    }

    /* ============================
       DB SAVE (UNCHANGED)
    ============================ */
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
   GET: Fetch all circulars (UNCHANGED)
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
