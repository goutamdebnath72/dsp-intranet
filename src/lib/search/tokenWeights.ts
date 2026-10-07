// src/lib/search/tokenWeights.ts
//
// Rarity weights for the words of a query. A word that appears in nearly every circular
// ("plant", "durgapur") says almost nothing about WHICH circular is wanted; a word found in
// one or two circulars ("alloy", "steels") says a lot. Counting every query word equally let
// a circular that matched only the common words count as a "perfect" match while the one
// circular containing the distinctive words ranked third.
//
// weight(word) = ln((N + 1) / (df + 1)) + 1   where N = circulars that have body text and
// df = circulars whose text contains the word. A word in every circular weighs exactly 1.
// A word found in NO circular ("happens", a typo, a synonym) weighs 0: no circular can match it,
// so it must not drag down the coverage of the circulars that match everything else. If every
// word of a query is unknown, all weights fall back to 1.
// Document frequencies are cached for 10 minutes. If the lookup fails for any reason every
// word weighs 1, which is the previous (unweighted) behaviour.

import type { DataSource } from "typeorm";

const TTL_MS = 10 * 60 * 1000;
const dfCache = new Map<string, { at: number; df: number }>();
let totalCache: { at: number; n: number } | null = null;

export async function queryTokenWeights(ds: DataSource, tokens: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = Array.from(new Set(tokens));
  try {
    const now = Date.now();
    if (!totalCache || now - totalCache.at > TTL_MS) {
      const r = await ds.query(`SELECT count(DISTINCT circular_id)::int AS n FROM circular_chunks`);
      totalCache = { at: now, n: Math.max(1, Number(r?.[0]?.n) || 1) };
    }
    const need = uniq.filter((t) => {
      const c = dfCache.get(t);
      return !c || now - c.at > TTL_MS;
    });
    if (need.length) {
      const safe = need.map((t) => t.replace(/[\\%_]/g, ""));
      const rows: Array<{ tok: string; df: number }> = await ds.query(
        `SELECT t.tok AS tok, count(DISTINCT cc.circular_id)::int AS df
           FROM unnest($1::text[]) AS t(tok)
           LEFT JOIN circular_chunks cc ON cc.text ILIKE '%' || t.tok || '%'
          GROUP BY t.tok`,
        [safe],
      );
      need.forEach((t, i) => {
        const row = rows.find((x) => x.tok === safe[i]);
        dfCache.set(t, { at: now, df: Number(row?.df) || 0 });
      });
    }
    const n = totalCache.n;
    for (const t of uniq) {
      const df = dfCache.get(t)?.df ?? 0;
      out.set(t, df === 0 ? 0 : Math.log((n + 1) / (df + 1)) + 1);
    }
    if (uniq.length && Array.from(out.values()).every((v) => v === 0)) {
      for (const t of uniq) out.set(t, 1);
    }
  } catch {
    for (const t of uniq) out.set(t, 1);
  }
  return out;
}

/** Share of the query's total weight that the matched words carry (0..1). */
export function weightedCoverage(all: string[], hit: string[], weights: Map<string, number>): number {
  const w = (t: string) => weights.get(t) ?? 1;
  const total = all.reduce((a, t) => a + w(t), 0);
  if (total <= 0) return 0;
  return hit.reduce((a, t) => a + w(t), 0) / total;
}
