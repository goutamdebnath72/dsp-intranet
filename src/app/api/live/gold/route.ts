// src/app/api/live/gold/route.ts
//
// GOLD AND SILVER IN INDIA (IBJA rates and their trend). Reads nothing from the caller; asks the IBJA page, reads it with src/lib/live/gold.ts, and answers with the source and the time.
// If the page cannot be reached the last good answer is returned, marked stale; if the page has changed so that the numbers cannot be found, it is an error, never a guess.
import { getText, UpstreamError } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { parseIbja } from "@/lib/live/gold";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const URL_IBJA = "https://ibjarates.com/";

export async function GET() {
  return liveRoute({
    key: "gold",
    ttlMs: 10 * 60 * 1000,
    source: "IBJA (India Bullion and Jewellers Association)",
    sourceUrl: URL_IBJA,
    load: async () => {
      const rates = parseIbja(await getText(URL_IBJA));
      if (!rates) throw new UpstreamError("The IBJA page no longer has the rates where they were expected.");
      return rates;
    },
  });
}
