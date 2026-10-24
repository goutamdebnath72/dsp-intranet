// cleanup/apply-step47a.js
//
// Edits FIVE existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 47a: "Dr." before a doctor's name, when it is shown.
//   The stored names have no title (none of the main hospital's 63 executives starts with Dr) and must stay plain: the name search (first word, surname, phonetic codes, alphabetical order) works
//   on the plain name. So the title is added only at display, by ONE rule in src/lib/employees/honorific.ts: every person on the medical track of the designation table, plus the tickets listed in
//   DR_TICKETS (non-medical employees with a PhD who write Dr.; the list starts empty: the owner finds them with SQL and sends the tickets).
//   New (in the zip): cleanup/honorific.initial.txt (the template of src/lib/employees/honorific.ts, copied ONLY IF that file is missing: your list of tickets is never overwritten), honorific.selftest.ts (35 checks incl. the real queries on a scratch database)
//   employeeSearch.ts (the live directory search: title on every person, a typed "Dr." is ignored in a name search), rosterQuery.ts (the older rule-based engine), omnibar.ts (the model's answer: the card
//   and the table/CSV rows), OmnibarModal.tsx (the card shows and copies "Dr. NAME"), medicalCadre.ts (the search model is told that a typed Dr. is a title, not a name word)
// Run step 46a first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step47a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "from \"@/lib/employees/honorific\"",
  "old": "import { DataSource } from \"typeorm\";\n",
  "new": "import { DataSource } from \"typeorm\";\nimport { stripDoctorTitle, titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "  /** Dr. before the name when it is shown",
  "old": "  designation: string | null;\n  department: string | null;\n",
  "new": "  designation: string | null;\n  /** Dr. before the name when it is shown: every medical-track doctor and the listed PhD holders (employees/honorific.ts). The stored name has no title. */\n  title?: string | null;\n  department: string | null;\n"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "title: titleFor(ticket, r.designation_track),",
  "old": "    department: r.dept_name || null,\n    mobileMasked: maskMobile(r.contactNo || null),",
  "new": "    department: r.dept_name || null,\n    title: titleFor(ticket, r.designation_track),\n    mobileMasked: maskMobile(r.contactNo || null),"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "AS designation_track\n`;",
  "old": "  u.designation, u.\"contactNo\" AS \"contactNo\", u.email,\n  d.name AS dept_name\n`;",
  "new": "  u.designation, u.\"contactNo\" AS \"contactNo\", u.email,\n  d.name AS dept_name,\n  (SELECT dg.track FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE er.ticket_no = u.\"ticketNo\" LIMIT 1) AS designation_track\n`;"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "dg.track AS designation_track,\n      (er.name ILIKE $2)",
  "old": "      sd.name AS dept_name,\n      (er.name ILIKE $2) AS literal_hit,",
  "new": "      sd.name AS dept_name, dg.track AS designation_track,\n      (er.name ILIKE $2) AS literal_hit,"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "const q = stripDoctorTitle((raw || \"\")",
  "old": "  const q = (raw || \"\").trim().replace(/\\s+/g, \" \");\n  if (q.length < 2) return [];\n\n  const like",
  "new": "  const q = stripDoctorTitle((raw || \"\").trim()).replace(/\\s+/g, \" \"); // a typed \"Dr.\" is a title, not a word of the stored name\n  if (q.length < 2) return [];\n\n  const like"
 },
 {
  "file": "src/lib/search/employeeSearch.ts",
  "marker": "const q = stripDoctorTitle((fragment || \"\")",
  "old": "  const q = (fragment || \"\").trim().replace(/\\s+/g, \" \");\n",
  "new": "  const q = stripDoctorTitle((fragment || \"\").trim()).replace(/\\s+/g, \" \");\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "from \"@/lib/employees/honorific\"",
  "old": "import type { EmployeeResult } from \"@/lib/search/employeeSearch\";\n",
  "new": "import type { EmployeeResult } from \"@/lib/search/employeeSearch\";\nimport { titleFor } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "dg.track AS designation_track,\n  sd.name AS dept_name,",
  "old": "  dg.title AS designation_title,\n  sd.name AS dept_name,\n",
  "new": "  dg.title AS designation_title,\n  dg.track AS designation_track,\n  sd.name AS dept_name,\n"
 },
 {
  "file": "src/lib/employees/rosterQuery.ts",
  "marker": "title: titleFor(ticket, r.designation_track),",
  "old": "    designation: r.designation_title || null,\n    department: r.dept_name || null,\n",
  "new": "    designation: r.designation_title || null,\n    department: r.dept_name || null,\n    title: titleFor(ticket, r.designation_track),\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "from \"@/lib/employees/honorific\"",
  "old": "import { peopleHeadline } from \"./medicalCadre\";\n",
  "new": "import { peopleHeadline } from \"./medicalCadre\";\nimport { titleFor, withTitlesInRows } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "title: titleFor(r.ticket_no, r.designation_track),",
  "old": "    designationTrack: r.designation_track || null,\n",
  "new": "    designationTrack: r.designation_track || null,\n    title: titleFor(r.ticket_no, r.designation_track),\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "const rows = withTitlesInRows(presented.rows, people);",
  "old": "  const { columns, rows } = presentPeople(res.data.columns, rawRows, people);\n",
  "new": "  const presented = presentPeople(res.data.columns, rawRows, people);\n  const columns = presented.columns;\n  // a doctor's name is shown with \"Dr.\" before it (the stored name has none): in the table and the CSV as well as on the card\n  const rows = withTitlesInRows(presented.rows, people);\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "from \"@/lib/employees/honorific\"",
  "old": "import { tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\n",
  "new": "import { tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\nimport { withTitle } from \"@/lib/employees/honorific\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "{withTitle(emp.name, emp.title)}\n          {emp.isExecutive",
  "old": "          {emp.name}\n          {emp.isExecutive && (",
  "new": "          {withTitle(emp.name, emp.title)}\n          {emp.isExecutive && ("
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "        withTitle(emp.name, emp.title),\n        emp.ticketNo,",
  "old": "        emp.name,\n        emp.ticketNo,",
  "new": "        withTitle(emp.name, emp.title),\n        emp.ticketNo,"
 },
 {
  "file": "src/lib/nl2sql/medicalCadre.ts",
  "marker": "|| /\\bdr\\b\\.?\\s*[a-z]/i.test(q || \"\")",
  "old": "export const isDoctorQuestion = (q: string): boolean =>\n  /\\b(doctors?|physicians?|non[- ]?medical|not (?:a )?doctors?|medical (?:staff|executives?|cadre))\\b/i.test(q || \"\");\n",
  "new": "export const isDoctorQuestion = (q: string): boolean =>\n  /\\b(doctors?|physicians?|non[- ]?medical|not (?:a )?doctors?|medical (?:staff|executives?|cadre))\\b/i.test(q || \"\") || /\\bdr\\b\\.?\\s*[a-z]/i.test(q || \"\");\n"
 },
 {
  "file": "src/lib/nl2sql/medicalCadre.ts",
  "marker": "names are stored WITHOUT it",
  "old": "  \"doctors\" alone means every doctor of the plant",
  "new": "  A \"Dr\" or \"Dr.\" before a name is a TITLE added on the screen: names are stored WITHOUT it. Leave it out when matching a name (\"Dr. Anil Kumar\" means the name \"Anil Kumar\") and do not add designation_track unless the question asks for doctors.\n  \"doctors\" alone means every doctor of the plant"
 }
];
const CHECKS = [
 {
 "marker": "Dr. before a doctor's name when it is shown (stored names stay plain)",
 "line": "{ grep -q \"titleFor\" src/lib/employees/rosterQuery.ts && grep -q \"withTitle\" src/components/OmnibarModal.tsx && grep -q \"stripDoctorTitle\" src/lib/search/employeeSearch.ts && grep -q \"stored WITHOUT it\" src/lib/nl2sql/medicalCadre.ts && test -f src/lib/employees/honorific.ts; } 2>/dev/null; report \"Dr. before a doctor's name when it is shown (stored names stay plain)\" $?"
}
];
// step 47b builds on this step and rewrites one of the lines it edits in OmnibarModal.tsx: after it, the other edits of this step are in place and there is nothing left to do.
// The one thing that can be lost is the edit of medicalCadre.ts (unzipping step 46a again puts back that step's own copy): this repairs exactly that.
try {
  if (fs.readFileSync("src/components/OmnibarModal.tsx", "utf8").includes('from "@/components/PersonBadges"')) {
    const mc = "src/lib/nl2sql/medicalCadre.ts";
    let text = fs.readFileSync(mc, "utf8");
    const missing = EDITS.filter((e) => e.file === mc && !text.includes(e.marker));
    if (!missing.length) {
      console.log("Nothing to do: already applied (step 47b builds on this step and has replaced a line it edited).");
      process.exit(0);
    }
    if (missing.some((e) => text.split(e.old).length - 1 !== 1)) {
      console.error("NOT APPLIED: " + mc + " is not the file step 47a was made for. Nothing was changed. Send it to me.");
      process.exit(1);
    }
    for (const e of missing) text = text.replace(e.old, () => e.new);
    fs.writeFileSync(mc, text);
    console.log("Repaired: " + mc + " had lost the edit of step 47a (an older step was unzipped again). Restart npm run dev.");
    process.exit(0);
  }
} catch (e) { /* no such file: the checks below say so */ }

const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

// The list of Dr. tickets lives in src/lib/employees/honorific.ts and is MAINTAINED BY HAND: the zip carries only a template of it (cleanup/honorific.initial.txt), copied ONLY IF the file
// does not exist yet, so no unzip and no script can ever overwrite the tickets you add.
const HONORIFIC = "src/lib/employees/honorific.ts";
const HONORIFIC_TEMPLATE = "cleanup/honorific.initial.txt";
if (!(fs.existsSync(HONORIFIC) && read(HONORIFIC).includes("DR_TICKETS")) && !fs.existsSync(HONORIFIC_TEMPLATE)) {
  console.error("NOT APPLIED: cleanup/honorific.initial.txt is not there. Unzip patch_step47a.zip first. Nothing was changed.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/nl2sql/medicalCadre.ts")) {
  console.error("NOT APPLIED: step 46a is not applied yet (src/lib/nl2sql/medicalCadre.ts is missing). Apply 46a first. Nothing was changed.");
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
if (!fs.existsSync(HONORIFIC)) {
  fs.copyFileSync(HONORIFIC_TEMPLATE, HONORIFIC);
  changed++;
  console.log(`created  ${HONORIFIC}  (your list of Dr. tickets: no patch overwrites it from now on)`);
}
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Restart npm run dev." : "Nothing to do: already applied.");
