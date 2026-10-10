// src/lib/nl2sql/deptColumns.ts
//
// A department shown by its code alone, or by its name alone, is half an answer: DSP has near-identical names
// (six Plant Garage sections) and six codes shared by two different departments. This looks at the columns the
// model's SQL RETURNS and says so when only one of the pair is there. The pipeline then gives the model one chance
// to put both in. Pure and deterministic -- it reads the SQL, it does not ask a model.

import { parse } from "pgsql-ast-parser";

const CODE_NAMES = new Set(["department_code", "dept_code", "section_code"]);
const NAME_NAMES = new Set(["department", "department_name", "dept_name", "dept", "section", "section_name"]);

/** The names of the columns the final SELECT returns, or null when they cannot be known (SELECT *, parse failure). */
export function outputColumnNames(sql: string): string[] | null {
  let stmts;
  try {
    stmts = parse(sql);
  } catch {
    return null;
  }
  if (stmts.length !== 1) return null;
  let st: any = stmts[0];
  // unwrap WITH ... and set operations down to the SELECT that shapes the result columns
  for (let i = 0; i < 8; i++) {
    if (st.type === "with") st = st.in;
    else if (st.type === "union" || st.type === "union all") st = st.left;
    else break;
  }
  if (!st || st.type !== "select" || !Array.isArray(st.columns)) return null;
  const names: string[] = [];
  for (const c of st.columns) {
    if (c.alias?.name) names.push(String(c.alias.name).toLowerCase());
    else if (c.expr?.type === "ref") {
      if (c.expr.name === "*") return null;
      names.push(String(c.expr.name).toLowerCase());
    } else names.push("");
  }
  return names;
}

/** null = fine (both, or neither, or unknown). Otherwise an instruction for the model. */
export function checkDepartmentColumns(sql: string): string | null {
  const names = outputColumnNames(sql);
  if (!names) return null;
  const hasCode = names.some((n) => CODE_NAMES.has(n));
  const hasName = names.some((n) => NAME_NAMES.has(n));
  if (hasCode === hasName) return null;
  const how =
    "Select BOTH department_code and department (code first) straight from nlq.employees -- they are already there, " +
    "so do not JOIN nlq.departments to read them. When counting per department, GROUP BY department_id, department_code, department.";
  return hasCode
    ? `The result shows a department's code without its name. ${how}`
    : `The result shows a department's name without its code. ${how}`;
}

/**
 * Two DIFFERENT departments can share one number (101, 103, 21000, 40017, 83002, 98902: an executive-only department and
 * a non-executive-only one). Matching rows to each other on department_code therefore merges them: "executives but no
 * non-executives under the same code" then wrongly drops BLAST FURNACE (OPERATION) because a different department with
 * the same number has non-executives. Departments are compared by department_id (a department ROW), never by number alone.
 * Only comparisons BETWEEN TWO COLUMNS are judged; filtering on a list of codes is fine.
 */
export function checkDepartmentIdentity(sql: string): string | null {
  let stmts;
  try {
    stmts = parse(sql);
  } catch {
    return null;
  }
  let bad = false;
  const nameOf = (e: any) => (e && e.type === "ref" && typeof e.name === "string" ? e.name.toLowerCase() : null);
  const visit = (n: any): void => {
    if (!n || typeof n !== "object") return;
    if (n.type === "binary" && n.op === "=") {
      const l = nameOf(n.left);
      const r = nameOf(n.right);
      if ((l === "department_code" && (r === "department_code" || r === "code")) || (r === "department_code" && l === "code")) bad = true;
    }
    for (const k of Object.keys(n)) visit(n[k]);
  };
  visit(stmts);
  return bad
    ? "Departments are matched by NUMBER here (department_code = department_code, or department_code = code), but six numbers (101, 103, 21000, 40017, 83002, 98902) belong to two different departments, so this merges them. Match departments by department_id (the department row), e.g. NOT EXISTS (... ne.department_id = e.department_id ...) or GROUP BY department_id with conditional counts."
    : null;
}
