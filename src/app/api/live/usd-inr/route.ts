// src/app/api/live/usd-inr/route.ts
//
// THE US DOLLAR IN RUPEES, EVERY WORKING DAY OF THE LAST YEAR, for the chart under the currency converter. Reads nothing from the caller: the address asked of Frankfurter (the European Central Bank's
// reference rates) is built from today's date only. The answer is checked by src/lib/live/usdInr.ts; if the source fails, the last good answer is returned and marked as such, and with none, a plain failure.
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
