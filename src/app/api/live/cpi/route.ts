// src/app/api/live/cpi/route.ts
//
// THE CONSUMER PRICE INDEX AND INFLATION OF MoSPI: the index of each month for all India (Combined, Urban, Rural) and for each State, and the inflation rate month by month since 2016 (src/lib/live/cpi.ts). Read from the saved
// rows (public.cpi_month); MoSPI is asked only for a month not saved yet (src/lib/live/cpiService.ts). Reads nothing from the caller. The index changes once a month, so an answer is kept for three hours.
import { getDb } from "@/lib/db";
import { liveRoute } from "@/lib/live/envelope";
import { MOSPI_SITE, type Cpi } from "@/lib/live/cpi";
import { cpiAnswer } from "@/lib/live/cpiService";
import { cpiStoreFor } from "@/lib/live/cpiStore";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  return liveRoute<Cpi>({
    key: "cpi",
    ttlMs: 3 * 60 * 60 * 1000,
    source: "MoSPI, Ministry of Statistics and Programme Implementation (CPI)",
    sourceUrl: MOSPI_SITE,
    load: async () => cpiAnswer({ store: cpiStoreFor(await getDb()) }),
  });
}
