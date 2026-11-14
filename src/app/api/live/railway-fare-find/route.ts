// src/app/api/live/railway-fare-find/route.ts
//
// "FIND A FARE": ?stops=1 gives the stations that have a saved fare to them (for the search box); ?to=PNBE gives every train that goes from Durgapur to that station, with the saved fare of each class (src/lib/live/fareFind.ts).
// DATABASE ONLY for the fares (nothing is asked of RailRadar's fare service: the plant pays for it for one month and the fares were collected then); the kept timetable (free plan, twelve hours) supplies the times and days.
// The caller sends only a station code, checked to be letters and digits.
import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";
import { buildFind, type FindAnswer, type StopsAnswer } from "@/lib/live/fareFind";
import { legStoreFor, type StopInfo } from "@/lib/live/fareLegStore";
import { ORDINARY_SOURCE } from "@/lib/live/ordinaryFare";
import { RAILRADAR_SITE, type Railway } from "@/lib/live/railway";
import { loadRailway } from "@/lib/live/railwayLoad";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
const SOURCE = "RailRadar (fares from the railway's reservation system)";

/** the list of stations is kept ten minutes in this copy's memory (the search box asks for it once per opening) */
let stopsKept: { at: number; stops: StopInfo[] } | null = null;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const store = legStoreFor(await getDb());
    if (q.get("stops") === "1") {
      if (!stopsKept || Date.now() - stopsKept.at > 10 * 60 * 1000) stopsKept = { at: Date.now(), stops: await store.stops() };
      if (stopsKept.stops.length === 0) { stopsKept = null; return fail("No fares to the stops have been collected yet.", 404); }
      const body: LiveEnvelope<StopsAnswer> = { ok: true, fetchedAt: DateTime.now().toUTC().toISO() ?? "", source: SOURCE, sourceUrl: RAILRADAR_SITE, stale: false, data: { stops: stopsKept.stops } };
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    }
    const to = q.get("to") ?? "";
    if (!/^[A-Z0-9]{1,8}$/.test(to)) return fail("Send a station code (letters and digits).", 400);
    const rows = await store.toStop(to);
    if (rows.length === 0) return fail("No saved fare goes to this station.", 404);
    const railway: Railway | null = await loadRailway().catch(() => null);
    const a = buildFind({ code: to, name: rows[0].leg.name }, rows, railway, await store.coverage(), DateTime.now());
    if (!a) return fail("No saved fare goes to this station.", 404);
    const hint = a.trains.some((t) => t.hint);
    const body: LiveEnvelope<FindAnswer> = {
      ok: true, fetchedAt: a.receivedAt, source: SOURCE, sourceUrl: RAILRADAR_SITE, stale: a.frozen,
      ...(hint ? { sources: [{ name: "RailRadar (fares from the railway's reservation system)", url: RAILRADAR_SITE }, { name: ORDINARY_SOURCE.name, url: ORDINARY_SOURCE.url }] } : {}),
      data: a,
    };
    if (!validEnvelope(body)) return fail("The fares could not be read.", 503);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The fares could not be read.", 503);
  }
}
