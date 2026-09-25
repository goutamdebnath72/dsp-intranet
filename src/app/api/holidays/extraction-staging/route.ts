// src/app/api/holidays/extraction-staging/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HolidayExtractionStaging } from "@/lib/db/models/holiday-extraction-staging.model";

export const dynamic = "force-dynamic";

/** GET /api/holidays/extraction-staging?status=pending (default: pending) */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") ?? "pending";
    const d = await getDb();
    const repo = d.getRepository(HolidayExtractionStaging);
    const rows = await repo.find({
      where: status === "all" ? {} : { status: status as any },
      order: { createdAt: "DESC" },
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing holiday extraction staging rows:", error);
    return NextResponse.json(
      { error: "Failed to list staged holiday extractions" },
      { status: 500 },
    );
  }
}
