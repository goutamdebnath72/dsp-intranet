// src/lib/nl2sql/rankingCheck.ts
//
// Three ways an otherwise-correct answer can quietly mislead, read from the model's SQL (not asked of a model):
//   1. LIMIT over GROUPS ("which department has the most ..." as ORDER BY count DESC LIMIT 1). If two departments
//      tie for first, one silently disappears. Ranking with rank() keeps every row tied for the place.
//   2. A grouped result with no ORDER BY: the rows come back in an arbitrary order.
//   3. A list of PEOPLE not in seniority order (global_seniority_rank): people in the same grade come back in
//      whatever order the database happens to use.
//   4. A window function in the OUTER query next to a filter on a window result from the sub-query
//      (rank() ... WHERE r = 1 together with  sum(cnt) OVER () ). The outer window runs AFTER the filter, so the
//      "total" is only the winners' own count and a percentage of the total comes out as 100.
//   5. A list of names inside one cell (array_agg / string_agg) with no ORDER BY: the names come in arbitrary order.
// The pipeline gives the model ONE chance to fix it (first attempt only) and never fails a question over it.

import { parse } from "pgsql-ast-parser";

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
const hasRef = (expr: any, name: string): boolean => {
  let found = false;
  walk(expr, (x) => {
    if (x.type === "ref" && typeof x.name === "string" && x.name.toLowerCase() === name) found = true;
  });
  return found;
};
const hasWindowCall = (expr: any): boolean => {
  let found = false;
  walk(expr, (x) => {
    if (x.type === "call" && x.over) found = true;
  });
  return found;
};

/** The column name an ORDER BY key refers to (qualified or not), or null for any other kind of expression. */
function refName(e: any): string | null {
  return e && e.type === "ref" && typeof e.name === "string" ? e.name.toLowerCase() : null;
}

export function checkRankingAndOrder(sql: string): string | null {
  const st = topSelect(sql);
  if (!st) return null;
  const grouped = Array.isArray(st.groupBy) && st.groupBy.length > 0;
  const hasLimit = !!st.limit?.limit;
  const hasOrder = Array.isArray(st.orderBy) && st.orderBy.length > 0;

  if (grouped && hasLimit) {
    return (
      "A LIMIT over groups can silently cut a tie (two departments or designations with the same count: one disappears). " +
      "For 'which has the most / least' keep EVERY row tied for the place: put the grouped query in a sub-query that also computes " +
      "rank() OVER (ORDER BY count(*) DESC) AS r, then SELECT ... WHERE r = 1 (or r <= N for 'top N'; a tie at the boundary is then kept -- say so in understood_as)."
    );
  }
  if (grouped && !hasOrder) {
    return (
      "A grouped result needs an ORDER BY so the rows come in a stable, meaningful order: counts -> ORDER BY count DESC, then the group's code or name; " +
      "designations -> ORDER BY rank_order."
    );
  }

  // Rule 4: ranking in a sub-query, then a window total in the OUTER query (a share of the total becomes 100%).
  if (Array.isArray(st.from) && st.from.length === 1 && st.from[0].type === "statement" && st.where) {
    const inner: any = st.from[0].statement;
    const windowAliases: string[] = (Array.isArray(inner?.columns) ? inner.columns : [])
      .filter((c: any) => c.expr?.type === "call" && c.expr.over && c.alias?.name)
      .map((c: any) => String(c.alias.name).toLowerCase());
    if (windowAliases.some((a) => hasRef(st.where, a)) && hasWindowCall(st.columns)) {
      return (
        "A window function in the OUTER query (such as sum(cnt) OVER ()) runs AFTER the WHERE that keeps only the ranked rows, so it only sees the winners: " +
        "a percentage of the total comes out as 100. Compute the total INSIDE the ranked sub-query, next to rank(): " +
        "sum(count(*)) OVER () AS total, rank() OVER (ORDER BY count(*) DESC) AS r -- then select cnt * 100.0 / total in the outer query."
      );
    }
  }

  // Rule 5: names collected into one cell must be in seniority order.
  let unorderedList = false;
  walk(st, (x) => {
    if (x.type === "call" && ["array_agg", "string_agg"].includes(String(x.function?.name).toLowerCase()) && !x.over && !(Array.isArray(x.orderBy) && x.orderBy.length > 0)) unorderedList = true;
  });
  if (unorderedList) {
    return "Names collected into one cell must be in seniority order: array_agg(name ORDER BY global_seniority_rank) (or string_agg(name, ', ' ORDER BY global_seniority_rank)).";
  }

  // A list of people: judged only when the columns can be resolved (no sub-query in FROM).
  const cols: any[] = Array.isArray(st.columns) ? st.columns : [];
  const isPeopleList =
    !grouped &&
    cols.some((c) => (c.alias?.name ?? refName(c.expr)) === "ticket_no") &&
    Array.isArray(st.from) &&
    st.from.length > 0 &&
    st.from.every((f: any) => f.type === "table");
  if (isPeopleList) {
    // aliases of the SELECT list that really are global_seniority_rank (e.g.  e.global_seniority_rank AS sr)
    const rankAliases = new Set(
      cols.filter((c) => refName(c.expr) === "global_seniority_rank" && c.alias?.name).map((c) => String(c.alias.name).toLowerCase()),
    );
    const orderKeys: any[] = hasOrder ? st.orderBy : [];
    const bySeniority = orderKeys.some((o) => {
      const n = refName(o.by);
      return n === "global_seniority_rank" || (n !== null && rankAliases.has(n));
    });
    if (!bySeniority) {
      return "A list of people must come in seniority order: ORDER BY global_seniority_rank (other keys such as department may come first, but global_seniority_rank must be among them).";
    }
  }
  return null;
}
