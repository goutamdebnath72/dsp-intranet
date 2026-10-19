// cleanup/apply-step42a.js
//
// Edits ONE existing source file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 42a: at UPLOAD, the pages of a circular that
// say the same thing in English, Hindi and Bengali check each other (src/lib/ingestion/crossCheck.ts), and what they find is stored with the second reading's
// checks (circular_page_check): numbers two pages agree on are confirmed, a reading another page contradicts is unconfirmed. Free and offline: it protects a
// new circular even when the second reader (Gemini) is off or failed.
//   src/app/api/circulars/route.ts   2 edits: the import, and the block that stores the page checks
//   cleanup/check-fixes.sh           one report line
// The module, its tests and scripts/crosscheck-report.ts come whole in the zip.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step42a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "from \"@/lib/ingestion/crossCheck\"",
  "old": "import { checkRowsFor, savePageChecks } from \"@/lib/search/pageChecks\";\n",
  "new": "import { checkRowsFor, savePageChecks } from \"@/lib/search/pageChecks\";\nimport { combineChecks, twinChecksFor } from \"@/lib/ingestion/crossCheck\";\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "step 42a: the pages of a circular that say the same thing",
  "old": "      if (secondSummary.enabled) {\n        // what the second reading decided, page by page, goes to the log; its checks are stored with the fingerprint of the text that was really stored\n        detail = { ...detail, secondReading: secondSummary.log };\n        detail.pageChecksSaved = await savePageChecks(sql, circular.id, checkRowsFor(secondSummary.checks, preparedChunks.map((c) => ({ page: c.page, index: c.index, text: c.text }))));\n      }\n",
  "new": "      {\n        // step 42a: the pages of a circular that say the same thing in English, Hindi and Bengali check each other: a number two pages agree on is\n        // confirmed, a reading another page contradicts is unconfirmed (src/lib/ingestion/crossCheck.ts). Free and offline, so it protects the circular\n        // even when the second reader is off or failed. It is merged with the second reading's checks, which are stored with the fingerprint of the\n        // text that was really stored.\n        const storedChunks = preparedChunks.map((c) => ({ page: c.page, index: c.index, text: c.text }));\n        // what the second reading decided, page by page, goes to the log\n        if (secondSummary.enabled) detail = { ...detail, secondReading: secondSummary.log };\n        const twin = twinChecksFor(storedChunks);\n        if (twin.length) detail = { ...detail, twinPages: twin.length };\n        const checkRows = checkRowsFor(combineChecks(secondSummary.enabled ? secondSummary.checks : [], twin), storedChunks);\n        if (secondSummary.enabled || checkRows.length) detail.pageChecksSaved = await savePageChecks(sql, circular.id, checkRows);\n      }\n"
 }
];
const CHECKS = [
 {
 "marker": "Pages in English, Hindi and Bengali check each other at upload",
 "line": "{ grep -q \"twinChecksFor\" src/app/api/circulars/route.ts && grep -q \"combineChecks\" src/lib/ingestion/crossCheck.ts; } 2>/dev/null; report \"Pages in English, Hindi and Bengali check each other at upload\" $?"
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

if (!read("src/lib/ingestion/crossCheck.ts").includes("combineChecks")) {
  console.error("NOT APPLIED: src/lib/ingestion/crossCheck.ts is not the new one. Unzip patch_step42a.zip first. Nothing was changed.");
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
