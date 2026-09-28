// src/lib/search/headlineEmbeddingSearch.ts
//
// Matches a query against the HEADLINE-ONLY embedding stored on circulars
// that have no circular_chunks rows at all -- currently, that means
// detected holiday-list circulars specifically (see
// src/app/api/circulars/route.ts's skipOcrAndEmbedding flag and its
// header comment for the full reasoning). Those circulars are display-only
// by design: their body is never OCR'd or chunked, so this is their ONLY
// semantic-similarity signal.
//
// Deliberately scoped to chunk-less circulars only (via the NOT EXISTS
// clause below), so this never competes with or duplicates the much richer
// per-chunk body search that ordinary circulars already have through
// semanticContentSearch.ts / semanticPolicySearch.ts. A circular that has
// real chunks should always be found through its actual content, not
// through this narrow fallback.
//
// Used only in "semantic" mode's result list (see ai-search/route.ts) --
// deliberately NOT fed into Executive Deep Synthesis's source pool. A
// headline-only hit has no body text to reason over (chunkText is always
// empty here), so handing it to the synthesis engine as a "source" would
// just reintroduce a content-free citation with nothing behind it -- the
// same class of problem this whole feature exists to avoid. Showing it as
// a plain, clickable result (so the person can open the circular
// themselves) is the right level of confidence for what this data actually
// supports.

import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import { formatLuxonDate, type SearchResultRow } from "./titleSearch";

export async function executeHeadlineEmbeddingSearch(
  dataSource: DataSource,
  q: string,
  limit = 5,
): Promise<SearchResultRow[]> {
  const safeQ = (q || "").trim();
  if (!safeQ) return [];

  let queryVector: number[];
  try {
    const raw = await generateEmbedding(safeQ, "search_query");
    queryVector = normalizeVector(raw);
  } catch (e) {
    console.warn("headlineEmbeddingSearch: query embedding failed:", (e as any)?.message ?? e);
    return [];
  }

  const vectorLiteral = `[${queryVector.join(",")}]`;

  const rows: Array<{
    id: number;
    headline: string;
    fileUrls: string[] | null;
    publishedAt: any;
    similarity: number;
  }> = await dataSource.query(
    `
      SELECT c.id, c.headline, c."fileUrls", c."publishedAt",
             (1 - (c.embedding <=> $1::vector(768))) AS similarity
      FROM circulars c
      WHERE c.embedding IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM circular_chunks cc WHERE cc.circular_id = c.id
        )
      ORDER BY c.embedding <=> $1::vector(768) ASC
      LIMIT $2;
    `,
    [vectorLiteral, limit],
  );

  return rows
    .filter((r) => r.similarity > 0.5) // same floor semanticContentSearch uses for its own vector-only fallback
    .map((r) => ({
      id: r.id,
      type: "circular" as const,
      headline: r.headline,
      url: Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
      publishedAt: formatLuxonDate(r.publishedAt),
      similarity: Number(r.similarity.toFixed(3)),
      chunkText: "", // no body content was ever stored for this circular -- see module header
    }));
}
