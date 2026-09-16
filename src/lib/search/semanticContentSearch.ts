// src/lib/search/semanticContentSearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
  executeTitleSearch,
} from "./titleSearch";
import { classifyQuoted, escapeRegex } from "./quotedMatch";

export async function executeContentSearch(
  dataSource: DataSource,
  q: string,
): Promise<{
  uniqueResults: SearchResultRow[];
  isFallback: boolean;
  hasExactMatch: boolean;
}> {
  const safeQ = (q || "").trim();
  if (!safeQ)
    return { uniqueResults: [], isFallback: false, hasExactMatch: false };

  // Classify the query. Whole-word matching applies ONLY to a double-quoted,
  // Latin-script phrase; everything else keeps the old case-insensitive
  // substring behaviour. Matching stays case-INSENSITIVE in every mode
  // (OCR corpus is case-noisy). The vector path is never affected.
  const mode = classifyQuoted(safeQ);
  const cleanQ = mode.phrase;

  // An "exact-token" query is a single token containing a digit (a number or
  // an alphanumeric code like 20995.30 or a policy number). The user typed it
  // to find that EXACT string. If it is not present literally in the corpus,
  // the honest answer is "nothing" — NOT the semantically-nearest unrelated
  // chunk. This prevents e.g. "20995.30" surfacing a Volleyball circular.
  const isExactTokenQuery =
    !/\s/.test(cleanQ) && /\d/.test(cleanQ) && cleanQ.length >= 4;

  // $2 is used by whichever operator the literal branch selects:
  //   - whole-word (quoted Latin) -> case-insensitive POSIX regex ~* \yphrase\y
  //   - otherwise                 -> ILIKE %phrase%
  const literalParam = mode.wholeWord
    ? // POSIX ERE has no lookbehind, so express "not flanked by a letter or
      // digit" with explicit boundary groups. This anchors codes with internal
      // punctuation ("HR-CLC", "DSP/PERS-NW") as whole tokens — POSIX \y wrapped
      // around a hyphenated string does not. The ~* operator is case-insensitive.
      `(^|[^A-Za-z0-9])${escapeRegex(cleanQ)}([^A-Za-z0-9]|$)`
    : `%${cleanQ}%`;

  // Operator + expression fragments differ by mode but reference the SAME $2,
  // so the rest of the query shape (and the literal_boost = 2.0) is unchanged.
  const litText = mode.wholeWord ? "cc.text ~* $2" : "cc.text ILIKE $2";
  const litHead = mode.wholeWord
    ? "c.headline ~* $2"
    : "c.headline ILIKE $2";
  const literalPredicate = `(${litText} OR ${litHead})`;

  // --- Per-token literal rescue (unquoted, multi-word, Latin queries) ---
  // The whole-string literal above only fires when a chunk contains the ENTIRE
  // query verbatim. A natural-language query ("format B declaration for SIR")
  // rarely appears verbatim, yet its significant tokens ("format","declaration",
  // "sir") do live in the target chunk. So for an UNQUOTED, non-Indic query with
  // 2+ meaningful tokens, we also match chunks that contain a strong share of
  // those tokens. Quoted queries and Indic queries are untouched.
  const INDIC = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;
  const STOP = new Set([
    "the","a","an","of","for","to","in","on","by","is","are","and","or",
    "how","what","where","when","why","can","if","do","i","my","me","we",
    "our","you","your","with","at","as","from","this","that","be","will",
  ]);
  const tokenParams: string[] = [];
  let tokenPredicate = "";
  if (!mode.isQuoted && !INDIC.test(cleanQ)) {
    const toks = cleanQ
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
      .filter((t) => t.length > 2 && !STOP.has(t));
    // de-dup, cap to keep the SQL sane
    const uniq = Array.from(new Set(toks)).slice(0, 8);
    if (uniq.length >= 2) {
      // Each token -> its own ILIKE param; a chunk/headline matching ANY of
      // them is admitted (ranking below still rewards more/where matches).
      const parts: string[] = [];
      uniq.forEach((t) => {
        parts.push(`cc.text ILIKE $${3 + tokenParams.length}`);
        tokenParams.push(`%${t}%`);
      });
      tokenPredicate = `(${parts.join(" OR ")})`;
    }
  }

  // Combined literal side = whole-string literal OR the per-token rescue.
  const literalOrTokens = tokenPredicate
    ? `(${literalPredicate} OR ${tokenPredicate})`
    : literalPredicate;

  try {
    const rawEmbedding = await generateEmbedding(safeQ, "search_query");
    const queryVector = normalizeVector(rawEmbedding);
    const vectorString = `[${queryVector.join(",")}]`;

    // Hybrid SQL: Searches both Vector Space AND the Literal Space.
    // The literal operator (~ vs ILIKE) is chosen above; the vector clause
    // is identical in every mode.
    const hybridQuerySql = `
      SELECT 
        c.id,
        c.headline,
        c."fileUrls",
        c."publishedAt",
        cc.text AS "chunkText",
        cc.page_number AS "pageNumber",
        (1 - (cc.embedding <=> $1::vector(768))) AS base_similarity,
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END) AS literal_boost,
        (CASE WHEN ${tokenPredicate || 'FALSE'} THEN 0.75 ELSE 0 END) AS token_boost
      FROM circular_chunks cc
      JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL 
        AND (${literalOrTokens} OR (1 - (cc.embedding <=> $1::vector(768))) > 0.50)
      ORDER BY (
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END) +
        (CASE WHEN ${tokenPredicate || 'FALSE'} THEN 0.75 ELSE 0 END) +
        (1 - (cc.embedding <=> $1::vector(768)))
      ) DESC
      LIMIT 20;
    `;

    const matches = await dataSource.query<any[]>(hybridQuerySql, [
      vectorString,
      literalParam,
      ...tokenParams,
    ]);

    let hasExactMatch = false;

    if (matches && matches.length > 0) {
      const docMap = new Map<
        number,
        SearchResultRow & { internalScore: number }
      >();

      for (const m of matches) {
        const rawSim = Number(m.base_similarity) || 0;
        const literalBoost = Number(m.literal_boost) || 0;
        const tokenBoost = Number(m.token_boost) || 0;

        if (literalBoost > 0) hasExactMatch = true;

        // Floor: keep a chunk if it has the whole-string literal, OR a strong
        // semantic score, OR a per-token lexical hit (the rescue path). Without
        // the tokenBoost clause the rescued chunks would be dropped here.
        if (literalBoost === 0 && tokenBoost === 0 && rawSim < 0.6) continue;

        // literal (2.0) ranks above token (0.75) ranks above pure vector.
        const score = rawSim + literalBoost + tokenBoost;

        if (!docMap.has(m.id)) {
          docMap.set(m.id, {
            id: m.id,
            type: "circular",
            headline: m.headline,
            url:
              Array.isArray(m.fileUrls) && m.fileUrls.length > 0
                ? m.fileUrls[0]
                : null,
            publishedAt: formatLuxonDate(m.publishedAt),
            internalScore: score,
            similarity: Number(Math.min(0.99, Math.max(0, rawSim)).toFixed(3)), // Keep UI percentage realistic
            chunkText: m.chunkText || "",
            // Page of the FIRST (highest-ranked) matching chunk — where the
            // viewer should jump to. 0/undefined means unknown (legacy chunks).
            matchPage:
              m.pageNumber != null && Number(m.pageNumber) > 0
                ? Number(m.pageNumber)
                : null,
            matchPages:
              m.pageNumber != null && Number(m.pageNumber) > 0
                ? [Number(m.pageNumber)]
                : [],
          });
        } else {
          const existing = docMap.get(m.id)!;
          if (m.chunkText && !existing.chunkText?.includes(m.chunkText)) {
            existing.chunkText += `\n\n${m.chunkText}`;
          }
          // Collect every distinct page that has a matching chunk.
          const pg =
            m.pageNumber != null && Number(m.pageNumber) > 0
              ? Number(m.pageNumber)
              : null;
          if (pg && existing.matchPages && !existing.matchPages.includes(pg)) {
            existing.matchPages.push(pg);
          }
        }
      }

      // Exact-token query with no literal match anywhere -> return empty
      // rather than vector-fallback junk.
      if (isExactTokenQuery && !hasExactMatch) {
        return { uniqueResults: [], isFallback: false, hasExactMatch: false };
      }

      const results = Array.from(docMap.values()).sort(
        (a, b) => b.internalScore - a.internalScore,
      );

      if (results.length > 0) {
        const topScore = results[0].internalScore;

        // Razor-sharp drop-off: If a literal match (score > 2.0) is found, sever everything else
        const tolerance = hasExactMatch ? 0.05 : 0.1;

        const strictlyFiltered = results
          .filter((r) => r.internalScore >= topScore - tolerance)
          .map(({ internalScore, ...rest }) => rest);

        return {
          uniqueResults: strictlyFiltered.slice(0, 5),
          isFallback: false,
          hasExactMatch,
        };
      }
    }
  } catch (err) {
    console.error("[Semantic Content Search] Hybrid pipeline error:", err);
  }

  const titleFallback = await executeTitleSearch(dataSource, safeQ);
  return {
    uniqueResults: titleFallback,
    isFallback: true,
    hasExactMatch: false,
  };
}
