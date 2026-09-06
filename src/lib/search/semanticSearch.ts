// src/lib/search/semanticSearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding } from "@/lib/ai-services";
import {
  SearchResultRow,
  formatLuxonDate,
  executeTitleSearch,
} from "./titleSearch";

function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

// Conversational stop-words that dilute PostgreSQL tsquery
const STOP_WORDS = new Set([
  "how",
  "do",
  "i",
  "my",
  "the",
  "before",
  "due",
  "date",
  "what",
  "is",
  "are",
  "can",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "an",
  "a",
]);

export async function executeSemanticSearch(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  let queryEmbedding: number[];
  try {
    const raw = await generateEmbedding(q);
    queryEmbedding = normalizeVector(raw);
  } catch (err) {
    console.error(
      "Embedding generation failed, falling back to keyword search:",
      err,
    );
    const fallbackResults = await executeTitleSearch(dataSource, q);
    return { uniqueResults: fallbackResults, isFallback: true };
  }

  const vectorString = `[${queryEmbedding.join(",")}]`;

  // Extract core domain keywords for text boosting without punctuation artifacts
  const keyTerms = q
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const cleanTsQuery = keyTerms.length > 0 ? keyTerms.join(" | ") : "";

  // 90% Vector + 10% Keyword weighted search with 0.45 threshold
  const matches = await dataSource.query<any[]>(
    `
    WITH scored_chunks AS (
      SELECT 
        c.id,
        c.headline,
        c."fileUrls",
        c."publishedAt",
        cc.text AS "chunkText",
        (1 - (cc.embedding <=> $1::vector(768))) AS vec_score,
        ${
          cleanTsQuery
            ? `COALESCE(
                 ts_rank_cd(
                   to_tsvector('english', c.headline || ' ' || cc.text),
                   to_tsquery('english', $2)
                 ), 
                 0
               )`
            : `0`
        } AS text_score
      FROM circular_chunks cc
      JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL
    ),
    weighted_chunks AS (
      SELECT 
        id,
        headline,
        "fileUrls",
        "publishedAt",
        "chunkText",
        ((0.90 * vec_score) + (0.10 * LEAST(text_score, 1.0))) AS combined_score
      FROM scored_chunks
    )
    SELECT *
    FROM weighted_chunks
    WHERE combined_score >= 0.45
    ORDER BY combined_score DESC
    LIMIT 15;
  `,
    cleanTsQuery ? [vectorString, cleanTsQuery] : [vectorString],
  );

  if (!matches || matches.length === 0) {
    const fallbackResults = await executeTitleSearch(dataSource, q);
    return { uniqueResults: fallbackResults, isFallback: true };
  }

  const docMap = new Map<number, SearchResultRow>();
  for (const m of matches) {
    const existing = docMap.get(m.id);
    const similarity =
      typeof m.combined_score === "number"
        ? Number(m.combined_score.toFixed(4))
        : null;

    if (!existing) {
      docMap.set(m.id, {
        id: m.id,
        type: "circular",
        headline: m.headline,
        url:
          Array.isArray(m.fileUrls) && m.fileUrls.length > 0
            ? m.fileUrls[0]
            : null,
        publishedAt: formatLuxonDate(m.publishedAt),
        similarity,
        chunkText: m.chunkText || "",
      });
    } else if (
      existing.chunkText &&
      m.chunkText &&
      !existing.chunkText.includes(m.chunkText)
    ) {
      existing.chunkText += `\n\n${m.chunkText}`;
    }
  }

  const uniqueResults = Array.from(docMap.values()).sort(
    (a, b) => (b.similarity || 0) - (a.similarity || 0),
  );

  return { uniqueResults, isFallback: false };
}
