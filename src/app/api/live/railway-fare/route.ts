// src/app/api/live/railway-fare/route.ts
//
// THE FARES OF ONE TRAIN FROM DURGAPUR TO THE END OF ITS RUN, asked only when someone presses "Fares" on a train. The plant uses RailRadar's paid fare service for ONE month (to 14 Dec 2026), so the fares are SAVED in the
// database with the time they were received (src/lib/live/fareStore.ts) and shown with that time; what is refreshed, when, and what happens after the month is in src/lib/live/fareService.ts.
// The caller sends nothing but the train number (`?train=12313`): when RailRadar has to be asked, the train must be in the kept timetable of Durgapur (an express or mail train, or a local MEMU one, for which only a HINT from the
// railway's fare table is made) and must not end at Durgapur; its end
// station and its days at Durgapur come from that timetable, not from the caller. So the request cannot spend the plant's quota on a train, a station or a date of the caller's choosing.
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { askFares, askLocalFare, journeyDateFor } from "@/lib/live/fare";
import { DateTime } from "luxon";
import { fareAnswer, type FareAnswer } from "@/lib/live/fareService";
import { fareStoreFor } from "@/lib/live/fareStore";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";
import { UpstreamError } from "@/lib/live/http";
import { ORDINARY_SOURCE } from "@/lib/live/ordinaryFare";
import { RAILRADAR_SITE, STATION, type Train } from "@/lib/live/railway";
import { loadRailway, railRadarFetch } from "@/lib/live/railwayLoad";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const find = (list: Train[], number: string): Train | undefined => list.find((t) => t.number === number);
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const number = req.nextUrl.searchParams.get("train") ?? "";
  if (!/^\d{5}$/.test(number)) return fail("Send the five-digit train number.", 400);
  try {
    const store = fareStoreFor(await getDb());
    const r = await fareAnswer(number, {
      store,
      target: async () => {
        const rw = await loadRailway();
        const x = rw.express, l = rw.local;
        const exp = find(x.east, number) ?? find(x.west, number) ?? find(x.other, number);
        const loc = find(l.east, number) ?? find(l.west, number) ?? find(l.other, number);
        const t = exp ?? loc;
        if (!t) throw new UpstreamError("This is not a train that stops at Durgapur: no fare is looked up.");
        if (!exp && loc) {
          if (t.toCode === STATION.code) throw new UpstreamError("This train ends at Durgapur: there is no fare from Durgapur.");
          return { to: t.toCode, date: DateTime.now().setZone(STATION.zone).toFormat("yyyy-MM-dd"), local: true };
        }
        if (t.toCode === STATION.code) throw new UpstreamError("This train ends at Durgapur: there is no fare from Durgapur.");
        const date = journeyDateFor(t.days);
        if (!date) throw new UpstreamError("The timetable gives no running day for this train.");
        return { to: t.toCode, date };
      },
      ask: (n, to, date, local) => (local ? askLocalFare(n, to, railRadarFetch, date) : askFares(n, to, date, railRadarFetch)),
    });
    // the time shown is the time the fares were RECEIVED (saved), not the time of this request
    // a local train's HINT comes from the railway's published fare table (the distance from RailRadar); the others are the reservation system's own fares via RailRadar
    const hint = r.data.classes.some((c) => c.basis === "table");
    const body: LiveEnvelope<FareAnswer> = hint
      ? { ok: true, fetchedAt: r.data.receivedAt, source: ORDINARY_SOURCE.name, sourceUrl: ORDINARY_SOURCE.url, sources: [{ name: ORDINARY_SOURCE.name, url: ORDINARY_SOURCE.url }, { name: "RailRadar (distance)", url: RAILRADAR_SITE }], stale: false, data: r.data }
      : { ok: true, fetchedAt: r.data.receivedAt, source: "RailRadar (fares from the railway's reservation system)", sourceUrl: RAILRADAR_SITE, stale: r.stale, data: r.data };
    if (!validEnvelope(body)) return fail("The fares could not be read.", 503);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The fares could not be read.", 503);
  }
}
