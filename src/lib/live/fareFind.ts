// src/lib/live/fareFind.ts
//
// "FIND A FARE": I list the trains that go from Durgapur (or from Asansol, on the Asansol tab) to a station the user picks, with the saved fare of each class. I build it from the saved fares to every stop (public.train_fare_leg) joined with the kept timetable (the
// departure at Durgapur, the days, the kind of train). This file is pure: the rows, the timetable and the clock are handed in. Nothing here asks RailRadar, because the fares were collected while the paid month lasted.
import { DateTime } from "luxon";
import type { ClassFare } from "./fare";
import { fareServiceOpen } from "./fareService";
import type { Coverage, StopInfo, StopTrainRow } from "./fareLegStore";
import type { Day, Kind, Railway, Train } from "./railway";
import type { AsansolTrains } from "./railwayAsansol";

/** The stations that have a saved fare to them, used by the search box. */
export interface StopsAnswer { stops: StopInfo[] }

export interface FindTrain {
  number: string;
  name: string;
  /** One of "Express", "Superfast", "Vande Bharat", "Shatabdi", "MEMU (local)"...; I leave it empty when the timetable is not at hand. */
  label: string;
  kind: Kind | null;
  /** The departure at the starting station (Durgapur, or Asansol); I set null when the timetable is not at hand. */
  departure: string | null;
  arrival: string | null;
  days: Day[];
  /** Where the train's run ends: the name RailRadar gives it, and the code. */
  endsAt: { code: string; name: string } | null;
  distanceKm: number;
  classes: ClassFare[];
  /** True when the fares are hints from the railway's fare table (a local train). */
  hint: boolean;
  receivedAt: string;
}

export interface FindAnswer {
  stop: { code: string; name: string };
  trains: FindTrain[];
  coverage: Coverage;
  /** The OLDEST fare among the trains shown, so none is older than this. */
  receivedAt: string;
  /** True when the paid month is over: nothing is refreshed any more. */
  frozen: boolean;
}

/** The cheapest fare of a train to the stop (its lowest class), used for sorting; I return Infinity when it has none. */
export const cheapest = (t: FindTrain): number => (t.classes.length ? Math.min(...t.classes.map((c) => c.total)) : Infinity);

/** A timetable that is two flat lists (Asansol's, and the Kolkata tab's) */
export interface FlatTimetable { express: Train[]; local: Train[] }

/** I return every train of a timetable, whichever of the shapes it has: Durgapur's (in groups by direction) or the flat one of Asansol and Kolkata (two lists). */
export function trainsOf(t: Railway | AsansolTrains | FlatTimetable | null): Train[] {
  if (!t) return [];
  if (Array.isArray(t.express)) return [...t.express, ...(t.local as Train[])];
  const r = t as Railway;
  return [...r.express.east, ...r.express.west, ...r.express.other, ...r.local.east, ...r.local.west, ...r.local.other];
}

/** I build the trains to a station from the saved fares and the timetable (null when the timetable could not be read); the result is null when no train has a saved fare to it. */
export function buildFind(stop: { code: string; name: string }, rows: StopTrainRow[], railway: Railway | AsansolTrains | FlatTimetable | null, coverage: Coverage, now: DateTime, until?: string): FindAnswer | null {
  if (rows.length === 0) return null;
  const all: Train[] = trainsOf(railway);
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
  // I sort by the time the train is at Durgapur (the departure, else the arrival), put trains without a time last, and then order by number.
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
