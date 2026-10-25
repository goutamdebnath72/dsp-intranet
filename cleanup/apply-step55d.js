#!/usr/bin/env node
// cleanup/apply-step55d.js -- Step 55d: "garage" and "plant garage" are the SIX rows of the Plant Garage, named by name and code (the exact-rows check then forces the SQL to select them all).
// Only the big suite changes in place (src/lib/nl2sql/eval/selftest.ts): the end-to-end check of step 55a that expected the model to be given the plain words "plant garage" is replaced, and a
// check that reproduces the live failure (a SQL that selects only the row called PLANT GARAGE is sent back) is added. Everything else of the patch is replaced or new files (unzip).
// Each change is checked on its own (already there: skipped; missing: made; place not recognised: nothing is written). Safe to run again.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/lib/nl2sql/departmentWords.ts"];
const EDITS = {
 "src/lib/nl2sql/eval/selftest.ts": [
  [
   "    check(\"55a: 'garage' is searched as 'plant garage': the model is given the clear name, not the bare word\", seen.length >= 1 && seen[0].includes(\"how many executives are there in plant garage\") && !seen[0].includes(\"there in garage\"), seen[0]?.slice(-200));\n",
   "    check(\"55d: 'garage' is searched as the six rows of the Plant Garage, by name and code: the model is given them, not the bare word\", seen.length >= 1 && seen[0].includes(\"how many executives are there in PLANT GARAGE (code 85000), PLANT GARAGE (TECH) (code 85070), PLANT GARAGE (M.H.E.O.D.) (code 85110), PLANT GARAGE (M.H.E.M.D.) (code 85200), PLANT GARAGE (OFFICE - MAINT) (code 85330) and PLANT GARAGE (OFFICE - OPRN) (code 85430)\") && !seen[0].includes(\"there in garage\"), seen[0]?.slice(-300));\n",
   "55d: 'garage' is searched as the six rows of the Plant Garage"
  ],
  [
   "    const gar: any = await runOmnibar(\"how many executives are there in garage\", \"T-DW\", mkDeps(spy(ANY)));\n",
   "    const gar: any = await runOmnibar(\"how many executives are there in garage\", \"T-DW\", mkDeps(spy(`SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (85000, 85070, 85110, 85200, 85330, 85430))`)));\n",
   "mkDeps(spy(`SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (85000"
  ],
  [
   "    seen.length = 0;\n    const ref: any = await runOmnibar(\"how many executives are there in refractory\"",
   "    // the live failure of 26 Oct 2026: the model first selected ONLY the row called PLANT GARAGE (9 executives, \"Departments covered (1)\"). The exact-rows check sends it back; the second SQL covers all six rows.\n    {\n      let turn = 0;\n      const ONE = `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id = (SELECT id FROM nlq.departments WHERE code = 85000)`;\n      const SIX_ROWS = `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN (SELECT id FROM nlq.departments WHERE code IN (85000, 85070, 85110, 85200, 85330, 85430))`;\n      const twice: LlmFn = async (p) => { seen.push(p); turn++; return json({ sql: turn === 1 ? ONE : SIX_ROWS, understood_as: \"the reading\", confidence: \"high\" }); };\n      const again: any = await runOmnibar(\"how many executives are there in garage\", \"T-DW\", mkDeps(twice));\n      check(\"55d: a SQL that selects only the row called PLANT GARAGE is sent back; the answer covers all six rows\", turn >= 2 && !!again && /85070/.test(again?.nl2sql?.sql ?? \"\") && /85430/.test(again?.nl2sql?.sql ?? \"\"), JSON.stringify({ turn, sql: again?.nl2sql?.sql }));\n    }\n    seen.length = 0;\n    const ref: any = await runOmnibar(\"how many executives are there in refractory\"",
   "55d: a SQL that selects only the row called PLANT GARAGE is sent back"
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
if (!todo) { console.log("Nothing to do: step 55d is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 55d (" + todo + " changes in " + files + " files).");
