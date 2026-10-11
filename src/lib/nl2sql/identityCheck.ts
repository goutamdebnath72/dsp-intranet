// src/lib/nl2sql/identityCheck.ts
//
// An answer about SPECIFIC people must say WHO each row is about. "Which department is ticket 228757 in" was answered with just
//     Dept Code | Department     12000 | CO & CC (BATTERY)
// -- a department with no person: the reader can not tell whose it is, and a name is what a ticket number is read against.
// A lookup of specific people (a ticket number, or a name typed in the question) must show ticket_no AND name, as the first columns.
//
// Read from the model's SQL (not asked of a model). Counts and breakdowns (an aggregate or a GROUP BY) are not about "a row per
// person" and are left alone. The pipeline gives the model ONE chance to fix it (first attempt only); the answer is never refused over it.

import { parse } from "pgsql-ast-parser";

const AGGREGATES = new Set(["count", "sum", "avg", "min", "max", "array_agg", "string_agg", "bool_and", "bool_or"]);
const NAME_HELPERS = new Set(["word_like", "first_word_like", "last_word_like"]);
const NAME_COLUMNS = new Set(["name", "name_words", "name_codes"]);

function topSelect(sql: string): any | null {
  let stmts;
  try {
    stmts = parse(sql);
  } catch {
    return null;
  }
  if (stmts.length !== 1) return null;
  let st: any = stmts[0];
  for (let i = 0; i < 8; i++) {
    if (st.type === "with") st = st.in;
    else if (st.type === "union" || st.type === "union all") st = st.left;
    else break;
  }
  return st && st.type === "select" ? st : null;
}

function walk(n: any, f: (x: any) => void): void {
  if (n && typeof n === "object") {
    f(n);
    for (const k of Object.keys(n)) walk(n[k], f);
  }
}

const refName = (e: any): string | null => (e && e.type === "ref" && typeof e.name === "string" ? e.name.toLowerCase() : null);

/** Does this WHERE pick out specific people: ticket_no compared with something, or a name condition? */
function pinsSpecificPeople(where: any): boolean {
  let pinned = false;
  walk(where, (x) => {
    if (x.type === "binary" && (refName(x.left) === "ticket_no" || refName(x.right) === "ticket_no")) pinned = true;
    if (x.type === "call" && NAME_HELPERS.has(String(x.function?.name ?? "").toLowerCase())) pinned = true;
    const r = refName(x);
    if (r && NAME_COLUMNS.has(r)) pinned = true;
  });
  return pinned;
}

export function checkPersonIdentity(sql: string): string | null {
  const top = topSelect(sql);
  if (!top || !Array.isArray(top.columns)) return null;

  // counts, totals and breakdowns: not a row per person
  if (Array.isArray(top.groupBy) && top.groupBy.length > 0) return null;
  let aggregate = false;
  let wildcard = false;
  const shown = new Set<string>();
  for (const c of top.columns) {
    walk(c.expr, (x) => {
      if (x.type === "call" && AGGREGATES.has(String(x.function?.name ?? "").toLowerCase())) aggregate = true;
    });
    const r = refName(c.expr);
    if (r === "*") wildcard = true;
    else if (r) shown.add(r);
  }
  if (aggregate || wildcard) return null;

  let pinned = false;
  walk(top, (x) => {
    if (x.where && pinsSpecificPeople(x.where)) pinned = true;
  });
  if (!pinned) return null;

  if (shown.has("ticket_no") && shown.has("name")) return null;
  const missing = [!shown.has("ticket_no") ? "ticket_no" : null, !shown.has("name") ? "name" : null].filter(Boolean).join(" and ");
  return `The question is about specific people (a ticket number or a name), but the answer does not say WHO each row is about: ${missing} ${missing.includes(" and ") ? "are" : "is"} missing from the SELECT list. Start the SELECT list with ticket_no and name (e.g. e.ticket_no, e.name), then the facts that were asked (for example department_code and department). A row about a person always carries that person's ticket number and name.`;
}

/**
 * A question about a health check-up is about WHEN: a schedule row without its date is half an answer (and the person asked for the date).
 * Judged on the SQL: a list of rows from nlq.health_checkups must SELECT checkup_date. Counts and breakdowns are left alone.
 */
export function checkHealthColumns(sql: string): string | null {
  const top = topSelect(sql);
  if (!top || !Array.isArray(top.columns) || !Array.isArray(top.from)) return null;
  const fromSchedule = top.from.some((f: any) => f.type === "table" && String(f.name?.name ?? "").toLowerCase() === "health_checkups");
  if (!fromSchedule) return null;
  if (Array.isArray(top.groupBy) && top.groupBy.length > 0) return null;
  let aggregate = false;
  let wildcard = false;
  const shown = new Set<string>();
  for (const c of top.columns) {
    walk(c.expr, (x) => {
      if (x.type === "call" && AGGREGATES.has(String(x.function?.name ?? "").toLowerCase())) aggregate = true;
    });
    const r = refName(c.expr);
    if (r === "*") wildcard = true;
    else if (r) shown.add(r);
  }
  if (aggregate || wildcard || shown.has("checkup_date")) return null;
  return "A question about a health check-up is about WHEN, but the answer does not show the date. Include checkup_date (and circular) in the SELECT list, e.g. SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ...";
}
