// src/lib/facility/rollbackDb.ts
//
// A FacilityDb for LIVE tests: every `run` is a SAVEPOINT inside ONE outer transaction that is always rolled back,
// so a test can drive the REAL store code (publish -> modify -> delete, audit rows, locks) against the REAL schema
// and persist nothing. Reason: the first Gemini-built tools were tested only with a fake database
// (`fn(async () => [])`), which cannot see a wrong table name or `FOR UPDATE` on a LEFT JOIN: both made the
// announcement edit and delete fail on every call.
//
// Advisory transaction locks (pg_advisory_xact_lock) are held until the outer transaction ends: harmless here.

import type { FacilityDb, QueryFn } from "./types";

interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export function rollbackDb(client: PgLike): { db: FacilityDb; q: QueryFn; start: () => Promise<void>; finish: () => Promise<void> } {
  let n = 0;
  const q: QueryFn = async (sql, params) => (await client.query(sql, params as unknown[])).rows;
  const db: FacilityDb = {
    run: async <T>(fn: (q: QueryFn) => Promise<T>): Promise<T> => {
      const sp = `sp_${++n}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        const out = await fn(q);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        return out;
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        throw e;
      }
    },
  };
  return {
    db,
    q,
    start: async () => void (await client.query("BEGIN")),
    finish: async () => void (await client.query("ROLLBACK")),
  };
}
