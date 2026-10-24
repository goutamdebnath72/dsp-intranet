// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/familyCheck.selftest.ts
// The model's SQL must cover the whole department family a question names. The cases are the live answers of 24 Oct 2026 (the SQL the model really wrote), run against the
// 300 real department rows.

import real from "./__fixtures__/departments.real.json";
import { checkFamilies, rowsSelectedBy } from "./familyCheck";
import type { DepartmentRow } from "./context";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const all = real as DepartmentRow[];
const ids = (re: RegExp) => all.filter((d) => re.test(d.name)).map((d) => d.id);
const sub = (cond: string) => `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE ${cond})`;
const check = (q: string, sql: string) => checkFamilies(q, sql, all);

// ---- the three WRONG live answers are sent back, with the right ids
let p = check("how many executives are there in main hospital, list them", sub("nlq.norm(name) LIKE '%hospital%'"));
ok("main hospital: LIKE '%hospital%' (2 of 6 rows) is sent back", !!p && /only 2 of its 6 rows/.test(p), String(p));
ok("...with all six ids to use", !!p && ids(/^(M&HS|MEDICAL|HOSPITAL)/).every((i) => p!.includes(String(i))) && /department_id IN \(/.test(p!), String(p));
p = check("how many executives are there in hydraulic lab?", sub("nlq.norm(name) LIKE '%hydraulic lab%'"));
ok("hydraulic lab: a LIKE that matches no row is sent back (the family is MTB)", !!p && /none of its rows/.test(p) && ids(/^MTB/).every((i) => p!.includes(String(i))), String(p));
p = check("how many executives are there in l&d, list them?", sub("nlq.norm(name) LIKE '%l d%'"));
ok("l&d: LIKE '%l d%' (it also matches 'contro[l d]eptt') is sent back and names ENVIRONMENT CONTROL DEPTT as what it selected instead", !!p && /ENVIRONMENT CONTROL DEPTT.* instead/.test(p) && ids(/^L & D/).every((i) => p!.includes(String(i))), String(p));

// ---- the RIGHT live answers pass
ok("fire brigade: LIKE '%fire%' selects exactly the 3 fire rows: passes", check("how many executives are there in fire brigade?", sub("nlq.norm(name) LIKE '%fire%'")) === null);
ok("heavy maintenance: code IN (92500, 92530) passes", check("how many executives are there in heavy maintenance, list them?", sub("code IN (92500,92530)")) === null);
ok("cocc: LIKE '%co and cc%' selects exactly the 8 CO & CC rows: passes", check("how many executives are there in cocc, list them?", sub("nlq.norm(name) LIKE '%co and cc%'")) === null);

// ---- other ways to write the same right answer
const l = ids(/^L & D/).join(", ");
ok("department_id IN (the ids) passes", check("executives in l&d", `SELECT count(*) FROM nlq.employees WHERE cohort='executive' AND department_id IN (${l})`) === null);
ok("department_id IN (SELECT id ... WHERE id IN (the ids)) passes", check("executives in l&d", sub(`id IN (${l})`)) === null);
ok("a LIKE with a prefix that selects exactly the family passes (hr% is the 11 HR rows)", check("how many executives in hr", sub("nlq.norm(name) LIKE 'hr%'")) === null);
ok("a raw ILIKE on the name passes when it selects the family", check("executives in merchant mill", sub("name ILIKE 'MERCHANT MILL%'")) === null);
ok("department_code IN (the codes) on nlq.employees passes", check("executives in heavy maintenance", "SELECT count(*) FROM nlq.employees WHERE cohort='executive' AND department_code IN (92500, 92530)") === null);

// ---- still wrong: one row of a family, or no department at all
p = check("how many executives are there in cocc", sub("code IN (10000)"));
ok("cocc through the plain CO & CC row alone (the original 0) is sent back", !!p && /only 1 of its 8 rows/.test(p), String(p));
p = check("how many executives are there in heavy maintenance", sub("code IN (92500)"));
ok("one of the two Heavy Maintenance rows is sent back", !!p && /only 1 of its 2 rows/.test(p));
p = check("how many executives are there in heavy maintenance, list them?", "SELECT count(*) FROM nlq.employees WHERE cohort = 'executive'");
ok("an SQL with no department condition at all (everybody) is sent back", !!p && /none of its rows/.test(p), String(p));

// ---- a named SECTION is respected
ok("sms-ccp: its rows alone are right (the word ccp only they have)", check("how many executives are there in sms-ccp", sub("nlq.norm(name) LIKE 'sms ccp%'")) === null);
ok("hospital office: HOSPITAL OFFICE alone is right", check("executives in main hospital office", sub("code IN (3304)")) === null);
ok("blast furnace gcp: the GCP row alone is right", check("executives in blast furnace gcp", sub("code IN (23000)")) === null);
ok("but sms with only one section and no section word is sent back", !!check("executives in sms", sub("code IN (32100)")));
ok("the whole family plus another department also passes", check("compare sms and traffic", sub("nlq.norm(name) LIKE 'sms%' OR nlq.norm(name) LIKE 'traffic%' OR nlq.norm(name) LIKE 's m s%'")) === null);

// ---- nothing to check
ok("a question that names no department family is not checked", check("how many executives have no NIC email", "SELECT count(*) FROM nlq.employees") === null);
ok("C & IT and Plant Garage (listed by code in every prompt) are not families: not checked", check("executives in plant garage", sub("code IN (85000)")) === null && check("executives in c&it", sub("code IN (98500)")) === null);

// ---- the reading of the SQL
ok("rowsSelectedBy: by id, by code, by LIKE, by =", rowsSelectedBy(sub("id IN (21)"), all).length === 1 && rowsSelectedBy(sub("code IN (10000)"), all).length === 1 && rowsSelectedBy(sub("nlq.norm(name) LIKE 'co and cc%'"), all).length === 8 && rowsSelectedBy(sub("name = 'CO & CC'"), all).length === 1);
ok("NOT LIKE selects nothing by itself", rowsSelectedBy(sub("nlq.norm(name) NOT LIKE '%co and cc%'"), all).length === 0);
ok("an SQL with no department condition selects no row", rowsSelectedBy("SELECT 1 FROM nlq.employees WHERE cohort = 'executive'", all).length === 0);

console.log(`familyCheck selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
