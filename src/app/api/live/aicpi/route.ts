// src/app/api/live/aicpi/route.ts
//
// The All-India Consumer Price Index for Industrial Workers (AICPI-IW), taken from the Labour Bureau's own pages (src/lib/live/aicpi.ts): the CPI-IW page, whose chart holds the last twelve months,
// and the home page, whose box holds the latest two (the newest month is there first). And the quarterly IDA orders of the Department of Public Enterprises, read from its website (src/lib/live/dpeOrders.ts), so that
// a new order shows on the card by itself. I read nothing from the caller: every address is fixed.
// The home page failing is not an error (the chart alone is a year); the CPI-IW page failing or changing is, and then I return the last good answer and mark it as such.
// DPE's website failing is not an error either: the card then has only the rates I read by hand, and says so (orders are left out of the answer).
// The index changes once a month and an order comes once a quarter, so I keep an answer for six hours.
import { DateTime } from "luxon";
import { getBuffer, getJson, getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { buildAicpi, CPI_HOME, CPI_PAGE, DPE_SITE, type Aicpi, ZONE } from "@/lib/live/aicpi";
import { loadDpeOrders } from "@/lib/live/dpeOrders";
import { plainBytes } from "@/lib/pdf/plainBytes";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

async function pdfText(bytes: Uint8Array): Promise<string> {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  return (await mod.default(plainBytes(bytes))).text;
}

/** The orders, in at most 14 seconds, whatever happens (they never hold the index back) */
async function orders() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<[]>((resolve) => { timer = setTimeout(() => resolve([]), 14000); });
  try {
    return await Promise.race([
      loadDpeOrders({ getJson: (u) => getJson<unknown>(u, { timeoutMs: 10000 }), getPdf: (u) => getBuffer(u, { timeoutMs: 10000, maxBytes: 4 * 1024 * 1024 }), pdfText }),
      limit,
    ]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  return liveRoute<Aicpi>({
    key: "aicpi",
    ttlMs: 6 * 60 * 60 * 1000,
    source: "Labour Bureau, Ministry of Labour and Employment (CPI-IW, base 2016=100)",
    sourceUrl: CPI_PAGE,
    sourceLinks: (d) => [
      { name: "Labour Bureau, Ministry of Labour and Employment (CPI-IW, base 2016=100)", url: CPI_PAGE },
      ...(d.orders && d.orders.length ? [{ name: "Department of Public Enterprises (IDA orders)", url: DPE_SITE }] : []),
    ],
    load: async () => {
      const [found, chart] = await Promise.all([orders(), getText(CPI_PAGE, { timeoutMs: 12000 })]);
      const home = await getText(CPI_HOME, { timeoutMs: 12000 }).catch(() => null);
      const built = buildAicpi(chart, home, DateTime.now().setZone(ZONE));
      return found.length ? { ...built, orders: found } : built;
    },
  });
}
