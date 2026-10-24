// cleanup/apply-step47b.js
//
// Edits FIVE existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 47b: a small "PhD" badge after the name, like the EXE badge.
//   Only for the NON-MEDICAL employees on the manual list of src/lib/employees/honorific.ts (DR_TICKETS); a doctor has the "Dr." before the name and the designation under it and needs no badge.
//   The badge is a badge and not text added to the name, so the name stays clean for Copy, the table, the CSV and the sort order.
//   New (in the zip): src/components/PersonBadges.tsx (EXE as before, PhD new), PersonBadges.selftest.tsx (8 checks), honorific.selftest.ts (replaced: 39 checks)
//   honorific.ts   edited IN PLACE (a new helper after titleFor): THE LIST OF TICKETS IS NEVER TOUCHED, so the tickets you add by hand are safe
//   employeeSearch.ts, rosterQuery.ts, omnibar.ts   the three places that build a person set the flag (nothing is sent for everybody else)
//   OmnibarModal.tsx   the card uses PersonBadges (the EXE markup is unchanged)
// Run step 47a first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step47b.js

const fs = require("fs");
// step 48b builds on this step and changes lines of employeeSearch.ts, rosterQuery.ts and omnibar.ts that this step checks: after it, this step has nothing left to do
try {
  if (fs.readFileSync("src/lib/search/employeeSearch.ts", "utf8").includes("isDoctorPerson")) {
    console.log("Nothing to do: already applied (step 48b builds on this step and has changed lines it checks).");
    process.exit(0);
  }
} catch (e) { /* no such file: the checks below say so */ }
const EDITS = [
 {
  "file": "src/lib/employees/honorific.ts",
  "marker": "export function makePhdHolder",
  "old": "export const titleFor = makeTitleFor(DR_TICKETS);\n",
  "new": "export const titleFor = makeTitleFor(DR_TICKETS);\n\n/** The small \"PhD\" badge on the card: only the people on the manual list (a non-medical employee with a PhD). A doctor has the title already and needs no badge. */\nexport function makePhdHolder(tickets: readonly string[]) {\n  const listed = new Set(tickets.map((t) => String(t).trim()));\n  return (ticketNo: unknown, track: unknown): boolean => track !== \"medical\" && listed.has(String(ticketNo ?? \"\").trim());\n}\nexport const isPhdHolder = makePhdHolder(DR_TICKETS);\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "import { isPhdHolder, stripDoctorTitle, titleFor }",
  "old": "import { stripDoctorTitle, titleFor } from \"@/lib/employees/honorific\";\n",
  "new": "import { isPhdHolder, stripDoctorTitle, titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "  phd?: boolean;",
  "old": "  title?: string | null;\n  department: string | null;\n",
  "new": "  title?: string | null;\n  /** The small \"PhD\" badge: a non-medical employee on the manual list (employees/honorific.ts). */\n  phd?: boolean;\n  department: string | null;\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "phd: isPhdHolder(ticket, r.designation_track) || undefined,",
  "old": "    title: titleFor(ticket, r.designation_track),\n",
  "new": "    title: titleFor(ticket, r.designation_track),\n    phd: isPhdHolder(ticket, r.designation_track) || undefined,\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "import { isPhdHolder, titleFor }",
  "old": "import { titleFor } from \"@/lib/employees/honorific\";\n",
  "new": "import { isPhdHolder, titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "phd: isPhdHolder(ticket, r.designation_track) || undefined,",
  "old": "    title: titleFor(ticket, r.designation_track),\n",
  "new": "    title: titleFor(ticket, r.designation_track),\n    phd: isPhdHolder(ticket, r.designation_track) || undefined,\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "import { isPhdHolder, titleFor, withTitlesInRows }",
  "old": "import { titleFor, withTitlesInRows } from \"@/lib/employees/honorific\";\n",
  "new": "import { isPhdHolder, titleFor, withTitlesInRows } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "phd: isPhdHolder(r.ticket_no, r.designation_track) || undefined,",
  "old": "    title: titleFor(r.ticket_no, r.designation_track),\n",
  "new": "    title: titleFor(r.ticket_no, r.designation_track),\n    phd: isPhdHolder(r.ticket_no, r.designation_track) || undefined,\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "import { PersonBadges } from \"@/components/PersonBadges\";",
  "old": "import { withTitle } from \"@/lib/employees/honorific\";\n",
  "new": "import { withTitle } from \"@/lib/employees/honorific\";\nimport { PersonBadges } from \"@/components/PersonBadges\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "<PersonBadges isExecutive={emp.isExecutive} phd={emp.phd} />",
  "old": "          {emp.isExecutive && (\n            <span className=\"ml-2 align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700\">\n              EXE\n            </span>\n          )}\n",
  "new": "          <PersonBadges isExecutive={emp.isExecutive} phd={emp.phd} />\n"
 }
];
const CHECKS = [
 {
 "marker": "A small PhD badge after the name of the listed non-medical PhD holders (doctors have Dr. only)",
 "line": "{ grep -q \"PersonBadges\" src/components/OmnibarModal.tsx && grep -q \"isPhdHolder\" src/lib/employees/honorific.ts && test -f src/components/PersonBadges.tsx; } 2>/dev/null; report \"A small PhD badge after the name of the listed non-medical PhD holders (doctors have Dr. only)\" $?"
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

if (!fs.existsSync("src/components/PersonBadges.tsx")) {
  console.error("NOT APPLIED: src/components/PersonBadges.tsx is not there. Unzip patch_step47b.zip first. Nothing was changed.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/employees/honorific.ts") || !read("src/lib/employees/honorific.ts").includes("makeTitleFor")) {
  console.error("NOT APPLIED: step 47a is not applied yet (src/lib/employees/honorific.ts is missing). Apply 47a first. Nothing was changed.");
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
