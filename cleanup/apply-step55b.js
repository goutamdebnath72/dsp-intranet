#!/usr/bin/env node
// cleanup/apply-step55b.js -- Step 55b: the SPELLING SAFETY NET for name searches ("rupak gosyami" found nobody although "Rupak" was perfect; owner, 26 Oct 2026).
// Six existing files change in place: pipeline.ts (the second search), types.ts, omnibar.ts, clientTypes.ts, Nl2SqlAnswerExtras.tsx (the amber note), eval/selftest.ts (eleven end-to-end checks).
// Each change is checked ON ITS OWN: one that is already there is skipped, one that is missing is made, and only a place that cannot be recognised at all stops the script (nothing is
// written then). So it does not matter whether the other step (55a / 55b) was applied before or after, or only half-applied: run it, and it finishes the job. Safe to run again.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/lib/nl2sql/nameSpelling.ts"];
const EDITS = {
 "src/lib/nl2sql/pipeline.ts": [
  [
   "import { checkHealthColumns, checkPersonIdentity } from \"./identityCheck\";\n",
   "import { checkHealthColumns, checkPersonIdentity } from \"./identityCheck\";\nimport { spellingRetry } from \"./nameSpelling\";\n",
   "import { spellingRetry } from \"./nameSpelling\";"
  ],
  [
   "      const data = await deps.withClient((c) => runReadOnly(c, g.sql, deps.exec));\n      const scope = await deps.withClient((c) => computeDepartmentScope(c, g.sql)).catch(() => null);\n      return finish(\n        { ok: true, question: q, sql: g.sql, understoodAs: plan.understood_as, confidence: plan.confidence, data, scope, display: plan.display, source: \"nl2sql\", attempts } as any,\n",
   "      let data = await deps.withClient((c) => runReadOnly(c, g.sql, deps.exec));\n      let finalSql = g.sql;\n      let spellingNote: string | undefined;\n      // Nobody found: a name word of the SQL that no real name is spelled like is replaced by the nearest real spelling and the same SQL runs again (step 55b, nameSpelling.ts).\n      if (data.total === 0) {\n        const near = await spellingRetry(g.sql, deps).catch(() => null);\n        if (near) { data = near.data; finalSql = near.sql; spellingNote = near.note; }\n      }\n      const scope = await deps.withClient((c) => computeDepartmentScope(c, finalSql)).catch(() => null);\n      return finish(\n        { ok: true, question: q, sql: finalSql, understoodAs: plan.understood_as, confidence: plan.confidence, data, scope, display: plan.display, source: \"nl2sql\", attempts, ...(spellingNote ? { spellingNote } : {}) } as any,\n",
   "const near = await spellingRetry(g.sql, deps)"
  ]
 ],
 "src/lib/nl2sql/types.ts": [
  [
   "      verifiedBy?: number;\n",
   "      verifiedBy?: number;\n      /** Set when nobody was found and the name words were replaced by the nearest real spellings (nameSpelling.ts): the sentence that says so. */\n      spellingNote?: string;\n",
   "spellingNote?: string;"
  ]
 ],
 "src/lib/nl2sql/omnibar.ts": [
  [
   "  return payload;\n}\n",
   "  if ((res as { spellingNote?: string }).spellingNote && payload.nl2sql) payload.nl2sql.spellingNote = (res as { spellingNote?: string }).spellingNote;\n  return payload;\n}\n",
   "payload.nl2sql.spellingNote ="
  ]
 ],
 "src/lib/nl2sql/clientTypes.ts": [
  [
   "  sourceNote?: string;\n",
   "  sourceNote?: string;\n  /** Set when nobody was found and the name words were replaced by the nearest real spellings: \"No name is spelled “Gosyami” (nearest: Goswami): ...\" (step 55b). */\n  spellingNote?: string;\n",
   "spellingNote?: string;"
  ]
 ],
 "src/components/Nl2SqlAnswerExtras.tsx": [
  [
   "      {scope && scope.total > 0 && (\n",
   "      {nl2sql.spellingNote ? (\n        <p className=\"mb-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium leading-snug text-amber-900\" data-spelling-note=\"true\">\n          {nl2sql.spellingNote}\n        </p>\n      ) : null}\n      {scope && scope.total > 0 && (\n",
   "data-spelling-note=\"true\""
  ]
 ],
 "src/lib/nl2sql/eval/selftest.ts": [
  [
   "import { answerFromVerified } from \"../pipeline\";\n",
   "import { answerFromVerified } from \"../pipeline\";\nimport { clearVocabularyCache } from \"../nameSpelling\";\n",
   "import { clearVocabularyCache } from \"../nameSpelling\";"
  ],
  [
   "  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n",
   "  // ---- step 55b: a name word that no real name is spelled like is replaced by the nearest real spelling when nobody is found (\"rupak gosyami\", 26 Oct 2026)\n  {\n    clearVocabularyCache();\n    const WHO = (first: string, last: string) => `SELECT ticket_no, name, designation, department_code, department FROM nlq.employees WHERE nlq.first_word_like(name_words, name_codes, '${first}') AND nlq.last_word_like(name_words, name_codes, '${last}') ORDER BY global_seniority_rank`;\n    const asked = async (q: string, sql: string): Promise<any> => runOmnibar(q, \"T-SP\", mkDeps(model(sql, \"the reading\")));\n    const rowsOf = async (sql: string) => Number((await pg.query(`SELECT count(*)::int n FROM (${sql}) q`)).rows[0].n);\n    check(\"55b: the failure is real: the model's SQL with 'Gosyami' finds nobody on its own, 'Goswami' finds Rupak Kumar Goswami\", (await rowsOf(WHO(\"Rupak\", \"Gosyami\"))) === 0 && (await rowsOf(WHO(\"Rupak\", \"Goswami\"))) > 0);\n    const direct = await asked(\"rupak goswami\", WHO(\"Rupak\", \"Goswami\"));\n    check(\"55b: the right spelling finds him, with no note\", !!direct && direct.count > 0 && /GOSWAMI/.test(direct.people?.[0]?.name ?? \"\") && !direct.nl2sql?.spellingNote, JSON.stringify(direct && { count: direct.count, note: direct.nl2sql?.spellingNote }));\n    for (const typed of [\"Gosyami\", \"Gosami\", \"Goshami\", \"Gosamy\"]) {\n      const o2 = await asked(`rupak ${typed.toLowerCase()}`, WHO(\"Rupak\", typed));\n      check(`55b: \"rupak ${typed.toLowerCase()}\" finds Rupak Kumar Goswami, and the answer says which spelling was used`, !!o2 && o2.count > 0 && /GOSWAMI/.test(o2.people?.[0]?.name ?? \"\") && /RUPAK/.test(o2.people?.[0]?.name ?? \"\") && new RegExp(`No name is spelled “${typed}” \\\\(nearest: Goswami[;)]`).test(o2.nl2sql?.spellingNote ?? \"\"), JSON.stringify(o2 && { count: o2.count, note: o2.nl2sql?.spellingNote }));\n    }\n    check(\"55b: ...the SQL shown is the corrected one (GOSWAMI), so a reader can check it\", /GOSWAMI/.test((await asked(\"rupak gosyami\", WHO(\"Rupak\", \"Gosyami\")))?.nl2sql?.sql ?? \"\"));\n    const both = await asked(\"rupk gosami\", WHO(\"Rupk\", \"Gosami\"));\n    check(\"55b: two wrong words are both corrected (Rupk -> Rupak, Gosami -> Goswami)\", !!both && both.count > 0 && /“Rupk” \\(nearest: Rupak\\)/.test(both.nl2sql?.spellingNote ?? \"\") && /“Gosami” \\(nearest: Goswami\\)/.test(both.nl2sql?.spellingNote ?? \"\"), both?.nl2sql?.spellingNote);\n    const nobody = await asked(\"rupak sarkar\", WHO(\"Rupak\", \"Sarkar\"));\n    check(\"55b: people who do not exist stay not found: both words are real names, so nothing is 'corrected' and nobody is invented\", !!nobody && !nobody.people?.length && !(nobody.count > 0) && !nobody.nl2sql?.spellingNote, JSON.stringify(nobody && { count: nobody.count, note: nobody.nl2sql?.spellingNote }));\n    const far = await asked(\"rupak xyzzyq\", WHO(\"Rupak\", \"Xyzzyq\"));\n    check(\"55b: a word near no real name is not corrected: still nobody, no note\", !!far && !far.people?.length && !far.nl2sql?.spellingNote);\n    const other: any = await runOmnibar(\"how many executives\", \"T-SP\", mkDeps(model(\"SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive'\", \"The number of executives.\")));\n    check(\"55b: a question with no name word is untouched\", !!other && other.count > 0 && !other.nl2sql?.spellingNote);\n  }\n\n  let o: any = await runOmnibar(\"list five senior executives\", \"T-OMNI\", mkDeps(model(PEOPLE5, \"Five most senior executives.\")));\n",
   "step 55b: a name word that no real name is spelled like"
  ],
  [
   "\\\\(nearest: Goswami\\\\)",
   "\\\\(nearest: Goswami[;)]",
   "Goswami[;)]",
   true
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
if (!todo) { console.log("Nothing to do: step 55b is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 55b (" + todo + " changes in " + files + " files).");
