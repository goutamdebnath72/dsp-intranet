// src/app/api/live/railway-fare/route.ts
//
// The fares of one train from Durgapur to the end of its run, when someone presses "Fares" on a train. DATABASE ONLY: the plant used RailRadar's paid fare service for ONE month (to 14 Dec 2026), the fares were SAVED in the
// database with the time they were received (src/lib/live/fareStore.ts), and this route never asks RailRadar: after the month the saved data is all there is (src/lib/live/fareService.ts).
// The caller sends nothing but the train number (`?train=12313`), and `from=ASN` for a train of the Asansol tab (the fares from Asansol; any other value means Durgapur).
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { fareAnswer, type FareAnswer } from "@/lib/live/fareService";
import { fareStoreFor } from "@/lib/live/fareStore";
import { validEnvelope, type LiveEnvelope } from "@/lib/live/envelope";
import { ORDINARY_SOURCE } from "@/lib/live/ordinaryFare";
import { RAILRADAR_SITE } from "@/lib/live/railway";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const number = req.nextUrl.searchParams.get("train") ?? "";
  // The station the fare starts from: Durgapur unless the Asansol tab asks (`from=ASN`). I accept nothing else.
  const from = req.nextUrl.searchParams.get("from") === "ASN" ? "ASN" : "DGR";
  if (!/^\d{5}$/.test(number)) return fail("Send the five-digit train number.", 400);
  try {
    const store = fareStoreFor(await getDb(), from);
    const r = await fareAnswer(number, { store });
    // The time shown is the time the fares were RECEIVED (saved), not the time of this request
    // A local train's HINT comes from the railway's published fare table (the distance from RailRadar); the others are the reservation system's own fares via RailRadar
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
