// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { executeTitleSearch } from "@/lib/search/titleSearch";
import { executeSemanticSearch } from "@/lib/search/semanticSearch";
import { executeExecutiveSynthesis } from "@/lib/search/executiveSynthesis";
import { cleanQueryString } from "@/lib/utils/queryCleaner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const url = new URL(request.url);
    const rawQ = url.searchParams.get("q");
    const q = cleanQueryString(rawQ);
    let mode = url.searchParams.get("mode") || "semantic";
    const userTicket = url.searchParams.get("ticket")?.trim();

    if (!q || q.length < 3) {
      return NextResponse.json([]);
    }

    // --- MODE 1: HEADLINE TITLE MATCH ---
    if (mode === "title") {
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

    // --- MODE 2: SMART SEMANTIC SEARCH (VECTOR + KEYWORD HYBRID) ---
    const { uniqueResults, isFallback } = await executeSemanticSearch(
      dataSource,
      q,
    );

    if (mode === "semantic" || isFallback) {
      const topPrimarySources = uniqueResults.slice(0, 5);
      return NextResponse.json(
        topPrimarySources.map(({ chunkText, ...rest }) => rest),
      );
    }

    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS ---
    const synthesisText = await executeExecutiveSynthesis(q, uniqueResults);
    const topPrimarySources = uniqueResults.slice(0, 5);

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
