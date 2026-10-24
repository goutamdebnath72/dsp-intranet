// cleanup/apply-step46a.js
//
// Edits TWO existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 46a: doctors and non-medical executives.
//   The owner: the main hospital (M&HS) has two cadres of executives with PARALLEL designations. Checked on the live data (63 executives): 40 on the medical track (Director(M&HS) 1, Joint Director 11,
//   Sr. Deputy Director 13, Asst. Director/Sr. Consultant 4, DMO/Consultant 3, ADMO/Specialist 1, Medical Officer 7) and 23 managerial; "Dr" at the start of a name: 0 of 63, so the title is not in the data.
//   New (in the zip): src/lib/nl2sql/medicalCadre.ts   the first line of a people list gets the split ("63 people found: 40 doctors and 23 non-medical."), only when the WHOLE list is loaded and every
//                     person's track is known; DOCTOR_DOC: a rule for the search model, added ONLY to a doctor question's prompt (doctors are found by designation_track, never by name)
//                     src/lib/nl2sql/medicalCadre.selftest.ts   38 checks with the real numbers
//   omnibar.ts        the people query also reads the designation track (dg.track), the person carries it, and the headline is built by peopleHeadline
//   prompt.ts         one import and one line: the doctor rule for doctor questions
// Run step 45a first (the test uses the saved copy of the real departments).
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step46a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "from \"./medicalCadre\"",
  "old": "import { comparisonVerdict } from \"./rankingCheck\";\n",
  "new": "import { comparisonVerdict } from \"./rankingCheck\";\nimport { peopleHeadline } from \"./medicalCadre\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "dg.track AS designation_track",
  "old": "dg.title AS designation_title, sd.name AS dept_name,",
  "new": "dg.title AS designation_title, dg.track AS designation_track, sd.name AS dept_name,"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "designationTrack: r.designation_track || null,",
  "old": "    designation: r.designation_title || null,\n",
  "new": "    designation: r.designation_title || null,\n    designationTrack: r.designation_track || null,\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "peopleHeadline(total, truncated, people)",
  "old": "      answer: verdictText ?? `${total.toLocaleString()} ${total === 1 ? \"person\" : \"people\"} found.`,\n",
  "new": "      answer: verdictText ?? peopleHeadline(total, truncated, people),\n"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "from \"./medicalCadre\"",
  "old": "import { vocabularyLine } from \"./vocabulary\";\n",
  "new": "import { vocabularyLine } from \"./vocabulary\";\nimport { DOCTOR_DOC, isDoctorQuestion } from \"./medicalCadre\";\n"
 },
 {
  "file": "src/lib/nl2sql/prompt.ts",
  "marker": "isDoctorQuestion(input.question)",
  "old": "  if (isOriginQuestion(input.question)) parts.push(ORIGIN_DOC);\n",
  "new": "  if (isOriginQuestion(input.question)) parts.push(ORIGIN_DOC);\n  if (isDoctorQuestion(input.question)) parts.push(DOCTOR_DOC);\n"
 }
];
const CHECKS = [
 {
 "marker": "Doctors and non-medical executives: the split in the first line, the doctor rule for the search model",
 "line": "{ grep -q \"peopleHeadline\" src/lib/nl2sql/omnibar.ts && grep -q \"isDoctorQuestion\" src/lib/nl2sql/prompt.ts && test -f src/lib/nl2sql/medicalCadre.ts; } 2>/dev/null; report \"Doctors and non-medical executives: the split in the first line, the doctor rule for the search model\" $?"
}
];
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

if (!fs.existsSync("src/lib/nl2sql/medicalCadre.ts") || !read("src/lib/nl2sql/medicalCadre.ts").includes("peopleHeadline")) {
  console.error("NOT APPLIED: src/lib/nl2sql/medicalCadre.ts is not there. Unzip patch_step46a.zip first. Nothing was changed.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/nl2sql/__fixtures__/departments.real.json")) {
  console.error("NOT APPLIED: step 45a is not applied yet (the saved copy of the real departments is missing). Apply 45a first. Nothing was changed.");
  process.exit(1);
}

const plan = [];
const byFile = new Map();
for (const e of EDITS) byFile.set(e.file, byFile.get(e.file) ?? read(e.file));
for (const e of EDITS) {
  let text = byFile.get(e.file);
  if (text.includes(e.marker)) { console.log(`already  ${e.file}  (${e.marker.slice(0, 48).replace(/\n/g, " ")}...)`); continue; }
  const n = countOf(text, e.old);
  if (n !== 1) {
    console.error(`NOT APPLIED: ${e.file} does not contain the expected code exactly once (found ${n}: ${JSON.stringify(e.old.slice(0, 70))}). Nothing was changed. This file differs from the one the patch was made for: send it to me.`);
    process.exit(1);
  }
  text = text.replace(e.old, () => e.new);
  byFile.set(e.file, text);
  plan.push(e.file);
}

let cf = read(CF);
const ANCHOR = '\necho\nif [ "$bad" -eq 0 ]';
const missingChecks = CHECKS.filter((c) => !cf.includes(c.marker));
if (missingChecks.length) {
  const first = cf.indexOf(ANCHOR);
  if (first === -1 || cf.indexOf(ANCHOR, first + 1) !== -1) {
    console.error(`NOT APPLIED: ${CF} does not have the expected ending. Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Restart npm run dev." : "Nothing to do: already applied.");
