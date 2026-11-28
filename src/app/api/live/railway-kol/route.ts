// src/app/api/live/railway-kol/route.ts
//
// The trains of the Kolkata tab: those that start at Howrah (HWH), Sealdah (SDAH), Santragachi (SRC) or Kolkata (KOAA), go over neither Durgapur nor Asansol, and touch none of the other three (src/lib/live/kolkataView.ts).
// `?from=HWH` (any of the four; Howrah when it is missing or is anything else) gives that station's trains and the counts of all four. DATABASE ONLY: the paid RailRadar month collected the trains and their fares (scripts/harvest-kol.ts)
// and this route never asks RailRadar. The caller sends only the station code, which I check against the four.
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";
import { kolkataAnswer } from "@/lib/live/kolkataRead";
import { isStartCode, looksLikeKolkata, type KolkataAnswer } from "@/lib/live/kolkataView";
import { RAILRADAR_SITE } from "@/lib/live/railway";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("from");
  const from = isStartCode(asked) ? asked : "HWH";
  try {
    const a = await kolkataAnswer(await getDb(), from);
    if (!looksLikeKolkata(a) || !a.savedAt) return fail("The saved trains of the Kolkata stations could not be read.", 503);
    // The time shown is the time the train records were SAVED from RailRadar, not the time of this request; the records are not refreshed after the paid month
    const body: LiveEnvelope<KolkataAnswer> = { ok: true, fetchedAt: a.savedAt, source: "RailRadar (train records and fares saved in the database)", sourceUrl: RAILRADAR_SITE, stale: false, data: a };
    if (!validEnvelope(body)) return fail("The saved trains of the Kolkata stations could not be read.", 503);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The saved trains of the Kolkata stations could not be read.", 503);
  }
}
