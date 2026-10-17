// cleanup/apply-step30b.js
//
// Edits TWO existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// THE ROOT CAUSE of damaged table text in scanned circulars (found 17 Oct): Tesseract decides the layout of a page by itself, and on a
// page with a table drawn with lines that decision is unstable: a narrow column is dropped, grid lines become characters, and the
// result changes with the scale. The fix reads the cells of a ruled table one by one (ruledTable.ts) and keeps the table out of the
// page reading. See the header of src/lib/ingestion/ruledTable.ts.
//
//   src/lib/ingestion/ocr.ts        reads ruled tables first and whites them out of the picture the page reading sees
//   src/lib/ingestion/ocrMerge.ts   the version goes from 2 to 3 (so the re-read tool reads every page again) and the discards are
//                                   reported against the table text too
//   cleanup/check-fixes.sh          one report line
// New files come in the zip: ruledTable.ts (+ self-test and a test page).
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step30b.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "import { keepWellRead, parseTsvWords, readRuledTables, textOfWords, tsvWithout, withoutTableWords, type CellOcr, type RuledPage, type TableReading } from \"./ruledTable\";",
  "old": "import { reconstructTableFromTSV } from \"./tableReconstruction\";\n",
  "new": "import { reconstructTableFromTSV } from \"./tableReconstruction\";\nimport { keepWellRead, parseTsvWords, readRuledTables, textOfWords, tsvWithout, withoutTableWords, type CellOcr, type RuledPage, type TableReading } from \"./ruledTable\";\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "export const RULED_TABLE_BUDGET_MS",
  "old": "export const OCR_LANGS = [\"eng\", \"hin+eng+ben\"] as const;\n",
  "new": "export const OCR_LANGS = [\"eng\", \"hin+eng+ben\"] as const;\n\n/** The most time one page may spend reading its ruled tables cell by cell (a typical table takes a few seconds). */\nexport const RULED_TABLE_BUDGET_MS = 90_000;\n\n/** Reads one cell: \"block\" mode (a few words or lines) at a stated resolution, which is what the engine does well. */\nfunction cellReader(worker: any): CellOcr {\n  let prepared = false;\n  return async (png) => {\n    if (!prepared) {\n      await worker.setParameters({ tessedit_pageseg_mode: \"6\" as any, user_defined_dpi: \"300\" as any });\n      prepared = true;\n    }\n    const { data } = await worker.recognize(png, {}, { text: true });\n    return { text: data.text || \"\", conf: Number(data.confidence ?? 0) };\n  };\n}\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "  /** Ruled tables read cell by cell",
  "old": "  fellBackToIndicPass: boolean;\n}\n",
  "new": "  fellBackToIndicPass: boolean;\n  /** Ruled tables read cell by cell (ruledTable.ts) instead of by the page reading. */\n  ruledTables?: number;\n  /** Numbers in those tables that the readings could not agree on (written \"[unclear]\"). */\n  unclearCells?: number;\n}\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "RULED TABLES (ruledTable.ts).",
  "old": "export async function ocrPageDual(input: Buffer | Uint8Array, label: string, workers: OcrWorkerPool): Promise<OcrPageResult> {\n  let eng = \"\";\n  let table = \"\";\n  let tri = \"\";\n  for (const langs of OCR_LANGS) {\n    try {\n      const worker = workers[langs];\n      const {\n        data: { text, tsv },\n      } = await worker.recognize(input, {}, { text: true, tsv: langs === \"eng\" });\n      if (langs === \"eng\") {\n        eng = text || \"\";\n        if (tsv) table = reconstructTableFromTSV(tsv) || \"\";\n      } else {\n        tri = text || \"\";\n      }\n    } catch (err) {\n      console.error(`OCR pass \"${langs}\" failed${label ? \" on \" + label : \"\"}:`, (err as any)?.message || err);\n    }\n  }\n  const merged = mergeOcrPasses(eng, table, tri);",
  "new": "export async function ocrPageDual(input: Buffer | Uint8Array, label: string, workers: OcrWorkerPool): Promise<OcrPageResult> {\n  let eng = \"\";\n  let table = \"\";\n  let tri = \"\";\n  // RULED TABLES (ruledTable.ts). The page reading cannot be trusted to lay out a table: it drops a narrow column and turns grid lines into\n  // characters, differently at every scale. So the cells of a ruled table are read one by one (with a vote on every number). The page is still\n  // read as before (always from the original picture), and a table reading is USED only if it keeps the words the page reading saw in that table;\n  // the words it contains are then cut out of the page text by their positions, so no damaged copy of the table is stored.\n  let ruled: RuledPage = { tables: [], text: \"\", maskedPng: null, skipped: [] };\n  let kept: TableReading[] = [];\n  const notUsed: string[] = [];\n  try {\n    ruled = await readRuledTables(Buffer.from(input), cellReader(workers.eng), { budgetMs: RULED_TABLE_BUDGET_MS, alt: cellReader(workers[\"hin+eng+ben\"]) });\n  } catch (err) {\n    console.error(`Ruled-table reading failed${label ? \" on \" + label : \"\"} (the page is read as before):`, (err as any)?.message || err);\n  } finally {\n    for (const langs of OCR_LANGS) {\n      try {\n        await workers[langs].setParameters({ tessedit_pageseg_mode: \"3\" as any, user_defined_dpi: \"0\" as any });\n      } catch {\n        /* the workers are reset for the page reading; a failure here shows up as a failed page reading below */\n      }\n    }\n  }\n  notUsed.push(...ruled.skipped);\n  for (const langs of OCR_LANGS) {\n    try {\n      const worker = workers[langs];\n      const {\n        data: { text, tsv },\n      } = await worker.recognize(input, {}, { text: true, tsv: langs === \"eng\" });\n      if (langs === \"eng\") {\n        eng = text || \"\";\n        let tsvForOldTables = tsv || \"\";\n        if (tsv && ruled.tables.length) {\n          const words = parseTsvWords(tsv);\n          const verdict = keepWellRead(ruled.tables, words);\n          kept = verdict.kept;\n          notUsed.push(...verdict.skipped);\n          if (kept.length) {\n            // cut only what the table readings contain (and grid-line debris); every other word inside a table's box stays\n            const rest = withoutTableWords(words, kept);\n            eng = textOfWords(rest.words);\n            tsvForOldTables = tsvWithout(tsv, rest.removed);\n          }\n        }\n        // a table WITHOUT lines is still rebuilt from the word positions, as before\n        if (tsvForOldTables) table = reconstructTableFromTSV(tsvForOldTables) || \"\";\n      } else {\n        tri = text || \"\";\n      }\n    } catch (err) {\n      console.error(`OCR pass \"${langs}\" failed${label ? \" on \" + label : \"\"}:`, (err as any)?.message || err);\n    }\n  }\n  if (kept.length) {\n    const keptText = kept.map((t) => t.text).join(\"\\n\\n\");\n    table = table ? `${keptText}\\n\\n${table}` : keptText;\n  }\n  const merged = mergeOcrPasses(eng, table, tri);"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "ruled tables read cell by cell: ${kept.length}",
  "old": "          : \"the two passes agree on every number\"),\n  );\n",
  "new": "          : \"the two passes agree on every number\") +\n      (kept.length ? ` | ruled tables read cell by cell: ${kept.length}${kept.reduce((n, t) => n + t.unclear, 0) ? ` (${kept.reduce((n, t) => n + t.unclear, 0)} unclear number(s))` : \"\"}` : \"\") +\n      (notUsed.length ? ` | not used: ${notUsed.join(\"; \")}` : \"\"),\n  );\n"
 },
 {
  "file": "src/lib/ingestion/ocr.ts",
  "marker": "ruledTables: kept.length",
  "old": "indicLetters: merged.indicLetters, discarded: merged.discarded, fellBackToIndicPass: merged.fellBackToIndicPass };\n}",
  "new": "indicLetters: merged.indicLetters, discarded: merged.discarded, fellBackToIndicPass: merged.fellBackToIndicPass, ruledTables: kept.length, unclearCells: kept.reduce((n, t) => n + t.unclear, 0) };\n}"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "export const OCR_MERGE_VERSION = 3;",
  "old": "export const OCR_MERGE_VERSION = 2;",
  "new": "export const OCR_MERGE_VERSION = 3;"
 },
 {
  "file": "src/lib/ingestion/ocrMerge.ts",
  "marker": "discarded: discardedNumbers(engText + \"\\n\" + (table || \"\"), tri || \"\")",
  "old": "discarded: discardedNumbers(engText, tri || \"\")",
  "new": "discarded: discardedNumbers(engText + \"\\n\" + (table || \"\"), tri || \"\")"
 }
];
const CHECKS = [
 {
  "marker": "scanned tables are read cell by cell (the page reading cannot lay out a table)",
  "line": "{ test -f src/lib/ingestion/ruledTable.ts && grep -q \"readRuledTables\" src/lib/ingestion/ocr.ts; } 2>/dev/null; report \"scanned tables are read cell by cell (the page reading cannot lay out a table)\" $?"
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

read("src/lib/ingestion/ruledTable.ts");

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
console.log(changed ? "Applied. New uploads, and the archive re-read tool, now read ruled tables cell by cell." : "Nothing to do: already applied.");
