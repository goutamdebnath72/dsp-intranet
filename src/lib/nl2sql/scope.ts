// src/lib/nl2sql/scope.ts
//
// "Which departments did this answer actually cover?" -- computed by the SYSTEM from the SQL, not
// written by the model. The model's plain-English reading can drift from what its SQL does (it once
// described one department while the SQL matched a pattern that covered seven). So for every answer
// that filters by department through a sub-query on nlq.departments, the same sub-query is run on its
// own and the matched department names are shown next to the answer.
//
// The line appears for an answer that FILTERS by department, however the model worded that filter (a sub-query on
// nlq.departments, a JOIN with d.code IN (...), department_id / department_code / department conditions). An answer
// with no department filter shows no line, and neither does an EXCLUSION ("not in C&IT").
//
// Only departments that really hold people in the answer are listed. A department filter such as "C&IT
// (all its sections)" matches three department records, but executives usually sit under ONE of them and
// the granular sections hold the non-executives. So the filter's matches are narrowed to the departments
// where at least one person satisfying the answer's OWN conditions (cohort, designation, ...) works: an
// executive answer names only departments that have executives, a non-executive answer only those that
// have non-executives.
//
// Deliberately conservative: it only reports a scope it can compute exactly. A sub-query that cannot run
// on its own (e.g. it refers to a column of the outer query), and sub-queries under NOT / NOT IN (which
// EXCLUDE departments), never produce a scope; the answer is then shown without one.

import { parse, toSql } from "pgsql-ast-parser";
import type { DepartmentScope, SqlClient } from "./types";
import { runReadOnly } from "./executor";

/** Standalone `SELECT code, name FROM nlq.departments WHERE ...` for each department sub-query. */
export function departmentScopeQueries(sql: string): string[] {
  let root: any;
  try {
    root = (parse(sql) as any[])[0];
  } catch {
    return [];
  }
  const found: any[] = [];
  const walk = (n: any, negated: boolean) => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, negated));
    if (!n || typeof n !== "object") return;
    if (n !== root && n.type === "select" && !negated && n.where && n.from?.length === 1 && n.from[0].type === "table") {
      const nm = n.from[0].name;
      const schema = nm?.schema ? String(nm.schema).toLowerCase() : "nlq";
      if (schema === "nlq" && String(nm?.name).toLowerCase() === "departments") found.push(n);
    }
    const neg = negated || (n.type === "unary" && String(n.op).toUpperCase() === "NOT") || (n.type === "binary" && String(n.op).toUpperCase() === "NOT IN");
    for (const k of Object.keys(n)) if (k !== "_location") walk(n[k], neg);
  };
  walk(root, false);
  return found.map((sub) =>
    (toSql as any).statement({
      type: "select",
      columns: [{ expr: { type: "ref", name: "code" } }, { expr: { type: "ref", name: "name" } }],
      from: sub.from,
      where: sub.where,
      orderBy: [{ by: { type: "ref", name: "name" } }],
    }),
  );
}

/**
 * Standalone query: which departments hold at least one person who satisfies the answer's own WHERE
 * (cohort, designation, department filter ...), grouped by department record. JOINs are fine (the model often joins
 * nlq.departments just to read a department code): the FROM and WHERE are kept as written and only the person table
 * (nlq.employees, under whatever alias the answer gave it) supplies the department. Returns null when the answer's shape
 * does not allow that to be computed exactly (no person table or two of them, a sub-select in FROM, a set operation,
 * a CTE, HAVING ...).
 * ORDER BY / LIMIT / GROUP BY of the original are dropped: the question is "where do these people work", not "which ten".
 */
export function peopleFootprintQuery(sql: string): string | null {
  let root: any;
  try {
    root = (parse(sql) as any[])[0];
  } catch {
    return null;
  }
  if (!root || root.type !== "select" || root.having) return null;
  if (!Array.isArray(root.from) || root.from.length < 1) return null;
  if (!root.from.every((f: any) => f?.type === "table")) return null;
  const isEmployees = (f: any) =>
    String(f.name?.name).toLowerCase() === "employees" && (f.name?.schema ? String(f.name.schema).toLowerCase() === "nlq" : true);
  const people = root.from.filter(isEmployees);
  if (people.length !== 1) return null; // none, or a self-join: cannot say which row is "the person"
  const ref = people[0].name?.alias ? String(people[0].name.alias) : "employees";
  const tpl: any = (parse(
    "SELECT employees.department_code AS code, employees.department AS name, count(*) AS n FROM nlq.employees GROUP BY employees.department_code, employees.department",
  ) as any[])[0];
  // point the column references at the person table exactly as the answer's SQL names it
  const repoint = (n: any) => {
    if (n && n.type === "ref" && n.table) n.table.name = ref;
  };
  tpl.columns.forEach((c: any) => repoint(c.expr));
  tpl.groupBy.forEach(repoint);
  tpl.from = root.from;
  tpl.where = root.where;
  return (toSql as any).statement(tpl);
}

const DEPT_COLUMNS_ON_PEOPLE = new Set(["department_id", "department_code", "department"]);
const DEPT_COLUMNS_ON_DEPARTMENTS = new Set(["id", "code", "name", "cohort_scope"]);
const NEGATING_BINARY = new Set(["NOT IN", "NOT LIKE", "NOT ILIKE", "!=", "<>"]);

/**
 * Does the answer's SQL filter by department (in WHERE, or in a JOIN condition), and is any such condition an exclusion?
 * A department column compared with another column (the plain join condition e.department_id = d.id) is NOT a filter.
 * Returns null when the SQL cannot be read.
 */
export function departmentFilterInfo(sql: string): { has: boolean; negated: boolean } | null {
  let root: any;
  try {
    root = (parse(sql) as any[])[0];
  } catch {
    return null;
  }
  if (!root || root.type !== "select") return null;
  interface Ctx {
    aliases: Set<string>; // names under which nlq.departments appears in the FROM of the select being read
    unqualifiedDept: boolean; // that select reads ONLY nlq.departments, so a bare `code` / `name` is a department column
  }
  const ctxOf = (sel: any, outer: Ctx | null): Ctx => {
    const aliases = new Set<string>(outer ? Array.from(outer.aliases) : []);
    const from: any[] = Array.isArray(sel?.from) ? sel.from : [];
    for (const f of from) {
      if (f?.type === "table" && String(f.name?.name).toLowerCase() === "departments") {
        aliases.add(String(f.name?.alias ?? f.name?.name).toLowerCase());
      }
    }
    const onlyDepartments = from.length === 1 && from[0]?.type === "table" && String(from[0].name?.name).toLowerCase() === "departments";
    return { aliases, unqualifiedDept: onlyDepartments };
  };
  let has = false;
  let negated = false;
  const isDeptRef = (n: any, ctx: Ctx) => {
    if (n?.type !== "ref") return false;
    const col = String(n.name).toLowerCase();
    const tbl = n.table?.name ? String(n.table.name).toLowerCase() : null;
    if (tbl) return ctx.aliases.has(tbl) ? DEPT_COLUMNS_ON_DEPARTMENTS.has(col) : DEPT_COLUMNS_ON_PEOPLE.has(col);
    if (ctx.unqualifiedDept && DEPT_COLUMNS_ON_DEPARTMENTS.has(col)) return true;
    return DEPT_COLUMNS_ON_PEOPLE.has(col);
  };
  const walk = (n: any, neg: boolean, ctx: Ctx) => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, neg, ctx));
    if (!n || typeof n !== "object") return;
    if (n.type === "select" && n !== root) {
      // a nested select is read with ITS OWN tables
      const inner = ctxOf(n, ctx);
      walk(n.where, neg, inner);
      for (const f of Array.isArray(n.from) ? n.from : []) if (f?.join?.on) walk(f.join.on, neg, inner);
      return;
    }
    if (n.type === "binary") {
      const op = String(n.op).toUpperCase();
      if (op === "=" && n.left?.type === "ref" && n.right?.type === "ref") return; // a join condition, not a filter
      const childNeg = neg || NEGATING_BINARY.has(op);
      walk(n.left, childNeg, ctx);
      walk(n.right, childNeg, ctx);
      return;
    }
    if (n.type === "unary") {
      const op = String(n.op).toUpperCase();
      walk(n.operand, neg || op === "NOT" || op === "IS NULL" || op === "IS NOT NULL", ctx);
      return;
    }
    if (isDeptRef(n, ctx)) {
      has = true;
      if (neg) negated = true;
      return;
    }
    for (const k of Object.keys(n)) if (k !== "_location") walk(n[k], neg, ctx);
  };
  const rootCtx = ctxOf(root, null);
  walk(root.where, false, rootCtx);
  for (const f of Array.isArray(root.from) ? root.from : []) if (f?.join?.on) walk(f.join.on, false, rootCtx);
  return { has, negated };
}

/**
 * The departments that hold the people in this answer, for an answer that filters by department; null when the answer has
 * no department filter, excludes departments, or has a shape whose people cannot be located exactly.
 */
export async function computeDepartmentScope(client: SqlClient, sql: string): Promise<DepartmentScope | null> {
  const info = departmentFilterInfo(sql);
  if (!info || info.negated) return null;
  if (!info.has && departmentScopeQueries(sql).length === 0) return null;
  const footprint = peopleFootprintQuery(sql);
  if (!footprint) return null;
  let rows: any[];
  try {
    rows = (await runReadOnly(client, footprint, { rowLimit: 500, timeoutMs: 3000 })).rows;
  } catch {
    return null;
  }
  const seen = new Map<string, { code: number; name: string }>();
  for (const row of rows) {
    if (row.code === null || row.code === undefined || row.name === null || row.name === undefined) continue; // people with no department
    seen.set(`${row.code}|${row.name}`, { code: Number(row.code), name: String(row.name) });
  }
  const departments = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { departments, total: departments.length };
}
