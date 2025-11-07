// src/app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";  // Use Node.js runtime (embedding library may not run on edge)

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json(
        { error: "Missing query parameter 'q'." },
        { status: 400 }
      );
    }
    if (!process.env.GOOGLE_AI_API_KEY) {
      console.error("Missing GOOGLE_AI_API_KEY env var");
      return NextResponse.json(
        { error: "Server misconfiguration: missing AI API key." },
        { status: 500 }
      );
    }

    // 1. Generate embedding for the query text using Google Generative AI (Gemini) API.
    //    We use the text-embedding-004 model which returns a 768-dimensional vector:contentReference[oaicite:1]{index=1}.
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embedResult = await model.embedContent(q);
    const embedding: number[] = embedResult.embedding.values;
    // Convert array to PostgreSQL vector literal (e.g. "[0.1, 0.2, ...]")
    const vectorString = `[${embedding.join(",")}]`;

    // 2. Perform vector similarity search with raw SQL.
    //    Prisma does not support `vector(768)` columns directly:contentReference[oaicite:2]{index=2},
    //    so we use $queryRaw and cast the parameter to vector(768).
    //    We compute `embedding <-> query_vector` as "similarity" (cosine distance).
    //    Order by similarity ASC (lower distance = more similar), then by publishedAt DESC.
    const rows: Array<{
      id: number;
      headline: string;
      url: string;
      publishedAt: Date;
      similarity: number;
    }> = await prisma.$queryRaw`
      SELECT
        id,
        headline,
        file_urls[1] AS url,
        published_at AS "publishedAt",
        (embedding <-> ${vectorString}::public.vector(768)) AS similarity
      FROM circulars
      ORDER BY similarity ASC, published_at DESC
      LIMIT 5;
    `;

    // 3. Format and return results (ISO date and 3-decimal similarity).
    const results = rows.map((row) => ({
      id: row.id,
      headline: row.headline,
      url: row.url,
      publishedAt: new Date(row.publishedAt).toISOString(),
      similarity: Number(row.similarity.toFixed(3)),
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
