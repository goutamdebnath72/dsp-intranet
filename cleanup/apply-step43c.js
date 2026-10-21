// cleanup/apply-step43c.js
//
// Edits THREE existing files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 43c, found by the whole-archive dry run of 19 Oct:
//   src/lib/ingestion/ocrMerge.ts        step 43b cut Devanagari and Bengali NUMERALS at their separators (६,००० became 000, १,५०,००० became 50 and 000, २,८०० lost its 2,
//                                        a date fell into three numbers): a separator between two Indic digits now stays, and is kept in the stored numeral; OCR_MERGE_VERSION 5 -> 6
//   src/lib/ingestion/ocr.ts             OCR_INDIC_CUT=false switches the step-43a cut off, to measure it on its own
//   scripts/reread-circulars.ts          a circular a second reader (Gemini) has read is SKIPPED (circular 85: its correct date would come back as 20-0802); --include-second-read overrides
//   cleanup/check-fixes.sh               one report line
// The tests (indicMisreads.selftest.ts) come whole in the zip. Run steps 43a and 43b first.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step43c.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "const DIGIT_JOINERS",
  "old": "const WORD_SEPARATORS = /[-\\u2010-\\u2015\\u2018\\u2019\\u201C\\u201D'\"()[\\]{}:;,]+/;\n",
  "new": "const SEPARATOR_CHARS = \"-\\\\u2010-\\\\u2015\\\\u2018\\\\u2019\\\\u201C\\\\u201D'\\\"()\\\\[\\\\]{}:;,\";\nconst DIGITS = \"\\\\u0966-\\\\u096F\\\\u09E6-\\\\u09EF\";\n/** ...but NOT where it joins two Indic DIGITS: ६,००० (an amount), २०-०८-२०२६ (a date), २०२५-२६ (a session) are each ONE numeral, and cutting them gave 000, 50 and 08. */\nconst WORD_SEPARATORS = new RegExp(`(?<![${DIGITS}])[${SEPARATOR_CHARS}]+|[${SEPARATOR_CHARS}]+(?![${DIGITS}])`);\n/** What may join two Indic digits inside a numeral, and is kept there: the stored numeral then reads as the number it is (६,००० = 6000, २०-०८-२०२६ = 20.08.2026). */\nconst DIGIT_JOINERS = new Set([\",\", \".\", \":\", \"/\", \"-\", \"\\u2013\", \"\\u2014\"]);\n"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "a separator inside a numeral",
  "old": "      let t = \"\";\n      for (const c of raw) if (INDIC_CHAR.test(c)) t += c;\n      const l = countLetters(t);",
  "new": "      let t = \"\";\n      const chars = [...raw];\n      chars.forEach((c, i) => {\n        if (INDIC_CHAR.test(c)) t += c;\n        else if (DIGIT_JOINERS.has(c) && INDIC_DIGIT.test(chars[i - 1] ?? \"\") && INDIC_DIGIT.test(chars[i + 1] ?? \"\")) t += c; // a separator inside a numeral\n      });\n      const l = countLetters(t);"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "6 = ...except between two Indic digits",
  "old": " *  5 = the Indic words of a line are split at punctuation (a hyphen, a quote, a bracket) and no longer glued (\"প্রকল্পএর\"). */\nexport const OCR_MERGE_VERSION = 5;",
  "new": " *  5 = the Indic words of a line are split at punctuation (a hyphen, a quote, a bracket) and no longer glued (\"প্রকল্পএর\").\n *  6 = ...except between two Indic digits: ६,००० stays one numeral (step 43b cut it into 000). */\nexport const OCR_MERGE_VERSION = 6;"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "process.env.OCR_INDIC_CUT !== \"false\"",
  "old": "  if (engWords.length && triWords.length) {\n    const cut = new Set(indicMisreads(engWords, triWords, tri));",
  "new": "  // OCR_INDIC_CUT=false switches the cut off (to measure it on its own: run the re-read dry run with and without it, with --no-cache)\n  if (engWords.length && triWords.length && process.env.OCR_INDIC_CUT !== \"false\") {\n    const cut = new Set(indicMisreads(engWords, triWords, tri));"
 },
 {
  "file": "scripts/reread-circulars.ts",
  "marker": "were read by the second reader (Gemini): their stored text is kept",
  "old": "        const plan = await planReread(deps, row, old, structured);\n",
  "new": "        // A circular the second reader (Gemini) read keeps its text: that text is better than a Tesseract-only re-read (circular 85: the date 20-08-2026 would\n        // come back as 20-0802). --include-second-read overrides.\n        let secondRead = 0;\n        if (!flag(\"include-second-read\")) {\n          try {\n            secondRead = Number((await client.query(`SELECT count(*) AS n FROM public.circular_page_check WHERE circular_id = $1 AND reader LIKE 'gemini%'`, [row.id])).rows[0]?.n ?? 0);\n          } catch {\n            secondRead = 0; // the table does not exist: no second readings\n          }\n        }\n        const plan: RereadPlan = secondRead\n          ? {\n              id: row.id, serialNumber: row.serialNumber, headline: row.headline, pages: Array.isArray(row.fileUrls) ? row.fileUrls.length : 0, oldChunks: old.length, newChunks: [],\n              oldChars: old.reduce((m, c) => m + c.text.length, 0), newChars: old.reduce((m, c) => m + c.text.length, 0), onlyInOld: [], onlyInNew: [], pageTexts: [], extractedText: \"\", status: \"skipped\",\n              reason: `${secondRead} page(s) were read by the second reader (Gemini): their stored text is kept (use --include-second-read to re-read anyway)`,\n            }\n          : await planReread(deps, row, old, structured);\n"
 }
];
const CHECKS = [
 {
 "marker": "Indic numerals stay whole, a Gemini-read circular is not re-read by Tesseract",
 "line": "{ grep -q \"DIGIT_JOINERS\" src/lib/ingestion/ocrMerge.ts && grep -q \"include-second-read\" scripts/reread-circulars.ts; } 2>/dev/null; report \"Indic numerals stay whole, a Gemini-read circular is not re-read by Tesseract\" $?"
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

if (!read("src/lib/ingestion/ocrMerge.ts").includes("OCR_MERGE_VERSION = 5") && !read("src/lib/ingestion/ocrMerge.ts").includes("OCR_MERGE_VERSION = 6")) {
  console.error("NOT APPLIED: src/lib/ingestion/ocrMerge.ts is not the one step 43b made (run node cleanup/apply-step43b.js first). Nothing was changed.");
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
