// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSmartSemanticRouter } from "@/lib/search/smartSemanticRouter";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

// 1. The True Vector Noise Floor
// Google Gemini embeddings for completely unrelated text (e.g., Honda spark plugs) score ~0.55 - 0.62.
// Valid Hindi/Cross-lingual or long conversational queries score ~0.68 - 0.78.
const ABSOLUTE_NOISE_FLOOR = 0.65;

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
    const queryTokens = cleanQ.split(/\s+/).filter((t) => t.length > 2);

    const scoredResults = (uniqueResults || []).map((result) => {
      const headlineLower = (result.headline || "").toLowerCase();
      const chunkLower = (result.chunkText || "").toLowerCase();
      const rawSim =
        typeof result.similarity === "number" ? result.similarity : 0;

      // Identify Lexical Overlap purely for UI Amber Box highlighting
      const isExactPhrase =
        cleanQ.length >= 2 &&
        (headlineLower.includes(cleanQ) || chunkLower.includes(cleanQ));

      const tokenHits = queryTokens.filter(
        (t) => headlineLower.includes(t) || chunkLower.includes(t),
      ).length;

      const isPerfectMatch =
        isExactPhrase || (queryTokens.length >= 2 && tokenHits >= 2);

      // Map the display percentage so it looks natural to humans (60% - 99%)
      let displayMatch = 0;
      if (isExactPhrase) {
        displayMatch = 94 + (rawSim > 0.7 ? 4 : 0);
      } else if (isPerfectMatch) {
        displayMatch = 85 + (rawSim > 0.7 ? 4 : 0);
      } else {
        // Scale remaining valid vectors (0.65 to 0.90) to a UI-friendly 60% to 85%
        displayMatch =
          60 +
          ((rawSim - ABSOLUTE_NOISE_FLOOR) / (0.9 - ABSOLUTE_NOISE_FLOOR)) * 25;
      }

      return {
        ...result,
        isExactPhrase,
        isPerfectMatch,
        matchPercentage: Math.min(99, Math.max(50, Math.round(displayMatch))),
      };
    });

    // The ONLY filter applied: A clean, wide vector threshold. No more token math for filtering.
    const qualifiedResults = scoredResults.filter((item) => {
      if (isExplicitQuotedQuery) return item.isExactPhrase;
      const rawSim = typeof item.similarity === "number" ? item.similarity : 0;
      return rawSim >= ABSOLUTE_NOISE_FLOOR;
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
