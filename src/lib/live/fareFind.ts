// src/lib/live/fareFind.ts
//
// "FIND A FARE": the trains that go from Durgapur to a station the user picks, with the saved fare of each class, built from the saved fares to every stop (public.train_fare_leg) joined with the kept timetable (the
// departure at Durgapur, the days, the kind of train). Pure: the rows, the timetable and the clock are handed in. Nothing here asks RailRadar: the fares were collected while the paid month lasted.
import { DateTime } from "luxon";
import type { ClassFare } from "./fare";
import { fareServiceOpen } from "./fareService";
import type { Coverage, StopInfo, StopTrainRow } from "./fareLegStore";
import type { Day, Kind, Railway, Train } from "./railway";

/** the stations that have a saved fare to them (for the search box) */
export interface StopsAnswer { stops: StopInfo[] }

export interface FindTrain {
  number: string;
  name: string;
  /** "Express", "Superfast", "Vande Bharat", "Shatabdi", "MEMU (local)"...; empty when the timetable is not at hand */
  label: string;
  kind: Kind | null;
  /** at Durgapur; null when the timetable is not at hand */
  departure: string | null;
  arrival: string | null;
  days: Day[];
  /** where the train's run ends (the name RailRadar gives it and the code) */
  endsAt: { code: string; name: string } | null;
  distanceKm: number;
  classes: ClassFare[];
  /** the fares are hints from the railway's fare table (a local train) */
  hint: boolean;
  receivedAt: string;
}

export interface FindAnswer {
  stop: { code: string; name: string };
  trains: FindTrain[];
  coverage: Coverage;
  /** the OLDEST fare among the trains shown (none is older) */
  receivedAt: string;
  /** the paid month is over: nothing is refreshed any more */
  frozen: boolean;
}

/** the cheapest fare of a train to the stop (the lowest class), for sorting; Infinity when it has none */
export const cheapest = (t: FindTrain): number => (t.classes.length ? Math.min(...t.classes.map((c) => c.total)) : Infinity);

/** the trains to a station: from the saved fares and the timetable (null when the timetable could not be read); null when no train has a saved fare to it */
export function buildFind(stop: { code: string; name: string }, rows: StopTrainRow[], railway: Railway | null, coverage: Coverage, now: DateTime, until?: string): FindAnswer | null {
  if (rows.length === 0) return null;
  const all: Train[] = railway ? [...railway.express.east, ...railway.express.west, ...railway.express.other, ...railway.local.east, ...railway.local.west, ...railway.local.other] : [];
  const byNumber = new Map(all.map((t) => [t.number, t]));
  const trains: FindTrain[] = rows.map((r) => {
    const t = byNumber.get(r.number);
    return {
      number: r.number,
      name: t?.name ?? r.trainName,
      label: t?.label ?? "",
      kind: t?.kind ?? null,
      departure: t ? t.departure : null,
      arrival: t ? t.arrival : null,
      days: t?.days ?? [],
      endsAt: t ? { code: t.toCode, name: t.to } : null,
      distanceKm: r.leg.distanceKm,
      classes: r.leg.classes,
      hint: r.leg.classes.every((c) => c.basis === "table"),
      receivedAt: r.receivedAt,
    };
  });
  // by the time the train is at Durgapur (the departure, else the arrival), trains without a time last, then by number
  trains.sort((a, b) => {
    const ta = a.departure ?? a.arrival, tb = b.departure ?? b.arrival;
    if (ta === null && tb === null) return a.number.localeCompare(b.number);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta.localeCompare(tb) || a.number.localeCompare(b.number);
  });
  const at = trains.map((t) => DateTime.fromISO(t.receivedAt).toMillis());
  return { stop, trains, coverage, receivedAt: DateTime.fromMillis(Math.min(...at)).toUTC().toISO() ?? "", frozen: !fareServiceOpen(now, until) };
}
