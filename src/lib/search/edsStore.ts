// src/lib/search/edsStore.ts
//
// THE PERMANENT STORE OF EXECUTIVE BRIEFINGS (table public.eds_briefing, src/lib/nl2sql/sql/20_eds_briefing.sql).
//
// Why it exists: a model gives a different briefing at every call, and a server's own memory is no help on Vercel (every instance and every
// cold start has its own, empty one). So the first GOOD briefing of a question is written to the database, and every later ask of the same
// question, on any server, reads that one. It stays valid until the archive of circulars changes (`fingerprint()`), or the prompt / rules of
// the engine change (the key carries a signature of both).
//
// Two servers generating the same question at the same moment cannot both win: the insert keeps the FIRST row (ON CONFLICT DO NOTHING) and
// both servers show the row that stands.
//
// Nothing here may break an answer: any database trouble is logged once and the engine carries on without the store.

import type { SynthesisResult } from "./executiveSynthesis";

export interface EdsRow {
  key: string;
  fingerprint: string;
  result: SynthesisResult;
  score: number;
}

export interface EdsStore {
  /** a short text that changes whenever a circular is added, removed, renamed or re-read */
  fingerprint(): Promise<string>;
  get(key: string): Promise<EdsRow | null>;
  /** stores the briefing unless a current one already stands; returns the row that stands afterwards */
  put(row: EdsRow & { query: string; engine: string }): Promise<EdsRow>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const EDS_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.eds_briefing (
     key          text        PRIMARY KEY,
     query_text   text        NOT NULL,
     fingerprint  text        NOT NULL,
     engine       text        NOT NULL,
     score        integer     NOT NULL CHECK (score BETWEEN 0 AND 100),
     result       jsonb       NOT NULL,
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE public.eds_briefing ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.eds_briefing FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);

export function typeormEdsStore(ds: Queryable): EdsStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;

  const ensure = (): Promise<boolean> => {
    // a good (or still pending) check stands; a failed one is not repeated for 10 minutes
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.eds_briefing') AS t`));
        if (have[0]?.t) return true;
        for (const sql of EDS_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) {
          warned = true;
          console.warn("[EDS] the briefing store is not available (run src/lib/nl2sql/sql/20_eds_briefing.sql):", e?.message || e);
        }
        return false;
      }
    })();
    return ready;
  };

  const fromRow = (x: any): EdsRow => ({
    key: String(x.key),
    fingerprint: String(x.fingerprint),
    score: Number(x.score),
    result: (typeof x.result === "string" ? JSON.parse(x.result) : x.result) as SynthesisResult,
  });

  return {
    async fingerprint() {
      const a = rowsOf(
        await ds.query(
          `SELECT count(*)::int AS n, coalesce(max(id), 0)::int AS mx,
                  md5(coalesce(string_agg(id::text || ':' || coalesce(headline, ''), '|' ORDER BY id), '')) AS h
             FROM public.circulars`,
        ),
      )[0];
      const b = rowsOf(await ds.query(`SELECT count(*)::int AS n, coalesce(max(id), 0)::int AS mx FROM public.circular_chunks`))[0];
      return `${a.n}.${a.mx}.${a.h}.${b.n}.${b.mx}`;
    },

    async get(key) {
      if (!(await ensure())) return null;
      const r = rowsOf(await ds.query(`SELECT key, fingerprint, score, result FROM public.eds_briefing WHERE key = $1`, [key]));
      return r[0] ? fromRow(r[0]) : null;
    },

    async put(row) {
      if (!(await ensure())) return row;
      // A row for an OLDER archive is replaced; a row for the CURRENT archive is never overwritten (the first good briefing stands).
      await ds.query(
        `INSERT INTO public.eds_briefing (key, query_text, fingerprint, engine, score, result)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (key) DO UPDATE
               SET query_text = EXCLUDED.query_text, fingerprint = EXCLUDED.fingerprint, engine = EXCLUDED.engine,
                   score = EXCLUDED.score, result = EXCLUDED.result, created_at = now()
             WHERE public.eds_briefing.fingerprint <> EXCLUDED.fingerprint`,
        [row.key, row.query.slice(0, 2000), row.fingerprint, row.engine, Math.round(row.score), JSON.stringify(row.result)],
      );
      // Tidy: a row made by ANOTHER engine version (an older prompt or rules) can never be served again (its key carries the engine signature), so it is
      // removed as soon as a current one is stored. The table never fills with dead rows.
      await ds.query(`DELETE FROM public.eds_briefing WHERE engine <> $1`, [row.engine]).catch(() => undefined);
      const r = rowsOf(await ds.query(`SELECT key, fingerprint, score, result FROM public.eds_briefing WHERE key = $1`, [row.key]));
      return r[0] ? fromRow(r[0]) : row;
    },
  };
}

// One store per database connection, so the "does the table exist" check is made once per server and not once per request.
const stores = new WeakMap<object, EdsStore>();
export function edsStoreFor(ds: Queryable): EdsStore {
  let st = stores.get(ds);
  if (!st) {
    st = typeormEdsStore(ds);
    stores.set(ds, st);
  }
  return st;
}
