// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSmartSemanticRouter } from "@/lib/search/smartSemanticRouter";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

// Google Gemini text-embedding-004 baseline parameters
const DENSE_NOISE_FLOOR = 0.7;
const DENSE_EXACT_CEILING = 0.92;

function calculateMatchPercentage(
  rawSimilarity: number | null | undefined,
  isExactPhrase: boolean,
  tokenHits: number,
  totalTokens: number,
): number {
  const raw = typeof rawSimilarity === "number" ? rawSimilarity : 0;

  // 1. Verbatim text phrase match: authoritative confidence (94% - 99%)
  if (isExactPhrase) {
    return 94 + Math.min(5, Math.max(0, Math.round((raw - 0.7) * 20)));
  }

  // 2. Strong Conceptual/Keyword Overlap (e.g., "motivational award policy" matching "motivational award scheme")
  // Elevates to high confidence bracket (82% - 93%)
  if (totalTokens >= 2 && tokenHits >= 2) {
    return 82 + Math.min(11, Math.max(0, Math.round((raw - 0.75) * 40)));
  }

  // 3. Pure Semantic / Single Keyword Match
  if (typeof rawSimilarity !== "number") return 0;
  const normalized =
    ((raw - DENSE_NOISE_FLOOR) / (DENSE_EXACT_CEILING - DENSE_NOISE_FLOOR)) *
    100;
  return Math.min(81, Math.max(0, Math.round(normalized)));
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
    const q = (searchParams.get("q") || "").trim();
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

    const cleanQ = q.replace(/^"|"$/g, "").trim().toLowerCase();
    const isExplicitQuotedQuery = q.startsWith('"') && q.endsWith('"');

    // Extract meaningful keyword tokens (length > 2 to keep acronyms like DSP, ECO)
    const queryTokens = cleanQ.split(/\s+/).filter((t) => t.length > 2);

    const scoredResults = (uniqueResults || []).map((result) => {
      const headlineLower = (result.headline || "").toLowerCase();
      const chunkLower = (result.chunkText || "").toLowerCase();

      // Full continuous phrase match
      const isExactPhrase =
        cleanQ.length >= 2 &&
        (headlineLower.includes(cleanQ) || chunkLower.includes(cleanQ));

      // Individual keyword overlaps
      const tokenHits = queryTokens.filter(
        (t) => headlineLower.includes(t) || chunkLower.includes(t),
      ).length;

      // UX Trigger: Upgrade strong conceptual queries to show the Amber Card + Context Drawer
      // Example: "motivational award policy" hits 2 tokens -> triggers UI context!
      const isPerfectMatch =
        isExactPhrase || (queryTokens.length >= 2 && tokenHits >= 2);

      const matchPercentage = calculateMatchPercentage(
        result.similarity,
        isExactPhrase,
        tokenHits,
        queryTokens.length,
      );

      return {
        ...result,
        isExactPhrase,
        isPerfectMatch,
        matchPercentage,
      };
    });

    // Filtering rules:
    const qualifiedResults = scoredResults.filter((item) => {
      if (isExplicitQuotedQuery) {
        return item.isExactPhrase;
      }

      // If it triggered the context drawer (exact phrase or strong token match), KEEP it
      if (item.isPerfectMatch) return true;

      // Otherwise, pure semantic similarity must be >= 40% confidence to bypass noise floor
      return item.matchPercentage >= 40;
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
      .slice(0, 5);

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
