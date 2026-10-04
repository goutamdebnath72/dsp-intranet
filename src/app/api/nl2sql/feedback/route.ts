// src/app/api/nl2sql/feedback/route.ts
//
// Tick / cross from the omnibar for an answer written by the language model.
// POST { logId: number, verdict: "confirm" | "reject", userKey?: string | null } -> { ok }
// Only the person the answer was logged for can rate it (userKey must match the log row).

import { NextResponse } from "next/server";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { recordVerdict } from "@/lib/nl2sql/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const logId = Number(body?.logId);
  const verdict = body?.verdict;
  const userKey = typeof body?.userKey === "string" && body.userKey.trim() ? body.userKey.trim() : null;
  if (!Number.isInteger(logId) || (verdict !== "confirm" && verdict !== "reject")) {
    return NextResponse.json({ error: "logId and verdict are required" }, { status: 400 });
  }
  const ok = await withDefaultClient((c) => recordVerdict(c, logId, verdict, userKey)).catch(() => false);
  return NextResponse.json({ ok });
}
