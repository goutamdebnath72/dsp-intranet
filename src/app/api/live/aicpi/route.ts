// src/app/api/live/aicpi/route.ts
//
// THE ALL-INDIA CONSUMER PRICE INDEX FOR INDUSTRIAL WORKERS (AICPI-IW), from the Labour Bureau's own pages (src/lib/live/aicpi.ts): the CPI-IW page, whose chart holds the last twelve months, and the home page, whose
// box holds the latest two (the newest month is there first). Reads nothing from the caller: the two addresses are fixed. The home page failing is not an error (the chart alone is a year); the CPI-IW page failing or
// changing is, and then the last good answer is returned and marked as such. The index changes once a month, so an answer is kept for six hours.
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { buildAicpi, CPI_HOME, CPI_PAGE, type Aicpi, ZONE } from "@/lib/live/aicpi";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  return liveRoute<Aicpi>({
    key: "aicpi",
    ttlMs: 6 * 60 * 60 * 1000,
    source: "Labour Bureau, Ministry of Labour and Employment (CPI-IW, base 2016=100)",
    sourceUrl: CPI_PAGE,
    load: async () => {
      const chart = await getText(CPI_PAGE, { timeoutMs: 12000 });
      const home = await getText(CPI_HOME, { timeoutMs: 12000 }).catch(() => null);
      return buildAicpi(chart, home, DateTime.now().setZone(ZONE));
    },
  });
}
