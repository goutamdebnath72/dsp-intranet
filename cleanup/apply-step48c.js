// cleanup/apply-step48c.js
//
// Edits ONE existing file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 48c: Town Administration (TA Building) is its six sections.
//   The owner: TOWNSHIP MAINTENANCE (650), S E TOWNSHIP MAINTENANCE (4001), ESTATE & TOWNSHIP BRANCH (108), TOWN SERV- B&R/PHM (4301), TOWN SERV-ELECT MAINT. (4102) and TOWN SERVICES (TECH) (10870)
//   are separate sections of ONE department. "town administration", "town admin", "ta building" and "ta bldg" now mean all six (ESTATE-ACCOUNTS is not one of them).
//   A-Zone / B-Zone Maintenance are NOT mapped: the data has no zone rows, so a count for one zone would silently be the count for all of Town Administration.
//   departmentAliases.ts is edited IN PLACE (your alias file); the test departmentAliases.selftest.ts is replaced (178 checks).
// Run step 45a first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step48c.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/departmentAliases.ts",
  "marker": "stems: [\"town serv\"]",
  "old": "  { name: \"TOWN ADMINISTRATION (TA BUILDING)\", aliases: [\"town administration\", \"ta building\", \"ta bldg\"], prefixes: [\"township maintenance\"] },\n",
  "new": "  { name: \"TOWN ADMINISTRATION (TA BUILDING)\", aliases: [\"town administration\", \"town admin\", \"ta building\", \"ta bldg\"], prefixes: [\"township maintenance\", \"s e township maintenance\", \"estate and township branch\"], stems: [\"town serv\"] },\n"
 },
 {
  "file": "src/lib/nl2sql/departmentAliases.ts",
  "marker": "are sections of Town Administration (its six rows were filled in",
  "old": "//   - A-Zone Maintenance and B-Zone Maintenance (part of Town Administration): which HR row(s)?\n",
  "new": "//   - A-Zone Maintenance and B-Zone Maintenance are sections of Town Administration (its six rows were filled in on 24 Oct 2026) but have no row of their own: the words are NOT mapped,\n//     because a count for one zone would silently be the count for all of Town Administration.\n"
 }
];
const CHECKS = [
 {
 "marker": "Town Administration (TA Building) means its six sections",
 "line": "{ grep -q \"estate and township branch\" src/lib/nl2sql/departmentAliases.ts; } 2>/dev/null; report \"Town Administration (TA Building) means its six sections\" $?"
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

if (!fs.existsSync("src/lib/nl2sql/departmentAliases.ts") || !read("src/lib/nl2sql/departmentAliases.ts").includes("DEPARTMENT_GROUPS")) {
  console.error("NOT APPLIED: step 45a is not applied yet (src/lib/nl2sql/departmentAliases.ts is missing). Apply 45a first. Nothing was changed.");
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
