// src/app/api/live/cpi/route.ts
//
// The Consumer Price Index and inflation of MoSPI: the index of each month for all India (Combined, Urban, Rural) and for each State, and the inflation rate month by month since 2016 (src/lib/live/cpi.ts).
// I read from the saved rows (public.cpi_month) and ask MoSPI only for a month not saved yet (src/lib/live/cpiService.ts). Nothing is read from the caller.
// The index changes once a month, so I keep an answer for three hours.
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
