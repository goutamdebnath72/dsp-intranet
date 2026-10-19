// cleanup/apply-step41a.js
//
// Edits EXISTING source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice. Step 41a: the Executive Deep Synthesis BUTTON
// is removed and the Enter key decides (it already did, behind a switch that was off: now it is ON by default, with the kill switch
// NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false). Only a signed-in executive reaches the synthesis (the screen checks, the server checks again from the login session).
//   .env.example
//   README.md
//   src/components/HelpManualModal.tsx
//   src/components/OmnibarModal.tsx
//   src/lib/search/loginHints.ts
//   src/lib/search/synthesisIntent.selftest.ts
//   src/lib/search/synthesisIntent.ts
//   cleanup/check-fixes.sh   one report line
// The new hint test (src/lib/search/loginHints.selftest.ts) comes whole in the zip.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step41a.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/lib/search/synthesisIntent.ts",
  "marker": "ON by default since step 41a; NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false turns it off",
  "old": "and the switch NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true: never decided here.",
  "new": "and the switch (ON by default since step 41a; NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false turns it off): never decided here."
 },
 {
  "file": "src/lib/search/synthesisIntent.ts",
  "marker": "ON by default (step 41a): the Enter key sends",
  "old": "/**\n * On only when NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true: the Enter key then sends an EDS-type question from a logged-in executive to\n * Executive Deep Synthesis by itself (the screen decides, OmnibarModal.tsx; the server still verifies the executive). It is a\n * NEXT_PUBLIC_ variable because the browser reads it. The browser must pass the value in explicitly, because Next only replaces\n * the literal process.env.NEXT_PUBLIC_... in client code.\n */\nexport function autoEdsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }): boolean {\n  return (env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS ?? \"\").trim().toLowerCase() === \"true\";\n}\n",
  "new": "/**\n * ON by default (step 41a): the Enter key sends an EDS-type question from a logged-in executive to Executive Deep Synthesis by itself (the\n * screen decides, OmnibarModal.tsx; the server still verifies the executive from the login session). There is no button any more. The kill\n * switch is NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false (also 0, off, no, in any case). It is a NEXT_PUBLIC_ variable because the browser reads it,\n * so a change needs a new deployment. The browser must pass the value in explicitly, because Next only replaces the literal\n * process.env.NEXT_PUBLIC_... in client code.\n */\nexport function autoEdsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }): boolean {\n  return ![\"false\", \"0\", \"off\", \"no\"].includes((env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS ?? \"\").trim().toLowerCase());\n}\n"
 },
 {
  "file": "src/lib/search/synthesisIntent.selftest.ts",
  "marker": "auto-EDS is ON by default (step 41a)",
  "old": "ok(\"auto-EDS is off by default\", !autoEdsEnabled({}) && !autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \"1\" }) && !autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \"false\" }));\nok(\"auto-EDS is on for 'true'\", autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \" True \" }));\nok(\"the old server-side variable no longer switches it on\", !autoEdsEnabled({ FRONT_PATH_AUTO_EDS: \"true\" }));\n",
  "new": "ok(\"auto-EDS is ON by default (step 41a): nothing set, empty, or any value that is not an explicit off\", autoEdsEnabled({}) && autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \"\" }) && autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \" True \" }) && autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: \"1\" }));\nok(\"the kill switch: false / 0 / off / no, in any case and with spaces, turn it off\", [\"false\", \" FALSE \", \"0\", \"off\", \"Off\", \"no\"].every((v) => !autoEdsEnabled({ NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: v })));\nok(\"the old server-side variable has no effect, either way\", autoEdsEnabled({ FRONT_PATH_AUTO_EDS: \"false\" }) && autoEdsEnabled({ FRONT_PATH_AUTO_EDS: \"true\" }));\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "Step 27a, ON by default since step 41a (kill switch",
  "old": "// Step 27a (off unless NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true): for a LOGGED-IN EXECUTIVE a question that needs",
  "new": "// Step 27a, ON by default since step 41a (kill switch NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false): for a LOGGED-IN EXECUTIVE a question that needs"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "BY ITSELF (there is no button any more):",
  "old": "BY ITSELF, exactly like the button:",
  "new": "BY ITSELF (there is no button any more):"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "Step 41a: no Executive Deep Synthesis button any more",
  "old": "              {/* Centered Mode Selector Toolbar */}\n              <div className=\"relative border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/70 px-4 py-3\">\n                <motion.div\n                  layout\n                  transition={{ type: \"spring\", stiffness: 380, damping: 26 }}\n                  className=\"flex items-center\"\n                >\n                  {/* Executive Deep Synthesis */}\n                  <Tooltip\n                    content={\n                      isExecutive\n                        ? \"Synthesises across circulars · English\"\n                        : \"Executives only — sign in with an executive ticket (starts with 4)\"\n                    }\n                    align=\"left\"\n                    className=\"block w-full\"\n                  >\n                  <button\n                    type=\"button\"\n                    onClick={() =>\n                      isExecutive && !isLoading && triggerSearch(\"intellectual\")\n                    }\n                    disabled={!isExecutive || isLoading}\n                    className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border px-3.5 py-2 sm:px-4 sm:py-2.5 text-sm font-semibold tracking-[-0.01em] outline-none transition-all duration-200 ${\n                      isExecutive && isLoading ? \"cursor-not-allowed opacity-60\" : \"\"\n                    } ${\n                      !isExecutive\n                        ? \"cursor-not-allowed border-slate-200 bg-slate-100/90 !text-slate-400 opacity-70 hover:!border-slate-200 hover:!bg-slate-100/90 hover:!text-slate-400\"\n                        : mode === \"intellectual\"\n                          ? \"border-amber-500 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white shadow-[0_7px_24px_rgba(245,158,11,0.34)] focus-visible:ring-2 focus-visible:ring-amber-400/60\"\n                          : \"border-amber-300 bg-gradient-to-b from-amber-50 to-orange-50/70 text-amber-800 shadow-sm hover:-translate-y-0.5 hover:border-amber-400 hover:from-amber-100 hover:to-orange-50 hover:shadow-[0_6px_20px_rgba(245,158,11,0.2)] focus-visible:ring-2 focus-visible:ring-amber-400/60\"\n                    }`}\n                  >\n                    {isExecutive && mode === \"intellectual\" && (\n                      <span className=\"absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 animate-pulse\" />\n                    )}\n                    <span\n                      className={`relative flex h-5 w-5 items-center justify-center rounded-md ${\n                        !isExecutive\n                          ? \"bg-slate-200/80 text-slate-400 group-hover:!text-slate-400\"\n                          : mode === \"intellectual\"\n                            ? \"bg-white/15\"\n                            : \"bg-white text-amber-600 shadow-sm\"\n                      }`}\n                    >\n                      {!isExecutive ? (\n                        <Lock size={12} strokeWidth={2.5} />\n                      ) : (\n                        <Sparkles\n                          size={13}\n                          strokeWidth={2.5}\n                          className={\n                            mode === \"intellectual\"\n                              ? \"text-white\"\n                              : \"text-amber-500 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110\"\n                          }\n                        />\n                      )}\n                    </span>\n                    <span\n                      className={`relative whitespace-nowrap ${\n                        !isExecutive\n                          ? \"!text-slate-400 group-hover:!text-slate-400\"\n                          : \"\"\n                      }`}\n                    >\n                      Executive Deep Synthesis\n                    </span>\n                    {isExecutive && mode === \"intellectual\" && (\n                      <motion.span\n                        initial={{ scale: 0.8, opacity: 0 }}\n                        animate={{ scale: 1, opacity: 1 }}\n                        transition={{\n                          type: \"spring\",\n                          stiffness: 400,\n                          damping: 20,\n                        }}\n                        className=\"relative rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white\"\n                      >\n                        Deep\n                      </motion.span>\n                    )}\n                  </button>\n                  </Tooltip>\n                </motion.div>\n              </div>\n\n",
  "new": "              {/* Step 41a: no Executive Deep Synthesis button any more. The Enter key decides (see the Enter handler above). */}\n\n"
 },
 {
  "file": "src/lib/search/loginHints.ts",
  "marker": "there is no button (step 41a)",
  "old": "// 1. decideLoginHint(): when should the page SUGGEST signing in / using the Executive Deep\n//    Synthesis button? Only for an explanatory question (\"why ...\", \"explain ...\", \"policy on ...\")\n//    that was answered with plain circular cards. Executive Deep Synthesis gives a written summary\n//    with sources for such questions, so a signed-out visitor is told to sign in first if they are\n//    an executive, and a signed-in executive who pressed Enter is told the button exists.\n",
  "new": "// 1. decideLoginHint(): when should the page SUGGEST signing in / asking for a written summary?\n//    Only for an explanatory question (\"why ...\", \"explain ...\", \"policy on ...\") that was answered\n//    with plain circular cards. Executive Deep Synthesis gives a written summary with sources for\n//    questions that compare or trace circulars; there is no button (step 41a): the Enter key sends\n//    such a question from a signed-in executive there by itself. So a signed-out visitor is told to\n//    sign in first if they are an executive, and a signed-in executive whose question was NOT sent\n//    there is told how to ask for a summary.\n"
 },
 {
  "file": "src/lib/search/loginHints.ts",
  "marker": "Executive Deep Synthesis has no button any more (step 41a)",
  "old": "export function decideLoginHint(i: HintInput): LoginHint | null {\n  // Reverse tip: Executive Deep Synthesis was used on a lookup, which the normal search answers directly.\n  if (i.mode === \"intellectual\") {\n    if (looksLikeLookup(i.query)) {\n      return {\n        kind: \"plain\",\n        text:\n          \"This looks like a direct lookup (a name, a count, seniority or a holiday). \" +\n          \"The normal search answers it straight from the records: press Enter. \" +\n          \"Executive Deep Synthesis is for explanations drawn from circulars.\",\n      };\n    }\n    return null;\n  }\n\n  if (i.circularShown && !i.answerCardShown && looksAnalytical(i.query)) {\n    if (!i.authenticated) {\n      return {\n        kind: \"synthesis\",\n        text:\n          \"This kind of question gets a fuller answer from Executive Deep Synthesis: a written summary with sources. \" +\n          \"If you are an executive, sign in first and use that button.\",\n      };\n    }\n    if (i.isExecutive) {\n      return {\n        kind: \"synthesis\",\n        text: \"Tip: for a written summary with sources on this question, use the Executive Deep Synthesis button.\",\n      };\n    }\n  }\n  return null;\n}\n",
  "new": "export function decideLoginHint(i: HintInput): LoginHint | null {\n  // Executive Deep Synthesis has no button any more (step 41a): the Enter key sends an executive's question there by itself, so once it has\n  // run there is nothing to advise.\n  if (i.mode === \"intellectual\") return null;\n\n  if (i.circularShown && !i.answerCardShown && looksAnalytical(i.query)) {\n    if (!i.authenticated) {\n      return {\n        kind: \"synthesis\",\n        text:\n          \"Signed-in executives can get a written summary across the circulars, with sources, for questions that compare or trace circulars. \" +\n          \"If you are an executive, sign in and ask again.\",\n      };\n    }\n    if (i.isExecutive) {\n      return {\n        kind: \"synthesis\",\n        text: \"Tip: for a written summary across several circulars, ask for it directly, for example \\u201ccompare \\u2026\\u201d, \\u201cwhat changed between \\u2026\\u201d or \\u201csummarise \\u2026\\u201d.\",\n      };\n    }\n  }\n  return null;\n}\n"
 },
 {
  "file": "src/components/HelpManualModal.tsx",
  "marker": "has no button: press Enter as usual.",
  "old": "                <p>\n                  <span className=\"inline-flex items-center gap-1 font-semibold text-slate-800\">\n                    <Sparkles size={14} /> Executive Deep Synthesis\n                  </span>{\" \"}\n                  is the only button. It reads across many circulars and writes a\n                  combined, sourced summary with figures and charts. It stays{\" \"}\n                  <span className=\"inline-flex items-center gap-1 font-semibold text-slate-700\">\n                    <Lock size={12} /> locked\n                  </span>{\" \"}\n                  until an <strong>executive</strong> signs in (tickets starting\n                  with <Pill>4</Pill>); it covers circulars only.\n                </p>\n",
  "new": "                <p>\n                  <span className=\"inline-flex items-center gap-1 font-semibold text-slate-800\">\n                    <Sparkles size={14} /> Executive Deep Synthesis\n                  </span>{\" \"}\n                  has no button: press Enter as usual. When an <strong>executive</strong>{\" \"}\n                  is signed in (tickets starting with <Pill>4</Pill>) and the question\n                  needs several circulars built into one answer (compare, what\n                  changed, trace, what is hidden), the search reads across the circulars\n                  and writes a combined, sourced summary with figures and charts. Ask\n                  in English. Everyone else gets the normal search. It covers circulars only.\n                </p>\n"
 },
 {
  "file": "src/components/HelpManualModal.tsx",
  "marker": "  Sparkles,\n  Globe,\n",
  "old": "  Sparkles,\n  Lock,\n  Globe,\n",
  "new": "  Sparkles,\n  Globe,\n"
 },
 {
  "file": ".env.example",
  "marker": "ON by default since step 41a): a question that needs",
  "old": "# Synthesis on the Enter key (step 27a): a question that needs several circulars built into one answer (compare, correlate, what is\n# hidden, what changed ...) starts the Executive Deep Synthesis by itself for a logged-in executive, with no button. OFF unless this is\n# exactly: true. NEXT_PUBLIC_ because the browser reads it: restart `npm run dev` after changing it.\n",
  "new": "# Synthesis on the Enter key (step 27a, ON by default since step 41a): a question that needs several circulars built into one answer\n# (compare, correlate, what is hidden, what changed ...) starts the Executive Deep Synthesis by itself for a logged-in executive. There\n# is no button. Leave this empty for ON; set exactly false (or 0, off, no) to turn it off. NEXT_PUBLIC_ because the browser reads it:\n# restart `npm run dev` after changing it, and redeploy on Vercel.\n"
 },
 {
  "file": "README.md",
  "marker": "ON by default and the button removed in step 41a",
  "old": "* THE SCREEN DECIDES (step 27a): with `NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true` in `.env.local` (restart `npm run dev`), a LOGGED-IN\n  EXECUTIVE who presses Enter on an EDS-type question gets Executive Deep Synthesis, exactly like the old button: the same processing\n  panel, the same briefing. The server verifies the executive again. If that synthesis finds no relevant circular, the screen falls back\n  to the normal search by itself. Off by default.\n",
  "new": "* THE SCREEN DECIDES (step 27a; ON by default and the button removed in step 41a): a LOGGED-IN EXECUTIVE who presses Enter on an EDS-type\n  question gets Executive Deep Synthesis: the same processing panel, the same briefing. The server verifies the executive again, from the\n  login session. If that synthesis finds no relevant circular, the screen falls back to the normal search by itself. The kill switch is\n  `NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false` (restart `npm run dev`; redeploy on Vercel).\n"
 }
];
const CHECKS = [
 {
 "marker": "No EDS button: the Enter key decides (on by default)",
 "line": "{ ! grep -q \"Centered Mode Selector Toolbar\" src/components/OmnibarModal.tsx && grep -q \"ON by default since step 41a\" src/lib/search/synthesisIntent.ts && grep -q \"Step 41a: no Executive Deep Synthesis button\" src/components/OmnibarModal.tsx; } 2>/dev/null; report \"No EDS button: the Enter key decides (on by default)\" $?"
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

if (!read("src/lib/search/loginHints.selftest.ts").includes("decideLoginHint")) {
  console.error("NOT APPLIED: src/lib/search/loginHints.selftest.ts is not there. Unzip patch_step41a.zip first. Nothing was changed.");
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
