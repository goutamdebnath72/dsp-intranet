// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import { ILike } from "typeorm";
import { Circular } from "@/lib/db/models/circular.model";
import { Announcement } from "@/lib/db/models/announcement.model";
import { DateTime } from "luxon";

export const runtime = "nodejs";

type SearchResultRow = {
  id: number;
  type: "circular" | "announcement";
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
    if (!dataSource || !dataSource.isInitialized) {
      return NextResponse.json([]);
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const mode = url.searchParams.get("mode") || "deep"; // "title" | "deep"

    if (!q || q.length < 3) {
      return NextResponse.json({ message: "Query too short.", results: [] });
    }

    const circularRepository = dataSource.getRepository(Circular);
    const announcementRepository = dataSource.getRepository(Announcement);

    // HELPER: Keyword Fallback & Title Search Mode
    const executeKeywordSearch = async () => {
      const [circularRows, announcementRows] = await Promise.all([
        circularRepository.find({
          where: { headline: ILike(`%${q}%`) },
          order: { publishedAt: "DESC" },
          take: 5,
        }),
        announcementRepository.find({
          where: { title: ILike(`%${q}%`) },
          order: { date: "DESC" },
          take: 5,
        }),
      ]);

      const mappedCirculars: SearchResultRow[] = circularRows.map((r) => ({
        id: r.id,
        type: "circular",
        headline: r.headline,
        url:
          Array.isArray(r.fileUrls) && r.fileUrls.length ? r.fileUrls[0] : null,
        publishedAt: r.publishedAt ? r.publishedAt.toISO() : null,
        similarity: null,
      }));

      const mappedAnnouncements: SearchResultRow[] = announcementRows.map(
        (r) => ({
          id: r.id,
          type: "announcement",
          headline: r.title,
          url: `/announcements/${r.id}`, // Route directly to announcement view
          publishedAt: r.date ? r.date.toISO() : null,
          similarity: null,
        }),
      );

      return [...mappedCirculars, ...mappedAnnouncements].sort((a, b) => {
        return (
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
      });
    };

    // If strictly title mode, skip the AI logic completely
    if (mode === "title") {
      const results = await executeKeywordSearch();
      return NextResponse.json(results);
    }

    // --- DEEP SEARCH MODE ---
    let queryEmbedding: number[];
    try {
      const raw = await generateEmbedding(q);
      queryEmbedding = normalizeVector(raw);
    } catch (err) {
      console.error(
        "Embedding generation failed, falling back to title search:",
        err,
      );
      return NextResponse.json(await executeKeywordSearch());
    }

    const vectorString = `[${queryEmbedding.join(",")}]`;

    try {
      // Execute parallel raw queries for both tables using Cosine Similarity
      const [circularRows, announcementRows] = await Promise.all([
        dataSource.query<SearchResultRow[]>(
          `
          SELECT id, headline, "fileUrls"[1] AS url, "publishedAt",
          (embedding <-> $1::public.vector(768)) AS similarity
          FROM circulars WHERE embedding IS NOT NULL
          ORDER BY similarity ASC LIMIT 5;
        `,
          [vectorString],
        ),

        dataSource.query<any[]>(
          `
          SELECT id, title AS headline, date AS "publishedAt",
          (embedding <-> $1::public.vector(768)) AS similarity
          FROM announcement WHERE embedding IS NOT NULL
          ORDER BY similarity ASC LIMIT 5;
        `,
          [vectorString],
        ),
      ]);

      const mergedRows = [
        ...(circularRows || []).map((r) => ({
          ...r,
          type: "circular" as const,
        })),
        ...(announcementRows || []).map((r) => ({
          ...r,
          type: "announcement" as const,
          url: `/announcements/${r.id}`,
        })),
      ];

      if (mergedRows.length > 0) {
        // Sort by closest vector similarity first
        mergedRows.sort((a, b) => (a.similarity || 0) - (b.similarity || 0));

        const results = mergedRows.map((r) => {
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
            type: r.type,
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

    return NextResponse.json(await executeKeywordSearch());
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: "Internal Server Error: search failed." },
      { status: 500 },
    );
  }
}
