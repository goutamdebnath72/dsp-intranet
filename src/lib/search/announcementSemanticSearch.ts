// src/lib/search/announcementSemanticSearch.ts
import { PERF } from "@/lib/perf/switches";
import { DataSource } from "typeorm";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
} from "./titleSearch";
import { classifyQuoted, escapeRegex } from "./quotedMatch";
import { contentTokens } from "./topicGate";
import { termFamilyTsTerms } from "./termFamilies";

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
/**
 * THE WORDS OF A QUESTION, FOUND WHEREVER THEY STAND IN A PASSAGE. A person asks "OTP valid for five minutes" and the PDF says "OTPs remain valid for only five minutes": the phrase is not there as typed, and a
 * long passage that holds other things as well is only a little like the question in meaning, so neither the substring match nor the vector finds it. What does is the circulars' own test: the question's content
 * words (not "what", "the", "for") are looked for in the passage, and the passage counts when it holds most of them. `lexicalTokens` are those words; `isLexicalHit` is the test.
 */
export function lexicalTokens(q: string): string[] {
  return Array.from(new Set(contentTokens((q || "").toLowerCase().replace(/["“”]/g, " ")))).slice(0, 8);
}
/** how many of the words stand in the text (a word counts inside a longer one: "otp" in "OTPs") */
export function wordsFound(tokens: string[], text: string): number {
  const t = (text || "").toLowerCase();
  return tokens.filter((w) => t.includes(w)).length;
}
/** Two or more words: at least two of them and at least 60% of them. One word: that word, if it has 4 letters or more. */
export function isLexicalHit(tokens: string[], text: string): boolean {
  const n = wordsFound(tokens, text);
  if (tokens.length >= 2) return n >= 2 && n / tokens.length >= 0.6;
  return tokens.length === 1 && n === 1 && tokens[0].length >= 4;
}
/** the words as a Postgres text-search query: any of them (the stricter test is isLexicalHit); only letters and digits go in */
export function orTsQuery(tokens: string[]): string {
  return tokens.map((w) => w.replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean).join(" | ");
}

/** One passage of an announcement that matched (announcement_chunk: its own text, or its PDF), as the database returns it */
export interface PdfChunkHit {
  /** where the passage is: the announcement's own text, or its PDF */
  source: "body" | "pdf";
  id: number;
  title: string;
  date: unknown;
  page: number | null;
  text: string;
  similarity: number;
  literal: boolean;
}

type RecordRow = SearchResultRow & { internalScore: number };

/**
 * Puts the passages that matched (of an announcement's own text, and of its PDF) together with the announcements that matched by their title and body: ONE row for each announcement, whichever way it was found, ranked by its best score.
 * A PDF passage that is the best evidence (a literal hit, or a stronger vector than the title and body gave) is the row's text, with its page (the window opens the PDF there) and `matchInPdf` set.
 * The same rule as the record's own: a passage counts if it holds the words, or is strongly similar (0.6).
 */
export function mergeAnnouncementHits(records: RecordRow[], chunks: PdfChunkHit[]): Array<SearchResultRow & { internalScore: number }> {
  const byId = new Map<number, RecordRow>();
  for (const r of records) byId.set(r.id, r);
  const bestChunk = new Map<number, { hit: PdfChunkHit; score: number }>();
  for (const c of chunks) {
    if (!c.literal && c.similarity < 0.6) continue;
    const score = c.similarity + (c.literal ? 2 : 0);
    const prev = bestChunk.get(c.id);
    if (!prev || score > prev.score) bestChunk.set(c.id, { hit: c, score });
  }
  for (const [id, { hit, score }] of Array.from(bestChunk.entries())) {
    const rec = byId.get(id);
    if (rec && rec.internalScore >= score) { if (hit.literal) rec.lexicalHit = true; continue; } // the title and body are the better evidence
    const inPdf = hit.source === "pdf";
    const page = inPdf && hit.page && hit.page > 0 ? hit.page : null;
    byId.set(id, {
      id,
      type: "announcement",
      headline: rec?.headline ?? hit.title,
      url: `/announcements/${id}`,
      publishedAt: rec?.publishedAt ?? formatLuxonDate(hit.date),
      similarity: Number(Math.min(0.99, Math.max(0, hit.similarity)).toFixed(3)),
      chunkText: hit.text,
      matchPage: page,
      matchPages: page ? [page] : undefined,
      ...(inPdf ? { matchInPdf: true } : {}),
      ...(hit.literal ? { lexicalHit: true } : {}),
      internalScore: score,
    });
  }
  return Array.from(byId.values());
}

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

    // The four queries below (title and body, the words in title and body, the PDFs' passages, the words in the passages) need only the vector and the words, never each other's rows: they are started TOGETHER and read in the
    // original order afterwards, so the answer is the same and the search waits for the slowest one instead of the sum of the four (each is a round trip to the database).
    const tokens = mode.isQuoted ? [] : lexicalTokens(safeQ);
    // the other words of a term family the question uses are alternatives too (src/lib/search/termFamilies.ts); the typed words stay, and isLexicalHit still counts only them
    const tsq = tokens.length ? [orTsQuery(tokens), ...termFamilyTsTerms(safeQ)].filter(Boolean).join(" | ") : "";
    const litChunk = mode.wholeWord ? `c.text ~* $2` : `c.text ILIKE $2`;
    // a query that fails is read as "no rows" by the part that reads it (null), exactly as each part's own catch did; the .catch here only keeps a failure from being unhandled before it is read.
    // `later(f)` starts f NOW when the queries run together, and only when it is first read (as before) when src/lib/perf/switches.js says parallelAnnouncementSearch: false
    const later = <T,>(f: () => Promise<T | null>): (() => Promise<T | null>) => {
      if (PERF.parallelAnnouncementSearch) { const p = f(); return () => p; }
      let p: Promise<T | null> | null = null;
      return () => (p ??= f());
    };
    const lexQuery = tsq
      ? later(() => dataSource
          .query<any[]>(
            `SELECT a.id, a.title, a."contentText", a.date, COALESCE(1 - (a.embedding <=> $1::vector(768)), 0) AS base_similarity
             FROM public.announcement a
            WHERE to_tsvector('english', a.title || ' ' || COALESCE(a."contentText", '')) @@ to_tsquery('english', $2)
            ORDER BY ts_rank_cd(to_tsvector('english', a.title || ' ' || COALESCE(a."contentText", '')), to_tsquery('english', $2)) DESC
            LIMIT 10`,
            [vectorString, tsq],
          )
          .catch(() => null))
      : null;
    const chunkQuery = later(() => dataSource
      .query<any[]>(
        `SELECT c.announcement_id AS id, c.source, a.title, a.date, c.page, c.text,
                (1 - (c.embedding <=> $1::vector(768))) AS similarity,
                (${litChunk}) AS literal
           FROM public.announcement_chunk c
           JOIN public.announcement a ON a.id = c.announcement_id
          WHERE (c.embedding IS NOT NULL AND (1 - (c.embedding <=> $1::vector(768))) > 0.50) OR ${litChunk}
          ORDER BY ((CASE WHEN ${litChunk} THEN 2.0 ELSE 0 END) + COALESCE((1 - (c.embedding <=> $1::vector(768))), 0)) DESC
          LIMIT 20`,
        [vectorString, literalParam],
      )
      .catch(() => null));
    const lexChunkQuery = tsq
      ? later(() => dataSource
          .query<any[]>(
            `SELECT c.announcement_id AS id, c.source, a.title, a.date, c.page, c.text, COALESCE(1 - (c.embedding <=> $1::vector(768)), 0) AS similarity
             FROM public.announcement_chunk c
             JOIN public.announcement a ON a.id = c.announcement_id
            WHERE to_tsvector('english', c.text) @@ to_tsquery('english', $2)
            ORDER BY ts_rank_cd(to_tsvector('english', c.text), to_tsquery('english', $2)) DESC
            LIMIT 20`,
            [vectorString, tsq],
          )
          .catch(() => null))
      : null;

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

    const rows: RecordRow[] = [];
    for (const m of matches || []) {
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

    // The words of the question found in the title and body (not as the typed phrase: "OTP valid for five minutes" in "OTPs remain valid for only five minutes"). A failure here leaves the rows as they were.
    if (tsq) {
      try {
        const lexRows = await lexQuery!(); // null: the query failed, the rows stand
        for (const m of lexRows || []) {
          if (!isLexicalHit(tokens, `${m.title} ${m.contentText ?? ""}`)) continue;
          const rawSim = Number(m.base_similarity) || 0;
          const have = rows.find((r) => r.id === m.id);
          if (have) { have.lexicalHit = true; continue; }
          rows.push({ id: m.id, type: "announcement", headline: m.title, url: `/announcements/${m.id}`, publishedAt: formatLuxonDate(m.date), similarity: Number(Math.min(0.99, Math.max(0, rawSim)).toFixed(3)), chunkText: m.contentText || "", lexicalHit: true, internalScore: rawSim + 1.5 });
        }
      } catch {
        /* the rows stand */
      }
    }
    for (const r of rows) if (r.internalScore - r.similarity! >= 1.99) r.lexicalHit = true; // the typed words themselves were found

    // The PDFs' own text: passages of announcement_chunk (a PDF-only announcement has nothing else to be found by). A missing table or a failure here leaves the title and body results as they were.
    let chunkHits: PdfChunkHit[] = [];
    try {
      const chunkRows = await chunkQuery();
      if (chunkRows === null) throw new Error("announcement_chunk query failed"); // as before: the passages are left out
      chunkHits = (chunkRows || []).map((c) => ({
        source: c.source === "pdf" ? ("pdf" as const) : ("body" as const),
        id: Number(c.id),
        title: String(c.title ?? ""),
        date: c.date,
        page: c.page == null ? null : Number(c.page),
        text: String(c.text ?? ""),
        similarity: Number(c.similarity) || 0,
        literal: c.literal === true,
      }));
      // ... and the words of the question found in a passage (any order, any inflection): the passage counts when it holds most of them
      if (tsq) {
        const lexChunks = await lexChunkQuery!();
        if (lexChunks === null) throw new Error("announcement_chunk words query failed"); // as before: a failure here drops every passage
        for (const c of lexChunks || []) {
          if (!isLexicalHit(tokens, String(c.text ?? ""))) continue;
          chunkHits.push({
            source: c.source === "pdf" ? "pdf" : "body",
            id: Number(c.id),
            title: String(c.title ?? ""),
            date: c.date,
            page: c.page == null ? null : Number(c.page),
            text: String(c.text ?? ""),
            similarity: Number(c.similarity) || 0,
            literal: true,
          });
        }
      }
    } catch {
      chunkHits = [];
    }

    return mergeAnnouncementHits(rows, chunkHits)
      .sort((a, b) => b.internalScore - a.internalScore)
      .slice(0, 5)
      .map(({ internalScore, ...rest }) => rest);
  } catch (err) {
    console.error("[Announcement Semantic Search] pipeline error:", err);
    return [];
  }
}
