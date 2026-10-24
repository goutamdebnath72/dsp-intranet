// cleanup/apply-step48b.js
//
// Edits FOUR existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 48b: doctors whose designation is a managerial one.
//   The owner: ARGHYA DAS (490041) is an eye specialist but his designation is Sr. Manager (managerial track): the app counted him as non-medical and showed no "Dr."; the designation must NOT be touched.
//   The owner also named 490178..490182 (PRIYANK SAHOO, SOUMYARUPA MAJEE, DIPAK SINGH, ISHITA KONAR, CHETAN), doctors of different disciplines. Six people, flagged in the DATABASE (roster column
//   doctor_override, view column nlq.employees.is_doctor) so that the "Dr.", the "40 doctors" split AND the counts of the search model ("how many doctors") all agree.
//   RUN THE SQL FIRST (cleanup/sql/48b_doctor_flag_live.sql, one section at a time in the Supabase SQL editor). The code also works before it (the new column is read in a way that gives NULL when it
//   does not exist yet), but the model's doctor questions need the view column is_doctor.
//   New (in the zip): cleanup/sql/48b_doctor_flag_live.sql, src/lib/nl2sql/sql/11_doctor_flag.sql (the structure alone, for a rebuilt database), medicalCadre.ts (replaced: the split counts the people the
//                     roster says are doctors; the rule for the model says is_doctor), medicalCadre.selftest.ts and honorific.selftest.ts (replaced)
//   honorific.ts   edited IN PLACE (the titles take the flag): THE LIST OF TICKETS IS NEVER TOUCHED
//   omnibar.ts, rosterQuery.ts, employeeSearch.ts   the three places that build a person read the flag and set isDoctor, the title and the PhD badge from it
// Run step 47b first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step48b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/employees/honorific.ts",
  "marker": "isDoctor?: unknown): Title | null",
  "old": "  return (ticketNo: unknown, track: unknown): Title | null => (track === \"medical\" || extra.has(String(ticketNo ?? \"\").trim()) ? \"Dr.\" : null);\n",
  "new": "  // a doctor is on the medical track OR flagged in the roster (doctor_override: a doctor whose designation is a managerial one); a listed PhD holder is the third way\n  return (ticketNo: unknown, track: unknown, isDoctor?: unknown): Title | null =>\n    track === \"medical\" || isDoctor === true || extra.has(String(ticketNo ?? \"\").trim()) ? \"Dr.\" : null;\n"
 },
 {
  "file": "src/lib/employees/honorific.ts",
  "marker": "isDoctor?: unknown): boolean => track !== \"medical\" && isDoctor !== true",
  "old": "  return (ticketNo: unknown, track: unknown): boolean => track !== \"medical\" && listed.has(String(ticketNo ?? \"\").trim());\n",
  "new": "  return (ticketNo: unknown, track: unknown, isDoctor?: unknown): boolean => track !== \"medical\" && isDoctor !== true && listed.has(String(ticketNo ?? \"\").trim());\n"
 },
 {
  "file": "src/lib/employees/honorific.ts",
  "marker": "export const isDoctorPerson",
  "old": "export const isPhdHolder = makePhdHolder(DR_TICKETS);\n",
  "new": "export const isPhdHolder = makePhdHolder(DR_TICKETS);\n\n/** Is this person a doctor: on the medical track of the designation table, or flagged in the roster (doctor_override) because the designation is a managerial one although the person is a doctor. */\nexport const isDoctorPerson = (track: unknown, doctorOverride: unknown): boolean => track === \"medical\" || doctorOverride === true;\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "import { isDoctorPerson, isPhdHolder, titleFor, withTitlesInRows }",
  "old": "import { isPhdHolder, titleFor, withTitlesInRows } from \"@/lib/employees/honorific\";\n",
  "new": "import { isDoctorPerson, isPhdHolder, titleFor, withTitlesInRows } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,",
  "old": "    title: titleFor(r.ticket_no, r.designation_track),\n    phd: isPhdHolder(r.ticket_no, r.designation_track) || undefined,\n",
  "new": "    isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,\n    title: titleFor(r.ticket_no, r.designation_track, r.doctor_override),\n    phd: isPhdHolder(r.ticket_no, r.designation_track, r.doctor_override) || undefined,\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "dg.track AS designation_track, (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override,",
  "old": "dg.title AS designation_title, dg.track AS designation_track, sd.name AS dept_name,",
  "new": "dg.title AS designation_title, dg.track AS designation_track, (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override, sd.name AS dept_name,"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "import { isDoctorPerson, isPhdHolder, titleFor }",
  "old": "import { isPhdHolder, titleFor } from \"@/lib/employees/honorific\";\n",
  "new": "import { isDoctorPerson, isPhdHolder, titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,",
  "old": "    title: titleFor(ticket, r.designation_track),\n    phd: isPhdHolder(ticket, r.designation_track) || undefined,\n",
  "new": "    isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,\n    title: titleFor(ticket, r.designation_track, r.doctor_override),\n    phd: isPhdHolder(ticket, r.designation_track, r.doctor_override) || undefined,\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "  (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override,",
  "old": "  dg.track AS designation_track,\n",
  "new": "  dg.track AS designation_track,\n  (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override,\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "import { isDoctorPerson, isPhdHolder, stripDoctorTitle, titleFor }",
  "old": "import { isPhdHolder, stripDoctorTitle, titleFor } from \"@/lib/employees/honorific\";\n",
  "new": "import { isDoctorPerson, isPhdHolder, stripDoctorTitle, titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "  isDoctor?: boolean;",
  "old": "  /** The small \"PhD\" badge: a non-medical employee on the manual list (employees/honorific.ts). */\n  phd?: boolean;\n",
  "new": "  /** The small \"PhD\" badge: a non-medical employee on the manual list (employees/honorific.ts). */\n  phd?: boolean;\n  /** A doctor: the medical track, or flagged in the roster (a doctor whose designation is a managerial one). */\n  isDoctor?: boolean;\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,",
  "old": "    title: titleFor(ticket, r.designation_track),\n    phd: isPhdHolder(ticket, r.designation_track) || undefined,\n",
  "new": "    isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,\n    title: titleFor(ticket, r.designation_track, r.doctor_override),\n    phd: isPhdHolder(ticket, r.designation_track, r.doctor_override) || undefined,\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "AS doctor_override\n`;",
  "old": "LIMIT 1) AS designation_track\n`;",
  "new": "LIMIT 1) AS designation_track,\n  (SELECT (to_jsonb(er) ->> 'doctor_override')::boolean FROM public.employee_roster er WHERE er.ticket_no = u.\"ticketNo\" LIMIT 1) AS doctor_override\n`;"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "dg.track AS designation_track, (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override,\n      (er.name",
  "old": "      sd.name AS dept_name, dg.track AS designation_track,\n      (er.name",
  "new": "      sd.name AS dept_name, dg.track AS designation_track, (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override,\n      (er.name"
 }
];
const CHECKS = [
 {
 "marker": "Doctors flagged in the roster (is_doctor): Dr., the split and the model's rule, designations untouched",
 "line": "{ grep -q \"isDoctorPerson\" src/lib/employees/honorific.ts && grep -q \"doctor_override\" src/lib/nl2sql/omnibar.ts && grep -q \"doctor_override\" src/lib/employees/rosterQuery.ts && grep -q \"doctor_override\" src/lib/search/employeeSearch.ts && grep -q \"is_doctor\" src/lib/nl2sql/medicalCadre.ts; } 2>/dev/null; report \"Doctors flagged in the roster (is_doctor): Dr., the split and the model's rule, designations untouched\" $?"
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

if (!fs.existsSync("src/lib/employees/honorific.ts") || !read("src/lib/employees/honorific.ts").includes("makePhdHolder")) {
  console.error("NOT APPLIED: step 47b is not applied yet (honorific.ts has no PhD helper). Apply 47b first. Nothing was changed.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/nl2sql/medicalCadre.ts") || !read("src/lib/nl2sql/medicalCadre.ts").includes("is_doctor")) {
  console.error("NOT APPLIED: src/lib/nl2sql/medicalCadre.ts is not the new one. Unzip patch_step48b.zip first. Nothing was changed.");
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
