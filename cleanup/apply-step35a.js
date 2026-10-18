// cleanup/apply-step35a.js
//
// Edits ONE existing source file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
//   src/app/api/ai-search/answer/route.ts   loads what a second reader said about the numbers of a circular's pages (src/lib/search/pageChecks.ts) and hands
//                                           it to the answer module, whose confirmation gate refuses a number the second reading did not confirm
//   cleanup/check-fixes.sh                  one report line
// New files come in the zip: pageChecks.ts (+ self-test) and the SQL file src/lib/nl2sql/sql/10_circular_page_check.sql (run it in Supabase first).
// Until the SQL has been run (or while no page has been checked) the route behaves exactly as before: loadPageChecks never throws.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step35a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/ai-search/answer/route.ts",
  "marker": "loadPageChecks }",
  "old": "import { answerFromPassages, buildPassages, type DocInput, type PassageType } from \"@/lib/search/circularAnswer\";\n",
  "new": "import { answerFromPassages, buildPassages, type DocInput, type PassageType } from \"@/lib/search/circularAnswer\";\nimport { loadPageChecks } from \"@/lib/search/pageChecks\";\n"
 },
 {
  "file": "src/app/api/ai-search/answer/route.ts",
  "marker": "const chunks = rows.map((r: any)",
  "old": "      docs.push({\n        type: \"circular\", id: it.id, title: String(head[0].headline), date: head[0].publishedAt ? new Date(head[0].publishedAt).toISOString() : null,\n        chunks: rows.map((r: any) => ({ page: r.page_number == null ? null : Number(r.page_number), index: Number(r.chunk_index), text: String(r.text ?? \"\") })),\n      });\n",
  "new": "      const chunks = rows.map((r: any) => ({ page: r.page_number == null ? null : Number(r.page_number), index: Number(r.chunk_index), text: String(r.text ?? \"\") }));\n      docs.push({\n        type: \"circular\", id: it.id, title: String(head[0].headline), date: head[0].publishedAt ? new Date(head[0].publishedAt).toISOString() : null,\n        chunks,\n        // what a second reader said about the numbers of these pages (only for pages whose stored text is still the text that was checked)\n        checks: await loadPageChecks((sql, params) => db.query(sql, params), it.id, chunks),\n      });\n"
 }
];
const CHECKS = [
 {
  "marker": "the answer card refuses a number the second reading did not confirm",
  "line": "{ test -f src/lib/search/pageChecks.ts && grep -q \"loadPageChecks\" src/app/api/ai-search/answer/route.ts && grep -q \"confirmationRefusal\" src/lib/search/circularAnswer.ts; } 2>/dev/null; report \"the answer card refuses a number the second reading did not confirm (the confirmation gate)\" $?"
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

read("src/lib/search/pageChecks.ts");

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
console.log(changed ? "Applied. Restart npm run dev. Run the SQL file in Supabase, then check-readings.ts --save, to make the gate act." : "Nothing to do: already applied.");
