// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { QueryTypes, Sequelize } from "sequelize"; // <-- 1. IMPORT SEQUELIZE

export const runtime = "nodejs";

type SearchResultRow = {
  id: number;
  headline: string;
  url: string;
  publishedAt: Date;
  similarity: number;
};

export async function GET(request: Request) {
  try {
    if (!db.sequelize) {
      console.log("Build-time: skipping AI search");
      return NextResponse.json([]);
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json(
        { error: "Missing query parameter 'q'." },
        { status: 400 }
      );
    }

    const embedding = await generateEmbedding(q);
    const vectorString = `[${embedding.join(",")}]`;

    // --- 2. CAST db.sequelize to Sequelize ---
    const rows = await (db.sequelize as Sequelize).query<SearchResultRow>(
      `
      SELECT
        id,
        headline,
        "fileUrls"[1] AS url,
        "publishedAt",
        (embedding <-> :vector::public.vector(1536)) AS similarity
      FROM circulars
      ORDER BY similarity ASC, "publishedAt" DESC
      LIMIT 5;
    `,
      {
        replacements: { vector: vectorString },
        type: QueryTypes.SELECT,
      }
    );

    // --- 3. ADDED TYPE for 'r' (fixes second error) ---
    const results = rows.map((r: SearchResultRow) => ({
      id: r.id,
      headline: r.headline,
      url: r.url,
      publishedAt: new Date(r.publishedAt).toISOString(),
      similarity: Number(r.similarity.toFixed(3)),
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: "Internal Server Error: search failed." },
      { status: 500 }
    );
  }
}
