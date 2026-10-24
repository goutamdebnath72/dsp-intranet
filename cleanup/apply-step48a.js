// cleanup/apply-step48a.js
//
// Edits ONE existing file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 48a: a department family covered wrongly is mended at once, with no second model call.
//   Live, 24 Oct 2026 17:41: "how many executives are there in main hospital, list them?" -> the model wrote department_id IN (SELECT id FROM nlq.departments WHERE code IN (135,180,161,126,89,1)): the
//   row IDS written as department CODES. The 45b check sent it back twice with the exact ids and the model repeated it; the third attempt is never checked, so the answer was a wrong 0, after 80 seconds
//   (every extra model call spends about 6,000 tokens and Groq's per-minute limit made the next one wait 23 and 45 seconds).
//   New (in the zip): src/lib/nl2sql/familyCheck.ts (replaced, it is code: repairFamilies puts the family's ids into the first department_id IN / department_code IN, found by matching the brackets, and
//                     returns it only when the mended SQL passes the check again; not when two departments are named, not when the question names ONE section such as BLAST FURNACE (OPERATION) or
//                     main hospital office, not when the SQL has nowhere to put the ids; the retry message now says in so many words when row ids were written as codes; little words such as "and"
//                     never count as a section), familyCheck.selftest.ts (43 checks, with the live SQL)
//   pipeline.ts       one import and one block after the safety guard: the mended SQL replaces the model's, and the model is asked again only if it cannot be mended
// Run step 45b first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step48a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/pipeline.ts",
  "marker": "import { checkFamilies, repairFamilies }",
  "old": "import { checkFamilies } from \"./familyCheck\";\n",
  "new": "import { checkFamilies, repairFamilies } from \"./familyCheck\";\n"
 },
 {
  "file": "src/lib/nl2sql/pipeline.ts",
  "marker": "department family repaired without a second model call",
  "old": "    const quotedProblem = checkQuotedTerms(q, g.sql);\n",
  "new": "    // a department family the question names, covered wrongly (the row ids written as codes, a LIKE that finds other rows or none ...): the right ids are put in HERE, at once, with no second model\n    // call (each costs about 6,000 tokens and Groq's per-minute limit makes the next one wait): live, 24 Oct 17:41, three calls, 80 s and a wrong 0 (step 48a)\n    {\n      const mended = repairFamilies(q, g.sql, prep.ctx.departments);\n      if (mended) {\n        const g2 = guardSql(mended);\n        if (g2.ok) {\n          console.info(\"[nl2sql] department family repaired without a second model call\");\n          g.sql = g2.sql;\n        }\n      }\n    }\n    const quotedProblem = checkQuotedTerms(q, g.sql);\n"
 }
];
const CHECKS = [
 {
 "marker": "A department family covered wrongly is mended at once, without a second model call",
 "line": "{ grep -q \"repairFamilies\" src/lib/nl2sql/pipeline.ts && grep -q \"export function repairFamilies\" src/lib/nl2sql/familyCheck.ts; } 2>/dev/null; report \"A department family covered wrongly is mended at once, without a second model call\" $?"
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

if (!fs.existsSync("src/lib/nl2sql/familyCheck.ts") || !read("src/lib/nl2sql/familyCheck.ts").includes("repairFamilies")) {
  console.error("NOT APPLIED: src/lib/nl2sql/familyCheck.ts is not the new one. Unzip patch_step48a.zip first. Nothing was changed.");
  process.exit(1);
}
if (!read("src/lib/nl2sql/pipeline.ts").includes("checkFamilies")) {
  console.error("NOT APPLIED: step 45b is not applied yet (pipeline.ts does not use checkFamilies). Apply 45b first. Nothing was changed.");
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
