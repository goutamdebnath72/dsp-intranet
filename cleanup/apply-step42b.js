// cleanup/apply-step42b.js
//
// Edits EXISTING source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 42b, the Indian rupee sign (U+20B9):
//   src/app/api/circulars/route.ts      at upload, an amount with a stray leading digit that the same page also states without it (the rupee sign read as a
//                                       digit: 215,000 for Rs 15,000) is stored as UNCONFIRMED, so the answer card refuses an answer that rests on it
//   src/lib/ingestion/pageReader.ts     the second reader's prompt says what the sign is, to copy it as printed and never to write it as a digit
//   src/lib/search/executiveSynthesis.ts the synthesis prompt says the sign is never a digit and what to do with a stray leading digit
//   cleanup/check-fixes.sh              one report line
// The new module (src/lib/ingestion/currency.ts), its test and the updated cross-check come whole in the zip. Changing the second reader's prompt changes the
// fingerprint under which its readings are cached: readings made before are read again, not reused.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step42b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "from \"@/lib/ingestion/currency\"",
  "old": "import { combineChecks, twinChecksFor } from \"@/lib/ingestion/crossCheck\";\n",
  "new": "import { combineChecks, twinChecksFor } from \"@/lib/ingestion/crossCheck\";\nimport { slotChecksFor } from \"@/lib/ingestion/currency\";\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "step 42b: an amount with a stray leading digit",
  "old": "        const checkRows = checkRowsFor(combineChecks(secondSummary.enabled ? secondSummary.checks : [], twin), storedChunks);\n",
  "new": "        // step 42b: an amount with a stray leading digit that the same page also states without it (the rupee sign read as a digit) is unconfirmed too\n        const checkRows = checkRowsFor(combineChecks(combineChecks(secondSummary.enabled ? secondSummary.checks : [], twin), slotChecksFor(storedChunks)), storedChunks);\n"
 },
 {
  "file": "src/lib/ingestion/pageReader.ts",
  "marker": "is a CURRENCY MARK, never a digit or a letter",
  "old": "- Copy every number, amount, date, reference and code exactly as printed. NEVER guess a digit. If a character or number is not clearly legible, write [illegible] in its place.\n",
  "new": "- Copy every number, amount, date, reference and code exactly as printed. NEVER guess a digit. If a character or number is not clearly legible, write [illegible] in its place.\n- The Indian rupee sign \\u20b9 (two horizontal bars across a curved top, with a slanted stroke below) is a CURRENCY MARK, never a digit or a letter. Copy it exactly where it is printed, directly before the amount: \\u20b915,000. NEVER write it as 2, 3, 7, %, Z, T or any other character, and never join it to the number as a digit. Where the page prints Rs., Rs, INR or \\u0930\\u0941. copy that instead. The amount keeps exactly the digits printed after the mark.\n"
 },
 {
  "file": "src/lib/search/executiveSynthesis.ts",
  "marker": "it is never a digit. OCR sometimes reads it as a digit stuck",
  "old": "- Transcribe figures, \\u20b9 amounts, dates, circular numbers VERBATIM from the records. NEVER invent or interpolate a number.\n",
  "new": "- Transcribe figures, \\u20b9 amounts, dates, circular numbers VERBATIM from the records. NEVER invent or interpolate a number.\n- The rupee sign (\\u20b9, also printed Rs. / INR / \\u0930\\u0941.) only marks an amount as rupees; it is never a digit. OCR sometimes reads it as a digit stuck to the front of an amount (\"215,000\" for \"Rs. 15,000\"). If a record gives the same amount two ways that differ only by one extra leading digit, report the shorter, printed amount and say the other reading is unclear. Give amounts with the unit \\u20b9.\n"
 }
];
const CHECKS = [
 {
 "marker": "The rupee sign: both readers are told, and a stray leading digit is unconfirmed at upload",
 "line": "{ grep -q \"slotChecksFor\" src/app/api/circulars/route.ts && grep -q \"CURRENCY MARK\" src/lib/ingestion/pageReader.ts && grep -q \"it is never a digit\" src/lib/search/executiveSynthesis.ts; } 2>/dev/null; report \"The rupee sign: both readers are told, and a stray leading digit is unconfirmed at upload\" $?"
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

if (!read("src/lib/ingestion/currency.ts").includes("attachedDigitSuspects")) {
  console.error("NOT APPLIED: src/lib/ingestion/currency.ts is not there. Unzip patch_step42b.zip first. Nothing was changed.");
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
