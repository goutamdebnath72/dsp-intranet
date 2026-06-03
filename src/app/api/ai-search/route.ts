// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { ILike } from "typeorm";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";

export const runtime = "nodejs";

type SearchResultRow = {
  id: number;
  headline: string;
  url: string | null;
  publishedAt: Date | string | any;
  similarity?: number | null;
};

function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

export async function GET(request: Request) {
  const dataSource = await getDb();

  try {
    // Graceful guard to protect runtime loops during the Next.js pre-compilation compilation phases
    if (!dataSource || !dataSource.isInitialized) {
      console.log("Build-time or DB not initialized: skipping AI search");
      return NextResponse.json([]);
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json(
        { error: "Missing query parameter 'q'." },
        { status: 400 },
      );
    }

    if (q.length < 3) {
      return NextResponse.json({
        message: "Query too short for semantic search.",
        results: [],
      });
    }

    const circularRepository = dataSource.getRepository(Circular);

    // HELPER: Reusable TypeORM keyword lookup strategy to prevent code duplication across exceptions
    const executeKeywordFallback = async () => {
      const fallbackRows = await circularRepository.find({
        where: {
          headline: ILike(`%${q}%`),
        },
        order: {
          publishedAt: "DESC",
        },
        take: 10,
      });

      return fallbackRows.map((r) => ({
        id: r.id,
        headline: r.headline,
        url:
          Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
        publishedAt: r.publishedAt ? r.publishedAt.toISO() : null, // Repository parses directly to Luxon instance
        similarity: null,
      }));
    };

    // 1) Generate and normalize query vector strings
    let queryEmbedding: number[];
    try {
      const raw = await generateEmbedding(q);
      queryEmbedding = normalizeVector(raw);
      console.log("DEBUG query embedding length:", queryEmbedding.length);
    } catch (err) {
      console.error(
        "Embedding generation failed for query, falling back to keyword search:",
        err,
      );
      const fallback = await executeKeywordFallback();
      return NextResponse.json(fallback);
    }

    const vectorString = `[${queryEmbedding.join(",")}]`;

    // 2) Execute specialized raw PgVector proximity index calculations
    // 2) Execute specialized raw PgVector proximity index calculations
    try {
      // ✅ Added [] to the generic type so TypeScript knows this is an array of rows
      const rows = await dataSource.query<SearchResultRow[]>(
        `
        SELECT
          id,
          headline,
          "fileUrls"[1] AS url,
          "publishedAt",
          (embedding <-> $1::public.vector(768)) AS similarity
        FROM circulars
        WHERE embedding IS NOT NULL
        ORDER BY similarity ASC, "publishedAt" DESC
        LIMIT 10;
      `,
        [vectorString],
      );

      if (rows && rows.length > 0) {
        const results = rows.map((r) => {
          // Normalize variance between un-transformed database strings/Dates and clean Luxon instances
          let dateStr: string | null = null;
          if (r.publishedAt) {
            if (r.publishedAt instanceof Date) {
              dateStr = DateTime.fromJSDate(r.publishedAt).toISO();
            } else if (typeof r.publishedAt === "string") {
              dateStr = DateTime.fromISO(r.publishedAt).toISO();
            } else if (typeof r.publishedAt.toISO === "function") {
              dateStr = r.publishedAt.toISO();
            }
          }

          return {
            id: r.id,
            headline: r.headline,
            url: r.url ?? null,
            publishedAt: dateStr,
            similarity:
              typeof r.similarity === "number"
                ? Number(r.similarity.toFixed(6))
                : null,
          };
        });
        return NextResponse.json(results);
      }
    } catch (vectorErr) {
      console.warn(
        "Vector similarity query failed — falling back to keyword search.",
        vectorErr,
      );
    }

    // 3) Final structural fallback path triggered on empty matches or query calculation crashes
    const fallback = await executeKeywordFallback();
    return NextResponse.json(fallback);
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: "Internal Server Error: search failed." },
      { status: 500 },
    );
  }
}
