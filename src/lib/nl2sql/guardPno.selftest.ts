// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/nl2sql/guardPno.selftest.ts
// The SAIL P.No. is the first password, so the guard has to refuse a query that selects, filters or sorts by it (in any spelling) and still pass the ordinary queries. The prompt no longer lists the column.
import { readFileSync } from "node:fs";
import { guardSql } from "./guard";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const refused = [
  "SELECT sail_pno FROM nlq.employees",
  "SELECT name, sail_pno FROM nlq.employees WHERE name ILIKE 'a%'",
  "SELECT e.sail_pno AS pno FROM nlq.employees e",
  "SELECT name FROM nlq.employees WHERE sail_pno = 'D001212'",
  "SELECT name FROM nlq.employees WHERE upper(sail_pno) LIKE 'D00%'",
  "SELECT name FROM nlq.employees ORDER BY SAIL_PNO",
  'SELECT "sail_pno" FROM nlq.employees',
  "WITH x AS (SELECT sail_pno, name FROM nlq.employees) SELECT * FROM x",
  "SELECT name FROM nlq.employees WHERE id IN (SELECT id FROM nlq.employees WHERE sail_pno = 'D1')",
  "SELECT count(*) FROM nlq.employees WHERE sail_pno IS NOT NULL",
];
for (const q of refused) { const r = guardSql(q); ok(`refused: ${q.slice(0, 70)}`, !r.ok && /sail_pno/.test((r as { reason?: string }).reason ?? ""), JSON.stringify(r)); }

const passed = [
  "SELECT ticket_no, name, designation, department FROM nlq.employees WHERE cohort = 'executive' ORDER BY global_seniority_rank",
  "SELECT department, count(*) AS n FROM nlq.employees GROUP BY department",
  "SELECT name FROM nlq.employees WHERE nlq.first_word_like(name_words, name_codes, 'rakesh')",
];
for (const q of passed) ok(`still passes: ${q.slice(0, 70)}`, guardSql(q).ok === true, JSON.stringify(guardSql(q)));

ok("the prompt does not list the P.No. column and says it is never available", !/sail_pno \(text\)/.test(readFileSync("src/lib/nl2sql/prompt.ts", "utf8")) && /NEVER available/.test(readFileSync("src/lib/nl2sql/prompt.ts", "utf8")));
console.log(`guardPno selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
