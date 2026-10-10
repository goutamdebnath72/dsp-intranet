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
