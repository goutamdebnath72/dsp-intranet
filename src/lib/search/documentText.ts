// src/lib/search/documentText.ts
//
// All stored passages (chunks) of the candidate circulars, for lexical scoring.
//
// The search engines return ONE chunk per circular: the chunk closest in MEANING. That is often
// not the passage that carries the distinctive words of the question. For "volleyball
// championship at Alloy Steels Plant" the best chunk of the right circular was its header, so
// the circular looked like a weak match. Here every passage of the circular is available, and
// bestPassage() picks the one that covers the most (rarity-weighted) query words. Scoring the
// WHOLE text instead would let long circulars match most words by chance; the best single
// passage keeps the evidence local, as a real answer is.
//
// Passages are cached for 10 minutes (bounded). On any database error the caller falls back to
// the single chunk, which is the previous behaviour. The text shown to the user stays the
// engine's own chunk.

import type { DataSource } from "typeorm";
import { weightedCoverage } from "./tokenWeights";

const TTL_MS = 10 * 60 * 1000;
const MAX_DOCS = 120;
const docCache = new Map<number, { at: number; chunks: string[] }>();

export async function loadDocumentChunks(ds: DataSource, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const now = Date.now();
  const need: number[] = [];
  for (const id of Array.from(new Set(ids))) {
    if (!Number.isInteger(id)) continue;
    const c = docCache.get(id);
    if (c && now - c.at < TTL_MS) out.set(id, c.chunks);
    else need.push(id);
  }
  if (need.length) {
    try {
      const rows: Array<{ id: number; chunks: string[] | null }> = await ds.query(
        `SELECT circular_id AS id, array_agg(lower(text) ORDER BY chunk_index) AS chunks
           FROM circular_chunks
          WHERE circular_id = ANY($1::int[])
          GROUP BY circular_id`,
        [need],
      );
      for (const r of rows) {
        const chunks = (r.chunks || []).map((t) => String(t || "").replace(/\s+/g, " "));
        docCache.set(Number(r.id), { at: now, chunks });
        out.set(Number(r.id), chunks);
      }
      if (docCache.size > MAX_DOCS) {
        const oldest = Array.from(docCache.entries())
          .sort((a, b) => a[1].at - b[1].at)
          .slice(0, docCache.size - MAX_DOCS);
        for (const [k] of oldest) docCache.delete(k);
      }
    } catch {
      /* fall back to the single chunk */
    }
  }
  return out;
}

/**
 * The passage (headline + one chunk) that covers the most query weight.
 * `passages` are lower-cased; ties keep the earliest passage. Without weights every word counts 1.
 */
export function bestPassage(
  queryTokens: string[],
  headlineLower: string,
  passages: string[],
  weights: Map<string, number> | null,
): { hits: string[]; evidence: string; coverage: number } {
  let best = { hits: [] as string[], evidence: passages[0] ?? "", coverage: -1 };
  for (const p of passages) {
    const hits = queryTokens.filter((t) => headlineLower.includes(t) || p.includes(t));
    const coverage = weights
      ? weightedCoverage(queryTokens, hits, weights)
      : queryTokens.length > 0
        ? hits.length / queryTokens.length
        : 0;
    if (coverage > best.coverage) best = { hits, evidence: p, coverage };
  }
  return best;
}
