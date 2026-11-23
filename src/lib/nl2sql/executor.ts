// src/lib/nl2sql/executor.ts
//
// This is my FIRST line of defence: I run LLM-written SQL inside a READ ONLY transaction,
// as the nlq_reader role (which can SELECT only from three views), with a
// statement timeout, a row cap, and an unconditional ROLLBACK. Even if the SQL
// guard (guard.ts) had a hole, the database itself refuses writes and refuses
// any table outside the nlq views.

import type { QueryResultData, SqlClient } from "./types";
import { stripLiterals } from "./guard";
import { stableOrderSql } from "./paging";

export interface ExecOptions {
  rowLimit?: number;
  /** Rows to skip, used by "Show more": page N starts at N * rowLimit. */
  offset?: number;
  timeoutMs?: number;
  /**
   * Role to assume for the query. The default is "nlq_reader". Pass null only when
   *  the connection itself already logs in as a restricted role.
   */
  role?: string | null;
}

function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  return v;
}

export async function runReadOnly(client: SqlClient, sql: string, opts: ExecOptions = {}): Promise<QueryResultData> {
  // This check is independent of the guard: the SQL is spliced into a wrapper query below,
  // so I refuse here too any text that could close the wrapper early and start a second statement
  // (semicolon, comment).
  const bare = stripLiterals(sql);
  if (bare.includes(";") || bare.includes("--") || bare.includes("/*")) {
    throw new Error("Only a single statement without comments is allowed.");
  }

  const rowLimit = opts.rowLimit ?? 200;
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  // I want a total order, so that every page is cut from the same sequence (see paging.ts); when that is impossible I keep the SQL as written.
  const ordered = stableOrderSql(sql);
  const inner = ordered ?? sql;
  const timeoutMs = Math.max(100, Math.floor(opts.timeoutMs ?? 5000));
  const role = opts.role === undefined ? "nlq_reader" : opts.role;

  await client.query("BEGIN READ ONLY");
  try {
    // I do the whole setup in ONE round trip (it was five: the database is ~100 ms away, so four trips were ~0.4 s on every answer). set_config(name, value, true) is the transaction-local form of SET LOCAL and takes
    // the role like SET LOCAL ROLE does (proved identical on the real database: same role, search path, timeouts, read-only state, the same refusal on public tables, and all of it gone after the ROLLBACK).
    // I keep the order: the timeouts first, the role, then the search path. Every value is a bound parameter, and none is spliced into the text.
    const settings: Array<[string, string]> = [
      ["statement_timeout", String(timeoutMs)],
      ["lock_timeout", "1000"],
      ["idle_in_transaction_session_timeout", "15000"],
      ...(role ? ([["role", role]] as Array<[string, string]>) : []),
      ["search_path", "nlq, pg_catalog"],
    ];
    await client.query(`SELECT ${settings.map((_, i) => `set_config($${2 * i + 1}, $${2 * i + 2}, true)`).join(", ")}`, settings.flat());

    const res = await client.query(`SELECT * FROM (${inner}) AS nl2sql_q OFFSET ${offset} LIMIT ${rowLimit + 1}`);
    const truncated = res.rows.length > rowLimit;
    const rowsRaw = truncated ? res.rows.slice(0, rowLimit) : res.rows;

    let total = offset + rowsRaw.length;
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
    return { columns, rows, total, truncated, pageable: ordered !== null };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
  }
}
