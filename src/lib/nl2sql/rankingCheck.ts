// src/lib/nl2sql/rankingCheck.ts
//
// Three ways an otherwise-correct answer can quietly mislead, read from the model's SQL (not asked of a model):
//   1. LIMIT over GROUPS ("which department has the most ..." as ORDER BY count DESC LIMIT 1). If two departments
//      tie for first, one silently disappears. Ranking with rank() keeps every row tied for the place.
//   2. A grouped result with no ORDER BY: the rows come back in an arbitrary order.
//   3. A list of PEOPLE not in seniority order (global_seniority_rank): people in the same grade come back in
//      whatever order the database happens to use.
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
