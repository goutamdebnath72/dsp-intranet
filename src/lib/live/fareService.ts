// src/lib/live/fareService.ts
//
// WHAT THE CARD IS TOLD ABOUT A TRAIN'S FARES: THE SAVED ONES, FROM THE DATABASE ONLY, always with the TIME THEY WERE RECEIVED. The app NEVER asks RailRadar's fare service: the plant pays for it for one month only,
// the fares were collected into the database (scripts/harvest-fares.ts, scripts/harvest-legs.ts), and after the month the database is all there is. A train with no saved row has no fares and the card says so.
//   * Before the end of the paid month the saved row is shown as it is; the collection scripts may refresh it, the app never does.
//   * From the day after FARES_LIVE_UNTIL the rows are marked "frozen": no longer refreshed.
import { DateTime } from "luxon";
import { UpstreamError } from "./http";
import type { FareSet, LegFare } from "./fare";
import type { LegRow } from "./fareLegStore";
import type { FareStore } from "./fareStore";
import { STATION } from "./railway";

/** the last day on which the fare service is asked (the paid month renews on 14 Dec 2026: the day before, so that no renewal is ever relied on) */
export const FARES_LIVE_UNTIL = "2026-12-13";

/** what the card gets: the fares, when they were received, and whether they are still being refreshed */
export interface FareAnswer extends FareSet {
  /** when the fares were received from RailRadar (ISO, UTC) */
  receivedAt: string;
  /** the paid month is over: these will not be refreshed any more */
  frozen: boolean;
}

export const fareServiceOpen = (now: DateTime, until: string = FARES_LIVE_UNTIL): boolean => now.setZone(STATION.zone).toFormat("yyyy-MM-dd") <= until;

export interface FareDeps {
  store: FareStore;
  now?: () => DateTime;
  until?: string;
}

/** the saved fares of one train: read from the database, nothing else (no request to RailRadar, ever) */
export async function fareAnswer(number: string, deps: FareDeps): Promise<{ data: FareAnswer; stale: boolean }> {
  const now = (deps.now ?? DateTime.now)();
  const open = fareServiceOpen(now, deps.until);
  const row = await deps.store.get(number).catch(() => { throw new UpstreamError("The saved fares could not be read just now."); });
  if (!row) throw new UpstreamError("The fares of this train were not collected while the plant's paid fare service lasted, and they are read from the saved data only. Check IRCTC for the fare.");
  return { data: { ...row.set, receivedAt: row.receivedAt, frozen: !open }, stale: !open };
}

/** the fares to every stop of a train, as the card gets them */
export interface LegsAnswer {
  train: string;
  legs: LegFare[];
  /** when the OLDEST of the stops' fares was received (the date the card names: none is older), and the newest */
  receivedAt: string;
  newestAt: string;
  /** the paid month is over: these will not be refreshed any more */
  frozen: boolean;
  /** the legs are hints from the railway's fare table (a local train), not fares from the reservation system */
  hint: boolean;
}

/** the saved stops of a train as one answer; null when none is saved. Read from the database only: the stops are collected by scripts/harvest-legs.ts, never asked for by a click (a long-distance train has 50 stops and 200 requests). */
export function legsAnswer(number: string, rows: LegRow[], now: DateTime, until?: string): LegsAnswer | null {
  if (rows.length === 0) return null;
  const at = rows.map((r) => DateTime.fromISO(r.receivedAt).toMillis());
  const iso = (ms: number) => DateTime.fromMillis(ms).toUTC().toISO() ?? "";
  return {
    train: number,
    legs: rows.map((r) => r.leg).sort((a, b) => a.seq - b.seq),
    receivedAt: iso(Math.min(...at)),
    newestAt: iso(Math.max(...at)),
    frozen: !fareServiceOpen(now, until),
    hint: rows.every((r) => r.leg.classes.every((c) => c.basis === "table")),
  };
}
