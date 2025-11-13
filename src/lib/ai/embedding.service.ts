// src/lib/ai/embedding.service.ts
import db from "@/lib/db";
import { QueryTypes } from "sequelize";
import { TDocument } from "pdf-to-text";

/**
 * Calls local Ollama to generate an embedding for given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    return data.embedding as number[];
  } catch (error) {
    console.error("Failed to generate local embedding:", error);
    throw new Error("Local embedding generation failed.");
  }
}

/**
 * Extracts text from a PDF buffer (using pdf-to-text).
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
 * Normalize an embedding vector to unit length.
 */
function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Generates embedding for a circular and stores it in DB.
 * This function normalizes the vector (unit length) before updating DB.
 */
export async function generateAndSaveEmbedding(
  circularId: number,
  fileBuffer: Buffer,
  headline: string
) {
  try {
    const pdfText = await extractTextFromPDF(fileBuffer);
    const fullText = `Headline: ${headline}\n\nContent: ${pdfText}`;
    const rawEmbedding = await generateEmbedding(fullText);

    // Normalize for consistent similarity computations
    const normalized = normalizeVector(rawEmbedding);

    // Convert to Postgres vector literal string like: [0.12,-0.45,...]
    const vectorString = `[${normalized.join(",")}]`;

    // Use a raw query to update the vector column (works when column is pgvector)
    await db.sequelize.query(
      `UPDATE "circulars" SET embedding = :vector WHERE id = :circularId`,
      {
        replacements: {
          vector: vectorString,
          circularId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    console.log(`✅ AI embedding generated and saved for: ${circularId}`);
  } catch (error: any) {
    // Do not block the upload on AI failure — just log it.
    console.error(
      `⚠️ AI embedding failed for ${circularId}:`,
      error?.message ?? error
    );
  }
}
