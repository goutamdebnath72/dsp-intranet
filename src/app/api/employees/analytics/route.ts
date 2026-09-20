// src/app/api/employees/analytics/route.ts
//
// Deterministic employee-analytics endpoint (Phase 1, DSP-wide).
// Aggregates only — no PII, so it is not login-gated (consistent with the
// masked people search). Returns { matched:false } when the question isn't a
// recognised analytics query, so the caller falls through to the next layer.

import { NextResponse } from "next/server";
import { parseAnalytics } from "@/lib/employees/parser";
import {
  countByTerm,
  totalHeadcount,
  designationBreakdown,
} from "@/lib/employees/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ matched: false });

  const intent = parseAnalytics(q);
  if (!intent) return NextResponse.json({ matched: false });

  try {
    if (intent.kind === "deptPending") {
      return NextResponse.json({
        matched: true,
        kind: "pending",
        answer: `Department-scoped counts (e.g. “${intent.dept}”) are coming soon. For now I can answer DSP-wide counts — try the same question without the department.`,
      });
    }

    if (intent.kind === "total") {
      const n = await totalHeadcount();
      return NextResponse.json({
        matched: true,
        kind: "total",
        count: n,
        answer: `DSP has ${n.toLocaleString()} employees on record.`,
      });
    }

    if (intent.kind === "breakdown") {
      const rows = await designationBreakdown();
      return NextResponse.json({
        matched: true,
        kind: "breakdown",
        rows,
        answer: `Designation-wise breakdown across DSP (${rows.length} designations).`,
      });
    }

    // count
    const res = await countByTerm(intent.term);
    if (!res) return NextResponse.json({ matched: false });
    const answer =
      res.kind === "exec"
        ? `DSP has ${res.count.toLocaleString()} executives.`
        : res.kind === "nonexec"
          ? `DSP has ${res.count.toLocaleString()} non-executives (S-scale).`
          : `DSP currently has ${res.count.toLocaleString()} ${res.label}.`;
    return NextResponse.json({
      matched: true,
      kind: "count",
      label: res.label,
      count: res.count,
      answer,
    });
  } catch (e: any) {
    console.error("❌ Employee analytics failed:", e?.message ?? e);
    return NextResponse.json({ error: "analytics failed" }, { status: 500 });
  }
}
