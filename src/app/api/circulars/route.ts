// src/app/api/circulars/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { put } from "@vercel/blob";
import { DateTime } from "luxon";
import { fromBuffer } from "pdf2pic";

// --- Detect file type helper ---
async function getFileType(buffer: Buffer) {
  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<
    typeof import("file-type")
  >);
  return fileTypeFromBuffer(buffer);
}

// --- GET route: Fetch all circulars ---
export async function GET() {
  try {
    const circulars = await prisma.circular.findMany({
      orderBy: { publishedAt: "desc" },
    });
    return NextResponse.json(circulars);
  } catch (error) {
    console.error("API Error: Failed to fetch circulars:", error);
    return NextResponse.json(
      { error: "Internal Server Error: Failed to fetch circulars" },
      { status: 500 }
    );
  }
}

// --- POST route: Upload new circular (secure PDF sanitization) ---
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const headline = formData.get("headline") as string;
    const file = formData.get("file") as File;

    if (!headline || !file) {
      return NextResponse.json(
        { error: "Headline and file are required." },
        { status: 400 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
      return NextResponse.json(
        { error: "Server configuration error: Missing BLOB token." },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const type = await getFileType(fileBuffer);
    const timestamp = DateTime.now().toMillis();
    const uploadedUrls: string[] = [];

    // --- PDF Sanitization (convert pages to images) ---
    if (type?.mime === "application/pdf") {
      console.log("Sanitizing PDF securely via pdf2pic...");

      // --- FIX: Add Homebrew paths for BOTH Apple Silicon and Intel Macs ---
      const homebrewAppleSiliconPath = "/opt/homebrew/bin";
      const homebrewIntelPath = "/usr/local/bin";
      let path = process.env.PATH || "";

      if (!path.includes(homebrewAppleSiliconPath)) {
        path = `${homebrewAppleSiliconPath}:${path}`;
        console.log(
          "Added Apple Silicon Homebrew path (/opt/homebrew/bin) to PATH."
        );
      }
      if (!path.includes(homebrewIntelPath)) {
        path = `${homebrewIntelPath}:${path}`;
        console.log("Added Intel Mac Homebrew path (/usr/local/bin) to PATH.");
      }
      process.env.PATH = path;
      // --- END FIX ---

      try {
        // Create pdf2pic converter
        const converter = fromBuffer(fileBuffer, {
          density: 150, // DPI resolution
          format: "png",
          width: 1200,
          height: 1600,
        });

        // Convert all pages to base64 images
        const pages = await converter.bulk(-1, { responseType: "base64" });

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
          throw new Error("PDF conversion failed or file has no valid pages.");
        }

        console.log(`PDF contains ${pages.length} page(s)`);

        // Upload all pages as sanitized PNGs
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];

          if (!page.base64) {
            console.warn(`Could not convert page ${i + 1}`);
            continue;
          }

          const imageBuffer = Buffer.from(page.base64, "base64");
          const filename = `circular_${timestamp}_page${i + 1}.png`;

          const blob = await put(filename, imageBuffer, {
            access: "public",
            contentType: "image/png",
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          uploadedUrls.push(blob.url);
        }

        console.log("✅ PDF sanitized successfully.");
      } catch (err: any) {
        console.error("⚠️ PDF sanitization failed:", err.message);

        // --- FIX: Do NOT upload the raw PDF. This is a security risk. ---
        // Instead, return a proper error to the client.
        return NextResponse.json(
          {
            error:
              "PDF processing failed. Poppler might be missing or the PDF is corrupt.",
          },
          { status: 500 }
        );
        // --- END FIX ---
      }
    }

    // --- Direct Image Upload (no sanitization needed) ---
    else if (type?.mime === "image/jpeg" || type?.mime === "image/png") {
      console.log("Uploading image circular...");
      const filename = `circular_${timestamp}.${type.ext}`;
      const blob = await put(filename, fileBuffer, {
        access: "public",
        contentType: type.mime,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      uploadedUrls.push(blob.url);
    }

    // --- Unsupported File Type ---
    else {
      console.error(`Unsupported file type: ${type?.mime || "unknown"}`);
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, JPG, or PNG." },
        { status: 415 }
      );
    }

    // --- Save to Database ---
    const newCircular = await prisma.circular.create({
      data: {
        headline,
        fileUrls: uploadedUrls,
        publishedAt: new Date(),
      },
    });

    console.log("✅ Circular record created:", newCircular.id);
    return NextResponse.json(newCircular, { status: 201 });
  } catch (error) {
    console.error("API Error: Failed to create circular:", error);
    return NextResponse.json(
      { error: "Internal Server Error: Failed to create circular" },
      { status: 500 }
    );
  }
}
