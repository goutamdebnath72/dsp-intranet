// src/app/api/omnibar/feedback/route.ts
//
// The omnibar's universal "Was this what you were looking for? Yes / No".
// POST { query, source, verdict: "yes"|"no", reasonCode?, note?, nl2sqlLogId?, attempt?, userKey? }
//   -> { ok, id, verdictRecorded }
// Works for every kind of answer (model, cache, holiday, old engine, circular results). For model-written and
// cached answers it also sets the verdict on the answer's log row, which is what the learning loop reads.

import { NextResponse } from "next/server";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { parseFeedback, recordFeedback, undoFeedback, countRecentVotes, VOTES_PER_HOUR } from "@/lib/nl2sql/feedback";
import { getSessionTicket } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Yes / No is for signed-in people only, and WHO voted comes from the login session, never from the request.
  const ticket = await getSessionTicket();
  if (!ticket) return NextResponse.json({ error: "Sign in to give feedback" }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userKey = ticket;

  // Undo: a person takes back THEIR OWN vote (the vote row and the verdict on the answer's log row).
  if (body?.verdict === "undo") {
    const fid = Number(body?.id);
    const lid = Number(body?.nl2sqlLogId);
    const r = await withDefaultClient((c) =>
      undoFeedback(c, userKey, Number.isInteger(fid) && fid > 0 ? fid : null, Number.isInteger(lid) && lid > 0 ? lid : null),
    ).catch(() => ({ undone: false }));
    return NextResponse.json({ ok: r.undone, undone: r.undone });
  }

  // A brake: no more than VOTES_PER_HOUR votes per person per hour.
  const recent = await withDefaultClient((c) => countRecentVotes(c, userKey)).catch(() => 0);
  if (recent >= VOTES_PER_HOUR) {
    return NextResponse.json({ error: "Too many votes this hour. Please try again later." }, { status: 429 });
  }

  const input = parseFeedback(body, userKey);
  if (!input) return NextResponse.json({ error: "query, source and verdict are required" }, { status: 400 });
  const result = await withDefaultClient((c) => recordFeedback(c, input)).catch(() => ({ id: null, verdictRecorded: false }));
  return NextResponse.json({ ok: result.id !== null, id: result.id, verdictRecorded: result.verdictRecorded });
}
