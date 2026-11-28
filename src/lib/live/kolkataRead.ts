// src/lib/live/kolkataRead.ts
//
// WHAT THE SERVER READS FOR THE KOLKATA TAB: the saved trains and fares of the third set (kolkataStore.ts), DATABASE ONLY. I never ask RailRadar here: the paid month collected everything (scripts/harvest-kol.ts) and after it the
// database is all there is, as for the other two tabs. The catalogue and the fare summaries are kept ten minutes in this copy's memory (they change only when I run the harvest), so that opening a station, a fare box and the
// fare finder do not each read six hundred trains again. A database failure is thrown (the route turns it into a plain 503): the tab says it cannot show the trains, it never shows a half-read list.
import type { FareRow } from "./fareStore";
import type { StopInfo, StopTrainRow, Coverage, LegRow } from "./fareLegStore";
import { kolStore, type CatalogueRow, type Queryable } from "./kolkataStore";
import { buildKolkata, stationTrains, type FareSummary, type KolkataAnswer, type KolTrain, type StartCode } from "./kolkataView";

const KEEP_MS = 10 * 60 * 1000;

interface Loaded { at: number; rows: CatalogueRow[]; fares: Map<string, FareSummary> }
let kept: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

/** The catalogue (every train that starts at the four stations, in the set or out) and the fare summaries, from the database, kept ten minutes. */
export async function loadKolkata(ds: Queryable, now = Date.now()): Promise<Loaded> {
  if (kept && now - kept.at < KEEP_MS) return kept;
  loading ??= (async () => {
    try {
      const store = kolStore(ds);
      const [rows, sums] = await Promise.all([store.trains(), store.fareSummaries()]);
      if (rows.filter((r) => r.inSet).length === 0) throw new Error("No trains of the Kolkata set are saved yet.");
      kept = { at: Date.now(), rows, fares: new Map(sums.map((s) => [s.number, { classes: s.classes, receivedAt: s.receivedAt }])) };
      return kept;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Forget what is kept (the tests, and the harvest script when it finishes a run). */
export function forgetKolkata(): void { kept = null; finder.clear(); }

export async function kolkataAnswer(ds: Queryable, code: StartCode): Promise<KolkataAnswer> {
  const { rows, fares } = await loadKolkata(ds);
  return buildKolkata(rows, fares, code);
}

/** The end-of-run fare of a train, as the fare box wants it (a FareRow); null when none is saved. */
export async function kolkataFareRow(ds: Queryable, number: string): Promise<FareRow | null> {
  const r = await kolStore(ds).fare(number);
  return r ? { set: r.set, receivedAt: r.receivedAt } : null;
}

/** The saved fares to every halt of one train (the "Fares to every stop" table). */
export async function kolkataLegRows(ds: Queryable, number: string): Promise<LegRow[]> {
  return kolStore(ds).legRows(number);
}

export interface KolkataFind {
  stops: StopInfo[];
  /** Every train's saved fare to one station, among the trains of this starting station that the tab shows */
  toStop(code: string): StopTrainRow[];
  coverage: Coverage;
  /** The tab's own trains as a timetable, for the times and days of the finder's rows */
  timetable: { express: KolTrain[]; local: KolTrain[] };
}

const finder = new Map<string, { at: number; value: KolkataFind }>();

/** THE FARE FINDER OF ONE STARTING STATION: only the trains the tab shows for it (so a train the rule left out is never offered), with their saved fares to every halt. */
export async function kolkataFind(ds: Queryable, code: StartCode): Promise<KolkataFind> {
  const hit = finder.get(code);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const { rows, fares } = await loadKolkata(ds);
  const { trains } = stationTrains(rows, fares, code);
  const names = new Map(trains.map((t) => [t.number, t.name]));
  const asked = trains.filter((t) => t.fare === "saved").map((t) => t.number);
  const legs = (await kolStore(ds).legRowsFor(asked)).filter((l) => names.has(l.number));
  const byStop = new Map<string, StopInfo>();
  for (const l of legs) {
    const s = byStop.get(l.row.leg.to);
    if (s) s.trains++; else byStop.set(l.row.leg.to, { code: l.row.leg.to, name: l.row.leg.name, trains: 1 });
  }
  const value: KolkataFind = {
    stops: [...byStop.values()].sort((a, b) => a.name.localeCompare(b.name)),
    toStop: (to) => legs.filter((l) => l.row.leg.to === to).map((l) => ({ number: l.number, trainName: names.get(l.number) ?? "", leg: l.row.leg, receivedAt: l.row.receivedAt })).sort((a, b) => a.number.localeCompare(b.number)),
    coverage: { withFares: asked.length, withLegs: new Set(legs.map((l) => l.number)).size },
    timetable: { express: trains.filter((t) => t.kind !== "local"), local: trains.filter((t) => t.kind === "local") },
  };
  finder.set(code, { at: Date.now(), value });
  return value;
}
