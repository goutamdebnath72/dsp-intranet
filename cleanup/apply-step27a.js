// cleanup/apply-step27a.js
//
// Edits three existing source files IN PLACE (plus .env.example and cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// ENTER KEY = EXECUTIVE DEEP SYNTHESIS for EDS-type questions: the screen, not the server, decides, so the processing panel
// ("Consulting executive knowledge base...") and the "EXECUTIVE DEEP SYNTHESIS" briefing appear exactly as they do for the old button.
// With NEXT_PUBLIC_FRONT_PATH_AUTO_EDS unset (the default) NOTHING changes in any answer.
//
//   src/components/OmnibarModal.tsx   Enter: for a logged-in executive, an EDS-type question goes to mode=intellectual like the button
//   src/hooks/useOmniSearch.ts        an automatic synthesis that finds no relevant circular falls back to the normal search
//   src/app/api/ai-search/route.ts    26a's server-side upgrade is REMOVED (one decision point); the route only records the intent
//   .env.example, cleanup/check-fixes.sh   the switch is now NEXT_PUBLIC_FRONT_PATH_AUTO_EDS; the check line follows
// synthesisIntent.ts (the detector, now with data-mining language) comes in the zip.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Needs steps 23a to 26a applied first. Run from the project root:   node cleanup/apply-step27a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "SCREEN decides (step 27a, OmnibarModal.tsx)",
  "old": "    // SYNTHESIS INTENT (step 26a, src/lib/search/synthesisIntent.ts): does the question need several circulars built into one\n    // answer (compare / trace / contrast / what changed between ... / list the events of a month)? It is always recorded in the\n    // trace (passive). With FRONT_PATH_AUTO_EDS=true the Enter key itself starts the synthesis, for a LOGGED-IN executive only;\n    // the directory check just below still has the last word, and the holiday parser and verified answers go first.\n    const synthIntent = mode === \"semantic\" ? detectSynthesisIntent(q) : null;\n    if (synthIntent) setTraceSynth(synthIntent.level, synthIntent.score);\n    if (synthIntent?.synthesis && autoEdsEnabled() && userTicket && /^4\\d{5}$/.test(userTicket) && !parseRetry(searchParams)) {\n      const direct = await answerOmnibar(q, userTicket, null, { skipModel: true });\n      if (direct) return NextResponse.json({ analytics: direct });\n      mode = \"intellectual\";\n    }\n",
  "new": "    // SYNTHESIS INTENT (step 26a, src/lib/search/synthesisIntent.ts): does the question need several circulars built into one\n    // answer (compare / trace / contrast / correlate / what is hidden / what changed between ...)? Only RECORDED here, for the trace\n    // and the harness. The SCREEN decides (step 27a, OmnibarModal.tsx): for a logged-in executive an EDS-type question is sent as\n    // mode=intellectual, exactly like the old button; this route then verifies the executive below and never upgrades by itself.\n    const synthIntent = mode === \"semantic\" ? detectSynthesisIntent(q) : null;\n    if (synthIntent) setTraceSynth(synthIntent.level, synthIntent.score);\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "import { detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";",
  "old": "import { autoEdsEnabled, detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";\n",
  "new": "import { detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "const [autoRouted, setAutoRouted] = useState(false);",
  "old": "  const [attempt, setAttempt] = useState(1); // the attempt number of the answer now on screen\n",
  "new": "  const [attempt, setAttempt] = useState(1); // the attempt number of the answer now on screen\n  // true when the ENTER KEY (not the old button) sent the question to Executive Deep Synthesis (step 27a)\n  const [autoRouted, setAutoRouted] = useState(false);\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "      setAutoRouted(false);\n      globalMutate(",
  "old": "      setRetry(null);\n      setAttempt(1);\n      globalMutate(",
  "new": "      setRetry(null);\n      setAttempt(1);\n      setAutoRouted(false);\n      globalMutate("
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "opts?: { auto?: boolean }",
  "old": "  const triggerSearch = (selectedMode: SearchMode) => {\n    if (!selectedMode) return;\n    setMode(selectedMode);\n",
  "new": "  const triggerSearch = (selectedMode: SearchMode, opts?: { auto?: boolean }) => {\n    if (!selectedMode) return;\n    setAutoRouted(!!opts?.auto && selectedMode === \"intellectual\");\n    setMode(selectedMode);\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "must not end as an empty briefing",
  "old": "  const isLoading = shouldFetch && isSwrLoading;\n",
  "new": "  const isLoading = shouldFetch && isSwrLoading;\n\n  // An EDS-type question that the ENTER KEY sent to Executive Deep Synthesis (step 27a) but that found no relevant circular to build\n  // an answer from must not end as an empty briefing: quietly run the normal search instead, exactly as Enter did before.\n  useEffect(() => {\n    if (!autoRouted || mode !== \"intellectual\" || isLoading || !data) return;\n    const syn = !Array.isArray(data) ? (data as OmniSearchResponse).synthesis : null;\n    const empty = !syn || !!syn.error || ((syn.keyFindings?.length ?? 0) === 0 && (syn.citations?.length ?? 0) === 0);\n    if (empty) {\n      setAutoRouted(false);\n      setMode(\"semantic\");\n    }\n  }, [autoRouted, mode, isLoading, data]);\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "import { autoEdsEnabled, detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";",
  "old": "import { decideLoginHint, excludeShownPeople } from \"@/lib/search/loginHints\";\n",
  "new": "import { decideLoginHint, excludeShownPeople } from \"@/lib/search/loginHints\";\nimport { autoEdsEnabled, detectSynthesisIntent } from \"@/lib/search/synthesisIntent\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "Executive Deep Synthesis BY ITSELF",
  "old": "                      // circular/announcement Smart Semantic. IDs & sites are\n                      // already live as you type; Executive Deep stays a\n                      // deliberate button click, never Enter.\n                      if (query.trim().length >= 2) {\n                        runEmployeeNameSearch();\n                      }\n                      triggerSearch(\"semantic\");\n",
  "new": "                      // circular/announcement Smart Semantic. IDs & sites are\n                      // already live as you type.\n                      // Step 27a (off unless NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true): for a LOGGED-IN EXECUTIVE a question that needs\n                      // several circulars built into one answer (compare / correlate / what is hidden / what changed ...: see\n                      // src/lib/search/synthesisIntent.ts) starts Executive Deep Synthesis BY ITSELF, exactly like the button:\n                      // same processing panel, same briefing. The server verifies the executive again. Anyone else, and every\n                      // other question, takes the normal Enter path.\n                      if (\n                        isExecutive &&\n                        autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }) &&\n                        detectSynthesisIntent(query).synthesis\n                      ) {\n                        if (!isLoading) triggerSearch(\"intellectual\", { auto: true });\n                      } else {\n                        if (query.trim().length >= 2) {\n                          runEmployeeNameSearch();\n                        }\n                        triggerSearch(\"semantic\");\n                      }\n"
 }
];
const CF = "cleanup/check-fixes.sh";
const CHECK_OLD_LINE = "{ test -f src/lib/search/synthesisIntent.ts && grep -q \"autoEdsEnabled\" src/app/api/ai-search/route.ts && grep -q \"intellectual\\\" as SearchMode\" src/hooks/useOmniSearch.ts; } 2>/dev/null; report \"the Enter key can start a synthesis for an executive (off unless FRONT_PATH_AUTO_EDS=true)\" $?";
const CHECK_NEW_LINE = "{ test -f src/lib/search/synthesisIntent.ts && grep -q \"autoEdsEnabled\" src/components/OmnibarModal.tsx && ! grep -q \"autoEdsEnabled()\" src/app/api/ai-search/route.ts; } 2>/dev/null; report \"the Enter key sends an EDS-type question from a logged-in executive to Executive Deep Synthesis (off unless NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true)\" $?";
const ENV = ".env.example";
const ENV_OLD = "\n# Synthesis on the Enter key (step 26a): a question that needs several circulars built into one answer starts the Executive\n# Deep Synthesis by itself for a logged-in executive, with no button. OFF unless this is exactly: true\nFRONT_PATH_AUTO_EDS=\n";
const ENV_NEW = "\n# Synthesis on the Enter key (step 27a): a question that needs several circulars built into one answer (compare, correlate, what is\n# hidden, what changed ...) starts the Executive Deep Synthesis by itself for a logged-in executive, with no button. OFF unless this is\n# exactly: true. NEXT_PUBLIC_ because the browser reads it: restart `npm run dev` after changing it.\nNEXT_PUBLIC_FRONT_PATH_AUTO_EDS=\n";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

// ---- 1. verify EVERYTHING before writing anything
if (!read("src/lib/search/synthesisIntent.ts").includes("DISCOVERY_STRONG")) {
  console.error("NOT APPLIED: src/lib/search/synthesisIntent.ts is the old version: unzip patch_step27a.zip first.");
  process.exit(1);
}
const routeNow = read("src/app/api/ai-search/route.ts");
if (!routeNow.includes("synthIntent")) {
  console.error("NOT APPLIED: route.ts has no synthesis-intent recording yet: apply step 26a first.");
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
let cfChanged = false;
if (!cf.includes("sends an EDS-type question from a logged-in executive")) {
  if (countOf(cf, CHECK_OLD_LINE) !== 1) {
    console.error(`NOT APPLIED: ${CF} does not contain the step 26a report line exactly once. Nothing was changed. Send me that file.`);
    process.exit(1);
  }
  cf = cf.replace(CHECK_OLD_LINE, () => CHECK_NEW_LINE);
  cfChanged = true;
}

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;
let envChanged = false;
if (env !== null && !env.includes("NEXT_PUBLIC_FRONT_PATH_AUTO_EDS")) {
  if (countOf(env, ENV_OLD) === 1) env = env.replace(ENV_OLD, () => ENV_NEW);
  else env = env.replace(/\s*$/, "\n") + ENV_NEW; // the 26a note is not there: just add the new one
  envChanged = true;
}

// ---- 2. write
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (envChanged) { fs.writeFileSync(ENV, env); changed++; console.log(`edited   ${ENV}  (NEXT_PUBLIC_FRONT_PATH_AUTO_EDS)`); }
if (cfChanged) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (the report line follows the new switch)`); }
console.log(changed ? "Applied. Enter-key synthesis stays OFF until you set NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true in .env.local and restart npm run dev." : "Nothing to do: already applied.");
