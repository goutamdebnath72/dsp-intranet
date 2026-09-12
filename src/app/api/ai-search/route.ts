// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSmartSemanticRouter } from "@/lib/search/smartSemanticRouter";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

// Baseline floor for Google Gemini text-embedding-004
// Cosine scores below 0.835 represent conversational/language background noise
const SEMANTIC_SIMILARITY_THRESHOLD = 0.835;

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

    // Filter out items falling below the semantic confidence threshold
    const qualifiedResults = (uniqueResults || []).filter((item) => {
      if (typeof item.similarity === "number") {
        return item.similarity >= SEMANTIC_SIMILARITY_THRESHOLD;
      }
      return true;
    });

    // If no records meet the relevance bar, return empty immediately
    if (qualifiedResults.length === 0) {
      if (mode === "intellectual") {
        return NextResponse.json({
          synthesis: "No relevant circular records found to synthesize.",
          results: [],
        });
      }
      return NextResponse.json([]);
    }

    const cleanQ = q.replace(/^"|"$/g, "").toLowerCase();

    // Map results to include the Perfect Match flag and keep the chunkText
    const topPrimarySources = qualifiedResults
      .slice(0, 5)
      .map((result, index) => {
        let isPerfectMatch = false;

        // If it's the #1 result and the exact query exists in the headline or chunk, flag it
        if (index === 0 && cleanQ.length > 2) {
          const headlineLower = (result.headline || "").toLowerCase();
          const chunkLower = (result.chunkText || "").toLowerCase();
          if (headlineLower.includes(cleanQ) || chunkLower.includes(cleanQ)) {
            isPerfectMatch = true;
          }
        }

        return { ...result, isPerfectMatch };
      });

    // --- MODE 2: SMART SEMANTIC SEARCH (Return Documents Only) ---
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
