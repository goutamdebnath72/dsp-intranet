// cleanup/apply-step39a.js
//
// Edits TWO existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
//   src/app/api/circulars/route.ts        the UPLOAD: each page image is also read by a second reader (Gemini), next to Tesseract; after the last page the
//                                         two readings are reconciled and the better text is chunked, embedded and stored; the page checks are stored with
//                                         the upload; the decision of every page goes to circular_ingest_log (8 small edits)
//   src/components/CircularUploadModal.tsx  one sentence for the uploader, in the success message: how well the circular was read (4 small edits)
//   cleanup/check-fixes.sh                one report line
// New files come in the zip: src/lib/ingestion/pageVerify.ts, src/lib/ingestion/uploadSecondReading.ts (+ self-tests) and the extended src/lib/search/pageChecks.ts.
//
// Off with UPLOAD_SECOND_READING=false in .env.local (and off without GEMINI_API_KEY): the upload then behaves exactly as before.
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step39a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "createSecondReading, readingLine, uploadSecondReader }",
  "old": "import { createRosterProbe } from \"@/lib/ingestion/schedule/rosterProbe\";\n",
  "new": "import { createRosterProbe } from \"@/lib/ingestion/schedule/rosterProbe\";\nimport { createSecondReading, readingLine, uploadSecondReader } from \"@/lib/ingestion/uploadSecondReading\";\nimport { checkRowsFor, savePageChecks } from \"@/lib/search/pageChecks\";\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "SECOND_READING_STOP_AFTER_MS = 200_000",
  "old": "const FALLBACK_RESERVE_MS = 40_000;\n",
  "new": "const FALLBACK_RESERVE_MS = 40_000;\n// The second reading (Gemini, per page, next to Tesseract) must be back by this time; the rest of the request is for assembling, embedding and the commit.\nconst SECOND_READING_STOP_AFTER_MS = 200_000;\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "const secondReading = createSecondReading(",
  "old": "    const rosterProbe = createRosterProbe();\n",
  "new": "    const rosterProbe = createRosterProbe();\n\n    // SECOND READING (step 39a): a second reader (Gemini) reads each page image next to Tesseract; after the last page the two readings are reconciled and the\n    // better text is what gets chunked, embedded and stored (src/lib/ingestion/uploadSecondReading.ts). Off for a holiday-list circular (no OCR at all), without\n    // GEMINI_API_KEY, and with UPLOAD_SECOND_READING=false. A failure of this step never fails the upload: the page keeps the Tesseract text, as before.\n    const secondReading = createSecondReading({ reader: skipOcrAndEmbedding ? null : uploadSecondReader(), deadlineAt: startedAt + SECOND_READING_STOP_AFTER_MS });\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "secondReading.start(1, fileBytes)",
  "old": "          console.log(\"DEBUG: Running dual-pass OCR (PSM 3) on image...\");\n",
  "new": "          secondReading.start(1, fileBytes); // the second reader looks at the same image while Tesseract works\n          console.log(\"DEBUG: Running dual-pass OCR (PSM 3) on image...\");\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "secondReading.start(page, pngBuffer)",
  "old": "          if (ocrWorkers && !isRosterPage) {\n            try {\n",
  "new": "          if (ocrWorkers && !isRosterPage) secondReading.start(page, pngBuffer); // second reader and Tesseract work on the page at the same time\n          if (ocrWorkers && !isRosterPage) {\n            try {\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "const secondSummary = await secondReading.finish(perPageText);",
  "old": "    /* ============================\n       TEXT extraction -- skipped entirely for a detected holiday-list\n",
  "new": "    // The pages the second reader read take its text where it is the better one; the assembled text is rebuilt from the pages (it feeds the circular's own vector).\n    const secondSummary = await secondReading.finish(perPageText);\n    if (secondSummary.changedPages > 0) ocrAccumulatedText = perPageText.filter((t) => t && t.trim()).join(\" \\n\") + \" \\n\";\n    if (secondSummary.enabled) console.log(`UPLOAD: second reading: ${readingLine(secondSummary.log) || \"no page was read\"}`);\n\n    /* ============================\n       TEXT extraction -- skipped entirely for a detected holiday-list\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "detail = { ...detail, secondReading: secondSummary.log };",
  "old": "      let detail: Record<string, unknown> = { pages: fileUrls.length, chunks: preparedChunks.length };\n",
  "new": "      let detail: Record<string, unknown> = { pages: fileUrls.length, chunks: preparedChunks.length };\n      if (secondSummary.enabled) {\n        // what the second reading decided, page by page, goes to the log; its checks are stored with the fingerprint of the text that was really stored\n        detail = { ...detail, secondReading: secondSummary.log };\n        detail.pageChecksSaved = await savePageChecks(sql, circular.id, checkRowsFor(secondSummary.checks, preparedChunks.map((c) => ({ page: c.page, index: c.index, text: c.text }))));\n      }\n"
 },
 {
  "file": "src/app/api/circulars/route.ts",
  "marker": "readingLine: readingLine(secondSummary.log)",
  "old": "      circular,\n      ingest,\n    });\n",
  "new": "      circular,\n      ingest,\n      secondReading: secondSummary.log,\n      readingLine: readingLine(secondSummary.log),\n    });\n"
 },
 {
  "file": "src/components/CircularUploadModal.tsx",
  "marker": "const [readingNote, setReadingNote]",
  "old": "  const [errorMessage, setErrorMessage] = useState(\"\");\n",
  "new": "  const [errorMessage, setErrorMessage] = useState(\"\");\n  // How well the uploaded circular was read (the server's one sentence, shown with the success message).\n  const [readingNote, setReadingNote] = useState(\"\");\n"
 },
 {
  "file": "src/components/CircularUploadModal.tsx",
  "marker": "setReadingNote(\"\");\n    setPublishedDate(null);",
  "old": "    setErrorMessage(\"\");\n    setPublishedDate(null);\n",
  "new": "    setErrorMessage(\"\");\n    setReadingNote(\"\");\n    setPublishedDate(null);\n"
 },
 {
  "file": "src/components/CircularUploadModal.tsx",
  "marker": "setReadingNote(typeof response.data?.readingLine",
  "old": "      setStatus(\"success\");\n      onUploadSuccess(response.data);\n",
  "new": "      setStatus(\"success\");\n      setReadingNote(typeof response.data?.readingLine === \"string\" ? response.data.readingLine : \"\");\n      onUploadSuccess(response.data);\n"
 },
 {
  "file": "src/components/CircularUploadModal.tsx",
  "marker": "{status === \"success\" && readingNote && (",
  "old": "              <p className=\"text-sm text-green-600 text-center\">\n                Upload successful! Closing soon...\n              </p>\n            )}\n",
  "new": "              <p className=\"text-sm text-green-600 text-center\">\n                Upload successful! Closing soon...\n              </p>\n            )}\n            {status === \"success\" && readingNote && (\n              <p className=\"text-xs text-neutral-600 text-center\">{readingNote}</p>\n            )}\n"
 }
];
const CHECKS = [
 {
  "marker": "every page of an upload is read by a second reader",
  "line": "{ grep -q \"createSecondReading\" src/app/api/circulars/route.ts && grep -q \"setReadingNote\" src/components/CircularUploadModal.tsx && test -f src/lib/ingestion/uploadSecondReading.ts; } 2>/dev/null; report \"every page of an upload is read by a second reader and the better text is stored (UPLOAD_SECOND_READING=false switches it off)\" $?"
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

for (const f of ["src/lib/ingestion/uploadSecondReading.ts", "src/lib/ingestion/pageVerify.ts"]) read(f);
if (!read("src/lib/search/pageChecks.ts").includes("savePageChecks")) {
  console.error("NOT APPLIED: src/lib/search/pageChecks.ts is not the new one. Unzip patch_step39a.zip first. Nothing was changed.");
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
