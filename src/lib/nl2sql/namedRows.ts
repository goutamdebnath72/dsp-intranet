// src/lib/nl2sql/namedRows.ts
//
// Step 49b. A question that names departments BY NAME AND CODE -- "REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600)", which is exactly what the "Which department do
// you mean?" boxes (step 49a, departmentAsk.ts) write -- has ALREADY been decided by the person: those rows, no more and no fewer.
//
// Live, 25 Oct 2026 00:57: for that very question the screen showed  department_id IN (46, 258)  = REFRACTORY and REFRACTORY (OFFICE) (COKE OVEN REFRACTORY is id 92): 20 people for the
// wrong pair. The terminal log says why: "department family repaired without a second model call" -- the step 48a REPAIR (repairFamilies) saw the word REFRACTORY, took the REFRACTORY
// family (46, 258) and wrote it over the SQL, whatever the model had written: it turns even the RIGHT SQL, IN (46, 92), into IN (46, 258). The family logic knows nothing of the row the person ticked.
//
// So, when a question carries "(code N)" markers:
//   - the rows they name are found by CODE and NAME together (two rows can share a code: 103 is P.R.O. and LAW);
//   - the SQL must select exactly those rows (checkNamedRows), and when it is wrong the first department_id / department_code IN (...) list is mended at once, with no second model
//     call (repairNamedRows, the same mending as step 48a); when it cannot be mended with certainty (a LIKE on the name ...) the model is sent back with the exact ids;
//   - the family logic of step 45b / 48a is NOT used for such a question: it would widen "REFRACTORY (code 86000)" to the whole REFRACTORY family, against the person's choice.
// A question with no marker goes the old way, unchanged (checkDepartments / repairDepartments below choose).

import type { DepartmentRow } from "./context";
import { checkFamilies, repairFamilies, rowsSelectedBy, withDepartmentIds } from "./familyCheck";

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** The department rows a question names by name and code ("REFRACTORY (OFFICE) (code 86030)"); empty when it names none. */
export function namedRows(question: string, departments: DepartmentRow[]): DepartmentRow[] {
  const out: DepartmentRow[] = [];
  let from = 0;
  for (const m of String(question ?? "").matchAll(/\(\s*code\s+(\d+)\s*\)/gi)) {
    const at = m.index ?? 0;
    const before = norm(String(question).slice(from, at));
    from = at + m[0].length;
    const sameCode = departments.filter((d) => d.code === Number(m[1]));
    // the row whose name the words before the marker END with (the longest name wins: "REFRACTORY (OFFICE)" before "REFRACTORY"); a code that only one row has needs no name
    const byName = sameCode.filter((d) => before.endsWith(norm(d.name))).sort((a, b) => norm(b.name).length - norm(a.name).length)[0];
    const row = byName ?? (sameCode.length === 1 ? sameCode[0] : undefined);
    if (row && !out.some((r) => r.id === row.id)) out.push(row);
  }
  return out;
}

const label = (r: DepartmentRow) => `${r.name} (code ${r.code}, id ${r.id})`;

/** A sentence for the model when its SQL does not select exactly the rows the question names; null when it does (or when the question names none). */
export function checkNamedRows(question: string, sql: string, departments: DepartmentRow[]): string | null {
  const named = namedRows(question, departments);
  if (!named.length) return null;
  const want = new Set(named.map((r) => r.id));
  const selected = rowsSelectedBy(sql, departments);
  const got = new Set(selected.map((r) => r.id));
  const missing = named.filter((r) => !got.has(r.id));
  const extra = selected.filter((r) => !want.has(r.id));
  if (!missing.length && !extra.length) return null;
  return (
    `The question names exactly ${named.length === 1 ? "this department row" : `these ${named.length} department rows`}: ${named.map(label).join("; ")}.` +
    (missing.length ? ` Your SQL does not select ${missing.map(label).join("; ")}.` : "") +
    (extra.length ? ` Your SQL also selects ${extra.slice(0, 3).map((r) => r.name).join(", ")}, which the person did not name.` : "") +
    ` Filter with department_id IN (${named.map((r) => r.id).join(", ")}) -- exactly those ids (the row numbers, not the codes) -- and nothing else for the department.`
  );
}

/** The SQL mended to select exactly the named rows, or null when nothing needs mending or the mistake cannot be mended with certainty (no department_id / department_code IN (...) to put the ids into). */
export function repairNamedRows(question: string, sql: string, departments: DepartmentRow[]): string | null {
  const named = namedRows(question, departments);
  if (!named.length || checkNamedRows(question, sql, departments) === null) return null;
  const fixed = withDepartmentIds(sql, named.map((r) => r.id));
  return fixed && checkNamedRows(question, fixed, departments) === null ? fixed : null;
}

/** What the pipeline calls: the named rows when the question carries "(code N)" markers, the department family logic otherwise. */
export function checkDepartments(question: string, sql: string, departments: DepartmentRow[]): string | null {
  return namedRows(question, departments).length ? checkNamedRows(question, sql, departments) : checkFamilies(question, sql, departments);
}
export function repairDepartments(question: string, sql: string, departments: DepartmentRow[]): string | null {
  return namedRows(question, departments).length ? repairNamedRows(question, sql, departments) : repairFamilies(question, sql, departments);
}
