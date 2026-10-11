// src/lib/ai/embedding.service.ts
import { getDb } from "@/lib/db";
import { TDocument } from "pdf-to-text";
import { generateEmbedding, normalizeVector } from "./geminiEmbedding";

// Re-exported so every existing import of these from "@/lib/ai/embedding.service" keeps working (they now live in geminiEmbedding.ts).
export { generateEmbedding, normalizeVector };


/**
 * Extracts raw text from a PDF buffer.
 */
async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  const { pdf } = await (eval('import("pdf-to-text")') as Promise<{
    pdf: (buffer: Buffer, options?: any) => Promise<TDocument>;
  }>);

  const data = await pdf(fileBuffer);
  const text = (Array.isArray(data) ? data.join(" ") : data) as string;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Generates embedding for a circular and saves to the database.
 */
export async function generateAndSaveEmbedding(
  circularId: number,
  fileBuffer: Buffer,
  headline: string,
) {
  const dataSource = await getDb();

  try {
    const pdfText = await extractTextFromPDF(fileBuffer);
    const fullText = `Headline: ${headline}\n\nContent: ${pdfText}`;
    const rawEmbedding = await generateEmbedding(fullText, "search_document");

    const normalized = normalizeVector(rawEmbedding);
    const vectorString = `[${normalized.join(",")}]`;

    await dataSource.query(
      `UPDATE "circulars" SET embedding = $1 WHERE id = $2`,
      [vectorString, circularId],
    );

    console.log(
      `✅ Embedding indexed via Gemini Cloud for circular #${circularId}`,
    );
  } catch (error: any) {
    console.error(
      `⚠️ Gemini embedding failed for circular #${circularId}:`,
      error?.message ?? error,
    );
  }
}
