// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { QueryTypes, Sequelize, Op } from "sequelize";

export const runtime = "nodejs";

type SearchResultRow = {
  id: number;
  headline: string;
  url: string | null;
  publishedAt: Date | string;
  similarity?: number | null;
};

function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

export async function GET(request: Request) {
  try {
    if (!db || !db.sequelize) {
      console.log("Build-time or DB not initialized: skipping AI search");
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

    // 1) Generate and normalize the query embedding
    let queryEmbedding: number[];
    try {
      const raw = await generateEmbedding(q);
      queryEmbedding = normalizeVector(raw);
    } catch (err) {
      console.error(
        "Embedding generation failed for query, falling back:",
        err
      );
      // If embedding fails, perform a pure keyword fallback
      const fallbackRows = await db.Circular.findAll({
        where: {
          headline: { [Op.iLike]: `%${q}%` },
        },
        order: [["publishedAt", "DESC"]],
        raw: true,
        limit: 10,
      });
      const fallback = fallbackRows.map((r: any) => ({
        id: r.id,
        headline: r.headline,
        url:
          Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
        publishedAt: r.publishedAt
          ? new Date(r.publishedAt).toISOString()
          : null,
        similarity: null,
      }));
      return NextResponse.json(fallback);
    }

    const vectorString = `[${queryEmbedding.join(",")}]`;

    // 2) Try the vector similarity query when embedding column is a pgvector
    try {
      const rows = await (db.sequelize as Sequelize).query<SearchResultRow>(
        `
        SELECT
          id,
          headline,
          "fileUrls"[1] AS url,
          "publishedAt",
          (embedding <-> :vector::public.vector(1536)) AS similarity
        FROM circulars
        WHERE embedding IS NOT NULL
        ORDER BY similarity ASC, "publishedAt" DESC
        LIMIT 10;
      `,
        {
          replacements: { vector: vectorString },
          type: QueryTypes.SELECT,
        }
      );

      if (rows && rows.length > 0) {
        const results = rows.map((r) => ({
          id: r.id,
          headline: r.headline,
          url: r.url ?? null,
          publishedAt: r.publishedAt
            ? new Date(r.publishedAt).toISOString()
            : null,
          similarity:
            typeof r.similarity === "number"
              ? Number(r.similarity.toFixed(6))
              : null,
        }));
        return NextResponse.json(results);
      }
      // If no rows returned (maybe no embeddings present), fallthrough to keyword fallback below
    } catch (vectorErr) {
      console.warn(
        "Vector similarity query failed — falling back to keyword search.",
        vectorErr
      );
      // fall through to keyword fallback
    }

    // 3) Fallback keyword search (headline ilike)
    const fallbackRows = await db.Circular.findAll({
      where: {
        headline: { [Op.iLike]: `%${q}%` },
      },
      order: [["publishedAt", "DESC"]],
      raw: true,
      limit: 10,
    });

    const fallback = fallbackRows.map((r: any) => ({
      id: r.id,
      headline: r.headline,
      url:
        Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
      similarity: null,
    }));

    return NextResponse.json(fallback);
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: "Internal Server Error: search failed." },
      { status: 500 }
    );
  }
}
