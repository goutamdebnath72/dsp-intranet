// src/lib/live/fareLegStore.ts
//
// THE SAVED FARES TO EVERY STOP AFTER DURGAPUR (table public.train_fare_leg, src/lib/nl2sql/sql/22_train_fare_leg.sql). One row per train and stop, each with the time it was received. Same pattern as fareStore.ts:
// database trouble is logged once and the store then answers "nothing saved" (list) or does nothing (put); a row that is not the shape written is not shown.
import { DateTime } from "luxon";
import type { ClassFare, LegFare } from "./fare";

export interface LegRow {
  leg: LegFare;
  /** when the leg's fares were received (ISO, UTC) */
  receivedAt: string;
}

/** a station that has saved fares to it, and how many trains go there */
export interface StopInfo { code: string; name: string; trains: number }
/** one train's saved fare to a station, with the train's name */
export interface StopTrainRow { number: string; trainName: string; leg: LegFare; receivedAt: string }
/** how much has been collected: trains that have fares to their end station, and trains that have fares to their stops */
export interface Coverage { withFares: number; withLegs: number }

export interface LegStore {
  /** every saved stop of a train, in route order */
  list(number: string): Promise<LegRow[]>;
  put(number: string, leg: LegFare, receivedAt: Date): Promise<void>;
  /** every station that has a saved fare to it (for the search), with its name and the number of trains */
  stops(): Promise<StopInfo[]>;
  /** every train's saved fare to one station */
  toStop(code: string): Promise<StopTrainRow[]>;
  coverage(): Promise<Coverage>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const LEG_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.train_fare_leg (
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
  `ALTER TABLE public.train_fare_leg ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.train_fare_leg FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);

export function legFromRow(x: any): LegRow | null {
  try {
    const classes = (typeof x.classes === "string" ? JSON.parse(x.classes) : x.classes) as ClassFare[];
    const at = x.fetched_at instanceof Date ? DateTime.fromJSDate(x.fetched_at) : DateTime.fromISO(String(x.fetched_at));
    const distanceKm = Number(x.distance_km), seq = Number(x.seq);
    if (!Array.isArray(classes) || classes.length === 0 || !at.isValid || !Number.isFinite(distanceKm) || !Number.isInteger(seq)) return null;
    for (const c of classes) if (typeof c?.code !== "string" || typeof c?.name !== "string" || typeof c?.total !== "number" || !Array.isArray(c?.parts)) return null;
    if (!/^[A-Z0-9]{1,8}$/.test(String(x.to_code)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.journey_date))) return null;
    return { receivedAt: at.toUTC().toISO() ?? "", leg: { to: String(x.to_code), name: String(x.to_name), seq, distanceKm, journeyDate: String(x.journey_date), classes } };
  } catch {
    return null;
  }
}

export function typeormLegStore(ds: Queryable): LegStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;

  const ensure = (): Promise<boolean> => {
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.train_fare_leg') AS t`));
        if (have[0]?.t) return true;
        for (const sql of LEG_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) {
          warned = true;
          console.warn("[fares] the leg store is not available (run src/lib/nl2sql/sql/22_train_fare_leg.sql):", e?.message || e);
        }
        return false;
      }
    })();
    return ready;
  };

  return {
    async list(number) {
      if (!(await ensure())) return [];
      try {
        const r = rowsOf(await ds.query(`SELECT to_code, to_name, seq, distance_km, to_char(journey_date, 'YYYY-MM-DD') AS journey_date, classes, fetched_at FROM public.train_fare_leg WHERE train_number = $1 ORDER BY seq`, [number]));
        return r.flatMap((x) => { const l = legFromRow(x); return l ? [l] : []; });
      } catch (e: any) {
        console.warn("[fares] could not read the saved legs:", e?.message || e);
        return [];
      }
    },
    async stops() {
      if (!(await ensure())) return [];
      try {
        const r = rowsOf(await ds.query(`SELECT to_code, max(to_name) AS to_name, count(*)::int AS trains FROM public.train_fare_leg GROUP BY to_code ORDER BY max(to_name)`));
        return r.flatMap((x) => (typeof x.to_code === "string" && /^[A-Z0-9]{1,8}$/.test(x.to_code) && typeof x.to_name === "string" ? [{ code: x.to_code, name: x.to_name, trains: Number(x.trains) || 0 }] : []));
      } catch (e: any) {
        console.warn("[fares] could not read the stops:", e?.message || e);
        return [];
      }
    },
    async toStop(code) {
      if (!(await ensure())) return [];
      try {
        const r = rowsOf(await ds.query(
          `SELECT l.train_number, f.train_name, l.to_code, l.to_name, l.seq, l.distance_km, to_char(l.journey_date, 'YYYY-MM-DD') AS journey_date, l.classes, l.fetched_at
             FROM public.train_fare_leg l LEFT JOIN public.train_fare f ON f.train_number = l.train_number
            WHERE l.to_code = $1 ORDER BY l.train_number`, [code]));
        return r.flatMap((x) => { const l = legFromRow(x); return l && /^\d{5}$/.test(String(x.train_number)) ? [{ number: String(x.train_number), trainName: typeof x.train_name === "string" ? x.train_name : "", leg: l.leg, receivedAt: l.receivedAt }] : []; });
      } catch (e: any) {
        console.warn("[fares] could not read the fares to a stop:", e?.message || e);
        return [];
      }
    },
    async coverage() {
      if (!(await ensure())) return { withFares: 0, withLegs: 0 };
      try {
        const r = rowsOf(await ds.query(`SELECT (SELECT count(*) FROM public.train_fare WHERE jsonb_array_length(classes) > 0)::int AS with_fares, (SELECT count(DISTINCT train_number) FROM public.train_fare_leg)::int AS with_legs`))[0];
        return { withFares: Number(r?.with_fares) || 0, withLegs: Number(r?.with_legs) || 0 };
      } catch {
        return { withFares: 0, withLegs: 0 };
      }
    },
    async put(number, leg, receivedAt) {
      if (!(await ensure())) return;
      try {
        await ds.query(
          `INSERT INTO public.train_fare_leg (train_number, to_code, to_name, seq, distance_km, journey_date, classes, fetched_at)
                VALUES ($1, $2, $3, $4, $5, $6::date, $7::jsonb, $8)
           ON CONFLICT (train_number, to_code) DO UPDATE
                 SET to_name = EXCLUDED.to_name, seq = EXCLUDED.seq, distance_km = EXCLUDED.distance_km, journey_date = EXCLUDED.journey_date,
                     classes = EXCLUDED.classes, fetched_at = EXCLUDED.fetched_at`,
          [number, leg.to, leg.name, leg.seq, leg.distanceKm, leg.journeyDate, JSON.stringify(leg.classes), receivedAt.toISOString()],
        );
      } catch (e: any) {
        console.warn("[fares] could not save a leg:", e?.message || e);
      }
    },
  };
}

const stores = new WeakMap<object, LegStore>();
export function legStoreFor(ds: Queryable): LegStore {
  let st = stores.get(ds);
  if (!st) {
    st = typeormLegStore(ds);
    stores.set(ds, st);
  }
  return st;
}
