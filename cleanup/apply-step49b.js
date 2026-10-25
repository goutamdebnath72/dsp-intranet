#!/usr/bin/env node
// cleanup/apply-step49b.js -- Step 49b: a question that names departments by name AND code ("REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600)") gets exactly those rows.
// ALL-OR-NOTHING and idempotent: if any anchor differs, it prints NOT APPLIED and changes nothing.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FC = path.join(root, "src/lib/nl2sql/familyCheck.ts");
const PL = path.join(root, "src/lib/nl2sql/pipeline.ts");
const NR = path.join(root, "src/lib/nl2sql/namedRows.ts");
const OLD_BLOCK = "  const m = /\\b(?:department_id|department_code)\\s+IN\\s*\\(/i.exec(sql);\n  if (!m) return null;\n  const start = m.index + m[0].length;\n  let depth = 1;\n  let inString = false;\n  let i = start;\n  for (; i < sql.length && depth > 0; i++) {\n    const ch = sql[i];\n    if (inString) {\n      if (ch === \"'\") {\n        if (sql[i + 1] === \"'\") i++;\n        else inString = false;\n      }\n      continue;\n    }\n    if (ch === \"'\") inString = true;\n    else if (ch === \"(\") depth++;\n    else if (ch === \")\") depth--;\n  }\n  if (depth !== 0) return null;\n  const end = i - 1; // the closing bracket\n  const fixed = sql.slice(0, m.index) + `department_id IN (${families[0].rows.map((r) => r.id).join(\", \")}` + sql.slice(end);\n";
const NEW_BLOCK = "  const fixed = withDepartmentIds(sql, families[0].rows.map((r) => r.id));\n  if (!fixed) return null;\n";
const HELPER = "\n/**\n * The SQL with its first department_id / department_code IN (...) -- a list or a sub-query, found by matching the brackets -- replaced by department_id IN (the ids); null when the SQL has no such\n * list (or its brackets do not close). Shared by repairFamilies (step 48a) and repairNamedRows (step 49b, namedRows.ts).\n */\nexport function withDepartmentIds(sql: string, ids: number[]): string | null {\n  const m = /\\b(?:department_id|department_code)\\s+IN\\s*\\(/i.exec(sql);\n  if (!m) return null;\n  const start = m.index + m[0].length;\n  let depth = 1;\n  let inString = false;\n  let i = start;\n  for (; i < sql.length && depth > 0; i++) {\n    const ch = sql[i];\n    if (inString) {\n      if (ch === \"'\") {\n        if (sql[i + 1] === \"'\") i++;\n        else inString = false;\n      }\n      continue;\n    }\n    if (ch === \"'\") inString = true;\n    else if (ch === \"(\") depth++;\n    else if (ch === \")\") depth--;\n  }\n  if (depth !== 0) return null;\n  const end = i - 1; // the closing bracket\n  return sql.slice(0, m.index) + `department_id IN (${ids.join(\", \")}` + sql.slice(end);\n}\n";
const PL_EDITS = [["import { checkFamilies, repairFamilies } from \"./familyCheck\";", "import { checkDepartments, repairDepartments } from \"./namedRows\";"], ["const mended = repairFamilies(q, g.sql, prep.ctx.departments);", "const mended = repairDepartments(q, g.sql, prep.ctx.departments);"], ["(attempts <= 2 ? checkFamilies(q, g.sql, prep.ctx.departments) : null)", "(attempts <= 2 ? checkDepartments(q, g.sql, prep.ctx.departments) : null)"]];
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of [FC, PL]) if (!fs.existsSync(f)) refuse("cannot find " + path.relative(root, f) + " (run this from the project root)");
if (!fs.existsSync(NR)) refuse("src/lib/nl2sql/namedRows.ts is missing (unzip the patch first)");
let fc = fs.readFileSync(FC, "utf8");
let pl = fs.readFileSync(PL, "utf8");
const fcDone = fc.includes("export function withDepartmentIds(");
const plDone = pl.includes("repairDepartments(") && pl.includes("checkDepartments(");
if (fcDone && plDone) { console.log("Nothing to do: step 49b is already applied."); process.exit(0); }
if (fcDone !== plDone) refuse("the two files are in different states (one is patched, the other is not); send me this message");
if (fc.split(OLD_BLOCK).length !== 2) refuse("src/lib/nl2sql/familyCheck.ts differs from what I expect (the block of repairFamilies that mends the department list)");
fc = fc.replace(OLD_BLOCK, () => NEW_BLOCK).replace(/\s*$/, "\n") + HELPER;
for (const [a, b] of PL_EDITS) {
  if (pl.split(a).length !== 2) refuse("src/lib/nl2sql/pipeline.ts differs from what I expect around: " + a.slice(0, 60));
  pl = pl.replace(a, () => b);
}
fs.writeFileSync(FC, fc);
fs.writeFileSync(PL, pl);
console.log("APPLIED: step 49b (familyCheck.ts and pipeline.ts edited in place; namedRows.ts is new).");
