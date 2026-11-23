// src/app/api/live/railway-asn/route.ts
//
// The trains of Asansol Junction that do not stop at Durgapur (src/lib/live/railwayAsansol.ts): those that pass Durgapur without stopping and those that do not go over it. I read nothing from the caller: the two
// addresses asked are fixed. The asking, the plant's key and the twelve-hour keeping of the answer are in src/lib/live/railwayLoad.ts.
import { liveRoute } from "@/lib/live/envelope";
import { RAILRADAR_SITE } from "@/lib/live/railway";
import { looksLikeAsansol, type AsansolTrains } from "@/lib/live/railwayAsansol";
import { KEPT_ASN_S, loadAsansol } from "@/lib/live/railwayLoad";
import { savedAnswers } from "@/lib/live/savedAnswers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  return liveRoute<AsansolTrains>({
    key: "railway-asn",
    ttlMs: KEPT_ASN_S * 1000,
    source: "RailRadar (station timetables of Asansol, ASN, and Durgapur, DGR)",
    sourceUrl: RAILRADAR_SITE,
    // I keep every fresh answer in the database too: when RailRadar does not answer (the free plan may not allow the pass-through rows, or its quota is used), the tab shows the last saved list marked stale with its own time
    persist: { store: savedAnswers, check: looksLikeAsansol },
    load: loadAsansol,
  });
}
