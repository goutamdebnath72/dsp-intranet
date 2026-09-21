// src/app/api/employees/analytics/route.ts
//
// Deterministic employee-analytics endpoint (debug/testing). Aggregates only,
// no PII, not login-gated. Returns { matched:false } when the question is not a
// recognised analytics query. Same logic as the Smart Semantic path.

import { NextResponse } from "next/server";
import { answerAnalytics } from "@/lib/employees/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ matched: false });

  try {
    const payload = await answerAnalytics(q);
    if (!payload) return NextResponse.json({ matched: false });
    return NextResponse.json({ matched: true, ...payload });
  } catch (e: any) {
    console.error("\u274c Employee analytics failed:", e?.message ?? e);
    return NextResponse.json({ error: "analytics failed" }, { status: 500 });
  }
}
