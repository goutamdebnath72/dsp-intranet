// cleanup/apply-step26a.js
//
// Edits three existing source files IN PLACE (plus .env.example and cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// The Enter key can decide for itself that a question needs Executive Deep Synthesis (the pattern is in
// src/lib/search/synthesisIntent.ts). With FRONT_PATH_AUTO_EDS unset (the default) NOTHING changes in any answer; the verdict is
// only recorded in the trace.
//
//   src/app/api/ai-search/route.ts   records the intent; with FRONT_PATH_AUTO_EDS=true starts the synthesis for a logged-in executive
//   src/hooks/useOmniSearch.ts       the screen shows a synthesis that arrives from the plain Enter path
//   src/lib/holidays/parser.ts       the holiday parser no longer answers a "compare ..." or "breakdown ..." question that is really
//                                    about circulars (before: "compare the leave entitlements for contractor workers in the 2023 and
//                                    2025 holiday and leave circulars" was answered with holiday counts)
//   .env.example                     documents FRONT_PATH_AUTO_EDS
//   cleanup/check-fixes.sh           one report line
// New files come in the zip: synthesisIntent.ts (+ self-test); frontPathTrace.ts is updated (it records the intent).
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Needs steps 23a, 24a and 25a applied first. Run from the project root:   node cleanup/apply-step26a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "setTraceGate, setTraceSynth, startTrace",
  "old": "import { routeFromReply, setTraceGate, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from \"@/lib/search/frontPathTrace\";\n",
  "new": "import { routeFromReply, setTraceGate, setTraceSynth, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from \"@/lib/search/frontPathTrace\";\nimport { autoEdsEnabled, detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const synthIntent = mode === \"semantic\"",
  "old": "    // --- TIER 3 EXECUTIVE AUTHORIZATION GATE ---\n",
  "new": "    // SYNTHESIS INTENT (step 26a, src/lib/search/synthesisIntent.ts): does the question need several circulars built into one\n    // answer (compare / trace / contrast / what changed between ... / list the events of a month)? It is always recorded in the\n    // trace (passive). With FRONT_PATH_AUTO_EDS=true the Enter key itself starts the synthesis, for a LOGGED-IN executive only;\n    // the directory check just below still has the last word, and the holiday parser and verified answers go first.\n    const synthIntent = mode === \"semantic\" ? detectSynthesisIntent(q) : null;\n    if (synthIntent) setTraceSynth(synthIntent.level, synthIntent.score);\n    if (synthIntent?.synthesis && autoEdsEnabled() && userTicket && /^4\\d{5}$/.test(userTicket) && !parseRetry(searchParams)) {\n      const direct = await answerOmnibar(q, userTicket, null, { skipModel: true });\n      if (direct) return NextResponse.json({ analytics: direct });\n      mode = \"intellectual\";\n    }\n\n    // --- TIER 3 EXECUTIVE AUTHORIZATION GATE ---\n"
 },
 {
  "file": "src/lib/holidays/parser.ts",
  "marker": "leftoverAfterStrip(q.replace(new RegExp(COMPARE_WORD.source",
  "old": "  if (hasHolidayWord && COMPARE_WORD.test(q)) {\n    const yearA = years[0] ?? explicitYearFromDate ?? now.year;\n",
  "new": "  if (hasHolidayWord && COMPARE_WORD.test(q)) {\n    // Hijack guard, as in the count/list branch: \"compare the leave entitlements for contractor workers in the 2023 and 2025 holiday and\n    // leave circulars\" is about CIRCULARS, not the calendar. Any topic word left once the holiday vocabulary and the compare word are\n    // stripped means this is not a calendar comparison: hand it on (circular search or synthesis) instead of answering with holiday counts.\n    if (leftoverAfterStrip(q.replace(new RegExp(COMPARE_WORD.source, \"g\"), \" \"))) return null; // ALL compare words, not just the first\n    const yearA = years[0] ?? explicitYearFromDate ?? now.year;\n"
 },
 {
  "file": "src/lib/holidays/parser.ts",
  "marker": "leftoverAfterStrip(q.replace(new RegExp(BREAKDOWN_WORD.source",
  "old": "  if (hasHolidayWord && BREAKDOWN_WORD.test(q)) {\n    const year = years[0] ?? explicitYearFromDate ?? now.year;\n",
  "new": "  if (hasHolidayWord && BREAKDOWN_WORD.test(q)) {\n    if (leftoverAfterStrip(q.replace(new RegExp(BREAKDOWN_WORD.source, \"g\"), \" \"))) return null; // same hijack guard: \"holiday breakdown for contract workers\" is not the calendar\n    const year = years[0] ?? explicitYearFromDate ?? now.year;\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "mode: synthesis ? (\"intellectual\" as SearchMode) : mode,",
  "old": "    setQuery,\n    mode,\n    triggerSearch,\n",
  "new": "    setQuery,\n    // A synthesis that arrives on the plain Enter path (the engine chose it, step 26a) is shown as one: the screen follows the answer.\n    mode: synthesis ? (\"intellectual\" as SearchMode) : mode,\n    triggerSearch,\n"
 }
];
const CHECKS = [
 {
  "marker": "the Enter key can start a synthesis for an executive (off unless FRONT_PATH_AUTO_EDS=true)",
  "line": "{ test -f src/lib/search/synthesisIntent.ts && grep -q \"autoEdsEnabled\" src/app/api/ai-search/route.ts && grep -q \"intellectual\\\" as SearchMode\" src/hooks/useOmniSearch.ts; } 2>/dev/null; report \"the Enter key can start a synthesis for an executive (off unless FRONT_PATH_AUTO_EDS=true)\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";
const ENV = ".env.example";
const ENV_BLOCK = "\n# Synthesis on the Enter key (step 26a): a question that needs several circulars built into one answer starts the Executive\n# Deep Synthesis by itself for a logged-in executive, with no button. OFF unless this is exactly: true\nFRONT_PATH_AUTO_EDS=\n";
const NEW_FILES = ["src/lib/search/synthesisIntent.ts", "src/lib/search/frontPathTrace.ts"];

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

// ---- 1. verify EVERYTHING before writing anything
for (const f of NEW_FILES) read(f);
if (!read("src/lib/search/frontPathTrace.ts").includes("setTraceSynth")) {
  console.error("NOT APPLIED: src/lib/search/frontPathTrace.ts is the old version: unzip patch_step26a.zip first.");
  process.exit(1);
}
if (!read("src/app/api/ai-search/route.ts").includes("getSessionTicket")) {
  console.error("NOT APPLIED: route.ts is missing the earlier steps: apply steps 23a, 24a and 25a first.");
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
    console.error(`NOT APPLIED: ${CF} does not have the expected ending (a bare "echo" line followed by the "if [ \\"$bad\\" ..." line, exactly once). Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;
const envNeeds = env !== null && !env.includes("FRONT_PATH_AUTO_EDS");
if (envNeeds) env = env.replace(/\s*$/, "\n") + ENV_BLOCK;

// ---- 2. write
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (envNeeds) { fs.writeFileSync(ENV, env); changed++; console.log(`edited   ${ENV}  (+ FRONT_PATH_AUTO_EDS)`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. (Whether the Enter key starts a synthesis is switched by step 27a: NEXT_PUBLIC_FRONT_PATH_AUTO_EDS, off by default.)" : "Nothing to do: already applied.");
