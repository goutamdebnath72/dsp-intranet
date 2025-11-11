import db from "@/lib/db"; // <-- 1. IMPORT SEQUELIZE
import { QueryTypes } from "sequelize"; // <-- 2. IMPORT QUERYTYPES
import { TDocument } from "pdf-to-text";

// This function calls local Ollama (LOGIC UNTOUCHED)
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
    return data.embedding;
  } catch (error) {
    console.error("Failed to generate local embedding:", error);
    throw new Error("Local embedding generation failed.");
  }
}

// Helper function to extract text (LOGIC UNTOUCHED)
async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  const { pdf } = await (eval('import("pdf-to-text")') as Promise<{
    pdf: (buffer: Buffer, options?: any) => Promise<TDocument>;
  }>);

  console.log("Sanitizing PDF securely for embedding...");
  const data = await pdf(fileBuffer);
  const text = (Array.isArray(data) ? data.join(" ") : data) as string;
  console.log("PDF text extracted for embedding.");
  return text.replace(/\s+/g, " ").trim();
}

// --- 3. FUNCTION SIGNATURE UPDATED ---
// It no longer receives 'prismaClient'
export async function generateAndSaveEmbedding(
  circularId: number,
  fileBuffer: Buffer,
  headline: string
) {
  try {
    const pdfText = await extractTextFromPDF(fileBuffer);
    const fullText = `Headline: ${headline}\n\nContent: ${pdfText}`;
    const embedding = await generateEmbedding(fullText);

    // --- 4. REPLACED PRISMA WITH SEQUELIZE RAW QUERY ---
    // This is the safest way to update a vector with Sequelize
    const vectorString = `[${embedding.join(",")}]`;
    await db.sequelize.query(
      `UPDATE "circulars" SET embedding = :vector WHERE id = :circularId`,
      {
        replacements: {
          vector: vectorString,
          circularId: circularId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    console.log(`✅ AI embedding generated and saved for: ${circularId}`);
  } catch (error: any) {
    // Log error but don't throw, as per original logic
    console.error(
      `⚠️ AI embedding failed for ${circularId}:`,
      error.message || error
    );
  }
}
