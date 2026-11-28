// src/app/api/live/railway-fare-legs/route.ts
//
// The saved fares from Durgapur to every stop after it on the route of one train (src/lib/live/fareLegStore.ts), for the "Fares to every stop" table. DATABASE ONLY: it never asks RailRadar (a long-distance train has 50 stops and
// about 200 requests): scripts/harvest-legs.ts collects the stops while the plant's paid month lasts. The caller sends nothing but the train number (and `from=ASN` for the Asansol tab's trains). The time shown is the time of the OLDEST stop's fares.
import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";
import { fareServiceOpen, legsAnswer, type LegsAnswer } from "@/lib/live/fareService";
import { legStoreFor } from "@/lib/live/fareLegStore";
import { kolkataLegRows } from "@/lib/live/kolkataRead";
import { isStartCode } from "@/lib/live/kolkataView";
import { ORDINARY_SOURCE } from "@/lib/live/ordinaryFare";
import { RAILRADAR_SITE } from "@/lib/live/railway";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const number = req.nextUrl.searchParams.get("train") ?? "";
  // The station the fare starts from: Durgapur unless the Asansol tab asks (`from=ASN`) or the Kolkata tab (the code of its station). I accept nothing else.
  const asked = req.nextUrl.searchParams.get("from");
  const from = asked === "ASN" ? "ASN" : "DGR";
  if (!/^\d{5}$/.test(number)) return fail("Send the five-digit train number.", 400);
  try {
    const db = await getDb();
    const rows = isStartCode(asked) ? await kolkataLegRows(db, number) : await legStoreFor(db, from).list(number);
    const a = legsAnswer(number, rows, DateTime.now());
    if (!a) return fail(fareServiceOpen(DateTime.now()) ? "The fares to the stops of this train are not collected yet: the collection is still running. Try again later." : "The fares to the stops of this train were not collected before the paid fare service ended.", 404);
    const body: LiveEnvelope<LegsAnswer> = a.hint
      ? { ok: true, fetchedAt: a.receivedAt, source: ORDINARY_SOURCE.name, sourceUrl: ORDINARY_SOURCE.url, sources: [{ name: ORDINARY_SOURCE.name, url: ORDINARY_SOURCE.url }, { name: "RailRadar (distances)", url: RAILRADAR_SITE }], stale: false, data: a }
      : { ok: true, fetchedAt: a.receivedAt, source: "RailRadar (fares from the railway's reservation system)", sourceUrl: RAILRADAR_SITE, stale: a.frozen, data: a };
    if (!validEnvelope(body)) return fail("The fares could not be read.", 503);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The fares could not be read.", 503);
  }
}
