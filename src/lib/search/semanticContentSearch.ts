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

  // $2 is used by whichever operator the literal branch selects:
  //   - whole-word (quoted Latin) -> case-insensitive POSIX regex ~* \yphrase\y
  //   - otherwise                 -> ILIKE %phrase%
  const literalParam = mode.wholeWord
    ? `\\y${escapeRegex(cleanQ)}\\y`
    : `%${cleanQ}%`;

  // Operator + expression fragments differ by mode but reference the SAME $2,
  // so the rest of the query shape (and the literal_boost = 2.0) is unchanged.
  const litText = mode.wholeWord ? "cc.text ~* $2" : "cc.text ILIKE $2";
  const litHead = mode.wholeWord
    ? "c.headline ~* $2"
    : "c.headline ILIKE $2";
  const literalPredicate = `(${litText} OR ${litHead})`;

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
        (1 - (cc.embedding <=> $1::vector(768))) AS base_similarity,
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END) AS literal_boost
      FROM circular_chunks cc
      JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL 
        AND (${literalPredicate} OR (1 - (cc.embedding <=> $1::vector(768))) > 0.50)
      ORDER BY (
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END) + 
        (1 - (cc.embedding <=> $1::vector(768)))
      ) DESC
      LIMIT 20;
    `;

    const matches = await dataSource.query<any[]>(hybridQuerySql, [
      vectorString,
      literalParam,
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

        if (literalBoost > 0) hasExactMatch = true;

        // Strict floor: Only process if it has a literal match OR a strong semantic correlation
        if (literalBoost === 0 && rawSim < 0.6) continue;

        const score = rawSim + literalBoost;

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
          });
        } else {
          const existing = docMap.get(m.id)!;
          if (m.chunkText && !existing.chunkText?.includes(m.chunkText)) {
            existing.chunkText += `\n\n${m.chunkText}`;
          }
        }
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
