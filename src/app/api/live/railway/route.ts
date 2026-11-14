// src/app/api/live/railway/route.ts
//
// THE TRAINS AT DURGAPUR RAILWAY STATION, from RailRadar's station timetable (src/lib/live/railway.ts). Reads nothing from the caller: the address asked is fixed. The asking, the plant's key and the twelve-hour keeping of
// the answer are in src/lib/live/railwayLoad.ts (shared with the fare route).
import { liveRoute } from "@/lib/live/envelope";
import { RAILRADAR_SITE, type Railway } from "@/lib/live/railway";
import { KEPT_S, loadRailway } from "@/lib/live/railwayLoad";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  return liveRoute<Railway>({
    key: "railway",
    ttlMs: KEPT_S * 1000,
    source: "RailRadar (station timetable of Durgapur, DGR)",
    sourceUrl: RAILRADAR_SITE,
    load: loadRailway,
  });
}
