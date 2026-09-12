// src/lib/ai/embedding.service.ts
import { getDb } from "@/lib/db";
import { TDocument } from "pdf-to-text";

/**
 * Normalizes an embedding vector to unit length.
 */
export function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Generates a 768-dimensional embedding vector directly via Google Gemini API.
 */
export async function generateEmbedding(
  text: string,
  taskType: "search_query" | "search_document" = "search_query",
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment variables.");
  }

  const geminiTaskType =
    taskType === "search_query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

  // Updated endpoint pointing to the active gemini-embedding-001 model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001", // Replaced deprecated text-embedding-004
        content: { parts: [{ text }] },
        taskType: geminiTaskType,
        outputDimensionality: 768,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const vector = data?.embedding?.values;

    if (!vector || !Array.isArray(vector)) {
      throw new Error(
        `Invalid response structure from Gemini: ${JSON.stringify(data)}`,
      );
    }

    return vector as number[];
  } catch (error: any) {
    console.error(
      "[Embedding Service] Gemini API error:",
      error?.message || error,
    );
    throw error;
  }
}

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
