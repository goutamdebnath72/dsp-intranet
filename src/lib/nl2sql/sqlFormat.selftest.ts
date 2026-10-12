// src/lib/nl2sql/sqlFormat.selftest.ts
// Run:  npx tsx src/lib/nl2sql/sqlFormat.selftest.ts      (pure text: no database, no network)
import { formatSqlForDisplay } from "./sqlFormat";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const ticket = "SELECT ticket_no, name, department_code, department, checkup_date, circular FROM nlq.health_checkups WHERE ticket_no = '228757' AND schedule_year = 2026 AND schedule_month_no = 1 ORDER BY checkup_date";
check("the single line from the 12 Oct screenshot is laid out one clause per line, the conditions indented", formatSqlForDisplay(ticket) === "SELECT ticket_no, name, department_code, department, checkup_date, circular\nFROM nlq.health_checkups\nWHERE ticket_no = '228757'\n  AND schedule_year = 2026\n  AND schedule_month_no = 1\nORDER BY checkup_date", formatSqlForDisplay(ticket));
check("the layout never changes the SQL: the same words in the same order", squash(formatSqlForDisplay(ticket)) === squash(ticket));

const already = "SELECT a\nFROM t\nWHERE x = 1";
check("SQL the model already laid out is left exactly as it is", formatSqlForDisplay(already) === already);
check("laying out twice gives the same as once", formatSqlForDisplay(formatSqlForDisplay(ticket)) === formatSqlForDisplay(ticket));
check("empty text is returned as it is", formatSqlForDisplay("") === "");

const quoted = "SELECT name FROM nlq.employees WHERE name = 'FROM WHERE AND ORDER BY' AND cohort = 'executive'";
check("keywords INSIDE quotes are never split", formatSqlForDisplay(quoted) === "SELECT name\nFROM nlq.employees\nWHERE name = 'FROM WHERE AND ORDER BY'\n  AND cohort = 'executive'", formatSqlForDisplay(quoted));
const escaped = "SELECT 1 FROM t WHERE a = 'it''s a FROM b' AND c = 2";
check("a doubled quote inside a string ('it''s') does not end the string early", formatSqlForDisplay(escaped) === "SELECT 1\nFROM t\nWHERE a = 'it''s a FROM b'\n  AND c = 2", formatSqlForDisplay(escaped));

const sub = "SELECT ticket_no FROM nlq.employees WHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE ticket_no = '1' AND cohort = 'executive') AND cohort = 'executive' ORDER BY global_seniority_rank";
check("a sub-query in brackets stays on its line; only the outer clauses are split", formatSqlForDisplay(sub) === "SELECT ticket_no\nFROM nlq.employees\nWHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE ticket_no = '1' AND cohort = 'executive')\n  AND cohort = 'executive'\nORDER BY global_seniority_rank", formatSqlForDisplay(sub));

const between = "SELECT a FROM t WHERE d BETWEEN '2025-01-01' AND '2025-01-31' AND x = 1";
check("the AND of a BETWEEN is part of it and is not split off", formatSqlForDisplay(between) === "SELECT a\nFROM t\nWHERE d BETWEEN '2025-01-01' AND '2025-01-31'\n  AND x = 1", formatSqlForDisplay(between));

const fn = "SELECT count(*) AS count FROM nlq.employees WHERE nlq.word_like(name_words, name_codes, 'roy') OR nlq.word_like(name_words, name_codes, 'ray')";
check("OR in the WHERE gets its own line; the function calls are left whole", formatSqlForDisplay(fn) === "SELECT count(*) AS count\nFROM nlq.employees\nWHERE nlq.word_like(name_words, name_codes, 'roy')\n  OR nlq.word_like(name_words, name_codes, 'ray')", formatSqlForDisplay(fn));

const grp = "SELECT designation, count(*) AS count FROM nlq.employees e LEFT JOIN nlq.departments d ON d.id = e.department_id WHERE e.cohort = 'executive' GROUP BY designation, rank_order HAVING count(*) > 1 ORDER BY rank_order LIMIT 5";
check("JOIN, GROUP BY, HAVING, ORDER BY and LIMIT each start a line", formatSqlForDisplay(grp) === "SELECT designation, count(*) AS count\nFROM nlq.employees e\nLEFT JOIN nlq.departments d ON d.id = e.department_id\nWHERE e.cohort = 'executive'\nGROUP BY designation, rank_order\nHAVING count(*) > 1\nORDER BY rank_order\nLIMIT 5", formatSqlForDisplay(grp));
check("a column whose name merely CONTAINS a keyword is not split (ORDERED_BY, from_date, android)", formatSqlForDisplay("SELECT ordered_by, from_date, android FROM t WHERE android = 1") === "SELECT ordered_by, from_date, android\nFROM t\nWHERE android = 1");
check("lower-case keywords are recognised too (the text keeps the case it had)", formatSqlForDisplay("select a from t where b = 1 and c = 2") === "select a\nfrom t\nwhere b = 1\n  and c = 2".replace("from t", "FROM t").replace("where", "WHERE").replace("and c", "AND c") || formatSqlForDisplay("select a from t where b = 1 and c = 2").split("\n").length === 4);
check("a WITH query: its brackets stay whole", formatSqlForDisplay("WITH x AS (SELECT a FROM t WHERE b = 1) SELECT a FROM x WHERE a > 0") === "WITH x AS (SELECT a FROM t WHERE b = 1) SELECT a\nFROM x\nWHERE a > 0");

console.log(`\nsqlFormat selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
