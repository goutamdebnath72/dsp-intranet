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
 * Query-embedding cache + de-duplication.
 *
 * One omnibar question is embedded by up to five search engines (policy / content search,
 * announcements, holiday policy, headline search). They run in parallel with the SAME text, so
 * without sharing a single question costs up to five identical Google calls. Under load (or a
 * test run) that exhausts the per-minute allowance and the failed calls silently turn into
 * empty search results.
 *
 * Here identical (text, taskType) requests share ONE in-flight call and its result for a few
 * minutes. A FAILED call is never cached. Only search queries are cached; document embeddings
 * at ingestion are all distinct and are not.
 */
const QUERY_EMBEDDING_TTL_MS = 5 * 60 * 1000;
const QUERY_EMBEDDING_MAX_ENTRIES = 500;
const queryEmbeddingCache = new Map<string, { at: number; promise: Promise<number[]> }>();

const RETRYABLE_STATUS = (status: number) => status === 429 || status >= 500;
const MAX_ATTEMPTS = 4; // 1 try + 3 retries
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchEmbeddingWithRetry(
  text: string,
  geminiTaskType: string,
  apiKey: string,
): Promise<number[]> {
  // Updated endpoint pointing to the active gemini-embedding-001 model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryAfterMs = 0;
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
        const err = new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
        if (!RETRYABLE_STATUS(response.status)) throw Object.assign(err, { fatal: true });
        const ra = Number(response.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 15000);
        lastError = err;
      } else {
        const data = await response.json();
        const vector = data?.embedding?.values;
        if (!vector || !Array.isArray(vector)) {
          throw Object.assign(
            new Error(`Invalid response structure from Gemini: ${JSON.stringify(data)}`),
            { fatal: true },
          );
        }
        return vector as number[];
      }
    } catch (error: any) {
      if (error?.fatal) throw error;
      lastError = error; // network error: retry
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = retryAfterMs || 700 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
      console.warn(
        `[Embedding Service] attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastError?.message?.slice(0, 120)}); retrying in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }
  throw lastError ?? new Error("Gemini embedding failed");
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

  const run = async () => {
    try {
      return await fetchEmbeddingWithRetry(text, geminiTaskType, apiKey);
    } catch (error: any) {
      console.error("[Embedding Service] Gemini API error:", error?.message || error);
      throw error;
    }
  };

  if (taskType !== "search_query") return run();

  const key = `${taskType}|${text}`;
  const now = Date.now();
  const hit = queryEmbeddingCache.get(key);
  if (hit && now - hit.at < QUERY_EMBEDDING_TTL_MS) return hit.promise;

  const promise = run();
  queryEmbeddingCache.set(key, { at: now, promise });
  // never keep a failure: the next caller must be able to try again
  promise.catch(() => {
    if (queryEmbeddingCache.get(key)?.promise === promise) queryEmbeddingCache.delete(key);
  });
  // bound the memory: drop the oldest entries
  if (queryEmbeddingCache.size > QUERY_EMBEDDING_MAX_ENTRIES) {
    const oldest = Array.from(queryEmbeddingCache.entries())
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, queryEmbeddingCache.size - QUERY_EMBEDDING_MAX_ENTRIES);
    for (const [k] of oldest) queryEmbeddingCache.delete(k);
  }
  return promise;
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
