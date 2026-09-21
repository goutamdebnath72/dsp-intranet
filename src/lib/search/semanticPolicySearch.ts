// src/lib/search/semanticPolicySearch.ts
//
// GENERIC HYBRID RETRIEVAL ENGINE (the `documents` worker of the query algebra).
//
// Replaces the previous pure-vector ranker whose additive recency bonus and
// relevance-blind edge-cliff let recent-but-off-topic circulars out-rank the
// on-topic one, and severed the correct document out of the result set before
// it could ever reach the UI (validated live: "leave policy", "c&it attendance").
//
// Design — proven on a 19-query battery against the live corpus:
//   ARM V  dense vector : per-document best-chunk cosine (topical proximity).
//   ARM L  lexical      : ONE field-weighted ts_rank over a single document
//                         tsvector  setweight(headline,'A') || setweight(body,'B')
//                         with log length-normalization, so a document whose
//                         SUBJECT is the query (short, focused headline) beats
//                         one that merely mentions the words in a long body.
//   FUSION  Reciprocal Rank Fusion (scale-free — no cosine-vs-ts_rank
//           normalization, no tuned magic constants; RRF k=60, L weighted x2).
//   TIE-BREAKERS ONLY : explicit-year match, then recency, then id — they can
//           only order documents of ~equal fused relevance, never flip it.
//   NO edge-cliff severance. NO recency/length term inside the score.
//
// The engine is uniform for every query: no per-circular, per-keyword or
// per-query rule anywhere. A query carrying no Latin tokens (Devanagari /
// Bengali) yields an empty lexical arm, so fusion collapses to the vector arm —
// i.e. the previous cross-lingual behaviour, unchanged.
//
// Contract preserved: returns { uniqueResults: SearchResultRow[]; isFallback }.
// Each row carries a `similarity` in a high band so the route-level noise floor
// admits it and the results interleave sanely with the announcement arm; the
// band is strictly rank-monotonic so any downstream similarity sort preserves
// this engine's order.

import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
  executeTitleSearch,
} from "./titleSearch";

// --- Fusion / retrieval constants -------------------------------------------
const RRF_K = 60; // standard Reciprocal Rank Fusion constant (insensitive)
const LEX_WEIGHT = 2; // subject/lexical arm counts double in the fusion
const POOL = 30; // per-arm candidate depth
const RESULT_K = 8; // documents returned to the router

// Relevance floor — calibrated on live junk-vs-legit signal distributions
// (scripts/probe-confidence.mjs). A candidate is kept only if it clears ONE of:
//   - strong lexical  : ts_rank >= LEX_FLOOR (legit subject hits are .04-.08;
//                       junk riding a common word like "list" is .006-.019),
//   - strong vector   : cos >= VEC_FLOOR (keeps cross-lingual/Indic legit at
//                       .68-.78; drops English gibberish whose nearest neighbour
//                       tops out ~.62),
//   - agreement tier  : present in BOTH arms with moderate signals
//                       (cos >= AGREE_COS AND ts_rank >= AGREE_TSR) — keeps
//                       on-topic tail; junk fails here on cos (.46-.52).
// This replaces the old loose "lexical-hit OR cos>=0.6" gate that let nonsense
// ("honda spark plugs price list") surface a confident match.
const COS_INCLUDE = 0.5; // vector-arm candidate inclusion (block obvious junk)
const LEX_FLOOR = 0.03; // strong lexical/subject match
const VEC_FLOOR = 0.64; // strong semantic match with no lexical support
const AGREE_COS = 0.55; // agreement tier: minimum cosine
const AGREE_TSR = 0.02; // agreement tier: minimum ts_rank

// Similarity emission band. Returned docs are the top candidates and must clear
// the route-level noise floor; the band is rank-monotonic so order survives any
// downstream similarity sort or announcement merge.
const SIM_HI = 0.97;
const SIM_LO = 0.7;

// Build an OR tsquery from a raw string: split on non-alphanumerics, drop
// <2-char tokens, OR the rest. Department/stopword noise ("c&it" -> c,it)
// falls away so the real topic token drives the lexical match. Latin-only by
// construction, so Indic queries return null (lexical arm no-ops).
function toOrTsquery(q: string): string | null {
  const toks = (q || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  const uniq = [...new Set(toks)];
  return uniq.length ? uniq.join(" | ") : null;
}

type VecRow = {
  id: number;
  headline: string;
  fileUrls: string[] | null;
  publishedAt: any;
  chunkText: string;
  cos: number;
};
type LexRow = { id: number; score: number };

// ARM V — per-document best-chunk cosine, top POOL, junk floor applied.
async function armVector(
  dataSource: DataSource,
  vectorString: string,
): Promise<VecRow[]> {
  const rows = await dataSource.query<any[]>(
    `
    WITH ranked AS (
      SELECT
        c.id,
        c.headline,
        c."fileUrls"        AS "fileUrls",
        c."publishedAt"     AS "publishedAt",
        cc.text             AS chunk_text,
        (1 - (cc.embedding <=> $1::vector(768))) AS cos,
        ROW_NUMBER() OVER (
          PARTITION BY c.id
          ORDER BY cc.embedding <=> $1::vector(768) ASC
        ) AS rn
      FROM circular_chunks cc
      JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL
    )
    SELECT id, headline, "fileUrls", "publishedAt", chunk_text, cos
    FROM ranked
    WHERE rn = 1 AND cos >= $2
    ORDER BY cos DESC
    LIMIT $3;
    `,
    [vectorString, COS_INCLUDE, POOL],
  );
  return rows.map((r) => ({
    id: r.id,
    headline: r.headline,
    fileUrls: Array.isArray(r.fileUrls) ? r.fileUrls : null,
    publishedAt: r.publishedAt,
    chunkText: r.chunk_text || "",
    cos: Number(r.cos) || 0,
  }));
}

// ARM L — field-weighted (headline 'A' over body 'B'), log length-normalized
// ts_rank over the whole document. Returns docs matching the OR tsquery, best
// first. Empty when tsq is null (Indic).
async function armLexical(
  dataSource: DataSource,
  tsq: string | null,
): Promise<LexRow[]> {
  if (!tsq) return [];
  const rows = await dataSource.query<any[]>(
    `
    WITH doc AS (
      SELECT
        c.id,
        setweight(to_tsvector('english', c.headline), 'A') ||
        setweight(
          to_tsvector('english', coalesce(string_agg(cc.text, ' '), '')),
          'B'
        ) AS tsv
      FROM circulars c
      LEFT JOIN circular_chunks cc ON cc.circular_id = c.id
      GROUP BY c.id
    )
    SELECT
      id,
      ts_rank('{0.1,0.2,0.4,1.0}'::float4[], tsv, to_tsquery('english', $1), 1) AS score
    FROM doc
    WHERE tsv @@ to_tsquery('english', $1)
    ORDER BY score DESC
    LIMIT $2;
    `,
    [tsq, POOL],
  );
  return rows.map((r) => ({ id: r.id, score: Number(r.score) || 0 }));
}

// Representative chunk for documents that surfaced only via the lexical arm
// (not in the vector pool), so every returned row has display/coverage text.
// Prefers a chunk that matches the tsquery; falls back to the first chunk.
async function fetchChunkText(
  dataSource: DataSource,
  ids: number[],
  tsq: string | null,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  try {
    const rows = tsq
      ? await dataSource.query<any[]>(
          `
          SELECT DISTINCT ON (cc.circular_id)
            cc.circular_id AS id, cc.text
          FROM circular_chunks cc
          WHERE cc.circular_id = ANY($1::int[])
          ORDER BY cc.circular_id,
            (CASE WHEN to_tsvector('english', cc.text) @@ to_tsquery('english', $2)
                  THEN 0 ELSE 1 END),
            cc.chunk_index ASC;
          `,
          [ids, tsq],
        )
      : await dataSource.query<any[]>(
          `
          SELECT DISTINCT ON (cc.circular_id)
            cc.circular_id AS id, cc.text
          FROM circular_chunks cc
          WHERE cc.circular_id = ANY($1::int[])
          ORDER BY cc.circular_id, cc.chunk_index ASC;
          `,
          [ids],
        );
    for (const r of rows) out.set(r.id, r.text || "");
  } catch (e) {
    console.warn("[Policy] fetchChunkText fallback failed:", e);
  }
  return out;
}

export async function executePolicySearch(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  if (!safeQ) return { uniqueResults: [], isFallback: false };

  const tsq = toOrTsquery(safeQ);
  const detectedYear = safeQ.match(/\b(20\d{2})\b/)?.[1] || null;

  try {
    const rawEmbedding = await generateEmbedding(safeQ, "search_query");
    const queryVector = normalizeVector(rawEmbedding);
    const vectorString = `[${queryVector.join(",")}]`;

    const [vec, lex] = await Promise.all([
      armVector(dataSource, vectorString),
      armLexical(dataSource, tsq),
    ]);

    if (vec.length === 0 && lex.length === 0) {
      const titleFallback = await executeTitleSearch(dataSource, safeQ);
      return { uniqueResults: titleFallback, isFallback: true };
    }

    // Rank maps for RRF.
    const vecRank = new Map<number, number>();
    vec.forEach((r, i) => vecRank.set(r.id, i + 1));
    const lexRank = new Map<number, number>();
    const lexScore = new Map<number, number>();
    const lexSet = new Set<number>();
    lex.forEach((r, i) => {
      lexRank.set(r.id, i + 1);
      lexScore.set(r.id, r.score);
      lexSet.add(r.id);
    });

    const meta = new Map<number, VecRow>();
    for (const r of vec) meta.set(r.id, r);

    // Candidate universe = union of both arms; then the calibrated relevance
    // floor (see constants). Junk fails all three tiers -> empty result set.
    const candidateIds = new Set<number>([...vecRank.keys(), ...lexSet]);
    const qualified: number[] = [];
    for (const id of candidateIds) {
      const inVec = meta.has(id);
      const inLex = lexSet.has(id);
      const cos = meta.get(id)?.cos ?? 0;
      const tsR = lexScore.get(id) ?? 0;
      const strongLex = tsR >= LEX_FLOOR;
      const strongVec = cos >= VEC_FLOOR;
      const agree = inVec && inLex && cos >= AGREE_COS && tsR >= AGREE_TSR;
      if (strongLex || strongVec || agree) qualified.push(id);
    }
    if (qualified.length === 0) {
      const titleFallback = await executeTitleSearch(dataSource, safeQ);
      return { uniqueResults: titleFallback, isFallback: true };
    }

    // Reciprocal Rank Fusion (lexical/subject arm weighted x2).
    const fused = qualified.map((id) => {
      const rv = vecRank.get(id);
      const rl = lexRank.get(id);
      const score =
        (rv ? 1 / (RRF_K + rv) : 0) +
        (rl ? LEX_WEIGHT * (1 / (RRF_K + rl)) : 0);
      return { id, score };
    });

    const yearOf = (id: number): number => {
      const d = meta.get(id)?.publishedAt;
      if (!d) return 0;
      const t = new Date(d).getFullYear();
      return Number.isFinite(t) ? t : 0;
    };
    fused.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
      if (detectedYear) {
        const ay = yearOf(a.id) === Number(detectedYear) ? 1 : 0;
        const by = yearOf(b.id) === Number(detectedYear) ? 1 : 0;
        if (ay !== by) return by - ay;
      }
      const yd = yearOf(b.id) - yearOf(a.id);
      if (yd !== 0) return yd;
      return a.id - b.id;
    });

    const top = fused.slice(0, RESULT_K);

    const needChunk = top.filter((t) => !meta.get(t.id)?.chunkText).map((t) => t.id);
    const missingMeta = top.filter((t) => !meta.get(t.id)).map((t) => t.id);
    const extraChunks = await fetchChunkText(dataSource, needChunk, tsq);

    let metaFill = new Map<number, any>();
    if (missingMeta.length > 0) {
      const rows = await dataSource.query<any[]>(
        `SELECT id, headline, "fileUrls" AS "fileUrls", "publishedAt" AS "publishedAt"
           FROM circulars WHERE id = ANY($1::int[]);`,
        [missingMeta],
      );
      metaFill = new Map(rows.map((r) => [r.id, r]));
    }

    const n = top.length;
    const uniqueResults: SearchResultRow[] = top.map((t, i) => {
      const m = meta.get(t.id);
      const fill = metaFill.get(t.id);
      const headline = m?.headline ?? fill?.headline ?? "";
      const fileUrls =
        m?.fileUrls ?? (Array.isArray(fill?.fileUrls) ? fill.fileUrls : null);
      const publishedAt = m?.publishedAt ?? fill?.publishedAt ?? null;
      const chunkText = m?.chunkText || extraChunks.get(t.id) || "";
      const similarity =
        n <= 1 ? SIM_HI : SIM_HI - (SIM_HI - SIM_LO) * (i / (n - 1));
      return {
        id: t.id,
        type: "circular",
        headline,
        url: Array.isArray(fileUrls) && fileUrls.length > 0 ? fileUrls[0] : null,
        publishedAt: formatLuxonDate(publishedAt),
        similarity: Number(similarity.toFixed(3)),
        chunkText,
      };
    });

    return { uniqueResults, isFallback: false };
  } catch (err) {
    console.error("[Policy] hybrid pipeline error:", err);
  }

  const titleFallback = await executeTitleSearch(dataSource, safeQ);
  return { uniqueResults: titleFallback, isFallback: true };
}
