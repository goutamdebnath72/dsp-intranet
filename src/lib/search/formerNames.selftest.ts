// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/formerNames.selftest.ts
// Step 59a: a question that uses a FORMER name of a department is answered with the CURRENT name first (owner, 26 Oct 2026: Training Department -> CHRD -> Centre for L & D (CL&D)).

import { RENAMED, formerNameNotice } from "./formerNames";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const CURRENT = "Centre for L & D (CL&D)";

// ---- the old names show the notice, in any kind of question
const chrd = ["list of employees in chrd", "CHRD", "C.H.R.D. employees", "c h r d staff", "circular of chrd", "chrd office staff", "how many executives are in CHRD?", "where is the chrd library", "chrd's contact number"];
for (const q of chrd) ok(`CHRD: "${q}"`, formerNameNotice(q)?.sentence === `“CHRD” is now called ${CURRENT}.`, JSON.stringify(formerNameNotice(q)));
const training = ["who are the executives of the Training Department", "training dept staff", "how many people work in training deptt.", "executives in the training department?", "Training Department phone numbers", "TRAINING DEPARTMENT"];
for (const q of training) ok(`Training Department: "${q}"`, formerNameNotice(q)?.sentence === `“Training Department” is now called ${CURRENT}.`, JSON.stringify(formerNameNotice(q)));
ok("the confirmed full form of CHRD shows the notice, quoted as typed (Centre or Center)", formerNameNotice("centre for human resource development staff")?.sentence === `“Centre for Human Resource Development” is now called ${CURRENT}.` && formerNameNotice("list the employees of the Center for Human Resource Development")?.used === "Centre for Human Resource Development");
ok("'Centre for HRD' is not used at the plant: no notice", formerNameNotice("centre for hrd") === null && formerNameNotice("center for hrd staff") === null);
ok("the full form of the CURRENT name (Learning and Development, confirmed by the HOD) is not a former name: no notice", formerNameNotice("centre for learning and development") === null && formerNameNotice("learning and development") === null);
ok("the small line under it is the history, oldest first: Training Department → CHRD → Centre for L & D (CL&D)", formerNameNotice("chrd")?.history === `Training Department → CHRD → ${CURRENT}`);
ok("when a question has both, the one written FIRST is quoted", formerNameNotice("training department now chrd")?.used === "Training Department" && formerNameNotice("chrd or training department")?.used === "CHRD");

// ---- the current name, the department's own name and other words need no notice
const none = ["list of employees in cl&d", "cl & d staff", "list of employees in l & d", "centre for l&d", "centre for learning and development", "how many employees in c&it", "training schedule circular", "department of training", "training room booking", "human resource development policy", "human resource development", "centre for learning and development", "", "   "];
for (const q of none) ok(`no notice: "${q}"`, formerNameNotice(q) === null, JSON.stringify(formerNameNotice(q)));
ok("a missing question gives nothing, never an error", formerNameNotice(undefined as never) === null && formerNameNotice(null as never) === null);

// ---- another plant's CHRD is not the Durgapur department that was renamed
for (const q of ["bsp chrd", "bhilai chrd employees", "chrd bokaro", "sail chrd ranchi", "chrd rourkela", "corporate chrd", "iisco chrd burnpur"]) ok(`another plant: "${q}" has no notice`, formerNameNotice(q) === null, JSON.stringify(formerNameNotice(q)));

// ---- the table
ok("the table has the department once, with its current name and a history that ends with it", RENAMED.length === 1 && RENAMED[0].current === CURRENT && RENAMED[0].history[RENAMED[0].history.length - 1] === CURRENT && RENAMED[0].history[0] === "Training Department");
ok("the current name is NOT among the former names (it would warn about itself)", RENAMED.every((r) => r.former.every((f) => !f.re.test(r.current.toLowerCase()))));
console.log(`formerNames selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
