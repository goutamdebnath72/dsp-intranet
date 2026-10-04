// src/app/api/omnibar/feedback/route.ts
//
// The omnibar's universal "Was this what you were looking for? Yes / No".
// POST { query, source, verdict: "yes"|"no", reasonCode?, note?, nl2sqlLogId?, attempt?, userKey? }
//   -> { ok, id, verdictRecorded }
// Works for every kind of answer (model, cache, holiday, old engine, circular results). For model-written and
// cached answers it also sets the verdict on the answer's log row, which is what the learning loop reads.

import { NextResponse } from "next/server";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { parseFeedback, recordFeedback } from "@/lib/nl2sql/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userKey = typeof body?.userKey === "string" && body.userKey.trim() ? body.userKey.trim() : null;
  const input = parseFeedback(body, userKey);
  if (!input) return NextResponse.json({ error: "query, source and verdict are required" }, { status: 400 });
  const result = await withDefaultClient((c) => recordFeedback(c, input)).catch(() => ({ id: null, verdictRecorded: false }));
  return NextResponse.json({ ok: result.id !== null, id: result.id, verdictRecorded: result.verdictRecorded });
}
