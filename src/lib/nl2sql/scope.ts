// src/lib/nl2sql/scope.ts
//
// "Which departments did this answer actually cover?" -- computed by the SYSTEM from the SQL, not
// written by the model. The model's plain-English reading can drift from what its SQL does (it once
// described one department while the SQL matched a pattern that covered seven). So for every answer
// that filters by department through a sub-query on nlq.departments, the same sub-query is run on its
// own and the matched department names are shown next to the answer.
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

/** The departments the answer's department filter(s) match, or null when that can't be known exactly. */
export async function computeDepartmentScope(client: SqlClient, sql: string): Promise<DepartmentScope | null> {
  const queries = departmentScopeQueries(sql);
  if (!queries.length) return null;
  const seen = new Map<string, { code: number; name: string }>();
  for (const q of queries) {
    try {
      const r = await runReadOnly(client, q, { rowLimit: 60, timeoutMs: 3000 });
      for (const row of r.rows) seen.set(`${row.code}|${row.name}`, { code: Number(row.code), name: String(row.name) });
    } catch {
      return null; // e.g. the sub-query refers to the outer query; claim nothing
    }
  }
  const departments = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { departments, total: departments.length };
}
