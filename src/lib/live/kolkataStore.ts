// src/lib/live/kolkataStore.ts
//
// THE SAVED TRAINS OF THE KOLKATA TERMINALS (Howrah, Sealdah, Santragachi, Kolkata) THAT GO OVER NEITHER DURGAPUR NOR ASANSOL, with their fares (src/lib/live/kolkataSet.ts says which trains these are). Three tables, closed to the
// public roles like the other fare tables (src/lib/nl2sql/sql/32_train_kol.sql):
//   public.train_kol           the CATALOGUE: one row for every train that STARTS at one of the four stations, whether it is in the set or not (in_set, and the reason when it is out), with its details and its halts with times;
//   public.train_fare_kol      the fare of each class from the starting station to the END of the run, one row per train (the same shape as train_fare, with from_code because the starting station differs);
//   public.train_fare_leg_kol  the fare to EVERY halt after the starting station, one row per train and halt (the same shape as train_fare_leg).
// Everything has the time it was received. The fares are the railway's reservation system's own, through RailRadar's paid fare service (to 14 Dec 2026). Nothing here is personal data.
// I made these tables of their own, and did not widen FareStation (fareStore.ts), so that nothing about the Durgapur and Asansol tabs can change.
import { DateTime } from "luxon";
import type { ClassFare, FareSet, LegFare } from "./fare";
import type { HaltRow, TrainFull } from "./kolkataSet";

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const KOL_TABLES = { trains: "train_kol", fares: "train_fare_kol", legs: "train_fare_leg_kol" } as const;

export const kolTableStatements = (): string[] => [
  `CREATE TABLE IF NOT EXISTS public.${KOL_TABLES.trains} (
     train_number text        PRIMARY KEY,
     train_name   text        NOT NULL,
     train_type   text        NOT NULL,
     category     text        NOT NULL DEFAULT '',
     from_code    text        NOT NULL,
     from_name    text        NOT NULL DEFAULT '',
     to_code      text        NOT NULL,
     to_name      text        NOT NULL DEFAULT '',
     run_days     jsonb       NOT NULL DEFAULT '[]',
     distance_km  numeric,
     duration_min integer,
     total_halts  integer,
     return_train text,
     classes      jsonb       NOT NULL DEFAULT '[]',
     prs_bookable boolean     NOT NULL DEFAULT false,
     has_reversal boolean     NOT NULL DEFAULT false,
     touches      jsonb       NOT NULL DEFAULT '[]',
     in_set       boolean     NOT NULL,
     reason       text        NOT NULL DEFAULT '',
     halts        jsonb       NOT NULL DEFAULT '[]',
     fetched_at   timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS public.${KOL_TABLES.fares} (
     train_number text        PRIMARY KEY,
     train_name   text        NOT NULL,
     from_code    text        NOT NULL,
     to_code      text        NOT NULL,
     journey_date date        NOT NULL,
     distance_km  numeric     NOT NULL,
     classes      jsonb       NOT NULL,
     fetched_at   timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS public.${KOL_TABLES.legs} (
     train_number text        NOT NULL,
     to_code      text        NOT NULL,
     to_name      text        NOT NULL,
     seq          integer     NOT NULL,
     distance_km  numeric     NOT NULL,
     journey_date date        NOT NULL,
     classes      jsonb       NOT NULL,
     fetched_at   timestamptz NOT NULL,
     PRIMARY KEY (train_number, to_code)
   )`,
  ...Object.values(KOL_TABLES).flatMap((t) => [`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ON public.${t} FROM anon, authenticated`]),
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);
const json = (x: unknown): any => (typeof x === "string" ? JSON.parse(x) : x);

/** What the catalogue keeps of a train: the details, and whether it is in the set (with the reason when it is not). */
export interface CatalogueRow {
  number: string;
  name: string;
  type: string;
  category: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  runDays: string[];
  distanceKm: number | null;
  durationMin: number | null;
  totalHalts: number | null;
  returnTrain: string | null;
  classes: string[];
  prsBookable: boolean;
  hasReversal: boolean;
  touches: string[];
  inSet: boolean;
  reason: string;
  halts: HaltRow[];
  fetchedAt: string;
}

/** A catalogue row for a train whose full record was read. */
export function catalogueFromTrain(t: TrainFull, touches: string[], inSet: boolean, reason: string, at: Date): CatalogueRow {
  return { number: t.number, name: t.name, type: t.type, category: t.category, from: t.from, fromName: t.fromName, to: t.to, toName: t.toName, runDays: t.runDays, distanceKm: t.distanceKm, durationMin: t.durationMin, totalHalts: t.totalHalts, returnTrain: t.returnTrain, classes: t.classes, prsBookable: t.prsBookable, hasReversal: t.hasReversal, touches, inSet, reason, halts: inSet ? t.halts : [], fetchedAt: at.toISOString() };
}

export function catalogueFromRow(x: any): CatalogueRow | null {
  try {
    const at = x.fetched_at instanceof Date ? DateTime.fromJSDate(x.fetched_at) : DateTime.fromISO(String(x.fetched_at));
    if (!at.isValid || !/^\d{5}$/.test(String(x.train_number))) return null;
    return { number: String(x.train_number), name: String(x.train_name), type: String(x.train_type), category: String(x.category ?? ""), from: String(x.from_code), fromName: String(x.from_name ?? ""), to: String(x.to_code), toName: String(x.to_name ?? ""), runDays: json(x.run_days) ?? [], distanceKm: x.distance_km === null ? null : Number(x.distance_km), durationMin: x.duration_min === null ? null : Number(x.duration_min), totalHalts: x.total_halts === null ? null : Number(x.total_halts), returnTrain: x.return_train ?? null, classes: json(x.classes) ?? [], prsBookable: x.prs_bookable === true, hasReversal: x.has_reversal === true, touches: json(x.touches) ?? [], inSet: x.in_set === true, reason: String(x.reason ?? ""), halts: json(x.halts) ?? [], fetchedAt: at.toUTC().toISO() ?? "" };
  } catch {
    return null;
  }
}

export interface KolStore {
  ensure(): Promise<void>;
  putTrain(row: CatalogueRow): Promise<void>;
  trains(): Promise<CatalogueRow[]>;
  putFare(set: FareSet, at: Date): Promise<void>;
  fare(number: string): Promise<{ set: FareSet; receivedAt: string } | null>;
  putLeg(number: string, leg: LegFare, at: Date): Promise<void>;
  /** the halts that have a saved fare for a train, with when */
  legs(number: string): Promise<Array<{ to: string; receivedAt: string }>>;
  /** counts for the report */
  summary(): Promise<{ trains: number; inSet: number; withFares: number; withLegs: number; legRows: number; oldest: Date | null; newest: Date | null }>;
}

/** The store of the set. Unlike the app's stores it THROWS when the database fails: it is used by the collection script, which must stop (not go on collecting what it cannot save). */
export function kolStore(ds: Queryable): KolStore {
  const t = KOL_TABLES;
  return {
    async ensure() { for (const sql of kolTableStatements()) await ds.query(sql); },
    async putTrain(r) {
      await ds.query(
        `INSERT INTO public.${t.trains} (train_number, train_name, train_type, category, from_code, from_name, to_code, to_name, run_days, distance_km, duration_min, total_halts, return_train, classes, prs_bookable, has_reversal, touches, in_set, reason, halts, fetched_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb,$15,$16,$17::jsonb,$18,$19,$20::jsonb,$21)
         ON CONFLICT (train_number) DO UPDATE SET train_name=EXCLUDED.train_name, train_type=EXCLUDED.train_type, category=EXCLUDED.category, from_code=EXCLUDED.from_code, from_name=EXCLUDED.from_name, to_code=EXCLUDED.to_code, to_name=EXCLUDED.to_name,
              run_days=EXCLUDED.run_days, distance_km=EXCLUDED.distance_km, duration_min=EXCLUDED.duration_min, total_halts=EXCLUDED.total_halts, return_train=EXCLUDED.return_train, classes=EXCLUDED.classes, prs_bookable=EXCLUDED.prs_bookable,
              has_reversal=EXCLUDED.has_reversal, touches=EXCLUDED.touches, in_set=EXCLUDED.in_set, reason=EXCLUDED.reason, halts=EXCLUDED.halts, fetched_at=EXCLUDED.fetched_at`,
        [r.number, r.name, r.type, r.category, r.from, r.fromName, r.to, r.toName, JSON.stringify(r.runDays), r.distanceKm, r.durationMin, r.totalHalts, r.returnTrain, JSON.stringify(r.classes), r.prsBookable, r.hasReversal, JSON.stringify(r.touches), r.inSet, r.reason, JSON.stringify(r.halts), r.fetchedAt],
      );
    },
    async trains() {
      const r = rowsOf(await ds.query(`SELECT * FROM public.${t.trains} ORDER BY train_number`));
      return r.flatMap((x) => { const c = catalogueFromRow(x); return c ? [c] : []; });
    },
    async putFare(set, at) {
      await ds.query(
        `INSERT INTO public.${t.fares} (train_number, train_name, from_code, to_code, journey_date, distance_km, classes, fetched_at)
              VALUES ($1,$2,$3,$4,$5::date,$6,$7::jsonb,$8)
         ON CONFLICT (train_number) DO UPDATE SET train_name=EXCLUDED.train_name, from_code=EXCLUDED.from_code, to_code=EXCLUDED.to_code, journey_date=EXCLUDED.journey_date, distance_km=EXCLUDED.distance_km, classes=EXCLUDED.classes, fetched_at=EXCLUDED.fetched_at`,
        [set.train, set.trainName, set.from, set.to, set.journeyDate, set.distanceKm, JSON.stringify(set.classes), at.toISOString()],
      );
    },
    async fare(number) {
      const r = rowsOf(await ds.query(`SELECT train_number, train_name, from_code, to_code, to_char(journey_date,'YYYY-MM-DD') AS journey_date, distance_km, classes, fetched_at FROM public.${t.fares} WHERE train_number = $1`, [number]))[0];
      if (!r) return null;
      const at = r.fetched_at instanceof Date ? DateTime.fromJSDate(r.fetched_at) : DateTime.fromISO(String(r.fetched_at));
      return { receivedAt: at.toUTC().toISO() ?? "", set: { train: String(r.train_number), trainName: String(r.train_name), from: String(r.from_code), to: String(r.to_code), journeyDate: String(r.journey_date), distanceKm: Number(r.distance_km), classes: json(r.classes) as ClassFare[] } };
    },
    async putLeg(number, leg, at) {
      await ds.query(
        `INSERT INTO public.${t.legs} (train_number, to_code, to_name, seq, distance_km, journey_date, classes, fetched_at)
              VALUES ($1,$2,$3,$4,$5,$6::date,$7::jsonb,$8)
         ON CONFLICT (train_number, to_code) DO UPDATE SET to_name=EXCLUDED.to_name, seq=EXCLUDED.seq, distance_km=EXCLUDED.distance_km, journey_date=EXCLUDED.journey_date, classes=EXCLUDED.classes, fetched_at=EXCLUDED.fetched_at`,
        [number, leg.to, leg.name, leg.seq, leg.distanceKm, leg.journeyDate, JSON.stringify(leg.classes), at.toISOString()],
      );
    },
    async legs(number) {
      const r = rowsOf(await ds.query(`SELECT to_code, fetched_at FROM public.${t.legs} WHERE train_number = $1 ORDER BY seq`, [number]));
      return r.map((x) => ({ to: String(x.to_code), receivedAt: (x.fetched_at instanceof Date ? DateTime.fromJSDate(x.fetched_at) : DateTime.fromISO(String(x.fetched_at))).toUTC().toISO() ?? "" }));
    },
    async summary() {
      const a = rowsOf(await ds.query(`SELECT count(*)::int AS trains, count(*) FILTER (WHERE in_set)::int AS in_set, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM public.${t.trains}`))[0];
      const f = rowsOf(await ds.query(`SELECT count(*)::int AS n FROM public.${t.fares}`))[0];
      const l = rowsOf(await ds.query(`SELECT count(*)::int AS rows, count(DISTINCT train_number)::int AS trains, max(fetched_at) AS newest FROM public.${t.legs}`))[0];
      return { trains: a.trains, inSet: a.in_set, withFares: f.n, withLegs: l.trains, legRows: l.rows, oldest: a.oldest ?? null, newest: l.newest && (!a.newest || l.newest > a.newest) ? l.newest : a.newest ?? null };
    },
  };
}
