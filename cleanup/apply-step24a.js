// cleanup/apply-step24a.js
//
// Edits two existing source files IN PLACE (plus .env.example and cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// The FRONT-PATH GATE: when FRONT_PATH_SKIP_MODEL=true, a question that cannot be an employee question skips the model call and
// goes straight to circular search (asking the model only if circular search finds nothing or fails). With the switch OFF (the
// default) every answer is exactly what it was before this patch.
//
//   src/lib/nl2sql/omnibar.ts          a skipModel switch for the model step only (holiday parser and verified answers still go first)
//   src/app/api/ai-search/route.ts     decides with frontGate.ts, and rescues with the model if circular search finds nothing or fails
//   .env.example                       documents FRONT_PATH_SKIP_MODEL
//   cleanup/check-fixes.sh             one report line
// New files come in the zip: src/lib/search/frontGate.ts (+ self-test); frontPathTrace.ts is updated (it records the gate).
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Needs step 23a (route logging) applied first. Run from the project root:   node cleanup/apply-step24a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "skipModel?: boolean;\n}",
  "old": "  /** Different people who must confirm an answer before it is served without the model. */\n  verifiedMin: number;\n}\n",
  "new": "  /** Different people who must confirm an answer before it is served without the model. */\n  verifiedMin: number;\n  /** Front-path gate (src/lib/search/frontGate.ts): the question cannot be an employee question, so skip the model (and the\n   *  old engine) and let the app continue with circular search. The holiday parser and verified answers still go first. */\n  skipModel?: boolean;\n}\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "if (deps.skipModel && !retry) return null;",
  "old": "  // 3. the model writes the SQL (on a retry: told what was rejected and why)\n",
  "new": "  // 2b. front-path gate: not an employee question, so do not spend a model call on it (the app continues with circular search)\n  if (deps.skipModel && !retry) return null;\n\n  // 3. the model writes the SQL (on a retry: told what was rejected and why)\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "opts: { skipModel?: boolean } = {}",
  "old": "export async function answerOmnibar(q: string, userKey: string | null, retry: RetryInfo | null = null): Promise<OmnibarPayload | null> {\n",
  "new": "export async function answerOmnibar(q: string, userKey: string | null, retry: RetryInfo | null = null, opts: { skipModel?: boolean } = {}): Promise<OmnibarPayload | null> {\n"
 },
 {
  "file": "src/lib/nl2sql/omnibar.ts",
  "marker": "skipModel: opts.skipModel,",
  "old": "    verifiedMin: verifiedMinConfirms(),\n    llm: groqLlm(),\n",
  "new": "    verifiedMin: verifiedMinConfirms(),\n    skipModel: opts.skipModel,\n    llm: groqLlm(),\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "setTraceGate, startTrace",
  "old": "import { routeFromReply, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from \"@/lib/search/frontPathTrace\";\n",
  "new": "import { routeFromReply, setTraceGate, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from \"@/lib/search/frontPathTrace\";\nimport { decideModelSkip, frontGateEnabled, loadDirectoryNameWords } from \"@/lib/search/frontGate\";\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "let deptMentioned = false;",
  "old": "    let isNameShaped = false;\n",
  "new": "    let isNameShaped = false;\n    let deptMentioned = false; // read by the front-path gate (frontGate.ts)\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "deptMentioned = true;",
  "old": "        if (dept) {\n          const fragment = normTerm(q)\n",
  "new": "        if (dept) {\n          deptMentioned = true;\n          const fragment = normTerm(q)\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const rescueWithModel = async",
  "old": "    if (mode === \"semantic\" && !retrievalOnly) {\n      const endOmnibar = traceStep(\"omnibar\");\n      const payload = await answerOmnibar(q, userTicket || null, parseRetry(searchParams));\n      endOmnibar();\n      if (payload) return NextResponse.json({ analytics: payload });\n    }\n",
  "new": "    // FRONT-PATH GATE (step 24a; OFF unless FRONT_PATH_SKIP_MODEL=true; src/lib/search/frontGate.ts). A question that mentions\n    // no one in the directory, no department, no ticket and no people-data word cannot be an employee question, so the slow,\n    // token-hungry model call is skipped and circular search answers first. If circular search then finds nothing, or fails,\n    // rescueWithModel asks the model after all: a wrong skip costs time, never a wrong answer.\n    const retryInfo = parseRetry(searchParams);\n    let modelSkipped = false;\n    if (mode === \"semantic\" && !retrievalOnly && !retryInfo && frontGateEnabled()) {\n      const endGate = traceStep(\"gate\");\n      try {\n        const directoryWords = await loadDirectoryNameWords((sql) => dataSource.query(sql));\n        modelSkipped = decideModelSkip({ q, isNameShaped, deptMentioned, directoryWords }).skip;\n      } catch {\n        modelSkipped = false; // the directory's word list is unavailable: behave exactly as before\n      }\n      endGate();\n      setTraceGate(modelSkipped ? \"skipped\" : \"model\");\n    }\n    const rescueWithModel = async () => {\n      if (!modelSkipped) return null;\n      setTraceGate(\"fallback\");\n      const endRescue = traceStep(\"model-fallback\");\n      const rescued = await answerOmnibar(q, userTicket || null, retryInfo, { skipModel: false });\n      endRescue();\n      return rescued ? NextResponse.json({ analytics: rescued }) : null;\n    };\n    if (mode === \"semantic\" && !retrievalOnly) {\n      const endOmnibar = traceStep(\"omnibar\");\n      const payload = await answerOmnibar(q, userTicket || null, retryInfo, { skipModel: modelSkipped });\n      endOmnibar();\n      if (payload) return NextResponse.json({ analytics: payload });\n    }\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "routed = await executeSmartSemanticRouter(dataSource, q);",
  "old": "    const { uniqueResults } = await executeSmartSemanticRouter(dataSource, q);\n    endCircular();\n",
  "new": "    let routed: Awaited<ReturnType<typeof executeSmartSemanticRouter>>;\n    try {\n      routed = await executeSmartSemanticRouter(dataSource, q);\n    } catch (routerErr) {\n      endCircular();\n      const rescued = await rescueWithModel(); // the gate skipped the model but circular search is unavailable\n      if (rescued) return rescued;\n      throw routerErr;\n    }\n    const { uniqueResults } = routed;\n    endCircular();\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "return (await rescueWithModel()) ?? NextResponse.json([]);",
  "old": "      return NextResponse.json([]);\n    }\n\n    // Rank by match percentage. Intellectual (synthesis) mode gets a wider\n",
  "new": "      return (await rescueWithModel()) ?? NextResponse.json([]);\n    }\n\n    // Rank by match percentage. Intellectual (synthesis) mode gets a wider\n"
 }
];
const CHECKS = [
 {
  "marker": "the front-path gate is built (off unless FRONT_PATH_SKIP_MODEL=true)",
  "line": "{ test -f src/lib/search/frontGate.ts && grep -q \"rescueWithModel\" src/app/api/ai-search/route.ts && grep -q \"skipModel\" src/lib/nl2sql/omnibar.ts; } 2>/dev/null; report \"the front-path gate is built (off unless FRONT_PATH_SKIP_MODEL=true)\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";
const ENV = ".env.example";
const ENV_BLOCK = "\n# Front-path gate (step 24a): skip the slow model call for questions that cannot be employee questions, then ask the\n# model anyway if circular search finds nothing. OFF unless this is exactly: true\nFRONT_PATH_SKIP_MODEL=\n";
const NEW_FILES = ["src/lib/search/frontGate.ts", "src/lib/search/frontPathTrace.ts"];

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
if (!read("src/lib/search/frontPathTrace.ts").includes("setTraceGate")) {
  console.error("NOT APPLIED: src/lib/search/frontPathTrace.ts is the old version: unzip patch_step24a.zip first.");
  process.exit(1);
}
if (!read("src/app/api/ai-search/route.ts").includes("frontPathTrace")) {
  console.error("NOT APPLIED: route.ts has no route logging yet: apply step 23a (cleanup/apply-step23a.js) first.");
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

// .env.example is documentation only: add the line when the file exists and does not mention it yet
let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;
const envNeeds = env !== null && !env.includes("FRONT_PATH_SKIP_MODEL");
if (envNeeds) env = env.replace(/\s*$/, "\n") + ENV_BLOCK;

// ---- 2. write (every anchor was verified above)
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (envNeeds) { fs.writeFileSync(ENV, env); changed++; console.log(`edited   ${ENV}  (+ FRONT_PATH_SKIP_MODEL)`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. The gate stays OFF until you set FRONT_PATH_SKIP_MODEL=true in .env.local." : "Nothing to do: already applied.");
