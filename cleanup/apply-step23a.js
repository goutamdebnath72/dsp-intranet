// cleanup/apply-step23a.js
//
// Edits three existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// PASSIVE route logging, step 2 of the front-path plan: nothing about any answer changes.
//
//   src/app/api/ai-search/route.ts          every search is wrapped: x-omni-* / Server-Timing headers and one
//                                           "[front-path] ..." console line (route, stages, model calls, tokens)
//   src/lib/nl2sql/llm.ts                   the model adapter reports each call's tokens and each rate-limit wait
//   src/lib/search/executiveSynthesis.ts    the synthesis call reports its tokens
//   cleanup/check-fixes.sh                  one report line
// The new file src/lib/search/frontPathTrace.ts (+ its self-test) comes in the zip itself.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step23a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/lib/nl2sql/llm.ts",
  "marker": "from \"../search/frontPathTrace\"",
  "old": "import type { LlmFn } from \"./types\";\n",
  "new": "import type { LlmFn } from \"./types\";\nimport { traceModelCall, traceWait } from \"../search/frontPathTrace\";\n"
 },
 {
  "file": "src/lib/nl2sql/llm.ts",
  "marker": "traceModelCall({ model, ...usage",
  "old": "        if (opts.onUsage && data.usage) opts.onUsage(usage);\n",
  "new": "        if (opts.onUsage && data.usage) opts.onUsage(usage);\n        traceModelCall({ model, ...usage, ms: Date.now() - started }); // front-path trace (passive)\n"
 },
 {
  "file": "src/lib/nl2sql/llm.ts",
  "marker": "traceWait(Math.ceil(wait * 1000) + 500)",
  "old": "          await sleep(Math.ceil(wait * 1000) + 500);\n",
  "new": "          traceWait(Math.ceil(wait * 1000) + 500); // front-path trace (passive)\n          await sleep(Math.ceil(wait * 1000) + 500);\n"
 },
 {
  "file": "src/lib/search/executiveSynthesis.ts",
  "marker": "import { traceModelCall } from \"./frontPathTrace\";",
  "old": "import { buildSourceNames, sanitizeSourceRefs } from \"./sourceRefs\";\n",
  "new": "import { buildSourceNames, sanitizeSourceRefs } from \"./sourceRefs\";\nimport { traceModelCall } from \"./frontPathTrace\";\n"
 },
 {
  "file": "src/lib/search/executiveSynthesis.ts",
  "marker": "front-path trace (passive): the synthesis call's tokens",
  "old": "      const groqData = await groqRes.json();\n",
  "new": "      const groqData = await groqRes.json();\n      // front-path trace (passive): the synthesis call's tokens (it sends up to ten circulars, the most expensive call)\n      if (groqData.usage) {\n        traceModelCall({\n          model: \"openai/gpt-oss-120b\",\n          prompt: Number(groqData.usage.prompt_tokens ?? 0),\n          completion: Number(groqData.usage.completion_tokens ?? 0),\n          total: Number(groqData.usage.total_tokens ?? 0),\n          cached: Number(groqData.usage.prompt_tokens_details?.cached_tokens ?? 0),\n          ms: 0,\n        });\n      }\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "from \"@/lib/search/frontPathTrace\"",
  "old": "import { normTerm } from \"@/lib/employees/designations\";\n",
  "new": "import { normTerm } from \"@/lib/employees/designations\";\nimport { routeFromReply, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from \"@/lib/search/frontPathTrace\";\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "async function handleSearch(request: Request)",
  "old": "export async function GET(request: Request) {\n  try {\n    const dataSource = await getDb();\n",
  "new": "/**\n * Every search goes through here. PASSIVE route logging (step 2 of the front-path plan, src/lib/search/frontPathTrace.ts):\n * the answer is exactly what handleSearch returns; this only adds x-omni-* / Server-Timing headers and ONE console line\n * saying which route answered, how long each stage took and how many model calls and tokens it used. Tracing can never\n * break a search.\n */\nexport async function GET(request: Request) {\n  const trace = startTrace();\n  const params = new URL(request.url).searchParams;\n  const res = await withTrace(trace, () => handleSearch(request));\n  try {\n    const body = await res.clone().json().catch(() => null);\n    const named = routeFromReply(res.status, params.get(\"mode\") || \"semantic\", body);\n    trace.route = named.route;\n    trace.kind = named.kind;\n    const summary = summarizeTrace(trace);\n    for (const [name, value] of Object.entries(traceHeaders(summary))) res.headers.set(name, value);\n    console.info(traceLine(summary, params.get(\"q\") || \"\"));\n  } catch {\n    /* tracing is best-effort */\n  }\n  return res;\n}\n\nasync function handleSearch(request: Request) {\n  try {\n    const dataSource = await getDb();\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const endNameChecks = traceStep(\"name-checks\");",
  "old": "    // Name-shaped: 2-3 words, all pure Latin letters (a person's name). Such a\n",
  "new": "    const endNameChecks = traceStep(\"name-checks\");\n    // Name-shaped: 2-3 words, all pure Latin letters (a person's name). Such a\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "    endNameChecks();\n",
  "old": "    // --- MODE 1: HEADLINE TITLE MATCH ---\n",
  "new": "    endNameChecks();\n\n    // --- MODE 1: HEADLINE TITLE MATCH ---\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const endOmnibar = traceStep(\"omnibar\");",
  "old": "      const payload = await answerOmnibar(q, userTicket || null, parseRetry(searchParams));\n      if (payload) return NextResponse.json({ analytics: payload });\n",
  "new": "      const endOmnibar = traceStep(\"omnibar\");\n      const payload = await answerOmnibar(q, userTicket || null, parseRetry(searchParams));\n      endOmnibar();\n      if (payload) return NextResponse.json({ analytics: payload });\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const endCircular = traceStep(\"circular-search\");",
  "old": "    const { uniqueResults } = await executeSmartSemanticRouter(dataSource, q);\n",
  "new": "    const endCircular = traceStep(\"circular-search\");\n    const { uniqueResults } = await executeSmartSemanticRouter(dataSource, q);\n    endCircular();\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const endSynthesis = traceStep(\"synthesis\");",
  "old": "      synthesis = await executeExecutiveSynthesis(q, synthesisSources, labels);\n",
  "new": "      const endSynthesis = traceStep(\"synthesis\");\n      synthesis = await executeExecutiveSynthesis(q, synthesisSources, labels);\n      endSynthesis();\n"
 }
];
const CHECKS = [
 {
  "marker": "every search is traced (route, stages, model calls and tokens)",
  "line": "{ test -f src/lib/search/frontPathTrace.ts && grep -q \"traceHeaders\" src/app/api/ai-search/route.ts && grep -q \"traceModelCall\" src/lib/nl2sql/llm.ts; } 2>/dev/null; report \"every search is traced (route, stages, model calls and tokens)\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";
const NEW_FILES = ["src/lib/search/frontPathTrace.ts"];

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

// ---- 2. write (every anchor was verified above)
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied." : "Nothing to do: already applied.");
