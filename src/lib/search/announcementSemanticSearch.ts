// src/lib/search/announcementSemanticSearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
} from "./titleSearch";
import { classifyQuoted, escapeRegex } from "./quotedMatch";

/**
 * Semantic + literal search over ANNOUNCEMENTS.
 *
 * Announcements are short, born-digital text (title + contentText), each with a
 * single whole-record embedding (no chunking, no pages). This mirrors the
 * circular content engine's hybrid approach — vector similarity OR a literal
 * match on the plain-text body/title — but against one row per announcement.
 *
 * Returns rows tagged `type: "announcement"`, shaped like every other
 * SearchResultRow so the router can merge them with circulars transparently.
 */
export async function executeAnnouncementSemanticSearch(
  dataSource: DataSource,
  q: string,
): Promise<SearchResultRow[]> {
  const safeQ = (q || "").trim();
  if (!safeQ) return [];

  const mode = classifyQuoted(safeQ);
  const cleanQ = mode.phrase;

  // Literal operator mirrors the circular engine: quoted Latin phrase -> a
  // case-insensitive whole-token regex; everything else -> ILIKE substring.
  const literalParam = mode.wholeWord
    ? `(^|[^A-Za-z0-9])${escapeRegex(cleanQ)}([^A-Za-z0-9]|$)`
    : `%${cleanQ}%`;

  const litBody = mode.wholeWord
    ? `a."contentText" ~* $2`
    : `a."contentText" ILIKE $2`;
  const litTitle = mode.wholeWord ? `a.title ~* $2` : `a.title ILIKE $2`;
  const literalPredicate = `(${litBody} OR ${litTitle})`;

  try {
    const raw = await generateEmbedding(safeQ, "search_query");
    const queryVector = normalizeVector(raw);
    const vectorString = `[${queryVector.join(",")}]`;

    // Only rows that have an embedding participate in the vector clause; the
    // literal clause can still match rows that somehow lack one.
    const sql = `
      SELECT
        a.id,
        a.title,
        a."contentText",
        a.date,
        (1 - (a.embedding <=> $1::vector(768))) AS base_similarity,
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END) AS literal_boost
      FROM public.announcement a
      WHERE
        (a.embedding IS NOT NULL AND (1 - (a.embedding <=> $1::vector(768))) > 0.50)
        OR ${literalPredicate}
      ORDER BY (
        (CASE WHEN ${literalPredicate} THEN 2.0 ELSE 0 END)
        + COALESCE((1 - (a.embedding <=> $1::vector(768))), 0)
      ) DESC
      LIMIT 10;
    `;

    const matches = await dataSource.query<any[]>(sql, [
      vectorString,
      literalParam,
    ]);

    if (!matches || matches.length === 0) return [];

    const rows: Array<SearchResultRow & { internalScore: number }> = [];
    for (const m of matches) {
      const rawSim = Number(m.base_similarity) || 0;
      const literalBoost = Number(m.literal_boost) || 0;

      // Keep a row if it has the literal match OR a strong semantic score.
      if (literalBoost === 0 && rawSim < 0.6) continue;

      rows.push({
        id: m.id,
        type: "announcement",
        headline: m.title,
        url: `/announcements/${m.id}`,
        publishedAt: formatLuxonDate(m.date),
        similarity: Number(Math.min(0.99, Math.max(0, rawSim)).toFixed(3)),
        chunkText: m.contentText || "",
        internalScore: rawSim + literalBoost,
      });
    }

    return rows
      .sort((a, b) => b.internalScore - a.internalScore)
      .slice(0, 5)
      .map(({ internalScore, ...rest }) => rest);
  } catch (err) {
    console.error("[Announcement Semantic Search] pipeline error:", err);
    return [];
  }
}
