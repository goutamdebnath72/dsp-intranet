// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeHeadlineEmbeddingSearch } from "@/lib/search/headlineEmbeddingSearch";
import { executeSmartSemanticRouter } from "@/lib/search/smartSemanticRouter";
import {
  executeExecutiveSynthesis,
  type SynthesisResult,
} from "@/lib/search/executiveSynthesis";
import { classifyQuoted, literalPhraseMatches } from "@/lib/search/quotedMatch";
import { cleanQueryString } from "@/lib/utils/queryCleaner";
import { answerOmnibar, parseRetry } from "@/lib/nl2sql/omnibar";
import { contentTokens, isHolidayTopic, topicTokens } from "@/lib/search/topicGate";
import { applyRankAdjustments } from "@/lib/search/rankAdjust";
import { queryTokenWeights, weightedCoverage } from "@/lib/search/tokenWeights";
import { loadDocumentChunks, bestPassage } from "@/lib/search/documentText";
import { findSailDepartmentInText } from "@/lib/employees/sailDepartments";
import { normTerm } from "@/lib/employees/designations";

// Vercel stops a serverless function after a time limit. A question can legitimately take
// longer than the default (the language model may have to wait for its per-minute allowance),
// so allow up to 60 seconds, as the nl2sql route does.
export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

// 1. The True Vector Noise Floor
// Google Gemini embeddings for completely unrelated text (e.g., Honda spark plugs) score ~0.55 - 0.62.
// Valid Hindi/Cross-lingual or long conversational queries score ~0.68 - 0.78.
const ABSOLUTE_NOISE_FLOOR = 0.65;

// For a person-name-shaped query (2-3 pure-Latin words, e.g. "goutam debnath"),
// a circular/announcement must have a real textual anchor (the words appear) or
// an unusually strong vector match to qualify — otherwise off-topic documents
// ride the noise floor and surface as meaningless ~67% matches. This is scoped
// to name-shaped queries only, so cross-lingual semantic matches (which score
// ~0.68-0.78 with no shared words) are unaffected.
const NAME_QUERY_VECTOR_BAR = 0.82;

// A well-formed empty SynthesisResult so intellectual-mode always returns the
// typed object the frontend expects — never a bare string.
function emptyBriefing(message: string): SynthesisResult {
  return {
    overview: message,
    keyFindings: [],
    table: null,
    charts: [],
    citations: [],
  };
}

// How much text of each source circular to hand the synthesis model. The UI
// snippet stays short (pickReadableExcerpt); the synthesis needs the FULL
// circular so figures living in a different chunk than the one that matched the
// query (e.g. an OCR rate table) are actually in context.
const SYNTH_CHARS_PER_CIRCULAR = 6000;

// Fetch the complete chunk text of the given circulars (all chunks, in order)
// and return a map id -> concatenated text. This is what feeds the synthesis,
// independent of which single chunk matched the query vector.
async function fetchFullCircularText(
  dataSource: import("typeorm").DataSource,
  ids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  try {
    const rows = await dataSource.query<
      Array<{ circular_id: number; text: string }>
    >(
      `SELECT circular_id, text
         FROM public.circular_chunks
        WHERE circular_id = ANY($1::int[])
        ORDER BY circular_id ASC, chunk_index ASC`,
      [ids],
    );
    for (const r of rows) {
      const prev = out.get(r.circular_id) || "";
      if (prev.length >= SYNTH_CHARS_PER_CIRCULAR) continue;
      out.set(
        r.circular_id,
        prev ? `${prev}\n${r.text || ""}` : r.text || "",
      );
    }
    // clamp each to the budget
    for (const [k, v] of out) {
      if (v.length > SYNTH_CHARS_PER_CIRCULAR) {
        out.set(k, v.slice(0, SYNTH_CHARS_PER_CIRCULAR));
      }
    }
  } catch (e) {
    console.warn("fetchFullCircularText failed; falling back to excerpts:", e);
  }
  return out;
}

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

    // Name-shaped: 2-3 words, all pure Latin letters (a person's name). Such a
    // query must anchor lexically in a document to qualify it (see the filter
    // below) — this kills the "name -> random low-score circular" noise.
    const nameTokens = q.trim().split(/\s+/);
    const looksLikeName =
      nameTokens.length >= 2 &&
      nameTokens.length <= 3 &&
      !INDIC_SCRIPT_REGEX.test(q) &&
      nameTokens.every((t) => /^[A-Za-z][A-Za-z.]*$/.test(t));

    // Only treat it as a name if it actually matches a PERSON in the directory
    // (same phonetic check the People search uses). This distinguishes a real
    // name ("goutam debnath") from a document phrase that happens to be two
    // Latin words ("leave policy") — the latter keeps the normal semantic floor.
    let isNameShaped = false;
    if (looksLikeName) {
      try {
        const nameHit = await dataSource.query(
          `SELECT 1 FROM public."user"
             WHERE public.phonetic_subseq_match($1, name_phonetic)
             LIMIT 1`,
          [q],
        );
        isNameShaped = Array.isArray(nameHit) && nameHit.length > 0;
      } catch {
        isNameShaped = false;
      }
    }

    // A query that NAMES A DEPARTMENT ("gautham c&it", "roy blast furnace") is a
    // directory lookup, not a circular topic. If the leftover fragment (after
    // removing the department) is an actual person, hold the circular side to the
    // same strict anchor as a plain name query so floor-riding noise circulars
    // don't leak in under the People results. A department + a real TOPIC
    // fragment ("c&it attendance") is NOT a person -> keeps the normal floor.
    if (!isNameShaped && !INDIC_SCRIPT_REGEX.test(q)) {
      try {
        const dept = await findSailDepartmentInText(q);
        if (dept) {
          const fragment = normTerm(q)
            .split(dept.phrase)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (fragment.length >= 2) {
            const fragHit = await dataSource.query(
              `SELECT 1 FROM public."user"
                 WHERE public.phonetic_subseq_match($1, name_phonetic)
                 LIMIT 1`,
              [fragment],
            );
            if (Array.isArray(fragHit) && fragHit.length > 0) isNameShaped = true;
          }
        }
      } catch {
        /* department-anchor best-effort */
      }
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

    // --- EMPLOYEE QUESTIONS: the language model writes the read-only SQL ---
    // Holiday questions keep their deterministic answers; every other question goes to the model, which
    // decides whether it is an employee question (answered from the database, with its reading, SQL,
    // departments covered and a tick/cross) or not (then we fall through to circular search below).
    // If the model path is unavailable the previous rule-based engine answers instead.
    // See src/lib/nl2sql/omnibar.ts. Kill switch: NL2SQL_OMNIBAR_ENABLED=false.
    // Test hook (never active in production builds): ?retrievalOnly=1 skips every
    // employee/holiday answer path -- and with it every model call -- so the circular
    // search can be measured on its own, for free and repeatably (scripts/circular-battery.mjs).
    const retrievalOnly = process.env.NODE_ENV !== "production" && searchParams.get("retrievalOnly") === "1";
    if (mode === "semantic" && !retrievalOnly) {
      const payload = await answerOmnibar(q, userTicket || null, parseRetry(searchParams));
      if (payload) return NextResponse.json({ analytics: payload });
    }

    // --- RETRIEVE BEST MATCHING CIRCULARS ---
    const { uniqueResults } = await executeSmartSemanticRouter(dataSource, q);

    // Quoted-query classification (double-quote only; Latin-only gets
    // case-insensitive whole-word, Indic stays substring) — mirrors the SQL
    // literal branch in semanticContentSearch so the two never disagree.
    const quoted = classifyQuoted(q);
    const isExplicitQuotedQuery = quoted.isQuoted;
    const cleanQ = quoted.phrase.toLowerCase();
    // Lexical evidence uses CONTENT words only (see lib/search/topicGate.ts):
    // counting "what", "the", "for" made nearly every chunk a "perfect match".
    // Quoted and Indic queries keep the original token rule unchanged.
    const strictLexical = !isExplicitQuotedQuery && !INDIC_SCRIPT_REGEX.test(q);
    const allTokens = cleanQ.split(/\s+/).filter((t) => t.length > 2);
    const contentOnly = strictLexical ? contentTokens(cleanQ) : [];
    const queryTokens = strictLexical && contentOnly.length > 0 ? contentOnly : allTokens;
    // What the question is ABOUT (content words minus who-it-is-for words): a result
    // that shares only "contract workers" with "leave policy for contract workers"
    // is about something else, however many audience words it repeats.
    const topicQ = strictLexical ? topicTokens(queryTokens) : [];
    // Rarity weights (lib/search/tokenWeights.ts): a word found in every circular counts
    // little, a word found in one or two counts a lot. Quoted/Indic queries stay unweighted.
    const tokenWeight = strictLexical ? await queryTokenWeights(dataSource, queryTokens) : null;
    // Lexical evidence is read from the BEST PASSAGE among all of a circular's chunks, not only
    // the one chunk the engine surfaced (lib/search/documentText.ts). Quoted/Indic queries keep
    // the single chunk.
    const docChunks = strictLexical
      ? await loadDocumentChunks(
          dataSource,
          (uniqueResults || []).filter((r: any) => r.type === "circular").map((r: any) => Number(r.id)),
        )
      : new Map<number, string[]>();
    // Holiday notes are the answer to a holiday question: lift them BEFORE the top-5 cut so a
    // slightly low-scoring note cannot be crowded out by circulars (not for contractor questions).
    const holidayFloor = strictLexical && isHolidayTopic(q) && !/\bcontract/i.test(q);

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

      const passages = result.type === "circular" ? docChunks.get(Number(result.id)) : undefined;
      const passage = bestPassage(
        queryTokens,
        headlineLower,
        passages && passages.length ? [chunkLower, ...passages] : [chunkLower],
        tokenWeight,
      );
      const evidenceLower = passage.evidence;
      const hitTokens = passage.hits;
      const tokenHits = hitTokens.length;
      // Headline hits mark the PRIMARY document (the circular actually about
      // the query) vs a chunk that merely mentions the words in passing.
      const headlineHits = queryTokens.filter((t) =>
        headlineLower.includes(t),
      ).length;
      const coverage = tokenWeight
        ? weightedCoverage(queryTokens, hitTokens, tokenWeight)
        : queryTokens.length > 0
          ? tokenHits / queryTokens.length
          : 0;

      // A "perfect" lexical match must cover most of what was asked, not just any
      // two words (a notice that only shares "contract workers" with
      // "leave policy for contract workers" is not a perfect match).
      const topicRelevant =
        topicQ.length === 0 ||
        topicQ.some((t) => headlineLower.includes(t)) ||
        topicQ.filter((t) => evidenceLower.includes(t)).length / topicQ.length > 0.5 ||
        rawSim >= 0.88;
      const isPerfectMatch =
        isExactPhrase ||
        (queryTokens.length >= 2 &&
          tokenHits >= 2 &&
          (!strictLexical || (coverage >= 0.6 && topicRelevant)));

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

      if (holidayFloor && result.type === "holiday") displayMatch = Math.max(displayMatch, 86);

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
      if (isNameShaped) {
        // A person-name query needs a genuine textual anchor, or a very strong
        // vector score — no floor-riding. Documents that actually mention the
        // name (lexical hit) still qualify.
        return (
          item.isExactPhrase ||
          item.isPerfectMatch ||
          rawSim >= NAME_QUERY_VECTOR_BAR
        );
      }
      if (rawSim >= ABSOLUTE_NOISE_FLOOR) return true;
      return item.isExactPhrase || item.isPerfectMatch;
    });

    if (qualifiedResults.length === 0) {
      if (mode === "intellectual") {
        return NextResponse.json({
          synthesis: emptyBriefing(
            "No relevant circular records found to synthesize.",
          ),
          results: [],
        });
      }
      return NextResponse.json([]);
    }

    // Rank by match percentage. Intellectual (synthesis) mode gets a wider
    // candidate pool than the plain semantic display -- executeExecutiveSynthesis
    // now runs its own decisive year/population relevance filter on whatever it's
    // handed (see that file), and needs real alternatives to fall back on when
    // the top-ranked candidates turn out to be a wrong-year or wrong-population
    // circular. Semantic/title mode is untouched: still exactly 5, same as before.
    const PRIMARY_SOURCE_LIMIT = mode === "intellectual" ? 10 : 5;
    const topPrimarySources = qualifiedResults
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, PRIMARY_SOURCE_LIMIT)
      .map((item) => ({
        ...item,
        chunkText: pickReadableExcerpt(item.chunkText, queryTokens),
      }));

    // --- MODE 2: SMART SEMANTIC SEARCH ---
    // Enter uses this path. Fold the literal HEADLINE search in too, so a single
    // Enter covers circular/announcement titles (literal) AND body (literal +
    // vector) — the Headline button is no longer required. Exact-title hits are
    // boosted to the top; body/semantic hits follow. (Headline search is Latin-
    // only; Indic queries rely on the vector path, unchanged.)
    if (mode === "semantic") {
      let merged = topPrimarySources as any[];
      if (!INDIC_SCRIPT_REGEX.test(q)) {
        try {
          const byKey = new Map<string, any>(
            merged.map((r) => [`${r.type}-${r.id}`, r]),
          );

          const titleHits = await executeTitleSearch(dataSource, q);
          for (const t of titleHits as any[]) {
            const key = `${t.type}-${t.id}`;
            const existing = byKey.get(key);
            if (existing) {
              // already a body/semantic hit — promote it: an exact title match
              // is the strongest signal.
              existing.matchPercentage = Math.max(
                existing.matchPercentage ?? 0,
                96,
              );
              existing.isExactPhrase = true;
            } else {
              byKey.set(key, {
                ...t,
                isExactPhrase: true,
                isPerfectMatch: true,
                matchPercentage: 96,
                chunkText: t.chunkText || "",
              });
            }
          }

          // Headline-only embedding hits (circulars with no body chunks at
          // all -- see headlineEmbeddingSearch.ts). A real cosine
          // similarity, not a literal match, so it gets its own honest
          // percentage rather than the fixed 96 a literal title match
          // earns -- these should read as "related" not "exact."
          // The holiday-list circulars (no body text) only belong in the results
          // when the question is about holidays; otherwise they are filler.
          const headlineHits = isHolidayTopic(q)
            ? await executeHeadlineEmbeddingSearch(dataSource, q, 8)
            : [];
          for (const h of headlineHits as any[]) {
            const key = `${h.type}-${h.id}`;
            const existing = byKey.get(key);
            const pct = Math.round((h.similarity ?? 0) * 100);
            if (existing) {
              existing.matchPercentage = Math.max(existing.matchPercentage ?? 0, pct);
            } else {
              byKey.set(key, {
                ...h,
                matchPercentage: pct,
                chunkText: "",
                fromHeadlineEmbedding: true,
              });
            }
          }

          // Rank rules (year, audience, holiday-first, cutoff): see lib/search/rankAdjust.ts.
          // Quoted and Indic queries pass through unchanged.
          const sortedByPct = Array.from(byKey.values()).sort(
            (a, b) => (b.matchPercentage ?? 0) - (a.matchPercentage ?? 0),
          );
          merged = applyRankAdjustments(q, sortedByPct as any[]).slice(0, 6);
        } catch (e) {
          // headline fold is best-effort; body/semantic results still stand.
          console.warn("headline fold failed:", (e as any)?.message ?? e);
        }
      }
      return NextResponse.json(merged);
    }

    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS ---
    // Feed synthesis the FULL text of each source circular (all chunks), not
    // the single readable UI excerpt — so figures in an unmatched chunk (e.g. a
    // rate table) are in context. The UI list still shows the short excerpt.
    let synthesis: SynthesisResult;
    if (topPrimarySources.length > 0) {
      const fullText = await fetchFullCircularText(
        dataSource,
        topPrimarySources.map((r) => r.id),
      );
      const synthesisSources = topPrimarySources.map((r) => ({
        ...r,
        chunkText: fullText.get(r.id) || r.chunkText,
      }));
      synthesis = await executeExecutiveSynthesis(q, synthesisSources);
    } else {
      synthesis = emptyBriefing(
        "No relevant circular records found to synthesize.",
      );
    }

    return NextResponse.json({
      synthesis,
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
