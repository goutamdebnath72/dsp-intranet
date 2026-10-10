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
//   6. Ranking BEFORE the population is decided: the outer WHERE holds both the rank cut (r <= 10) and another condition
//      (nonexec_count = 0). The rank was computed over ALL rows, so the top 10 of everyone is cut first and then thinned:
//      fewer than 10 rows come back. The condition that decides who competes belongs in HAVING/WHERE of the ranking query.
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

  // Rule 6: the rank cut and ANOTHER condition together in the outer WHERE (the other condition is applied after ranking).
  if (Array.isArray(st.from) && st.from.length === 1 && st.from[0].type === "statement" && st.where) {
    const inner: any = st.from[0].statement;
    const windowAliases: string[] = (Array.isArray(inner?.columns) ? inner.columns : [])
      .filter((c: any) => c.expr?.type === "call" && c.expr.over && c.alias?.name)
      .map((c: any) => String(c.alias.name).toLowerCase());
    const refs = new Set<string>();
    walk(st.where, (x) => {
      if (x.type === "ref" && typeof x.name === "string") refs.add(x.name.toLowerCase());
    });
    const usesRank = windowAliases.some((a) => refs.has(a));
    const others = [...refs].filter((n) => !windowAliases.includes(n));
    if (usesRank && others.length > 0) {
      return (
        `The outer WHERE cuts the ranking (${windowAliases.filter((a) => refs.has(a)).join(", ")}) and ALSO filters on ${others.join(", ")}. ` +
        "rank() was computed over ALL rows first, so the top N of everyone is taken and only then thinned: fewer than N rows come back. " +
        "Put the condition that decides WHICH rows compete in HAVING (or WHERE) of the query that computes rank() -- e.g. " +
        "HAVING count(*) FILTER (WHERE cohort = 'nonexecutive') = 0 -- and keep ONLY the rank filter (r <= N) in the outer WHERE."
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

/**
 * "Who is more senior, A or B?" answered with ORDER BY ... LIMIT 1 shows ONE person: nobody can see whether the other
 * was found, or either rank. The answer must show BOTH people with their global_seniority_rank (lower = more senior).
 * Judged only when the QUESTION is an explicit comparison ("more/less senior", "who is senior/junior", "senior/junior
 * between/among", "which of ... senior"), so "the most senior Roy or Ray" (a genuine LIMIT 1) is left alone.
 */
const COMPARISON_CUE =
  /\b(?:more|less)\s+(?:senior|junior)\b|\bwho\s+is\s+(?:senior|junior)\b|\b(?:senior|junior)\s+(?:between|among|out\s+of)\b|\bwhich\s+of\b[^?]*\b(?:senior|junior)\b/i;

export function checkComparison(question: string, sql: string): string | null {
  if (!COMPARISON_CUE.test(question || "")) return null;
  const st = topSelect(sql);
  if (!st) return null;
  const cols: any[] = Array.isArray(st.columns) ? st.columns : [];
  const isPeopleList = cols.some((c) => (c.alias?.name ?? refName(c.expr)) === "ticket_no");
  const limitIsOne = st.limit?.limit?.type === "integer" && Number(st.limit.limit.value) === 1;
  let hasOr = false;
  walk(st.where, (x) => {
    if (x.type === "binary" && String(x.op).toUpperCase() === "OR") hasOr = true;
  });
  if (!(isPeopleList && limitIsOne && hasOr)) return null;
  return (
    "A comparison of named people must show BOTH of them, not only the winner: remove LIMIT 1, SELECT global_seniority_rank " +
    "(it appears as a labelled chip), and ORDER BY global_seniority_rank (the first row is the more senior; lower rank = more senior). " +
    "Say in understood_as, in plain words, that they are listed most senior first (never mention column names). Match each person with nlq.word_like(name_words, name_codes, 'first') AND nlq.word_like(name_words, name_codes, 'last'). " +
    "If one of them does not exist the answer then visibly shows a single row instead of silently naming a winner."
  );
}

// ---------------------------------------------------------------------------------------------------
// The sentence that STATES the answer of a comparison, in plain words. Computed from the data by code, never by the model.
//   global_seniority_rank = grade level x 10,000 + position within that grade (lower = more senior). The number itself means
//   nothing to a reader, so the sentence speaks of grades and of position in the grade's seniority list instead.
//   Domain rule: among EXECUTIVES the order within a grade is real (earlier in HR's list = more senior). Among
//   NON-EXECUTIVES only the grade order is meaningful, so two non-executives of one grade are never ranked against each other.
// ---------------------------------------------------------------------------------------------------
const JUNIOR_CUE =
  /\b(?:more\s+junior|less\s+senior)\b|\bwho\s+is\s+junior\b|\bjunior\s+(?:between|among|out\s+of)\b|\bwhich\s+of\b[^?]*\bjunior\b/i;
const SENIOR_CUE =
  /\b(?:more\s+senior|less\s+junior)\b|\bwho\s+is\s+senior\b|\bsenior\s+(?:between|among|out\s+of)\b|\bwhich\s+of\b[^?]*\bsenior\b/i;

export interface PersonForVerdict {
  ticketNo?: string | null;
  designation?: string | null;
  isExecutive?: boolean | null;
}

export function comparisonVerdict(
  question: string,
  rows: Array<Record<string, unknown>>,
  people: PersonForVerdict[] = [],
): string | null {
  const q = question || "";
  if (!JUNIOR_CUE.test(q) && !SENIOR_CUE.test(q)) return null;
  if (!Array.isArray(rows) || rows.length !== 2) return null; // 1 or 3+ people: the ambiguity must stay visible
  const info = rows.map((r) => {
    const p = people.find((x) => String(x?.ticketNo ?? "").trim() === String(r?.ticket_no ?? "").trim());
    const rank = Number(r?.global_seniority_rank);
    return {
      name: typeof r?.name === "string" ? r.name.trim() : "",
      rank,
      level: Math.floor(rank / 10000),
      pos: rank % 10000,
      desig: (p?.designation ?? (typeof r?.designation === "string" ? r.designation : "") ?? "").toString().trim(),
      exec: typeof p?.isExecutive === "boolean" ? p.isExecutive : null,
    };
  });
  const [a, b] = info;
  if (!a.name || !b.name || !Number.isFinite(a.rank) || !Number.isFinite(b.rank) || a.rank === b.rank) return null;
  const withD = (x: { name: string; desig: string }) => (x.desig ? `${x.name} (${x.desig})` : x.name);
  const asksJunior = JUNIOR_CUE.test(q) && !SENIOR_CUE.test(q);

  if (a.level === b.level) {
    if (a.exec === null || b.exec === null) return null; // cannot tell executives from non-executives: say nothing rather than guess
    if (!a.exec && !b.exec) {
      const same = a.desig && a.desig === b.desig ? ` (${a.desig})` : "";
      return `${a.name} and ${b.name} are in the same grade${same}. Within a non-executive grade there is no individual seniority order, so neither is more senior.`;
    }
  }
  const [s, j] = a.rank < b.rank ? [a, b] : [b, a];
  const ord = (n: number) => {
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
    return `${n.toLocaleString("en-US")}${suffix}`;
  };
  const reason =
    a.level !== b.level
      ? asksJunior
        ? "a lower grade"
        : "a higher grade"
      : asksJunior
        ? `at the same grade level, listed later in HR's seniority list for that grade (${ord(j.pos)} against ${ord(s.pos)})`
        : `at the same grade level, listed earlier in HR's seniority list for that grade (${ord(s.pos)} against ${ord(j.pos)})`;
  return asksJunior
    ? `${withD(j)} is junior to ${withD(s)}: ${reason}.`
    : `${withD(s)} is more senior than ${withD(j)}: ${reason}.`;
}
