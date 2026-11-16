// src/lib/live/railwayLoad.ts
//
// THE ONE PLACE THAT ASKS RAILRADAR (with the plant's key) AND KEEPS THE ANSWER, shared by the timetable route and the fare route (which looks a train up in the same kept timetable, so that only a real train of Durgapur can
// cost a fare request). The key (RAILRADAR_API_KEY, in the server's environment) is read here only, put in the Authorization header, never logged, never in an answer and never sent to a browser.
// THE KEY'S QUOTA: the timetable is kept twelve hours twice over, by the host's data cache (next/cache unstable_cache: it outlives restarts and is shared by every copy of the server; a plain fetch cache is switched off by a
// dynamic route, which is why it is not used), and by the memory of the route's own copy.
import { unstable_cache } from "next/cache";
import { UpstreamError } from "./http";
import { parseRailway, RAILRADAR_URL, type Railway } from "./railway";
import { parseAsansol, RAILRADAR_ASN_URL, RAILRADAR_DGR_ALL_URL, type AsansolTrains } from "./railwayAsansol";
import type { Fetcher } from "./fare";

export const KEPT_S = 12 * 60 * 60;

/** one GET to RailRadar with the key; the answer's status and JSON (the callers decide what a status means). Times out after twelve seconds. */
export const railRadarFetch: Fetcher = async (url) => {
  const key = process.env.RAILRADAR_API_KEY;
  if (!key) throw new UpstreamError("The RailRadar key is not set on this server (RAILRADAR_API_KEY).");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    const json: unknown = await r.json().catch(() => null);
    return { status: r.status, json };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new UpstreamError("railradar.in could not be reached");
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

async function askTimetable(): Promise<Railway> {
  const { status, json } = await railRadarFetch(RAILRADAR_URL);
  if (status === 429) throw new UpstreamError("RailRadar turned the request away for going over its limit (30 a minute, 30,000 a month on the plant's key). Try again in a minute.", 429);
  if (status === 401 || status === 403) throw new UpstreamError("RailRadar did not accept the plant's key.", status);
  if (status !== 200) throw new UpstreamError(`railradar.in answered ${status}`, status);
  return parseRailway(json);
}

/** the timetable from the host-wide cache (twelve hours), asking RailRadar only when there is none or it is old */
export const loadRailway = unstable_cache(askTimetable, ["railradar-station-DGR-v1"], { revalidate: KEPT_S });

/** one board of RailRadar with the statuses every caller treats the same way */
async function askBoard(url: string): Promise<unknown> {
  const { status, json } = await railRadarFetch(url);
  if (status === 429) throw new UpstreamError("RailRadar turned the request away for going over its limit (30 a minute, 30,000 a month on the plant's key). Try again in a minute.", 429);
  if (status === 401 || status === 403) throw new UpstreamError("RailRadar did not accept the plant's key.", status);
  if (status !== 200) throw new UpstreamError(`railradar.in answered ${status}`, status);
  return json;
}

/** Asansol's trains that Durgapur does not stop: two boards (Asansol's, and Durgapur's with the pass-throughs), one after the other, kept twelve hours like the Durgapur one (so two requests in twelve hours) */
async function askAsansol(): Promise<AsansolTrains> {
  const asn = await askBoard(RAILRADAR_ASN_URL);
  const dgr = await askBoard(RAILRADAR_DGR_ALL_URL);
  return parseAsansol(asn, dgr);
}

/** Asansol's list is kept THREE days (two requests each time, from the free plan's 100 a month, of which Durgapur's twelve-hour timetable already takes about 60): the stations a train stops at hardly change from day to day */
export const KEPT_ASN_S = 3 * 24 * 60 * 60;
export const loadAsansol = unstable_cache(askAsansol, ["railradar-asansol-not-at-DGR-v1"], { revalidate: KEPT_ASN_S });
