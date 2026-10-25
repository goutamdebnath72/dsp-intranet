// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/departmentWords.selftest.ts
// Step 55a: "refractory" = its three rows, "garage" = the Plant Garage, "township garage" = a closed department. Resolved, never asked; the rewritten question names the rows exactly
// (checked against the 300 real department rows); nothing else is touched.

import real from "./__fixtures__/departments.real.json";
import { refractoryAsk } from "./__fixtures__/askExamples";
import { queryFor } from "./departmentAsk";
import { checkNamedRows, namedRows } from "./namedRows";
import { REFRACTORY_ROWS, TOWNSHIP_GARAGE_CLOSED, finishDepartmentNote, resolveDepartmentWords } from "./departmentWords";
import type { DepartmentRow } from "./context";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const all = real as DepartmentRow[];
const ids = (rows: DepartmentRow[]) => rows.map((r) => r.id).sort((a, b) => a - b).join(",");

// ---- garage = the Plant Garage
let w = resolveDepartmentWords("how many executives are there in garage");
ok("garage about people: the word becomes 'plant garage', the rest of the question is untouched", w?.question === "how many executives are there in plant garage" && !w?.closed, JSON.stringify(w));
ok("...the note says what garage means and that the township garage is closed", /“Garage” means the Plant Garage \(all its six sections\)\./.test(w?.note ?? "") && (w?.note ?? "").includes(TOWNSHIP_GARAGE_CLOSED));
ok("a bare word: 'garage' and 'Garage staff'", resolveDepartmentWords("garage")?.question === "plant garage" && resolveDepartmentWords("Garage staff")?.question === "plant garage staff");
for (const q of ["how many executives are there in plant garage", "people in mhemd", "executives in M.H.E.M.D.", "executives in m h e o d", "executives in plant garage (tech)"]) ok(`already clear, left alone: ${q}`, resolveDepartmentWords(q) === null);

// ---- the township garage is closed
ok("the township garage: answered at once, nothing is searched", resolveDepartmentWords("executives in township garage")?.closed === "Township Garage has no employees: it is a closed department." && !resolveDepartmentWords("executives in township garage")?.question);
for (const q of ["list the staff of town garage", "township garage", "how many people work in the Township Garage", "executives in Town Garage"]) ok(`closed: ${q}`, resolveDepartmentWords(q)?.closed === TOWNSHIP_GARAGE_CLOSED);
w = resolveDepartmentWords("executives in plant garage and township garage");
ok("both named in one question: the Plant Garage is answered, and the note says the township garage is closed", !w?.closed && !w?.question && w?.note === TOWNSHIP_GARAGE_CLOSED, JSON.stringify(w));
ok("a question about documents is never touched: 'what is the tender for the new garage building', 'circular about the township garage tender'", resolveDepartmentWords("what is the tender for the new garage building") === null && resolveDepartmentWords("circular about the township garage tender") === null);

// ---- refractory = all three rows
w = resolveDepartmentWords("how many executives are there in refractory, list them?");
ok("refractory about people: the word becomes the three rows by name and code, the rest of the question untouched", w?.question === `how many executives are there in ${REFRACTORY_ROWS}, list them?` && !w?.closed, w?.question);
ok("...exactly what ticking all three boxes used to search", w?.question === queryFor(refractoryAsk("how many executives are there in refractory, list them?"), ["refractory", "office", "coke"]));
ok("...and the question names EXACTLY the three real rows: REFRACTORY 46, REFRACTORY (OFFICE) 258, COKE OVEN REFRACTORY 92", ids(namedRows(w?.question ?? "", all)) === "46,92,258", ids(namedRows(w?.question ?? "", all)));
ok("...a model SQL that picks only two of them is sent back, the right one passes", !!checkNamedRows(w?.question ?? "", "SELECT e.ticket_no, e.name FROM nlq.employees e WHERE e.department_id IN (46, 92)", all) && checkNamedRows(w?.question ?? "", "SELECT e.ticket_no, e.name FROM nlq.employees e WHERE e.department_id IN (46, 258, 92)", all) === null);
ok("...the note says all three, as in the old intranet, and that Coke Oven Refractory is also in CO & CC", /“Refractory” means all three Refractory departments, as in the old intranet: REFRACTORY \(86000\), REFRACTORY \(OFFICE\) \(86030\) and COKE OVEN REFRACTORY \(86600\)\./.test(w?.note ?? "") && /Coke Oven Refractory also belongs to CO & CC/.test(w?.note ?? "") && w?.cokeOven === true);
ok("a bare word: 'refractory' alone is the three rows too (the people, as the old intranet's page)", resolveDepartmentWords("refractory")?.question === REFRACTORY_ROWS && resolveDepartmentWords("Refractory")?.question === REFRACTORY_ROWS && resolveDepartmentWords("list the staff in refractory")?.question === `list the staff in ${REFRACTORY_ROWS}`);
for (const q of ["how many executives are there in coke oven refractory", "executives in refractory office", "executives in refractory (office)", "staff of Coke Oven Refractory", "executives in REFRACTORY (code 86000)"]) ok(`already clear, left alone: ${q}`, resolveDepartmentWords(q) === null);
ok("refractories (the material, plural) is not the department word", resolveDepartmentWords("executives who buy refractories") === null);
ok("a question about documents is never touched: 'what is the circular about refractory bricks'", resolveDepartmentWords("what is the circular about refractory bricks") === null);

// ---- the note's number
const base = resolveDepartmentWords("executives in refractory")!.note!;
ok("the number of Coke Oven Refractory people is filled in: 5, 1, none", /counted in both\.$/.test(finishDepartmentNote(base, 5)) && finishDepartmentNote(base, 5).includes("its 5 people are counted in both") && finishDepartmentNote(base, 1).includes("its 1 person is counted in both") && finishDepartmentNote(base, null).includes("its people are counted in both") && finishDepartmentNote(base, 0).includes("its people are counted in both"));
ok("...and no placeholder is ever left in the note", !finishDepartmentNote(base, 5).includes("{{") && !finishDepartmentNote(base, null).includes("{{"));

// ---- NEVER a loop: what the words become is not resolved again
for (const q of ["how many executives are there in garage", "garage", "refractory", "executives in refractory, list them", "executives in plant garage and township garage"]) {
  const r = resolveDepartmentWords(q);
  ok(`no loop: "${q}"`, !r?.question || resolveDepartmentWords(r.question) === null, r?.question);
}
// ---- other questions are never touched
for (const q of ["how many executives are there in main hospital", "how many executives work in each section of C&IT", "who is more senior, Mohd Anwar Ullah or Rana Saha", "list the employees whose name has kumar as a word", "restricted holidays in March 2026", "how many executives are there in heavy maintenance, list them?", "list of ent doctors", "is the hospital open on monday?"]) ok(`never touched: ${q}`, resolveDepartmentWords(q) === null);

console.log(`departmentWords selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
