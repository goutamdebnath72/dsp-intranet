// src/lib/live/snapshotStore.ts
//
// The saved last good answer of a live card (table public.live_snapshot, src/lib/nl2sql/sql/25_live_snapshot.sql): one row for each card that asks for it, holding the whole answer as it was last had from its source and the time it was
// received. When the source does not answer AND the server's memory is empty (a restart, a new instance, a night of silence), I show this on the card, marked stale with its own time, instead of an error.
// A card opts in (liveRoute's `persist`); today the gold card does. Nothing here may break a card: database trouble is logged once and the store then answers "nothing saved" (get) or does nothing (put), like marketStore.ts,
// whose pattern I follow. Nothing in it is personal data.
import { DateTime } from "luxon";

export interface SavedSnapshot {
  value: unknown;
  /** When it was received from the source (ms since the epoch). */
  at: number;
}
export interface SnapshotStore {
  get(key: string): Promise<SavedSnapshot | null>;
  put(key: string, value: unknown, receivedAt: number): Promise<void>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const SNAPSHOT_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.live_snapshot (
     key        text        PRIMARY KEY,
     payload    jsonb       NOT NULL,
     fetched_at timestamptz NOT NULL
   )`,
  `ALTER TABLE public.live_snapshot ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.live_snapshot FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);

/** Reads a saved row back: its payload, parsed if it came as text, and its time; returns null when it is not the shape written. */
export function snapshotFromRow(x: any): SavedSnapshot | null {
  const value = typeof x?.payload === "string" ? safeJson(x.payload) : x?.payload;
  const at = x?.fetched_at instanceof Date ? x.fetched_at.getTime() : DateTime.fromISO(String(x?.fetched_at)).toMillis();
  if (value === null || value === undefined || typeof value !== "object" || !Number.isFinite(at)) return null;
  return { value, at };
}
function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export function typeormSnapshotStore(ds: Queryable): SnapshotStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;
  const ensure = (): Promise<boolean> => {
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.live_snapshot') AS t`));
        if (have[0]?.t) return true;
        for (const sql of SNAPSHOT_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) { warned = true; console.warn("[live] the snapshot store is not available (run src/lib/nl2sql/sql/25_live_snapshot.sql):", e?.message || e); }
        return false;
      }
    })();
    return ready;
  };
  return {
    async get(key) {
      if (!(await ensure())) return null;
      try {
        const r = rowsOf(await ds.query(`SELECT payload, fetched_at FROM public.live_snapshot WHERE key = $1`, [key]));
        return r.length ? snapshotFromRow(r[0]) : null;
      } catch (e: any) {
        console.warn("[live] could not read the saved snapshot:", e?.message || e);
        return null;
      }
    },
    async put(key, value, receivedAt) {
      if (!(await ensure())) return;
      try {
        await ds.query(
          `INSERT INTO public.live_snapshot (key, payload, fetched_at) VALUES ($1, $2::jsonb, $3::timestamptz)
           ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at`,
          [key, JSON.stringify(value), DateTime.fromMillis(receivedAt).toUTC().toISO()],
        );
      } catch (e: any) {
        console.warn("[live] could not save the snapshot:", e?.message || e);
      }
    },
  };
}

/** A store that holds nothing, for when the database cannot be had at all: the card then works as it did before. */
export const NO_SNAPSHOT_STORE: SnapshotStore = { get: async () => null, put: async () => undefined };

const stores = new WeakMap<object, SnapshotStore>();
export function snapshotStoreFor(ds: Queryable): SnapshotStore {
  let st = stores.get(ds);
  if (!st) { st = typeormSnapshotStore(ds); stores.set(ds, st); }
  return st;
}
