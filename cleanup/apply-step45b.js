// cleanup/apply-step45b.js
//
// Edits ONE existing file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 45b: a question that names a large department must be answered for ALL its rows.
//   Live, 24 Oct 2026, the model's SQL ignored the hint of step 45a (or there was none yet): "main hospital" -> LIKE '%hospital%' (2 of 6 rows) counted 0; "hydraulic lab" -> LIKE '%hydraulic lab%'
//   (no row) counted 0; "l&d" -> LIKE '%l d%' also matches "contro[l d]eptt" and counted ENVIRONMENT CONTROL DEPTT as L&D (a confident wrong answer).
//   New (in the zip): src/lib/nl2sql/familyCheck.ts   works out WHICH ROWS the model's SQL selects (by id, by code, by LIKE or = on the name, read against the live list); when they are not the family,
//                     the model is sent back with the exact ids. It checks the RESULT, not the form (LIKE '%co and cc%' passes: it selects exactly the CO & CC rows); a named section is respected.
//   pipeline.ts       the check is one more "sense" rule, on the first two attempts only: a question is never failed over it.
// Run step 45a first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step45b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/pipeline.ts",
  "marker": "from \"./familyCheck\"",
  "old": "import { checkNormPatterns, checkVocabulary } from \"./vocabulary\";\n",
  "new": "import { checkNormPatterns, checkVocabulary } from \"./vocabulary\";\nimport { checkFamilies } from \"./familyCheck\";\n"
 },
 {
  "file": "src/lib/nl2sql/pipeline.ts",
  "marker": "checkFamilies(q, g.sql, prep.ctx.departments)",
  "old": "    const senseProblem = checkVocabulary(q, g.sql, knownPhrases) ?? checkNormPatterns(g.sql);\n",
  "new": "    // a department family the question names (CO & CC, main hospital, L & D ...) must be covered in full: first two attempts only, a question is never failed over it (step 45b)\n    const senseProblem =\n      checkVocabulary(q, g.sql, knownPhrases) ?? checkNormPatterns(g.sql) ?? (attempts <= 2 ? checkFamilies(q, g.sql, prep.ctx.departments) : null);\n"
 }
];
const CHECKS = [
 {
 "marker": "The model's SQL must cover the whole department family a question names",
 "line": "{ grep -q \"checkFamilies\" src/lib/nl2sql/pipeline.ts && test -f src/lib/nl2sql/familyCheck.ts; } 2>/dev/null; report \"The model's SQL must cover the whole department family a question names\" $?"
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

if (!fs.existsSync("src/lib/nl2sql/familyCheck.ts") || !read("src/lib/nl2sql/context.ts").includes("NO_AUTO_FAMILY")) {
  console.error("NOT APPLIED: src/lib/nl2sql/familyCheck.ts is not there (or step 45a is not applied yet). Unzip patch_step45b.zip first. Nothing was changed.");
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
