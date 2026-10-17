// cleanup/apply-step29b.js
//
// Edits ONE existing source file IN PLACE, all-or-nothing and safe to run twice.
// When the answer card already cites a document, that document is no longer listed a second time below the answer (the card's source
// line is its one link); the documents that remain are headed "Other matching circulars". Needs step 29a. With answer-first off, or
// with no answer on screen, NOTHING changes.
//
// New files come in the zip: circularAnswer.ts (+ self-test) and CircularAnswerCard.tsx (the table-style card).
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step29b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "const answeredKeys = new Set(",
  "old": "  const circularAnswer = useCircularAnswer({ enabled: answerFirstEnabled(), query: submittedQuery, results: isLoading ? [] : results, mode });\n",
  "new": "  const circularAnswer = useCircularAnswer({ enabled: answerFirstEnabled(), query: submittedQuery, results: isLoading ? [] : results, mode });\n  // The documents the answer already cites are not listed a second time below it: the answer's source line is their one link.\n  const answeredKeys = new Set((circularAnswer.answer?.sources ?? []).map((s) => `${s.type}-${s.id}`));\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "!answeredKeys.has(`${r.type}-${r.id}`)",
  "old": "                            : results\n                          ).map((result) => (",
  "new": "                            : results.filter((r) => !answeredKeys.has(`${r.type}-${r.id}`))\n                          ).map((result) => ("
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "Other matching circulars",
  "old": "                          ) : null}\n                          {/* In synthesis mode, only show cards for sources",
  "new": "                          ) : answeredKeys.size > 0 && results.some((r) => !answeredKeys.has(`${r.type}-${r.id}`)) ? (\n                            <h4 className=\"mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2\">\n                              Other matching circulars\n                            </h4>\n                          ) : null}\n                          {/* In synthesis mode, only show cards for sources"
 }
];

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

if (!read("src/components/OmnibarModal.tsx").includes("useCircularAnswer(")) {
  console.error("NOT APPLIED: OmnibarModal.tsx has no answer card yet: apply step 29a first.");
  process.exit(1);
}
if (!read("src/lib/search/circularAnswer.ts").includes("TABLE_LIKE_NUMBERS")) {
  console.error("NOT APPLIED: src/lib/search/circularAnswer.ts is the old version: unzip patch_step29b.zip first.");
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
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
console.log(changed ? "Applied. Restart npm run dev." : "Nothing to do: already applied.");
