// cleanup/apply-step43a.js
//
// Edits TWO existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 43a: on a page with Hindi or Bengali text,
// the English reading's words that stand where the Hindi/Bengali reading sees Indic script (and that the English reading was not sure of) are misreadings of
// Indic glyphs, and are cut before the two readings are merged (src/lib/ingestion/indicMisreads.ts). Before: a fully Bengali circular was stored with 14 numbers
// that are not on the page, and nine lines of Latin gibberish.
//   src/lib/ingestion/ocr.ts        asks for the word positions of BOTH readings, cuts those words, recomposes the English text from the rest, reports the count
//   src/lib/ingestion/ocrMerge.ts   OCR_MERGE_VERSION 3 -> 4 (the archive re-read tool then ignores readings made by the old rule) and one exported helper
//   cleanup/check-fixes.sh          one report line
// The rule, its test and its real-page fixture come whole in the zip.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step43a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "4 = English-pass words that sit where the Hindi/Bengali pass reads Indic script",
  "old": " *  2 = the table header fix (a roster page used to get a 60,000-character column dump). */\nexport const OCR_MERGE_VERSION = 3;",
  "new": " *  2 = the table header fix (a roster page used to get a 60,000-character column dump).\n *  4 = English-pass words that sit where the Hindi/Bengali pass reads Indic script are cut before the merge (indicMisreads.ts). */\nexport const OCR_MERGE_VERSION = 4;"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "export function isIndicWord",
  "old": "/** Only the Indic-script words of a text",
  "new": "/** A token the Hindi/Bengali pass read as a word or numeral of its own script: at least one Indic letter, or an Indic digit (marks alone do not count). */\nexport function isIndicWord(token: string): boolean {\n  let t = \"\";\n  for (const c of token || \"\") if (INDIC_CHAR.test(c)) t += c;\n  return countLetters(t) > 0 || [...t].some((c) => INDIC_DIGIT.test(c));\n}\n\n/** Only the Indic-script words of a text"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "from \"./indicMisreads\"",
  "old": "import { mergeOcrPasses } from \"./ocrMerge\";\n",
  "new": "import { mergeOcrPasses } from \"./ocrMerge\";\nimport { indicMisreads } from \"./indicMisreads\";\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "English-pass words cut because the Hindi/Bengali pass read Indic script",
  "old": "  unclearCells?: number;\n",
  "new": "  unclearCells?: number;\n  /** English-pass words cut because the Hindi/Bengali pass read Indic script where they stand (misreadings of Indic glyphs: indicMisreads.ts). */\n  indicMisreads?: number;\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "let engWords: ReturnType<typeof parseTsvWords> = [];",
  "old": "  let eng = \"\";\n  let table = \"\";\n  let tri = \"\";\n",
  "new": "  let eng = \"\";\n  let table = \"\";\n  let tri = \"\";\n  let engWords: ReturnType<typeof parseTsvWords> = [];\n  let triWords: ReturnType<typeof parseTsvWords> = [];\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "{ text: true, tsv: true }",
  "old": "} = await worker.recognize(input, {}, { text: true, tsv: langs === \"eng\" });",
  "new": "} = await worker.recognize(input, {}, { text: true, tsv: true });"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "engWords = tsv ? parseTsvWords(tsv) : [];",
  "old": "        eng = text || \"\";\n        let tsvForOldTables",
  "new": "        eng = text || \"\";\n        engWords = tsv ? parseTsvWords(tsv) : [];\n        let tsvForOldTables"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "engWords = rest.words;",
  "old": "            eng = textOfWords(rest.words);\n",
  "new": "            eng = textOfWords(rest.words);\n            engWords = rest.words;\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "triWords = tsv ? parseTsvWords(tsv) : [];",
  "old": "        tri = text || \"\";\n",
  "new": "        tri = text || \"\";\n        triWords = tsv ? parseTsvWords(tsv) : [];\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "step 43a: an English-pass word that stands where",
  "old": "  if (kept.length) {\n    const keptText",
  "new": "  // step 43a: an English-pass word that stands where the Hindi/Bengali pass read Indic script, and that the English pass was not sure of, is a misreading of an\n  // Indic glyph (gibberish, or a number invented from a Bengali or Devanagari numeral): it is cut before the merge (indicMisreads.ts). Only such words are cut: the\n  // text of an English page, and of every line without Indic script, is exactly what it was.\n  let indicCut = 0;\n  if (engWords.length && triWords.length) {\n    const cut = new Set(indicMisreads(engWords, triWords, tri));\n    if (cut.size) {\n      eng = textOfWords(engWords.filter((w) => !cut.has(w)));\n      indicCut = cut.size;\n    }\n  }\n  if (kept.length) {\n    const keptText"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "words cut: the Hindi/Bengali pass read Indic script there",
  "old": "`[ocr] ${label || \"page\"}: English pass ${eng.length} chars; Indic words kept",
  "new": "`[ocr] ${label || \"page\"}: English pass ${eng.length} chars${indicCut ? ` (${indicCut} words cut: the Hindi/Bengali pass read Indic script there)` : \"\"}; Indic words kept"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "unclearCells: kept.reduce((n, t) => n + t.unclear, 0), indicMisreads: indicCut",
  "old": "unclearCells: kept.reduce((n, t) => n + t.unclear, 0) };",
  "new": "unclearCells: kept.reduce((n, t) => n + t.unclear, 0), indicMisreads: indicCut };"
 }
];
const CHECKS = [
 {
 "marker": "OCR cuts the English pass's misreadings of Indic glyphs",
 "line": "{ grep -q \"indicMisreads\" src/lib/ingestion/ocr.ts && grep -q \"OCR_MERGE_VERSION = 4\" src/lib/ingestion/ocrMerge.ts; } 2>/dev/null; report \"OCR cuts the English pass's misreadings of Indic glyphs\" $?"
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

if (!read("src/lib/ingestion/indicMisreads.ts").includes("indicMisreads")) {
  console.error("NOT APPLIED: src/lib/ingestion/indicMisreads.ts is not there. Unzip patch_step43a.zip first. Nothing was changed.");
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
