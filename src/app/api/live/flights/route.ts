// src/app/api/live/flights/route.ts
//
// The flights to and from Andal Airport, from the airport's own flight page (src/lib/live/flights.ts). I read nothing from the caller: the address asked is fixed.
// I check the page; if the airport's site fails or its layout changes, I return the last good answer marked as such, and with none, a plain failure. I keep it for ten minutes.
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { FLIGHTS_URL, parseFlights, type Flights } from "@/lib/live/flights";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  return liveRoute<Flights>({
    key: "flights",
    ttlMs: 10 * 60 * 1000,
    source: "Kazi Nazrul Islam Airport (Andal), flight information page",
    sourceUrl: FLIGHTS_URL,
    load: async () => parseFlights(await getText(FLIGHTS_URL, { timeoutMs: 10000 }), DateTime.now()),
  });
}
