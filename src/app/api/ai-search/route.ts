// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSemanticSearch } from "@/lib/search/semanticSearch";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

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

    const rawUrl = request.url;
    const match = rawUrl.match(/[?&]q=([^&]*)/);
    let q = "";

    if (match && match[1]) {
      try {
        q = decodeURIComponent(match[1]).trim();
      } catch {
        q = match[1].trim();
      }
    } else {
      const url = new URL(request.url);
      q = (url.searchParams.get("q") || "").trim();
    }

    console.log(`[RAW URL EXTRACT] q: "${q}" | length: ${q.length}`);

    const url = new URL(request.url);
    let mode = url.searchParams.get("mode") || "semantic";
    const userTicket = url.searchParams.get("ticket")?.trim();

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
    const { uniqueResults } = await executeSemanticSearch(dataSource, q);

    const topPrimarySources = uniqueResults.slice(0, 5);

    // --- MODE 2: SMART SEMANTIC SEARCH (Return Documents Only) ---
    if (mode === "semantic") {
      return NextResponse.json(
        topPrimarySources.map(({ chunkText, ...rest }) => rest),
      );
    }

    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS (Always Generate Synthesis) ---
    let synthesisText = "";
    if (uniqueResults.length > 0) {
      synthesisText = await executeExecutiveSynthesis(q, uniqueResults);
    } else {
      synthesisText = "No relevant circular records found to synthesize.";
    }

    return NextResponse.json({
      synthesis: synthesisText,
      results: topPrimarySources.map(({ chunkText, ...rest }) => rest),
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
