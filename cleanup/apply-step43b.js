// cleanup/apply-step43b.js
//
// Edits ONE existing source file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 43b, found on the FULL Bengali circular
// (04_2026.pdf, rendered the way the upload renders it): the merge glued Bengali words where the page has a hyphen, a quote or a bracket ("প্রকল্প)’-এর" became
// "প্রকল্পএর", "এইচআর-সিএলসি" became "এইচআরসিএলসি"), so whole-word recall was 88% while the character error rate was 1.7%.
//   src/lib/ingestion/ocrMerge.ts   the Indic words of a line are split at punctuation; OCR_MERGE_VERSION 4 -> 5 (the archive re-read tool then ignores older readings)
//   cleanup/check-fixes.sh          one report line
// The cut rule (indicMisreads.ts: 40% cover, counted over all the Indic words a word spans), its tests and its real-page fixtures come whole in the zip.
// Run step 43a first (node cleanup/apply-step43a.js) if you have not.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step43b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "const WORD_SEPARATORS",
  "old": "/** A line needs at least this many Indic letters to count",
  "new": "/** Punctuation that stands BETWEEN two words in running text: a hyphen or dash, a quote, a bracket, a colon, a semicolon, a comma. It is where a Bengali suffix attaches\n *  (\"প্রকল্প)’-এর\") and it must not glue two words into one (\"প্রকল্পএর\"). Other OCR junk inside a word (| ~ ^ _ ...) is still dropped, which joins a broken word back together. */\nconst WORD_SEPARATORS = /[-\\u2010-\\u2015\\u2018\\u2019\\u201C\\u201D'\"()[\\]{}:;,]+/;\n\n/** A line needs at least this many Indic letters to count"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "w.split(WORD_SEPARATORS)",
  "old": "    for (const raw of line.split(/\\s+/)) {\n      if (!raw) continue;\n      let t = \"\";\n      for (const c of raw) if (INDIC_CHAR.test(c)) t += c;",
  "new": "    for (const raw of line.split(/\\s+/).flatMap((w) => w.split(WORD_SEPARATORS))) {\n      if (!raw) continue;\n      let t = \"\";\n      for (const c of raw) if (INDIC_CHAR.test(c)) t += c;"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "5 = the Indic words of a line are split at punctuation",
  "old": " *  4 = English-pass words that sit where the Hindi/Bengali pass reads Indic script are cut before the merge (indicMisreads.ts). */\nexport const OCR_MERGE_VERSION = 4;",
  "new": " *  4 = English-pass words that sit where the Hindi/Bengali pass reads Indic script are cut before the merge (indicMisreads.ts).\n *  5 = the Indic words of a line are split at punctuation (a hyphen, a quote, a bracket) and no longer glued (\"প্রকল্পএর\"). */\nexport const OCR_MERGE_VERSION = 5;"
 }
];
const CHECKS = [
 {
 "marker": "Bengali words are not glued at punctuation, the OCR cut counts the words together",
 "line": "{ grep -q \"WORD_SEPARATORS\" src/lib/ingestion/ocrMerge.ts && grep -q \"coverOf(w, indic)\" src/lib/ingestion/indicMisreads.ts; } 2>/dev/null; report \"Bengali words are not glued at punctuation, the OCR cut counts the words together\" $?"
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

if (!read("src/lib/ingestion/indicMisreads.ts").includes("coverOf(w, indic)")) {
  console.error("NOT APPLIED: src/lib/ingestion/indicMisreads.ts is not the new one. Unzip patch_step43b.zip first. Nothing was changed.");
  process.exit(1);
}
if (!read("src/lib/ingestion/ocrMerge.ts").includes("OCR_MERGE_VERSION = 4") && !read("src/lib/ingestion/ocrMerge.ts").includes("OCR_MERGE_VERSION = 5")) {
  console.error("NOT APPLIED: src/lib/ingestion/ocrMerge.ts is not the one step 43a made (run node cleanup/apply-step43a.js first). Nothing was changed.");
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
