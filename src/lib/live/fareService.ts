// src/lib/live/fareService.ts
//
// WHAT THE CARD IS TOLD ABOUT A TRAIN'S FARES: the saved ones, from the database only, always with the time they were received. I never let the app ask RailRadar's fare service: the plant pays for it for one month only,
// so I collected the fares into the database (scripts/harvest-fares.ts, scripts/harvest-legs.ts), and after the month the database is all there is. A train with no saved row has no fares and the card says so.
//   * Before the end of the paid month I show the saved row as it is; the collection scripts may refresh it, the app never does.
//   * From the day after FARES_LIVE_UNTIL I mark the rows "frozen": they are no longer refreshed.
import { DateTime } from "luxon";
import { UpstreamError } from "./http";
import type { FareSet, LegFare } from "./fare";
import type { LegRow } from "./fareLegStore";
import type { FareStore } from "./fareStore";
import { STATION } from "./railway";

/** The last day on which the fare service is asked. The paid month renews on 14 Dec 2026, so I stop the day before and never rely on a renewal. */
export const FARES_LIVE_UNTIL = "2026-12-13";

/** What the card gets: the fares, when they were received, and whether they are still being refreshed. */
export interface FareAnswer extends FareSet {
  /** The time the fares were received from RailRadar (ISO, UTC). */
  receivedAt: string;
  /** True when the paid month is over: these will not be refreshed any more. */
  frozen: boolean;
}

export const fareServiceOpen = (now: DateTime, until: string = FARES_LIVE_UNTIL): boolean => now.setZone(STATION.zone).toFormat("yyyy-MM-dd") <= until;

export interface FareDeps {
  store: FareStore;
  now?: () => DateTime;
  until?: string;
}

/** Returns the saved fares of one train, read from the database and nothing else: I never send a request to RailRadar. */
export async function fareAnswer(number: string, deps: FareDeps): Promise<{ data: FareAnswer; stale: boolean }> {
  const now = (deps.now ?? DateTime.now)();
  const open = fareServiceOpen(now, deps.until);
  const row = await deps.store.get(number).catch(() => { throw new UpstreamError("The saved fares could not be read just now."); });
  if (!row) throw new UpstreamError("The fares of this train were not collected while the plant's paid fare service lasted, and they are read from the saved data only. Check IRCTC for the fare.");
  return { data: { ...row.set, receivedAt: row.receivedAt, frozen: !open }, stale: !open };
}

/** The fares to every stop of a train, as the card gets them. */
export interface LegsAnswer {
  train: string;
  legs: LegFare[];
  /** The time the OLDEST of the stops' fares was received (the date the card names: none is older), and the newest. */
  receivedAt: string;
  newestAt: string;
  /** True when the paid month is over: these will not be refreshed any more. */
  frozen: boolean;
  /** True when the legs are hints from the railway's fare table (a local train), not fares from the reservation system. */
  hint: boolean;
}

/** Turns the saved stops of a train into one answer; null when none is saved. I read from the database only: the stops are collected by scripts/harvest-legs.ts and never asked for by a click (a long-distance train has 50 stops and 200 requests). */
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
