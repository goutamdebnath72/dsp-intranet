// src/lib/search/holidayPolicySearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import { SearchResultRow } from "./titleSearch";

/**
 * Semantic search over HOLIDAY POLICY CHUNKS (see holiday-policy-chunk.model
 * and holidays/policyChunks.ts) -- the free-text prose (compensatory-off
 * rules, RH deadline, proportionate entitlement, per-holiday reclassification
 * reasons) that structured queryHolidays() queries can't answer.
 *
 * Deliberately a SEPARATE, independent function from executePolicySearch
 * (semanticPolicySearch.ts), not folded into its carefully-tuned RRF fusion:
 * that engine's relevance floors were calibrated against a 19-query battery
 * of CIRCULAR text specifically, and this content has a different length/
 * style profile (short, self-contained policy paragraphs vs. long scanned
 * documents). Merged at the router level instead, additively -- the exact
 * same pattern already used for announcements (see smartSemanticRouter.ts).
 *
 * Year-aware in a way the main engine's tie-breaker isn't: policy specifics
 * genuinely differ by year (a different RH deadline date, a different
 * reclassification reason each year), so showing the WRONG year's chunk
 * isn't just imprecise, it's actively incorrect. A year mentioned in the
 * query hard-filters to that year; otherwise every year is searched and the
 * year is included in the returned text so it's never ambiguous which year
 * an answer applies to.
 */
export async function executeHolidayPolicySearch(
  dataSource: DataSource,
  q: string,
): Promise<SearchResultRow[]> {
  const safeQ = (q || "").trim();
  if (!safeQ) return [];

  const detectedYear = safeQ.match(/\b(20\d{2})\b/)?.[1];

  try {
    const raw = await generateEmbedding(safeQ, "search_query");
    const queryVector = normalizeVector(raw);
    const vectorString = `[${queryVector.join(",")}]`;

    const params: any[] = [vectorString];
    let yearClause = "";
    if (detectedYear) {
      params.push(Number(detectedYear));
      yearClause = `AND year = $${params.length}`;
    }
    params.push(10); // pool size

    const rows: any[] = await dataSource.query(
      `
      SELECT
        id, year, source_type, topic, holiday_name, text,
        (1 - (embedding <=> $1::vector(768))) AS cos
      FROM holiday_policy_chunks
      WHERE embedding IS NOT NULL ${yearClause}
      ORDER BY cos DESC
      LIMIT $${params.length};
      `,
      params,
    );

    if (!rows || rows.length === 0) return [];

    // Same relevance floor style as the announcement engine (short,
    // self-contained text, no separate literal-match arm here).
    const qualified = rows.filter((r) => Number(r.cos) >= 0.55);
    if (qualified.length === 0) return [];

    return qualified.slice(0, 5).map((r) => {
      const label =
        r.source_type === "reclassification"
          ? `${r.holiday_name} — reclassification (${r.year})`
          : `${r.topic} (${r.year} holiday policy)`;
      return {
        id: r.id,
        type: "holiday",
        headline: label,
        url: null, // not a document with a page to open -- text is shown inline
        publishedAt: null,
        similarity: Number(Math.min(0.99, Math.max(0, Number(r.cos))).toFixed(3)),
        chunkText: r.text || "",
      };
    });
  } catch (err) {
    console.error("[Holiday Policy Search] pipeline error:", err);
    return [];
  }
}
