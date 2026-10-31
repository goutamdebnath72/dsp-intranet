// src/lib/pax/store.ts
//
// READING THE PAX DIRECTORY (step 63a). The table `public.pax_directory` (sql/12) is deliberately NOT in the `nlq` schema and is closed to the public API roles (row level security on,
// everything revoked from `anon` and `authenticated`): only the application's OWN connection reads it. So this loader takes a plain query function and is given `getDb()`'s `query`
// (see omnibar.ts), NEVER the language model's read-only client (`deps.withClient`): the model must not be able to see this table, and with a dedicated NL2SQL_DATABASE_URL it could not read it anyway.
//
// The area (plant / outside plant / not classified) comes from the database function `public.pax_area(number)`, so the rule lives in ONE place. Its words are normalised here, so a change of wording
// there ("plant" / "in plant") cannot turn a plant number into an unclassified one.

import type { PaxArea, PaxRow } from "./matcher";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** The directory is a few dozen to a few thousand rows: it is read whole and matched in memory (spelling slips, abbreviations). */
export const PAX_ROW_LIMIT = 5000;

export function normalizeArea(v: unknown): PaxArea {
  const s = String(v ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(?:outside|outer|township)\b/.test(s)) return "outside";
  if (/^(?:in[ -]?)?plant\b/.test(s)) return "plant";
  return "unclassified";
}

export async function loadPaxRows(query: QueryFn): Promise<PaxRow[]> {
  const rows = await query(
    `SELECT label, dept_name, location, "number"::text AS number, note, public.pax_area("number") AS area
       FROM public.pax_directory
      ORDER BY label, "number"
      LIMIT ${PAX_ROW_LIMIT}`,
  );
  return rows
    .map((r) => ({
      label: String(r.label ?? "").trim(),
      deptName: String(r.dept_name ?? "").trim(),
      location: String(r.location ?? "").trim(),
      number: String(r.number ?? "").trim(),
      note: String(r.note ?? "").trim(),
      area: normalizeArea(r.area),
    }))
    .filter((r) => r.label && r.number);
}
