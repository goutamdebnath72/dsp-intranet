// src/app/api/live/railway/route.ts
//
// THE TRAINS AT DURGAPUR RAILWAY STATION, from RailRadar's station timetable (src/lib/live/railway.ts). Reads nothing from the caller: the address asked is fixed. The plant's API key (RAILRADAR_API_KEY, in the
// server's environment, never sent to a browser and never in the answer) is put in the request's Authorization header here and nowhere else.
// THE KEY'S QUOTA IS SMALL (the free plan holds 100 requests a month), so the answer is kept for twelve hours twice over: by the host's data cache (next/cache unstable_cache: it outlives restarts and is shared by every copy
// of the server; a plain fetch cache is switched off by this route being dynamic, which is why it is not used), and by the memory of this copy; a timetable does not change by the hour. While the cached answer is
// older than twelve hours the old one is still served and a new one is fetched behind it, and if that fails the old one stays. If RailRadar fails and nothing is cached, a plain failure.
import { unstable_cache } from "next/cache";
import { liveRoute } from "@/lib/live/envelope";
import { UpstreamError } from "@/lib/live/http";
import { parseRailway, RAILRADAR_SITE, RAILRADAR_URL, type Railway } from "@/lib/live/railway";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEPT_S = 12 * 60 * 60;

/** the one request to RailRadar never logs or returns the key */
async function askRailRadar(): Promise<Railway> {
  const key = process.env.RAILRADAR_API_KEY;
  if (!key) throw new UpstreamError("The RailRadar key is not set on this server (RAILRADAR_API_KEY).");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(RAILRADAR_URL, { signal: ctl.signal, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (r.status === 429) throw new UpstreamError("RailRadar's monthly limit for the plant's key has been reached.", 429);
    if (r.status === 401 || r.status === 403) throw new UpstreamError("RailRadar did not accept the plant's key.", r.status);
    if (!r.ok) throw new UpstreamError(`railradar.in answered ${r.status}`, r.status);
    return parseRailway(await r.json());
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new UpstreamError("railradar.in could not be reached");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** the answer from the host-wide cache (twelve hours), asking RailRadar only when there is none or it is old */
const loadRailway = unstable_cache(askRailRadar, ["railradar-station-DGR-v1"], { revalidate: KEPT_S });

export async function GET() {
  return liveRoute<Railway>({
    key: "railway",
    ttlMs: KEPT_S * 1000,
    source: "RailRadar (station timetable of Durgapur, DGR)",
    sourceUrl: RAILRADAR_SITE,
    load: loadRailway,
  });
}
