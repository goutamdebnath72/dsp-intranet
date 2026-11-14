// src/lib/live/fareService.ts
//
// WHAT THE CARD IS TOLD ABOUT A TRAIN'S FARES: the saved ones, refreshed from RailRadar only while the plant's paid month lasts, and always with the TIME THEY WERE RECEIVED.
//   * A saved row younger than three days is shown as it is, with no request.
//   * An older one (or none) is fetched afresh while the paid service is open (until FARES_LIVE_UNTIL), saved, and shown; if the fetch fails, the saved row is shown with the note that the source did not answer.
//   * AFTER THE PAID MONTH (from the day after FARES_LIVE_UNTIL) RailRadar's fare service is NEVER asked again: on the free plan every request, refused or not, is taken from the 100 a month the timetable needs.
//     The saved rows are shown as they are, marked "frozen": no longer refreshed. A train with no saved row then has no fares, and says why.
// Two people pressing the same train at once share one request. The asking, the saving and the clock are handed in, so that this is tested without the network or a database.
import { DateTime } from "luxon";
import { UpstreamError } from "./http";
import { FARE_KEPT_S, type FareSet, type LegFare } from "./fare";
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
  /** where the train ends and a day it is at Durgapur, read from the kept timetable (only asked when the fare service has to be asked) */
  target: () => Promise<{ to: string; date: string; local?: boolean }>;
  /** asks RailRadar for the fares of the train: every class from the fare service, or, for a local train, its schedule (for the distance of the table's hint) */
  ask: (number: string, to: string, date: string, local: boolean) => Promise<FareSet>;
  now?: () => DateTime;
  until?: string;
}

const inflight = new Map<string, Promise<{ data: FareAnswer; stale: boolean }>>();

export async function fareAnswer(number: string, deps: FareDeps): Promise<{ data: FareAnswer; stale: boolean }> {
  const now = (deps.now ?? DateTime.now)();
  const open = fareServiceOpen(now, deps.until);
  const row = await deps.store.get(number).catch(() => null);
  const age = row ? now.toMillis() - DateTime.fromISO(row.receivedAt).toMillis() : Infinity;
  if (row && (!open || age < FARE_KEPT_S * 1000)) return { data: { ...row.set, receivedAt: row.receivedAt, frozen: !open }, stale: !open };
  if (!open) throw new UpstreamError("The fares of this train were not collected before the paid fare service ended, and it is not asked any more. Check IRCTC for the fare.");
  const mine = inflight.get(number);
  if (mine) return mine;
  const job = (async () => {
    try {
      const t = await deps.target();
      const set = await deps.ask(number, t.to, t.date, t.local === true);
      const at = (deps.now ?? DateTime.now)().toUTC();
      await deps.store.put(set, at.toJSDate());
      return { data: { ...set, receivedAt: at.toISO() ?? "", frozen: false }, stale: false };
    } catch (e) {
      if (row) return { data: { ...row.set, receivedAt: row.receivedAt, frozen: false }, stale: true };
      throw e;
    } finally {
      inflight.delete(number);
    }
  })();
  inflight.set(number, job);
  return job;
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
