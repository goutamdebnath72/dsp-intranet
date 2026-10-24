// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/medicalCadre.selftest.ts
// Doctors and non-medical executives: the split in the first line of a people list (the real numbers of the main hospital: 40 and 23), and the rule that only a doctor question
// puts in the search model's prompt.

import real from "./__fixtures__/departments.real.json";
import { DOCTOR_DOC, isDoctorQuestion, peopleHeadline } from "./medicalCadre";
import { buildPrompt } from "./prompt";
import { guardSql } from "./guard";
import type { DepartmentRow } from "./context";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const some = (n: number, track: string | null) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, designationTrack: track, isDoctor: track === "medical" ? true : undefined }));
// a doctor whose designation is a managerial one (flagged in the roster): the track says managerial, the person says doctor
const flagged = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `F${i}`, designationTrack: "managerial", isDoctor: true }));

// ---- the first line of the list
eq("the real main hospital: 40 doctors and 23 non-medical", peopleHeadline(63, false, [...some(40, "medical"), ...some(23, "managerial")]), "63 people found: 40 doctors and 23 non-medical.");
eq("the order of the people does not matter", peopleHeadline(63, false, [...some(23, "managerial"), ...some(40, "medical")]), "63 people found: 40 doctors and 23 non-medical.");
eq("one doctor", peopleHeadline(23, false, [...some(1, "medical"), ...some(22, "managerial")]), "23 people found: 1 doctor and 22 non-medical.");
eq("one non-medical person", peopleHeadline(8, false, [...some(7, "medical"), ...some(1, "managerial")]), "8 people found: 7 doctors and 1 non-medical.");
eq("only doctors: no split", peopleHeadline(7, false, some(7, "medical")), "7 people found.");
eq("no doctor: no split", peopleHeadline(16, false, some(16, "managerial")), "16 people found.");
eq("a list that is only partly loaded gets no split (it would count only what is on screen)", peopleHeadline(1169, true, [...some(50, "medical"), ...some(50, "managerial")]), "1,169 people found.");
eq("a list whose people are fewer than the total gets no split", peopleHeadline(63, false, [...some(20, "medical"), ...some(23, "managerial")]), "63 people found.");
eq("one person with no known track: no split (not sure)", peopleHeadline(63, false, [...some(40, "medical"), ...some(22, "managerial"), ...some(1, null)]), "63 people found.");
eq("people without the field at all (the older engine): no split", peopleHeadline(2, false, [{ name: "A" }, { name: "B" }]), "2 people found.");
eq("one person", peopleHeadline(1, false, some(1, "medical")), "1 person found.");
eq("nobody", peopleHeadline(0, false, []), "0 people found.");
eq("no list", peopleHeadline(5, false, null), "5 people found.");

// ---- step 48b: doctors flagged in the roster (a managerial designation, but a doctor) are counted as doctors
eq("the live case after the change: 39 medical-track + 6 flagged = 45 doctors, 17 non-medical", peopleHeadline(62, false, [...some(39, "medical"), ...flagged(6), ...some(17, "managerial")]), "62 people found: 45 doctors and 17 non-medical.");
eq("only flagged doctors and non-medical people: still a split", peopleHeadline(8, false, [...flagged(2), ...some(6, "managerial")]), "8 people found: 2 doctors and 6 non-medical.");
eq("a list of flagged doctors only: no split", peopleHeadline(3, false, flagged(3)), "3 people found.");

// ---- which questions are about doctors
for (const q of ["how many doctors are there in M&HS", "list non-medical executives in main hospital", "list the non medical executives in M&HS", "executives who are not doctors", "how many physicians are there", "show the medical staff of the hospital", "list all doctor in the plant", "nonmedical executives in main hospital"]) ok(`a doctor question: ${q}`, isDoctorQuestion(q));
for (const q of ["how many executives are there in main hospital, list them?", "list the medical officers", "how many executives work in each section of C&IT", "who is more senior, Mohd Anwar Ullah or Rana Saha", "how many GMs are there", "which designation has the most executives", "list the employees whose name has kumar as a word"]) ok(`an ordinary question is not: ${q}`, !isDoctorQuestion(q));

// ---- the prompt: the rule only for doctor questions
const context = { designations: [], departments: [] } as never;
const withDoc = buildPrompt({ question: "how many doctors are there in main hospital", context, examples: [] });
const without = buildPrompt({ question: "how many executives are there in main hospital", context, examples: [] });
ok("a doctor question's prompt holds the rule", withDoc.includes("is_doctor") && /NOT is_doctor/.test(withDoc) && /never by designation_track alone/.test(withDoc), withDoc.slice(0, 80));
ok("...and says that a doctor is never found by name", /NEVER find a doctor by name/.test(withDoc));
ok("an ordinary question's prompt does not hold it (no cost)", !without.includes("DOCTORS AND NON-MEDICAL"));
ok("the extra text is modest (under 2200 characters), only for those questions", withDoc.length - without.length > 400 && withDoc.length - without.length < 2200, `${withDoc.length - without.length}`);
const real300 = real as DepartmentRow[];
const big = buildPrompt({ question: "how many doctors are there in main hospital, list them", context: { designations: [], departments: real300 } as never, examples: [] });
ok("with the 300 real departments, a doctor question about the main hospital stays within the prompt budget (under 17,000 characters, 1,500 spare for the live designations)", big.length < 17000, `${big.length} chars`);
ok("...and names the six hospital ids", /department_id IN \(([0-9]+, ){5}[0-9]+\)/.test(big));

// ---- the SQL the rule teaches passes the real guard
for (const sql of [
  "SELECT designation, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND designation_track = 'medical' GROUP BY designation, rank_order ORDER BY rank_order",
  "SELECT designation_track, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) GROUP BY designation_track",
  "SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND is_doctor AND department_id IN (1, 89, 126, 135, 161, 180)",
  "SELECT is_doctor, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (1, 89, 126, 135, 161, 180) GROUP BY is_doctor",
  "SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE cohort = 'executive' AND designation_track = 'managerial' AND department_id IN (1, 89, 126, 135, 161, 180) ORDER BY global_seniority_rank",
]) ok(`the guard accepts: ${sql.slice(0, 70)}...`, guardSql(sql).ok);
ok("the doctor rule is one block of text that names no person", DOCTOR_DOC.length > 400 && !/[A-Z][a-z]+ [A-Z][a-z]+ (Das|Roy|Sharma)/.test(DOCTOR_DOC));

console.log(`medicalCadre selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
