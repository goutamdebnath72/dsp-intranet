// cleanup/apply-step38c.js
//
// Edits THREE existing source files and one test IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
//   src/app/api/ai-search/route.ts       when the structured data answers "unanswerable" and nobody is named, the circular search runs first;
//                                        the explanation is shown only if the circulars have nothing either (5 small edits)
//   src/lib/nl2sql/omnibar.ts            an "unanswerable" answer carries a flag, and an explanation that names the database's own view or
//                                        column is replaced by a plain one (3 small edits)
//   src/lib/nl2sql/eval/selftest.ts      3 checks for the two points above
//   cleanup/check-fixes.sh               one report line
// New files come in the zip: src/lib/search/dataGapRule.ts (+ self-test) and the extended src/lib/search/frontGate.ts.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step38c.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "continueToCirculars }",
  "old": "import { answerOmnibar, parseRetry } from \"@/lib/nl2sql/omnibar\";\n",
  "new": "import { answerOmnibar, parseRetry } from \"@/lib/nl2sql/omnibar\";\nimport { continueToCirculars } from \"@/lib/search/dataGapRule\";\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "let heldAnswer:",
  "old": "    if (mode === \"semantic\" && !retrievalOnly) {\n      const endOmnibar = traceStep(\"omnibar\");\n      const payload = await answerOmnibar(q, userTicket || null, retryInfo, { skipModel: modelSkipped });\n      endOmnibar();\n      if (payload) return NextResponse.json({ analytics: payload });\n    }\n",
  "new": "    // The structured data may answer \"unanswerable\" (no such column). When nobody is named, the circulars get their turn first and the\n    // explanation is kept in heldAnswer, shown only if they have nothing either (step 38c, src/lib/search/dataGapRule.ts).\n    let heldAnswer: Awaited<ReturnType<typeof answerOmnibar>> = null;\n    if (mode === \"semantic\" && !retrievalOnly) {\n      const endOmnibar = traceStep(\"omnibar\");\n      const payload = await answerOmnibar(q, userTicket || null, retryInfo, { skipModel: modelSkipped });\n      endOmnibar();\n      if (payload) {\n        const goOn = await continueToCirculars(payload, q, () => loadDirectoryNameWords((sql) => dataSource.query(sql)), { isNameShaped, deptMentioned });\n        if (!goOn) return NextResponse.json({ analytics: payload });\n        heldAnswer = payload;\n      }\n    }\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "the circulars are unavailable: the data's own explanation stands",
  "old": "      endCircular();\n      const rescued = await rescueWithModel(); // the gate skipped the model but circular search is unavailable",
  "new": "      endCircular();\n      if (heldAnswer) return NextResponse.json({ analytics: heldAnswer }); // the circulars are unavailable: the data's own explanation stands\n      const rescued = await rescueWithModel(); // the gate skipped the model but circular search is unavailable"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "nothing in the circulars either: the data's own explanation stands",
  "old": "      return (await rescueWithModel()) ?? NextResponse.json([]);\n    }\n",
  "new": "      if (heldAnswer) return NextResponse.json({ analytics: heldAnswer }); // nothing in the circulars either: the data's own explanation stands\n      return (await rescueWithModel()) ?? NextResponse.json([]);\n    }\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "merged.length === 0 && heldAnswer",
  "old": "      return NextResponse.json(merged);\n    }\n\n    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS",
  "new": "      if (merged.length === 0 && heldAnswer) return NextResponse.json({ analytics: heldAnswer });\n      return NextResponse.json(merged);\n    }\n\n    // --- MODE 3: EXECUTIVE DEEP SYNTHESIS"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "friendlyUnanswerable }",
  "old": "import { isReasonCode, retryHint, verifiedMinConfirms, type AnswerSource, type ReasonCode } from \"./learning\";\n",
  "new": "import { isReasonCode, retryHint, verifiedMinConfirms, type AnswerSource, type ReasonCode } from \"./learning\";\nimport { friendlyUnanswerable } from \"@/lib/search/dataGapRule\";\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "unanswerable?: boolean;",
  "old": "  /** The nl2sql_log row to rate, also for explanations / clarifying questions that carry no SQL. */\n  feedbackLogId?: number | null;\n};\n",
  "new": "  /** The nl2sql_log row to rate, also for explanations / clarifying questions that carry no SQL. */\n  feedbackLogId?: number | null;\n  /** The structured data cannot answer this (\"unanswerable\"): the route may try the circulars before showing the explanation (step 38c). */\n  unanswerable?: boolean;\n};\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "friendlyUnanswerable(res.message)",
  "old": "    case \"clarify\":\n    case \"unanswerable\":\n      return {\n        kind: \"clarify\",\n        answer: res.message,\n",
  "new": "    case \"clarify\":\n    case \"unanswerable\":\n      return {\n        kind: \"clarify\",\n        answer: res.kind === \"unanswerable\" ? friendlyUnanswerable(res.message) : res.message,\n        ...(res.kind === \"unanswerable\" ? { unanswerable: true } : {}),\n"
 },
 {
  "file": "src/lib/nl2sql/eval/selftest.ts",
  "marker": "a clarifying question is not flagged as a data gap",
  "old": "  check(\"a clarifying question is passed on\", o.kind === \"clarify\" && o.answer === \"Which Sanjay do you mean?\");\n",
  "new": "  check(\"a clarifying question is passed on\", o.kind === \"clarify\" && o.answer === \"Which Sanjay do you mean?\");\n  check(\"a clarifying question is not flagged as a data gap\", o.unanswerable === undefined);\n  o = await runOmnibar(\"salary of arup roy\", \"T-OMNI\", mkDeps(script([json({ sql: null, understood_as: \"A salary request.\", unanswerable_reason: \"This data does not include salary.\" })])));\n  check(\"an unanswerable answer is flagged, so that the route may try the circulars first\", o.kind === \"clarify\" && o.unanswerable === true);\n  o = await runOmnibar(\"which pathology room should non-executive employees report to\", \"T-OMNI\", mkDeps(script([json({ sql: null, understood_as: \"A room request.\", unanswerable_reason: \"The health_checkups view does not include a pathology-room column.\" })])));\n  check(\"an explanation that names the database's own view or column is replaced by a plain one\", o.kind === \"clarify\" && o.unanswerable === true && !/health_checkups|view|column/i.test(o.answer) && /do not hold that information/.test(o.answer));\n"
 }
];
const CHECKS = [
 {
  "marker": "the circulars are tried when the data cannot answer",
  "line": "{ grep -q \"continueToCirculars\" src/app/api/ai-search/route.ts && grep -q \"friendlyUnanswerable\" src/lib/nl2sql/omnibar.ts && test -f src/lib/search/dataGapRule.ts; } 2>/dev/null; report \"the circulars are tried when the data cannot answer (and nobody is named)\" $?"
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

read("src/lib/search/dataGapRule.ts");

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
