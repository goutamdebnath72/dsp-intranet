// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/cld.selftest.ts
// Step 59a: the CL&D (Centre for L & D). It was the Training Department, then CHRD, and people still use the old names (owner, 26 Oct 2026). All of them, and "CL&D", mean the five L & D rows of the HR department
// table. The list of the CL&D employees (CL&D Online - Contacts, 26 Oct 2026) is the proof of WHICH rows: 32 people in five sections.

import list from "./__fixtures__/cld_contacts.json";
import real from "./__fixtures__/departments.real.json";
import { departmentFamilies, type DepartmentRow } from "./context";
import { checkFamilies } from "./familyCheck";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const rows = real as DepartmentRow[];
const people = list.people;
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const num = (code: string) => Number(/(\d+)$/.exec(code)?.[1]);

// ---- the list itself
ok("32 people, no ticket twice", people.length === 32 && new Set(people.map((p) => p.ticket)).size === 32);
const bySection = (code: string) => people.filter((p) => num(p.code) === Number(code));
ok("five sections: L & D (EXE-00107) 7, L & D OFFICE (09001) 13, L & D (09003) 1, L & D TECH (10770) 3, L & D IND (09008) 8", bySection("107").length === 7 && bySection("9001").length === 13 && bySection("9003").length === 1 && bySection("10770").length === 3 && bySection("9008").length === 8);
ok("the seven executives (tickets 4xxxxx) are the section EXE-00107, nobody else is", people.filter((p) => p.ticket.startsWith("4")).length === 7 && people.filter((p) => p.ticket.startsWith("4")).every((p) => num(p.code) === 107));
ok("the list carries no phone number or e-mail address (names, tickets, sections and codes only)", people.every((p) => Object.keys(p).sort().join() === "code,designation,name,section,ticket"));

// ---- each section of the list is a row of the HR department table, with the same name
const sectionRows = [107, 9001, 9003, 10770, 9008].map((code) => rows.find((r) => r.code === code) as DepartmentRow);
ok("every section's code is a row of the 300", sectionRows.every((r) => !!r), sectionRows.map((r) => r?.id).join());
ok("...with the SAME name as the list prints (L & D TECH is written L & D (TECH) in the table)", people.every((p) => { const r = rows.find((x) => x.code === num(p.code)); return !!r && norm(r.name) === norm(p.section); }));
const ids = sectionRows.map((r) => r.id).sort((a, b) => a - b);
ok("the five rows are ids 17, 138, 140, 201, 286", JSON.stringify(ids) === "[17,138,140,201,286]", JSON.stringify(ids));
ok("no other department starts with L & D (the family is exactly these five)", rows.filter((r) => /^l and d\b/.test(norm(r.name))).length === 5);

// ---- every old and new name means the five rows
const cl = (q: string) => departmentFamilies(q, rows).find((f) => f.rows.some((r) => r.code === 107));
for (const alias of ["cl&d", "cl & d", "cl and d", "c l & d", "centre for l&d", "center for l & d", "learning and development", "centre for learning and development", "center for learning and development", "chrd", "c.h.r.d", "c h r d", "centre for human resource development", "center for human resource development", "training department", "training dept", "training deptt", "l&d", "l & d"]) {
  const f = cl(`list the employees of ${alias}`);
  ok(`"${alias}" means all five L & D rows`, !!f && JSON.stringify(f.rows.map((r) => r.id).sort((a, b) => a - b)) === JSON.stringify(ids), JSON.stringify(f?.rows.map((r) => r.id)));
}
ok("the full forms are the CONFIRMED ones only (L & D = Learning and Development: the HOD; CHRD = Centre for Human Resource Development): the abbreviation 'Centre for HRD' is not used at the plant and is not an alias; 'human resource development' alone is a topic, not this department", !cl("list the employees of centre for hrd") && !cl("how many employees of hrd") && !cl("list the employees of human resource development"));
// ---- step 60c: another plant's CHRD is NOT this department (the owner's check of 26 Oct 2026 showed "bhilai chrd" getting the five Durgapur rows)
const cldRows = (q: string) => departmentFamilies(q, rows).filter((f) => f.rows.some((r) => r.code === 107));
for (const q of ["list employees of bsp chrd", "employees of bhilai chrd", "how many people in rourkela chrd", "bokaro chrd staff", "chrd bokaro", "iisco chrd", "burnpur chrd employees", "employees of the training department of bhilai", "list the employees of chrd ranchi", "sail chrd employees", "corporate office chrd", "centre for human resource development bokaro"])
  ok(`another plant's CHRD: "${q}" does NOT name the Durgapur CL&D rows`, cldRows(q).length === 0, JSON.stringify(cldRows(q).map((f) => f.name.slice(0, 20))));
for (const q of ["list the employees of chrd", "employees of the training department", "how many people work in chrd", "chrd employees", "list of cl&d employees"])
  ok(`Durgapur's own: "${q}" still names the five CL&D rows`, cldRows(q).length === 1 && cldRows(q)[0].rows.length === 5, JSON.stringify(cldRows(q).map((f) => f.rows.length)));
// ---- step 60d: the LONGEST name wins (the owner's check of 26 Oct 2026: the full form of CHRD got the 11 HR rows too, because "human resource" is inside "centre for human resource development", and the answer was 107 HR people)
const fam = (q: string) => departmentFamilies(q, rows);
const isHr = (f: { name: string }) => /^HR\b/.test(f.name);
for (const q of ["list the employees of the centre for human resource development", "centre for human resource development", "list the employees of the Center for Human Resource Development", "how many people work in the centre for human resource development"]) {
  const f = fam(q);
  ok(`"${q}": ONE family, the five CL&D rows, not HR`, f.length === 1 && f[0].rows.length === 5 && f[0].rows.every((r) => [107, 9001, 9003, 10770, 9008].includes(r.code)) && !f.some(isHr), JSON.stringify(f.map((x) => `${x.name.slice(0, 12)}:${x.rows.length}`)));
}
for (const q of ["how many people work in human resource", "list the employees of the human resource department", "human resources employees"]) ok(`"${q}": HR is still named when only HR is`, fam(q).some(isHr), JSON.stringify(fam(q).map((x) => x.name.slice(0, 12))));
{
  const both = fam("employees of the human resource department and of the centre for human resource development");
  ok("a question that names HR on its own AND the full form of CHRD gets both families", both.some(isHr) && both.some((f) => f.rows.some((r) => r.code === 107)), JSON.stringify(both.map((x) => x.name.slice(0, 12))));
  ok("another plant's centre for human resource development: not CL&D, and not HR either (the phrase belongs to the CHRD name, so no family: the model answers honestly)", fam("list the employees of the bhilai centre for human resource development").length === 0, JSON.stringify(fam("list the employees of the bhilai centre for human resource development").map((x) => x.name.slice(0, 12))));
}
ok("a question that names no such department does not pull them in: C & IT, the main hospital, the training of apprentices", ["how many executives in c&it", "doctors in the main hospital", "circular about apprentice training schedule"].every((q) => !cl(q)));

// ---- the answer must cover all five; one named section is allowed
const sql = (codes: number[]) => `SELECT e.ticket_no FROM nlq.employees e WHERE e.department_code IN (${codes.join(", ")})`;
const question = "how many employees work in chrd";
ok("an SQL that covers all five rows passes", checkFamilies(question, sql([107, 9001, 9003, 10770, 9008]), rows) === null);
ok("an SQL that covers only ONE row (the 'L & D' of 107) is sent back: this is what 'chrd' used to risk", !!checkFamilies(question, sql([107]), rows));
ok("a part is accepted when the question names ONE section: 'chrd office' with L & D OFFICE only", checkFamilies("how many employees in chrd office", sql([9001]), rows) === null);
ok("...but the family without the section word is not: 'chrd' with L & D OFFICE only is sent back", !!checkFamilies(question, sql([9001]), rows));
ok("the old names work the same: training department with the five rows passes, with one it does not", checkFamilies("list the executives of the training department", sql([107, 9001, 9003, 10770, 9008]), rows) === null && !!checkFamilies("list the executives of the training department", sql([9003]), rows));
console.log(`cld selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
