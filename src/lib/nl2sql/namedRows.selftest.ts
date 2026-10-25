// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/namedRows.selftest.ts
// Step 49b: a question that names departments by name AND code gets exactly those rows. The first case is the live answer of 25 Oct 2026 00:57 (the SQL the screen showed), run
// against the 300 real department rows; the last block runs EVERY combination of ticks through the real "Which department do you mean?" ask (departmentAsk.ts).

import real from "./__fixtures__/departments.real.json";
import { queryFor } from "./departmentAsk";
import { garageAsk, refractoryAsk } from "./__fixtures__/askExamples";
import { checkDepartments, checkNamedRows, namedRows, repairDepartments, repairNamedRows } from "./namedRows";
import { checkFamilies, repairFamilies, rowsSelectedBy } from "./familyCheck";
import { guardSql } from "./guard";
import type { DepartmentRow } from "./context";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const all = real as DepartmentRow[];
const row = (name: string) => all.find((d) => d.name === name)!;
const ids = (rows: DepartmentRow[]) => rows.map((r) => r.id).sort((a, b) => a - b).join(",");
const sel = (sql: string) => ids(rowsSelectedBy(sql, all));
const people = (where: string) => `SELECT e.ticket_no, e.name, e.designation, e.department_code, e.department FROM nlq.employees e WHERE ${where} ORDER BY e.global_seniority_rank`;
const REF = row("REFRACTORY"), OFF = row("REFRACTORY (OFFICE)"), COKE = row("COKE OVEN REFRACTORY");
ok("the real rows are what I think: REFRACTORY 46, OFFICE 258, COKE OVEN 92", REF.id === 46 && OFF.id === 258 && COKE.id === 92 && COKE.code === 86600);

// ---- the live mistake of 25 Oct 2026 00:57
const LIVE_Q = "REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600)";
const LIVE_SQL = people("e.department_id IN (46, 258)");
ok("the question names exactly REFRACTORY and COKE OVEN REFRACTORY", ids(namedRows(LIVE_Q, all)) === ids([REF, COKE]), ids(namedRows(LIVE_Q, all)));
const p = checkNamedRows(LIVE_Q, LIVE_SQL, all);
ok("the live SQL IN (46, 258) is sent back", !!p, String(p));
ok("...saying it misses COKE OVEN REFRACTORY (id 92) and that REFRACTORY (OFFICE) was not named", !!p && /does not select COKE OVEN REFRACTORY \(code 86600, id 92\)/.test(p) && /also selects REFRACTORY \(OFFICE\)/.test(p) && /department_id IN \(46, 92\)/.test(p), String(p));
ok("the old family check accepts it (46 and 258 are the REFRACTORY family)", checkFamilies(LIVE_Q, LIVE_SQL, all) === null);
// ---- the REAL cause, seen in the terminal log ("department family repaired without a second model call"): the old repair rewrote even the RIGHT SQL
const RIGHT_SQL = people("e.department_id IN (46, 92)");
ok("the old repairFamilies turned the RIGHT SQL, IN (46, 92), into IN (46, 258): that was the wrong 20", repairFamilies(LIVE_Q, RIGHT_SQL, all) === people("e.department_id IN (46, 258)"));
ok("the new repairDepartments and checkDepartments leave the right SQL alone", repairDepartments(LIVE_Q, RIGHT_SQL, all) === null && checkDepartments(LIVE_Q, RIGHT_SQL, all) === null);
const fixed = repairNamedRows(LIVE_Q, LIVE_SQL, all);
ok("it is mended at once to IN (46, 92), nothing else changed", fixed === people("e.department_id IN (46, 92)"), String(fixed));
ok("...the mended SQL passes the safety check and selects exactly the two rows", !!fixed && guardSql(fixed).ok && sel(fixed) === ids([REF, COKE]));
ok("...and the mended SQL passes the check", !!fixed && checkNamedRows(LIVE_Q, fixed, all) === null);
ok("repairDepartments / checkDepartments choose the named rows for this question", repairDepartments(LIVE_Q, LIVE_SQL, all) === fixed && checkDepartments(LIVE_Q, LIVE_SQL, all) === p);

// ---- right answers pass, written any way
ok("department_id IN (46, 92) passes", checkNamedRows(LIVE_Q, people("e.department_id IN (46, 92)"), all) === null);
ok("the order of the ids does not matter", checkNamedRows(LIVE_Q, people("e.department_id IN (92, 46)"), all) === null);
ok("department_code IN (86000, 86600) passes", checkNamedRows(LIVE_Q, people("e.department_code IN (86000, 86600)"), all) === null);
ok("two separate conditions pass", checkNamedRows(LIVE_Q, people("(e.department_id = 46 OR e.department_id = 92)"), all) === null);
ok("a sub-query on the ids passes", checkNamedRows(LIVE_Q, `SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (SELECT id FROM nlq.departments WHERE id IN (46, 92))`, all) === null);

// ---- wrong ones, every kind
ok("the ids written as codes (code IN (46, 92)) are sent back", !!checkNamedRows(LIVE_Q, people("e.department_code IN (46, 92)"), all));
ok("a LIKE on the name that selects all three refractory rows is sent back (OFFICE was not ticked)", !!checkNamedRows(LIVE_Q, people("nlq.norm(e.department) LIKE '%refractory%'"), all));
ok("...and it cannot be mended with certainty (no list to put the ids into): the model is sent back", repairNamedRows(LIVE_Q, people("nlq.norm(e.department) LIKE '%refractory%'"), all) === null);
ok("one row only (IN (46)) is sent back", !!checkNamedRows(LIVE_Q, people("e.department_id IN (46)"), all));
ok("no department condition at all is sent back", !!checkNamedRows(LIVE_Q, people("e.cohort = 'executive'"), all));
ok("...and cannot be mended (no list): sent back", repairNamedRows(LIVE_Q, people("e.cohort = 'executive'"), all) === null);

// ---- one row named
const Q1 = "how many executives are there in REFRACTORY (code 86000)";
ok("REFRACTORY (code 86000) alone: IN (46, 258) is wrong (the family is NOT wanted here)", !!checkNamedRows(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (46, 258)", all));
ok("...mended to IN (46)", repairNamedRows(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (46, 258)", all) === "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (46)");
ok("...and IN (46) passes, while the family logic alone would have demanded both rows", checkNamedRows(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (46)", all) === null && checkFamilies(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (46)", all) !== null);
ok("...so repairFamilies would have WIDENED it (and the new code does not)", repairFamilies(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (46)", all) !== null && repairDepartments(Q1, "SELECT count(*) AS count FROM nlq.employees WHERE department_id IN (46)", all) === null);
const QO = "list REFRACTORY (OFFICE) (code 86030)";
ok("REFRACTORY (OFFICE) (code 86030) is found as the OFFICE row, not as REFRACTORY", ids(namedRows(QO, all)) === String(OFF.id), ids(namedRows(QO, all)));

// ---- a code that two rows share is told apart by the name
const PRO = row("P.R.O."), LAW = row("LAW");
ok("code 103 is P.R.O. or LAW by the name before it", ids(namedRows("executives in P.R.O. (code 103)", all)) === String(PRO.id) && ids(namedRows("staff in LAW (code 103)", all)) === String(LAW.id));
ok("code 103 with no name before it is not guessed", namedRows("staff in (code 103)", all).length === 0);
ok("a code that only one row has needs no name", ids(namedRows("staff in (code 86600)", all)) === String(COKE.id));
ok("a code that no row has names nothing", namedRows("staff in X (code 99999)", all).length === 0);

// ---- a question without a marker goes the OLD way, unchanged
const OLDQ = "how many executives are there in heavy maintenance, list them?";
ok("no marker: namedRows is empty", namedRows(OLDQ, all).length === 0 && namedRows("", all).length === 0);
const hm = "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%heavy%')";
ok("no marker: checkDepartments is exactly checkFamilies, repairDepartments exactly repairFamilies", checkDepartments(OLDQ, hm, all) === checkFamilies(OLDQ, hm, all) && repairDepartments(OLDQ, hm, all) === repairFamilies(OLDQ, hm, all));

// ---- EVERY combination of ticks through the checkbox question (its example, __fixtures__/askExamples.ts): what the question names is EXACTLY what was ticked
const ask = refractoryAsk("refractory", true);
const byId: Record<string, DepartmentRow> = { refractory: REF, office: OFF, coke: COKE };
let combos = 0;
for (let mask = 1; mask < 8; mask++) {
  const ticked = ask.options.filter((_, i) => mask & (1 << i)).map((o) => o.id);
  const q = queryFor(ask, ticked);
  combos++;
  ok(`ticks [${ticked}] -> "${q}" names exactly those rows`, ids(namedRows(q, all)) === ids(ticked.map((t) => byId[t])), ids(namedRows(q, all)));
  const wanted = ticked.map((t) => byId[t].id).join(", ");
  ok(`ticks [${ticked}]: the correct SQL passes, the whole-family IN (46, 258, 92) is mended or sent back`, checkNamedRows(q, people(`e.department_id IN (${wanted})`), all) === null && (ticked.length === 3 || !!checkNamedRows(q, people("e.department_id IN (46, 258, 92)"), all)));
}
ok("all seven combinations were run", combos === 7);
const askG = garageAsk("how many executives are there in garage");
ok("the garage ask carries no code marker, so it is untouched by 49b", namedRows(queryFor(askG, ["plant"]), all).length === 0);

console.log(`namedRows selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
