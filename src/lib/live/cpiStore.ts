// src/lib/live/cpiStore.ts
//
// THE SAVED CONSUMER PRICE INDEX (table public.cpi_month, src/lib/nl2sql/sql/23_cpi_month.sql): MoSPI's index and inflation rate for each month, State and sector, with the time received. The card is built from these rows, and MoSPI is
// asked only for a month that is not saved yet, so the card keeps working when MoSPI's service is down, and a month once published stays.
// Nothing here may break a card: database trouble is logged once and the store then answers "nothing saved" (all) or does nothing (put), like src/lib/live/fareStore.ts, whose pattern this follows.
import type { CpiRow, Sector } from "./cpi";

export interface CpiStore {
  all(): Promise<CpiRow[]>;
  put(rows: CpiRow[], receivedAt: Date): Promise<void>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const CPI_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.cpi_month (
     base_year  text        NOT NULL,
     month      text        NOT NULL,
     state      text        NOT NULL,
     sector     text        NOT NULL,
     idx        numeric     NOT NULL,
     inflation  numeric,
     fetched_at timestamptz NOT NULL,
     PRIMARY KEY (base_year, month, state, sector)
   )`,
  `ALTER TABLE public.cpi_month ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.cpi_month FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);

/** a saved row read back and CHECKED: a row that is not the shape written is dropped, never shown */
export function cpiFromRow(x: any): CpiRow | null {
  const base = String(x?.base_year), sector = String(x?.sector), index = Number(x?.idx);
  const inflation = x?.inflation === null || x?.inflation === undefined ? null : Number(x.inflation);
  if ((base !== "2012" && base !== "2024") || !/^\d{4}-\d{2}$/.test(String(x?.month)) || typeof x?.state !== "string" || !x.state) return null;
  if (!["Combined", "Urban", "Rural"].includes(sector) || !Number.isFinite(index) || (inflation !== null && !Number.isFinite(inflation))) return null;
  return { base, month: String(x.month), state: x.state, sector: sector as Sector, index, inflation };
}

export function typeormCpiStore(ds: Queryable): CpiStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;

  const ensure = (): Promise<boolean> => {
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.cpi_month') AS t`));
        if (have[0]?.t) return true;
        for (const sql of CPI_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) {
          warned = true;
          console.warn("[cpi] the CPI store is not available (run src/lib/nl2sql/sql/23_cpi_month.sql):", e?.message || e);
        }
        return false;
      }
    })();
    return ready;
  };

  return {
    async all() {
      if (!(await ensure())) return [];
      try {
        return rowsOf(await ds.query(`SELECT base_year, month, state, sector, idx, inflation FROM public.cpi_month`)).map(cpiFromRow).filter((r): r is CpiRow => r !== null);
      } catch (e: any) {
        console.warn("[cpi] could not read the saved index:", e?.message || e);
        return [];
      }
    },
    async put(rows, receivedAt) {
      if (!rows.length || !(await ensure())) return;
      try {
        // in batches of 400 rows, each one statement (the rows travel as arrays)
        for (let i = 0; i < rows.length; i += 400) {
          const b = rows.slice(i, i + 400);
          await ds.query(
            `INSERT INTO public.cpi_month (base_year, month, state, sector, idx, inflation, fetched_at)
                  SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::timestamptz[])
             ON CONFLICT (base_year, month, state, sector) DO UPDATE
                    SET idx = EXCLUDED.idx, inflation = EXCLUDED.inflation, fetched_at = EXCLUDED.fetched_at`,
            [b.map((r) => r.base), b.map((r) => r.month), b.map((r) => r.state), b.map((r) => r.sector), b.map((r) => r.index), b.map((r) => r.inflation), b.map(() => receivedAt.toISOString())],
          );
        }
      } catch (e: any) {
        console.warn("[cpi] could not save the index:", e?.message || e);
      }
    },
  };
}

const stores = new WeakMap<object, CpiStore>();
export function cpiStoreFor(ds: Queryable): CpiStore {
  let st = stores.get(ds);
  if (!st) {
    st = typeormCpiStore(ds);
    stores.set(ds, st);
  }
  return st;
}
