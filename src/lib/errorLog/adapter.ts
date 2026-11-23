// src/lib/errorLog/adapter.ts
//
// I let the error log talk to PostgreSQL through one small function type (store.ts Query). TypeORM's own query() gives the rows of a SELECT or an INSERT ... RETURNING, but for an UPDATE or DELETE ... RETURNING it gives
// [rows, affectedCount]: this adapter turns both into plain rows.

import type { Query } from "./store";

export function rowsOf(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === "number") return raw[0] as Array<Record<string, unknown>>;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
}

export const fromDataSource = (ds: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Query => async (sql, params) => rowsOf(await ds.query(sql, params));
