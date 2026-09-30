// src/lib/nl2sql/db.ts
//
// Connection provider for the web route. Preferred: a DEDICATED restricted
// login (env NL2SQL_DATABASE_URL, see sql/03_*.sql) -- it can never leave the
// nlq_reader role. Fallback: the app's own TypeORM connection, switching to
// nlq_reader per query (SET LOCAL ROLE). Not used by the command-line tools,
// which open their own `pg` connection.

import type { SqlClient } from "./types";

let pool: any = null;

export function usesDedicatedConnection(): boolean {
  return !!process.env.NL2SQL_DATABASE_URL;
}

export async function withDefaultClient<T>(fn: (c: SqlClient) => Promise<T>): Promise<T> {
  const url = process.env.NL2SQL_DATABASE_URL;
  if (url) {
    if (!pool) {
      const { Pool } = await import("pg");
      pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
    }
    const client = await pool.connect();
    try {
      return await fn({ query: (t, p) => client.query(t, p) });
    } finally {
      client.release();
    }
  }
  const { getDb } = await import("@/lib/db");
  const ds = await getDb();
  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    return await fn({
      query: async (t: string, p?: any[]) => {
        const rows = await qr.query(t, p);
        return { rows: Array.isArray(rows) ? rows : [] };
      },
    });
  } finally {
    await qr.release();
  }
}
