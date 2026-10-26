#!/usr/bin/env node
// cleanup/apply-step56a.js -- Step 56a: "list of DNB doctors" is answered from the hospital's staff list, and a question that names a qualification gets one extra rule for the model.
// One existing file changes in place (src/lib/nl2sql/prompt.ts, two lines: the import and the hook); everything else of the patch is a replaced or new file (unzip).
// Each change is checked on its own (already there: skipped; missing: made; place not recognised: nothing is written). Safe to run again.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/lib/nl2sql/medicalCadre.ts"];
const EDITS = {
 "src/lib/nl2sql/prompt.ts": [
  [
   "import { DOCTOR_DOC, isDoctorQuestion } from \"./medicalCadre\";",
   "import { DOCTOR_DOC, QUALIFICATION_DOC, isDoctorQuestion, isQualificationQuestion } from \"./medicalCadre\";",
   "QUALIFICATION_DOC, isDoctorQuestion, isQualificationQuestion"
  ],
  [
   "  if (isDoctorQuestion(input.question)) parts.push(DOCTOR_DOC);\n",
   "  if (isDoctorQuestion(input.question)) parts.push(DOCTOR_DOC);\n  if (isQualificationQuestion(input.question)) parts.push(QUALIFICATION_DOC); // \"DNB doctors\" is not \"doctors\": only for a question that names a qualification (step 56a)\n",
   "parts.push(QUALIFICATION_DOC)"
  ]
 ]
};
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of NEEDS) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const plan = [];
let todo = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) refuse("cannot find " + file + " (run this from the project root)");
  const src = fs.readFileSync(p, "utf8");
  const make = [];
  for (const [from, to, marker, optional] of edits) {
    if (src.includes(marker)) continue; // already there
    if (src.split(from).length === 2) { make.push([from, to]); continue; }
    if (optional) continue; // a place that only exists in some trees
    refuse(file + " differs from what I expect (a place to change is not there exactly once: " + JSON.stringify(from.slice(0, 70)) + ")");
  }
  todo += make.length;
  plan.push([p, src, make]);
}
if (!todo) { console.log("Nothing to do: step 56a is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 56a (" + todo + " changes in " + files + " files).");
