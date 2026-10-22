// cleanup/apply-step44a.js
//
// Edits FIVE existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 44a, two small changes:
//   1. the circular search: while the summary is prepared the card above the list of circulars said "Reading the documents for your answer..." with a blue bar that sweeps in from the left and
//      pulsing grey bars; it now says "Loading Summary . . ." with three dots that light up one after another (quiet, no moving colour; still when the person asks the system for less motion)
//        src/components/CircularAnswerCard.tsx, src/app/globals.css
//   2. the filter box above a list of people understands designations: gm, dgm, agm, cgm, ed, dic, jo, mo, Dy. general manager, asst. general manager, sr mgr, dy mngr, jr mngr ... in any case,
//      with or without dots; "gm, dgm, agm" shows the three kinds; "roy gm" combines a word and a designation; "Asst.General Manager" (no space, as stored) and "Asst. General Manager" are the
//      same; the designation is SHOWN with the space after the dot (the stored value is not changed)
//        src/lib/nl2sql/display.ts (filterRows), src/components/AnswerResult.tsx (table cell, filter box), src/components/OmnibarModal.tsx (the person card)
// The new module and the tests come whole in the zip. If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step44a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "from \"./designationFilter\"",
  "old": "export type ColumnKind = \"number\" | \"percent\" | \"boolean\" | \"code\" | \"date\" | \"text\";",
  "new": "import { alternativeMatches, canonicalTitle, compileAlternative, isDesignationColumn, splitAlternatives, squash } from \"./designationFilter\";\n\nexport type ColumnKind = \"number\" | \"percent\" | \"boolean\" | \"code\" | \"date\" | \"text\";"
 },
 {
  "file": "src/lib/nl2sql/display.ts",
  "marker": "const compiled = alternatives.map(",
  "old": "export function filterRows(rows: Row[], columns: DisplayColumn[], query: string): Row[] {\n  const q = query.trim().toLowerCase();\n  if (!q) return rows;\n  return rows.filter((r) => columns.some((c) => formatCell(r[c.key], c.kind).toLowerCase().includes(q)));\n}\n",
  "new": "/**\n * The filter box above a list. Several things can be asked at once, separated by a comma (or ; | or the word \"or\"): \"gm, dgm, agm\". Each one is either\n *   - a DESIGNATION (in any case, with or without dots: gm, dgm, agm, ed, dic, Dy. general manager, asst.general manager, sr mgr ...): the rows with exactly\n *     that designation, however it is spelled in the list; or\n *   - text, found anywhere in the row as before (a name, a ticket, a department, a code); dots and spaces do not matter (\"asst.general\" finds \"Asst. General\").\n * A designation and a word can be combined (\"roy gm\"). See designationFilter.ts for the rules.\n */\nexport function filterRows(rows: Row[], columns: DisplayColumn[], query: string): Row[] {\n  const alternatives = splitAlternatives(query);\n  if (alternatives.length === 0) return rows;\n  const designationColumn = columns.find(isDesignationColumn);\n  const prepared = rows.map((r) => {\n    const cells = columns.map((c) => formatCell(r[c.key], c.kind));\n    return {\n      row: r,\n      lower: cells.map((s) => s.toLowerCase()).join(\" | \"),\n      squashed: cells.map(squash).join(\" \"),\n      title: designationColumn ? canonicalTitle(formatCell(r[designationColumn.key], designationColumn.kind)) : \"\",\n    };\n  });\n  const known = new Set(prepared.map((p) => p.title).filter(Boolean));\n  const compiled = alternatives.map((a) => compileAlternative(a, known, designationColumn !== undefined));\n  return prepared.filter((p) => compiled.some((c) => alternativeMatches(c, p))).map((p) => p.row);\n}\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "from \"@/lib/nl2sql/designationFilter\"",
  "old": "import { exportNote, filterRows, formatCell, pageProgress, rowCountLabel, sortRows, toCsv, toTsv, type DisplayColumn, type ViewKind } from \"@/lib/nl2sql/display\";\n",
  "new": "import { exportNote, filterRows, formatCell, pageProgress, rowCountLabel, sortRows, toCsv, toTsv, type DisplayColumn, type ViewKind } from \"@/lib/nl2sql/display\";\nimport { isDesignationColumn, tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "isDesignationColumn(col) ? tidyDesignation(text) : text",
  "old": "  return <>{formatCell(value, col.kind)}</>;\n",
  "new": "  const text = formatCell(value, col.kind);\n  return <>{isDesignationColumn(col) ? tidyDesignation(text) : text}</>;\n"
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "placeholder=\"Filter rows (e.g. GM, DGM, AGM)\"",
  "old": "placeholder=\"Filter rows\"",
  "new": "placeholder=\"Filter rows (e.g. GM, DGM, AGM)\"\n              title=\"Type a name, a code, or designations such as GM, DGM, AGM, Sr. Mgr, Dy. Mgr (capitals and dots do not matter; separate several with commas)\""
 },
 {
  "file": "src/components/AnswerResult.tsx",
  "marker": "w-60 rounded-lg border",
  "old": "w-44 rounded-lg border",
  "new": "w-60 rounded-lg border"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "from \"@/lib/nl2sql/designationFilter\"",
  "old": "import { CircularAnswerCard } from \"@/components/CircularAnswerCard\";\n",
  "new": "import { CircularAnswerCard } from \"@/components/CircularAnswerCard\";\nimport { tidyDesignation } from \"@/lib/nl2sql/designationFilter\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "\n            emp.designation ? `${tidyDesignation(",
  "old": "\n            emp.designation ? `${emp.designation}",
  "new": "\n            emp.designation ? `${tidyDesignation(emp.designation)}"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "\n        emp.designation ? `${tidyDesignation(",
  "old": "\n        emp.designation ? `${emp.designation}",
  "new": "\n        emp.designation ? `${tidyDesignation(emp.designation)}"
 },
 {
  "file": "src/components/CircularAnswerCard.tsx",
  "marker": "function LoadingDots()",
  "old": "export function CircularAnswerCard({ state, onOpenSource }",
  "new": "/** \"Loading Summary . . .\" : three dots that light up one after another. */\nfunction LoadingDots() {\n  return (\n    <span aria-hidden className=\"ml-1 inline-flex gap-1\">\n      {[0, 1, 2].map((i) => (\n        <span key={i} className=\"dot-wave\" style={{ animationDelay: `${(i * 0.22).toFixed(2)}s` }}>\n          .\n        </span>\n      ))}\n    </span>\n  );\n}\n\nexport function CircularAnswerCard({ state, onOpenSource }"
 },
 {
  "file": "src/components/CircularAnswerCard.tsx",
  "marker": "aria-label=\"Loading summary\"",
  "old": "      <section aria-label=\"Preparing the answer\" aria-busy=\"true\" className=\"overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm\">\n        <div className=\"flex items-center gap-2 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 px-4 py-2 text-white\">\n          <Sparkles size={14} aria-hidden />\n          <span className=\"text-[11px] font-bold uppercase tracking-[0.14em]\">Reading the documents for your answer...</span>\n        </div>\n        <div className=\"space-y-2 px-4 py-4\" aria-hidden>\n          <div className=\"h-4 w-2/3 animate-pulse rounded bg-neutral-100\" />\n          <div className=\"h-9 w-full animate-pulse rounded-lg bg-neutral-100\" />\n          <div className=\"h-9 w-full animate-pulse rounded-lg bg-neutral-100\" />\n        </div>\n      </section>\n",
  "new": "      <section role=\"status\" aria-live=\"polite\" aria-label=\"Loading summary\" aria-busy=\"true\" className=\"flex items-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm\">\n        <Sparkles size={14} aria-hidden />\n        <span>\n          Loading Summary\n          <LoadingDots />\n        </span>\n      </section>\n"
 },
 {
  "file": "src/app/globals.css",
  "marker": "@keyframes dotWave",
  "old": "/* Animation utilities for modals */\n@keyframes fadeIn {",
  "new": "/* \"Loading Summary . . .\" : the three dots light up one after another */\n@keyframes dotWave {\n  0%, 80%, 100% { opacity: 0.15; }\n  40% { opacity: 1; }\n}\n.dot-wave {\n  display: inline-block;\n  font-weight: 900;\n  animation: dotWave 1.3s ease-in-out infinite both;\n}\n@media (prefers-reduced-motion: reduce) {\n  .dot-wave { animation: none; opacity: 1; }\n}\n\n/* Animation utilities for modals */\n@keyframes fadeIn {"
 }
];
const CHECKS = [
 {
 "marker": "The people filter understands designations (GM, DGM, AGM ...) and the circular summary says Loading Summary",
 "line": "{ grep -q \"compileAlternative\" src/lib/nl2sql/display.ts && grep -q \"dot-wave\" src/app/globals.css && grep -q \"Loading Summary\" src/components/CircularAnswerCard.tsx; } 2>/dev/null; report \"The people filter understands designations (GM, DGM, AGM ...) and the circular summary says Loading Summary\" $?"
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

if (!read("src/lib/nl2sql/designationFilter.ts").includes("compileAlternative")) {
  console.error("NOT APPLIED: src/lib/nl2sql/designationFilter.ts is not the new one. Unzip patch_step44a.zip first. Nothing was changed.");
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
