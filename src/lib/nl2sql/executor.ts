// src/lib/nl2sql/executor.ts
//
// FIRST line of defence: run LLM-written SQL inside a READ ONLY transaction,
// as the nlq_reader role (which can SELECT only from three views), with a
// statement timeout, a row cap, and an unconditional ROLLBACK. Even if the SQL
// guard (guard.ts) had a hole, the database itself refuses writes and refuses
// any table outside the nlq views.

import type { QueryResultData, SqlClient } from "./types";
import { stripLiterals } from "./guard";

export interface ExecOptions {
  rowLimit?: number;
  timeoutMs?: number;
  /** Role to assume for the query. Default "nlq_reader". Pass null only when
   *  the connection itself already logs in as a restricted role. */
  role?: string | null;
}

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  return v;
}

export async function runReadOnly(client: SqlClient, sql: string, opts: ExecOptions = {}): Promise<QueryResultData> {
  // Independent of the guard: the SQL is spliced into a wrapper query below,
  // so text that could close the wrapper early and start a second statement
  // (semicolon, comment) is refused here too.
  const bare = stripLiterals(sql);
  if (bare.includes(";") || bare.includes("--") || bare.includes("/*")) {
    throw new Error("Only a single statement without comments is allowed.");
  }

  const rowLimit = opts.rowLimit ?? 200;
  const timeoutMs = Math.max(100, Math.floor(opts.timeoutMs ?? 5000));
  const role = opts.role === undefined ? "nlq_reader" : opts.role;

  await client.query("BEGIN READ ONLY");
  try {
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    await client.query("SET LOCAL lock_timeout = 1000");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = 15000");
    if (role) await client.query(`SET LOCAL ROLE ${quoteIdent(role)}`);
    await client.query("SET LOCAL search_path = nlq, pg_catalog");

    const res = await client.query(`SELECT * FROM (${sql}) AS nl2sql_q LIMIT ${rowLimit + 1}`);
    const truncated = res.rows.length > rowLimit;
    const rowsRaw = truncated ? res.rows.slice(0, rowLimit) : res.rows;

    let total = rowsRaw.length;
    if (truncated) {
      const c = await client.query(`SELECT count(*)::int AS n FROM (${sql}) AS nl2sql_c`);
      total = Number(c.rows[0]?.n ?? rowsRaw.length);
    }

    const columns = res.fields?.length ? res.fields.map((f) => f.name) : Object.keys(rowsRaw[0] ?? {});
    const rows = rowsRaw.map((r) => {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(r)) o[k] = jsonSafe(r[k]);
      return o;
    });
    return { columns, rows, total, truncated };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
  }
}
