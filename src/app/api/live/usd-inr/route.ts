// src/app/api/live/usd-inr/route.ts
//
// The US dollar in rupees, every working day of the last year, for the chart under the currency converter. I read nothing from the caller: the address asked of Frankfurter (the European Central Bank's
// reference rates) is built from today's date only. src/lib/live/usdInr.ts checks the answer; if the source fails, I return the last good answer marked as such, and with none, a plain failure.
import { getJson } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { parseUsdInr, rangeStart, type UsdInrTrend } from "@/lib/live/usdInr";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  return liveRoute<UsdInrTrend>({
    key: "usd-inr",
    ttlMs: 3 * 60 * 60 * 1000,
    source: "European Central Bank reference rates (Frankfurter)",
    sourceUrl: "https://frankfurter.dev",
    load: async () => ({ points: parseUsdInr(await getJson(`https://api.frankfurter.dev/v1/${rangeStart()}..?base=USD&symbols=INR`, { timeoutMs: 10000 })) }),
  });
}
