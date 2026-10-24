// cleanup/apply-step44d.js
//
// Edits THREE existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 44d, from the owner's screenshots of 24 Oct:
//   "how many executives are there in heavy maintenance, list them?" was answered "1,169" (DSP currently has 1,169 executives) with the executives of EVERY department: the model's attempt failed,
//   the older rule-based engine took over, dropped the department it did not know and counted the whole plant: a confident wrong answer. The older engine no longer reports an unknown department
//   (since 29 Sep, phrases like "at any position" misfired), so the gap is closed at the omnibar's door to it, narrowly: only its unscoped company-wide count, only for a question with a non-generic
//   phrase after in / at / under / within / inside / from, becomes "I could not find a department called ..., so I have not counted anyone."
//        src/lib/nl2sql/omnibar.ts (the legacy door); new src/lib/employees/unresolvedScope.ts (in the zip)
//   Heavy Maintenance (HM) is added to the large departments (its row names are NOT yet checked against the live list; a stem now also matches "heavy maintenance" and "heavy maint.").
//        src/lib/nl2sql/aliasHints.ts, context.ts
// Run step 44c first. If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step44d.js

const fs = require("fs");
// step 45a moves the part of aliasHints.ts that this step edits into departmentAliases.ts: after it, this step has nothing left to do
try {
  if (fs.readFileSync("src/lib/nl2sql/aliasHints.ts", "utf8").includes('from "./departmentAliases"')) {
    console.log("Nothing to do: already applied (step 45a has replaced the part of aliasHints.ts that this step edited).");
    process.exit(0);
  }
} catch (e) { /* no such file: the checks below say so */ }
const EDITS = [
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "from \"@/lib/employees/unresolvedScope\"",
  "old": "import { presentPeople, withCohortInHint } from \"./seniorityDisplay\";\n",
  "new": "import { presentPeople, withCohortInHint } from \"./seniorityDisplay\";\nimport { withoutBlindScope } from \"@/lib/employees/unresolvedScope\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "return withoutBlindScope(qq, await answerEmployeeQuery(qq));",
  "old": "      return answerEmployeeQuery(qq);\n",
  "new": "      // a department the question names but nobody can find must not become \"everybody\" (step 44d)\n      return withoutBlindScope(qq, await answerEmployeeQuery(qq));\n"
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "prefixes: string[]; stems?: string[] }[] = [",
  "old": "export const DEPARTMENT_FAMILIES: { name: string; aliases: string[]; prefixes: string[] }[] = [",
  "new": "export const DEPARTMENT_FAMILIES: { name: string; aliases: string[]; prefixes: string[]; stems?: string[] }[] = ["
 },
 {
  "file": "src/lib/nl2sql/aliasHints.ts",
  "marker": "name: \"HEAVY MAINTENANCE (HM)\"",
  "old": "  { name: \"SECTION MILL\", aliases: [\"section mill\", \"sec mill\"], prefixes: [\"section mill\", \"sec mill\"] },\n];",
  "new": "  { name: \"SECTION MILL\", aliases: [\"section mill\", \"sec mill\"], prefixes: [\"section mill\", \"sec mill\"] },\n  // Heavy Maintenance (HM): the row names are NOT yet checked against the live list (a stem also matches \"heavy maintenance\" and \"heavy maint.\"); no row matches = no family, nothing is lost.\n  { name: \"HEAVY MAINTENANCE (HM)\", aliases: [\"hm\", \"hmd\", \"heavy maintenance\", \"heavy maint\"], prefixes: [\"hm\", \"h m\", \"hmd\"], stems: [\"heavy maint\"] },\n];"
 },
 {
  "file": "src/lib/nl2sql/context.ts",
  "marker": "(f.stems ?? []).some",
  "old": "      return f.prefixes.some((p) => n === p || n.startsWith(p + \" \"));",
  "new": "      return f.prefixes.some((p) => n === p || n.startsWith(p + \" \")) || (f.stems ?? []).some((s) => n.startsWith(s));"
 }
];
const CHECKS = [
 {
 "marker": "A department the question names but nobody can find is no longer answered as everybody",
 "line": "{ grep -q \"withoutBlindScope\" src/lib/nl2sql/omnibar.ts && grep -q \"HEAVY MAINTENANCE (HM)\" src/lib/nl2sql/aliasHints.ts; } 2>/dev/null; report \"A department the question names but nobody can find is no longer answered as everybody\" $?"
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

if (!read("src/lib/employees/unresolvedScope.ts").includes("withoutBlindScope") || !read("src/lib/nl2sql/aliasHints.ts").includes("DEPARTMENT_FAMILIES")) {
  console.error("NOT APPLIED: the new file is not there (and step 44c must be applied first). Unzip patch_step44d.zip first. Nothing was changed.");
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
