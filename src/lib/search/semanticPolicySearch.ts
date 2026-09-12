// src/lib/search/semanticSearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
  executeTitleSearch,
} from "./titleSearch";

const DEVANAGARI_REGEX = /[\p{Script=Devanagari}]/u;
const BENGALI_REGEX = /[\p{Script=Bengali}]/u;

export async function executePolicySearch(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  if (!safeQ) return { uniqueResults: [], isFallback: false };

  const isDevanagari = DEVANAGARI_REGEX.test(safeQ);
  const isBengali = BENGALI_REGEX.test(safeQ);
  const isEnglishQuery = !isDevanagari && !isBengali; // Universal fallback for Latin text

  // Extract explicit 4-digit calendar year if present
  const detectedYear = safeQ.match(/\b(20\d{2})\b/)?.[1] || null;

  try {
    // 1. Generate Native Vector Space
    const rawEmbedding = await generateEmbedding(safeQ, "search_query");
    const queryVector = normalizeVector(rawEmbedding);
    const vectorString = `[${queryVector.join(",")}]`;

    const params: any[] = [vectorString];

    // A. Universal Year Constraint
    let yearBonusSql = "0";
    if (detectedYear) {
      params.push(`%${detectedYear}%`);
      yearBonusSql = `(CASE WHEN TO_CHAR(c."publishedAt", 'YYYY') = '${detectedYear}' OR c.headline ILIKE $${params.length} THEN 0.12 ELSE -0.25 END)`;
    }

    // B. Symmetrical Language Alignment
    let scriptBonusSql = "0";
    if (isBengali) {
      scriptBonusSql = `(CASE WHEN c.headline ILIKE '%(beng)%' OR c.headline ILIKE '%bengali%' THEN 0.03 ELSE 0 END)`;
    } else if (isDevanagari) {
      scriptBonusSql = `(CASE WHEN c.headline ILIKE '%(hindi)%' OR c.headline ILIKE '%hin%' THEN 0.03 ELSE 0 END)`;
    } else if (isEnglishQuery) {
      // If query is English, prioritize standard circulars over explicitly translated ones
      scriptBonusSql = `(CASE WHEN c.headline NOT ILIKE '%(hindi)%' AND c.headline NOT ILIKE '%(beng)%' THEN 0.03 ELSE 0 END)`;
    }

    // 2. Base Database Query
    const vectorQuerySql = `
      SELECT 
        c.id,
        c.headline,
        c."fileUrls",
        c."publishedAt",
        cc.text AS "chunkText",
        (1 - (cc.embedding <=> $1::vector(768))) AS base_similarity,
        (
          (1 - (cc.embedding <=> $1::vector(768))) 
          + ${yearBonusSql} 
          + ${scriptBonusSql}
        ) AS math_score
      FROM circular_chunks cc
      JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL
      ORDER BY math_score DESC
      LIMIT 30;
    `;

    const matches = await dataSource.query<any[]>(vectorQuerySql, params);

    if (matches && matches.length > 0) {
      const docMap = new Map<
        number,
        SearchResultRow & { internalScore: number }
      >();
      const currentYear = new Date().getFullYear();

      for (const m of matches) {
        const rawSim = Number(m.base_similarity) || 0;

        // Absolute mathematical floor: block non-semantic junk
        if (rawSim < 0.5) continue;

        let score = Number(m.math_score) || rawSim;
        const headline = m.headline || "";
        const pubDate = new Date(m.publishedAt);
        const pubYearStr = pubDate.getFullYear().toString();

        // C. Amplified Recency Matrix (Bonds sibling translations, pushes down old intrusions)
        const ageInYears = currentYear - parseInt(pubYearStr);
        const recencyBonus = Math.max(0, (10 - ageInYears) * 0.015);
        score += recencyBonus;

        // D. Headline Density Penalty (Ensures punchy primary circulars beat long amendments)
        const lengthPenalty = headline.length * 0.0003;
        score -= lengthPenalty;

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
            similarity: Number(Math.min(0.99, Math.max(0, score)).toFixed(3)),
            chunkText: m.chunkText || "",
          });
        } else {
          const existing = docMap.get(m.id)!;
          if (m.chunkText && !existing.chunkText?.includes(m.chunkText)) {
            existing.chunkText += `\n\n${m.chunkText}`;
          }
        }
      }

      // 3. Absolute Mathematical Sorting
      const results = Array.from(docMap.values()).sort((a, b) => {
        const simDiff = b.internalScore - a.internalScore;
        if (Math.abs(simDiff) > 0.0001) return simDiff;

        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

      if (results.length > 0) {
        const topScore = results[0].internalScore;
        const strictResults: typeof results = [];

        // 4. Vector Edge-Cliff Detection (Aggressive Severance)
        for (let i = 0; i < results.length; i++) {
          const currentResult = results[i];

          // Outer boundary: Must remain within 4.5% to accommodate multi-language translations
          if (currentResult.internalScore < topScore - 0.045) {
            break;
          }

          // Inner cliff: If the score drops dramatically from the rank immediately above it, sever the list
          if (i > 0) {
            const dropFromPrevious =
              results[i - 1].internalScore - currentResult.internalScore;
            if (dropFromPrevious > 0.02) {
              break;
            }
          }

          strictResults.push(currentResult);
        }

        return {
          uniqueResults: strictResults.map(
            ({ internalScore, ...rest }) => rest,
          ),
          isFallback: false,
        };
      }
    }
  } catch (err) {
    console.error("[Semantic Search] Vector pipeline error:", err);
  }

  // -------------------------------------------------------------
  // BRANCH B: Title Lexical Fallback
  // -------------------------------------------------------------
  const titleFallback = await executeTitleSearch(dataSource, safeQ);
  return { uniqueResults: titleFallback, isFallback: true };
}
