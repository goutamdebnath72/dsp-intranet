// scripts/test-gemini-ocr.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pdf as renderPdfToImages } from "pdf-to-img";
import { geminiReader } from "../src/lib/ingestion/pageReader";
import { shrinkForReading } from "../src/lib/ingestion/pageImage";

async function main() {
  const pdfRelPath = process.argv[2] || "2026 to 2022/2023/07_2023.pdf";
  const pdfPath = join(process.cwd(), pdfRelPath);
  console.log(`\n=== Testing Gemini OCR on: ${pdfRelPath} ===`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GEMINI_API_KEY is not set in environment.");
    process.exit(1);
  }

  // Allow overriding model via CLI or env, default to gemini-2.5-flash or gemini-3.8-flash
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
  console.log(`Using Gemini Vision Model: ${model}`);

  const reader = geminiReader({ apiKey, model });

  console.log("Rendering PDF pages with pdf-to-img...");
  const pdfDoc = await renderPdfToImages(pdfPath, { scale: 300 / 72 });
  let pageNum = 0;
  const pageTexts: string[] = [];

  for await (const pageImg of pdfDoc) {
    pageNum++;
    console.log(`\n--- Processing Page ${pageNum} ---`);
    console.log(`Original image size: ${(pageImg.length / 1024).toFixed(1)} KB`);

    const shrunk = await shrinkForReading(pageImg);
    console.log(`Shrunk image size: ${(shrunk.length / 1024).toFixed(1)} KB`);

    console.log("Sending to Gemini Vision API...");
    const startMs = Date.now();
    try {
      const text = await reader.read(shrunk);
      const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
      console.log(`Gemini OCR finished in ${elapsedSec}s. Extracted ${text.length} chars.`);
      pageTexts.push(`=== PAGE ${pageNum} ===\n${text}`);
    } catch (err: any) {
      console.error(`Gemini OCR failed on page ${pageNum}:`, err.message);
      process.exit(1);
    }
  }

  const fullText = pageTexts.join("\n\n");
  const outDir = join(process.cwd(), "ocr-test-results");
  mkdirSync(outDir, { recursive: true });
  const outName = pdfRelPath.replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt";
  const outPath = join(outDir, outName);
  writeFileSync(outPath, fullText, "utf8");

  console.log(`\n================ OCR RESULT ================\n`);
  console.log(fullText);
  console.log(`\n============================================\n`);
  console.log(`Full result saved to: ${outPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
