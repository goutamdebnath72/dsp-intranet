// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSmartSemanticRouter } from "@/lib/search/smartSemanticRouter";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";
import { classifyQuoted, literalPhraseMatches } from "@/lib/search/quotedMatch";
import { cleanQueryString } from "@/lib/utils/queryCleaner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

// 1. The True Vector Noise Floor
// Google Gemini embeddings for completely unrelated text (e.g., Honda spark plugs) score ~0.55 - 0.62.
// Valid Hindi/Cross-lingual or long conversational queries score ~0.68 - 0.78.
const ABSOLUTE_NOISE_FLOOR = 0.65;

// The content engine may concatenate several chunks of a document with
// "\n\n". When the top-scoring chunk is OCR garbage (dense tables read as
// noise), we would rather SHOW the user a readable passage that still contains
// their words. This picks the best candidate chunk for DISPLAY only — it never
// affects ranking or which documents match.
function pickReadableExcerpt(
  chunkText: string | null | undefined,
  tokens: string[],
): string {
  const raw = (chunkText || "").trim();
  if (!raw) return raw;
  const candidates = raw
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (candidates.length <= 1) return raw;

  // Readability score: share of tokens that look like real words (letters,
  // length >= 2). OCR gibberish ("ftftAs", "lRl202S") scores low. Add a bonus
  // when the candidate contains the user's query tokens so the shown snippet
  // is both clean AND relevant.
  const score = (c: string) => {
    const words = c.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    const realish = words.filter((w) =>
      /^[\p{L}][\p{L}\p{M}.,:/()-]*$/u.test(w) && w.length >= 2,
    ).length;
    const readability = realish / words.length; // 0..1
    const lower = c.toLowerCase();
    const hits = tokens.filter((t) => lower.includes(t)).length;
    const relevance = tokens.length > 0 ? hits / tokens.length : 0; // 0..1
    return readability * 0.7 + relevance * 0.3;
  };

  let best = candidates[0];
  let bestScore = score(best);
  for (const c of candidates.slice(1)) {
    const sc = score(c);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

export async function GET(request: Request) {
  try {
    const dataSource = await getDb();

    if (!dataSource || !dataSource.isInitialized) {
      console.error("Database connection failed to initialize.");
      return NextResponse.json(
        { error: "Database initialization failed." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    // Sanitize junk characters up front. cleanQueryString deliberately
    // PRESERVES the double-quote (the whole-word trigger) and the literal
    // punctuation (. - / @ : # & ( ) , _) and both Indic scripts, so quoted
    // and literal lookups survive intact. Everything downstream — quote
    // classification, the vector embedding, and the literal term — uses this
    // single cleaned value so they can never disagree.
    const q = cleanQueryString(searchParams.get("q") || "");
    let mode = searchParams.get("mode") || "semantic";
    const userTicket = searchParams.get("ticket")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    // --- MODE 1: HEADLINE TITLE MATCH ---
    if (mode === "title") {
      if (INDIC_SCRIPT_REGEX.test(q)) {
        return NextResponse.json([]);
      }
      const results = await executeTitleSearch(dataSource, q);
      return NextResponse.json(results.slice(0, 5));
    }

    // --- TIER 3 EXECUTIVE AUTHORIZATION GATE ---
    if (mode === "intellectual") {
      let isAuthorizedExecutive = false;

      if (userTicket && /^4\d{5}$/.test(userTicket)) {
        try {
          const executiveRecord = await dataSource.query(
            `SELECT id FROM "user" WHERE "ticketNo" = $1 AND "ticketNo" LIKE '4%' LIMIT 1`,
            [userTicket],
          );
          if (executiveRecord && executiveRecord.length > 0) {
            isAuthorizedExecutive = true;
          }
        } catch (dbErr) {
          console.warn("User ticket verification error:", dbErr);
        }
      }

      if (!isAuthorizedExecutive && userTicket) {
        mode = "semantic";
      }
    }

    // --- RETRIEVE BEST MATCHING CIRCULARS ---
    const { uniqueResults } = await executeSmartSemanticRouter(dataSource, q);

    // Quoted-query classification (double-quote only; Latin-only gets
    // case-insensitive whole-word, Indic stays substring) — mirrors the SQL
    // literal branch in semanticContentSearch so the two never disagree.
    const quoted = classifyQuoted(q);
    const isExplicitQuotedQuery = quoted.isQuoted;
    const cleanQ = quoted.phrase.toLowerCase();
    const queryTokens = cleanQ.split(/\s+/).filter((t) => t.length > 2);

    const scoredResults = (uniqueResults || []).map((result) => {
      const headlineLower = (result.headline || "").toLowerCase();
      const chunkLower = (result.chunkText || "").toLowerCase();
      const rawSim =
        typeof result.similarity === "number" ? result.similarity : 0;

      // Identify Lexical Overlap for the UI Amber Box + quoted-query filter.
      // For a quoted Latin phrase this is case-insensitive & whole-word; for an
      // Indic quoted phrase or any unquoted query it is substring (as before).
      const isExactPhrase =
        quoted.phrase.length >= 2 &&
        (literalPhraseMatches(result.headline || "", quoted) ||
          literalPhraseMatches(result.chunkText || "", quoted));

      const tokenHits = queryTokens.filter(
        (t) => headlineLower.includes(t) || chunkLower.includes(t),
      ).length;
      // Headline hits mark the PRIMARY document (the circular actually about
      // the query) vs a chunk that merely mentions the words in passing.
      const headlineHits = queryTokens.filter((t) =>
        headlineLower.includes(t),
      ).length;
      const coverage =
        queryTokens.length > 0 ? tokenHits / queryTokens.length : 0;

      const isPerfectMatch =
        isExactPhrase || (queryTokens.length >= 2 && tokenHits >= 2);

      // Map to a human-friendly percentage. Within each band the score varies
      // CONTINUOUSLY with token coverage + headline hits + vector, so a primary
      // match separates from a supporting one instead of both flat-lining at 89.
      let displayMatch = 0;
      if (isExactPhrase) {
        // 94-98: exact phrase present; nudge by headline + vector.
        displayMatch =
          94 + Math.min(4, headlineHits * 1.5 + (rawSim > 0.7 ? 1 : 0));
      } else if (isPerfectMatch) {
        // 82-93: spread by how much of the query is covered and whether the
        // headline carries the terms (primary doc) plus a small vector nudge.
        displayMatch =
          82 +
          coverage * 6 + // 0-6 by token coverage
          Math.min(3, headlineHits * 1.5) + // 0-3 headline bonus
          (rawSim > 0.7 ? 2 : 0); // small semantic nudge
      } else {
        // 60-81: pure vector, scaled from the noise floor.
        displayMatch =
          60 +
          ((rawSim - ABSOLUTE_NOISE_FLOOR) / (0.9 - ABSOLUTE_NOISE_FLOOR)) * 21;
      }

      return {
        ...result,
        isExactPhrase,
        isPerfectMatch,
        matchPercentage: Math.min(99, Math.max(50, Math.round(displayMatch))),
      };
    });

    // Admission filter. A quoted query still demands the exact phrase.
    // Otherwise a result qualifies if EITHER it clears the vector noise floor
    // OR it carries a strong lexical signal (the exact phrase, or >=2 query
    // tokens present in headline/chunk). The lexical rescue matters because a
    // chunk that literally contains the user's words must never be discarded
    // just because a form/table document embeds with low semantic similarity
    // (e.g. "format B declaration for SIR" lives in a names table).
    const qualifiedResults = scoredResults.filter((item) => {
      if (isExplicitQuotedQuery) return item.isExactPhrase;
      const rawSim = typeof item.similarity === "number" ? item.similarity : 0;
      if (rawSim >= ABSOLUTE_NOISE_FLOOR) return true;
      return item.isExactPhrase || item.isPerfectMatch;
    });

    if (qualifiedResults.length === 0) {
      if (mode === "intellectual") {
        return NextResponse.json({
          synthesis: "No relevant circular records found to synthesize.",
          results: [],
        });
      }
      return NextResponse.json([]);
    }

    // Rank by match percentage
    const topPrimarySources = qualifiedResults
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        chunkText: pickReadableExcerpt(item.chunkText, queryTokens),
      }));

    // --- MODE 2: SMART SEMANTIC SEARCH ---
    if (mode === "semantic") {
      return NextResponse.json(topPrimarySources);
    }

    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS ---
    let synthesisText = "";
    if (topPrimarySources.length > 0) {
      synthesisText = await executeExecutiveSynthesis(q, topPrimarySources);
    } else {
      synthesisText = "No relevant circular records found to synthesize.";
    }

    return NextResponse.json({
      synthesis: synthesisText,
      results: topPrimarySources,
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
