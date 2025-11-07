// src/lib/ai/embedding.service.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// 1. Initialize the Google AI Client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004", // This model uses 768 dimensions
});
/**
 * Extracts text content from a PDF buffer.
 */
async function getTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfData = new Uint8Array(buffer);

    // Pass the converted data to getDocument
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const doc = await loadingTask.promise;
    let textContent = "";

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const text = await page.getTextContent();
      // Ensure text.items is an array before mapping
      if (Array.isArray(text.items)) {
        textContent += text.items.map((item: any) => item.str).join(" ") + "\n";
      }
    }
    return textContent;
  } catch (error) {
    console.error("Error parsing PDF buffer:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

/**
 * Generates an embedding from text.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding from Google AI");
  }
}

/**
 * The main function to be called from our API route.
 * It coordinates text extraction, embedding generation,
 * and saving the vector to the database.
 */
export async function generateAndSaveEmbedding(
  prisma: any,
  circularId: number,
  fileBuffer: Buffer,
  headline: string
) {
  // 1. Extract text from the PDF buffer
  const pdfText = await getTextFromPdf(fileBuffer);
  const combinedText = `${headline}\n\n${pdfText}`;

  // 2. Generate the embedding vector
  const embedding = await generateEmbedding(combinedText);
  if (!embedding) {
    throw new Error("Embedding result was null or empty.");
  }

  // 3. Save the embedding back to the database
  // We must first convert the number[] array into a string
  // e.g., '[0.1, 0.2, 0.3]'
  const vectorString = `[${embedding.join(",")}]`;
  // Now we pass this STRING to the query.
  // The database will correctly cast the string to a vector.
  await prisma.$executeRaw`
  UPDATE "circulars"
  SET embedding = ${vectorString}::public.vector(768)
  WHERE id = ${circularId}
`;
}
