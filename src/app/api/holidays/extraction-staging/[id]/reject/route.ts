// src/app/api/holidays/extraction-staging/[id]/reject/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HolidayExtractionStaging } from "@/lib/db/models/holiday-extraction-staging.model";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const stagingId = parseInt(context.params.id, 10);
  if (!Number.isFinite(stagingId)) {
    return NextResponse.json({ error: "Invalid staging id" }, { status: 400 });
  }

  let reviewedBy: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    reviewedBy = typeof body?.reviewedBy === "string" ? body.reviewedBy : null;
  } catch {
    // no body is fine
  }

  try {
    const dataSource = await getDb();
    const stagingRepo = dataSource.getRepository(HolidayExtractionStaging);
    const staged = await stagingRepo.findOne({ where: { id: stagingId } });

    if (!staged) {
      return NextResponse.json({ error: "Staged extraction not found" }, { status: 404 });
    }
    if (staged.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${staged.status} -- nothing to reject` },
        { status: 409 },
      );
    }

    staged.status = "rejected";
    staged.reviewedBy = reviewedBy;
    staged.reviewedAt = new Date();
    await stagingRepo.save(staged);

    return NextResponse.json({ message: "Rejected" });
  } catch (error) {
    console.error("Error rejecting staged holiday extraction:", error);
    return NextResponse.json(
      { error: "Failed to reject staged extraction" },
      { status: 500 },
    );
  }
}
