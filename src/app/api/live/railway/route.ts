// src/app/api/live/railway/route.ts
//
// THE TRAINS AT DURGAPUR RAILWAY STATION, from RailRadar's station timetable (src/lib/live/railway.ts). Reads nothing from the caller: the address asked is fixed. The asking, the plant's key and the twelve-hour keeping of
// the answer are in src/lib/live/railwayLoad.ts (shared with the fare route).
import { liveRoute } from "@/lib/live/envelope";
import { looksLikeRailway, RAILRADAR_SITE, type Railway } from "@/lib/live/railway";
import { savedAnswers } from "@/lib/live/savedAnswers";
import { KEPT_S, loadRailway } from "@/lib/live/railwayLoad";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  return liveRoute<Railway>({
    key: "railway",
    ttlMs: KEPT_S * 1000,
    source: "RailRadar (station timetable of Durgapur, DGR)",
    sourceUrl: RAILRADAR_SITE,
    // the last good timetable is also kept in the database: when RailRadar does not answer (or its free quota is used), the card shows it marked stale with its own time, and nothing is lost
    persist: { store: savedAnswers, check: looksLikeRailway },
    load: loadRailway,
  });
}
