// src/lib/live/fareStore.ts
//
// THE SAVED FARES (table public.train_fare, src/lib/nl2sql/sql/21_train_fare.sql). The plant uses RailRadar's paid fare service for ONE month only (to 14 Dec 2026), so every fare received is SAVED here with the time it
// was received, and the card shows that time ("Fares last received ..."). After the month the rows simply stay. One row per train, replaced whenever the train's fares are received again.
// Nothing here may break a card: database trouble is logged once and the store then answers "nothing saved" (get) or does nothing (put), exactly like src/lib/search/edsStore.ts, whose pattern this follows.
import { DateTime } from "luxon";
import type { ClassFare, FareSet } from "./fare";

export interface FareRow {
  set: FareSet;
  /** when the fares were received from RailRadar (ISO, UTC) */
  receivedAt: string;
}

export interface FareStore {
  get(number: string): Promise<FareRow | null>;
  put(set: FareSet, receivedAt: Date): Promise<void>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const FARE_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.train_fare (
     train_number text        PRIMARY KEY,
     train_name   text        NOT NULL,
     to_code      text        NOT NULL,
     journey_date date        NOT NULL,
     distance_km  numeric     NOT NULL,
     classes      jsonb       NOT NULL,
     fetched_at   timestamptz NOT NULL
   )`,
  `ALTER TABLE public.train_fare ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.train_fare FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);

/** a saved row read back and CHECKED: a row that is not the shape written is treated as not saved, never shown */
export function fareFromRow(x: any): FareRow | null {
  try {
    const classes = (typeof x.classes === "string" ? JSON.parse(x.classes) : x.classes) as ClassFare[];
    const at = x.fetched_at instanceof Date ? DateTime.fromJSDate(x.fetched_at) : DateTime.fromISO(String(x.fetched_at));
    const distanceKm = Number(x.distance_km);
    if (!Array.isArray(classes) || !at.isValid || !Number.isFinite(distanceKm)) return null;
    for (const c of classes) if (typeof c?.code !== "string" || typeof c?.name !== "string" || typeof c?.total !== "number" || !Array.isArray(c?.parts)) return null;
    if (!/^\d{5}$/.test(String(x.train_number)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.journey_date))) return null;
    return { receivedAt: at.toUTC().toISO() ?? "", set: { train: String(x.train_number), trainName: String(x.train_name), from: "DGR", to: String(x.to_code), journeyDate: String(x.journey_date), distanceKm, classes } };
  } catch {
    return null;
  }
}

export function typeormFareStore(ds: Queryable): FareStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;

  const ensure = (): Promise<boolean> => {
    // a good (or still pending) check stands; a failed one is not repeated for 10 minutes
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.train_fare') AS t`));
        if (have[0]?.t) return true;
        for (const sql of FARE_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) {
          warned = true;
          console.warn("[fares] the fare store is not available (run src/lib/nl2sql/sql/21_train_fare.sql):", e?.message || e);
        }
        return false;
      }
    })();
    return ready;
  };

  return {
    async get(number) {
      if (!(await ensure())) return null;
      try {
        const r = rowsOf(await ds.query(`SELECT train_number, train_name, to_code, to_char(journey_date, 'YYYY-MM-DD') AS journey_date, distance_km, classes, fetched_at FROM public.train_fare WHERE train_number = $1`, [number]));
        return r[0] ? fareFromRow(r[0]) : null;
      } catch (e: any) {
        console.warn("[fares] could not read the saved fares:", e?.message || e);
        return null;
      }
    },
    async put(set, receivedAt) {
      if (!(await ensure())) return;
      try {
        await ds.query(
          `INSERT INTO public.train_fare (train_number, train_name, to_code, journey_date, distance_km, classes, fetched_at)
                VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, $7)
           ON CONFLICT (train_number) DO UPDATE
                 SET train_name = EXCLUDED.train_name, to_code = EXCLUDED.to_code, journey_date = EXCLUDED.journey_date,
                     distance_km = EXCLUDED.distance_km, classes = EXCLUDED.classes, fetched_at = EXCLUDED.fetched_at`,
          [set.train, set.trainName, set.to, set.journeyDate, set.distanceKm, JSON.stringify(set.classes), receivedAt.toISOString()],
        );
      } catch (e: any) {
        console.warn("[fares] could not save the fares:", e?.message || e);
      }
    },
  };
}

// One store per database connection, so the "does the table exist" check is made once per server and not once per request.
const stores = new WeakMap<object, FareStore>();
export function fareStoreFor(ds: Queryable): FareStore {
  let st = stores.get(ds);
  if (!st) {
    st = typeormFareStore(ds);
    stores.set(ds, st);
  }
  return st;
}
