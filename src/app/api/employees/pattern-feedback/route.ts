// src/app/api/employees/pattern-feedback/route.ts
//
// Receives feedback on a PENDING learned query pattern (see
// src/lib/employees/patternCache.ts and queryOrchestrator.ts): an explicit
// tick/cross from the person who saw that specific LLM-derived answer. This is the ONLY way a pattern ever becomes 'confirmed' (matchable
// for everyone else) or 'rejected' -- nothing is ever cached from the LLM path
// alone, and nothing is inferred from behaviour (no dwell-time signals).

import { NextResponse } from "next/server";
import { recordPatternFeedback, type PatternFeedback } from "@/lib/employees/patternCache";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * POST /api/employees/pattern-feedback
 * Body:
 *   { patternId: number, verdict: "confirm" | "reject" }   -- explicit tick/cross
 *
 * Always returns 200 with { ok: true } even when nothing was actually
 * changed (e.g. the pattern was already decided, or doesn't exist) --
 * this is fire-and-forget telemetry from the frontend's point of view, not
 * a user-facing action that should ever surface an error.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const patternId = Number(body?.patternId);
  if (!Number.isInteger(patternId) || patternId <= 0) {
    return NextResponse.json({ ok: false, error: "patternId is required" }, { status: 400 });
  }

  if (body?.verdict !== "confirm" && body?.verdict !== "reject") {
    return NextResponse.json({ ok: false, error: "verdict must be 'confirm' or 'reject'" }, { status: 400 });
  }
  const feedback: PatternFeedback = { verdict: body.verdict };

  await recordPatternFeedback(patternId, feedback);
  return NextResponse.json({ ok: true });
}
