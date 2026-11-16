// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/omnibarIntent.selftest.ts
// How the search box uses what a line means: the ORDER of what Enter does, that the line of a found utility is never searched, what is said to the user, and that nothing but the line can reach the AI.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = readFileSync("src/components/OmnibarModal.tsx", "utf8");
const enter = src.slice(src.indexOf('if (e.key === "Enter" && !e.shiftKey)'), src.indexOf('placeholder="Search people, departments'));
const at = (needle: string) => enter.indexOf(needle);

ok("Enter works in this order: the exact readers (detectTool), then an ID, then what the app understands by itself (clearIntent), then the AI (askIntent, only for a sentence worth asking about, never an executive's synthesis question), then the ordinary search", at("detectTool(qTrim)") > 0 && at("isIdQuery(qTrim)") > at("detectTool(qTrim)") && at("clearIntent(qTrim)") > at("isIdQuery(qTrim)") && at("worthAsking(qTrim)") > at("clearIntent(qTrim)") && at("askIntent(qTrim") > at("worthAsking(qTrim)") && at("proceed();") > at("askIntent(qTrim") && /!synthesis && worthAsking\(qTrim\)/.test(enter));
ok("the ordinary search (name search and Smart Semantic) is inside proceed(): it runs only after the AI said none, failed or was not asked; a found utility returns before it", /const proceed = \(\) => \{[\s\S]*runEmployeeNameSearch\(\);[\s\S]*triggerSearch\("semantic"\);[\s\S]*\};/.test(enter) && /if \(understood\) \{\s*openRouted\(understood\.id, "local"\);\s*return;\s*\}/.test(enter) && /if \(pick\) openRouted\(pick\.id, "ai"\);\s*else \{ setUnderstanding\(false\); proceed\(\); \}/.test(enter));
ok("an answer for an old text is dropped (the text was edited meanwhile), the ask gives up after five seconds, and Enter on a line whose utility is already open does nothing", /routeReq\.current !== mine\) return/.test(enter) && /setTimeout\(\(\) => ctl\.abort\(\), 5000\)/.test(enter) && /if \(routed\) return;/.test(enter));
ok("editing the text forgets a utility that was found from the old line", /if \(routed \|\| routedQuery \|\| understanding\) forgetRoute\(\)/.test(src));
ok("a clearly understood line shows 'Looks like <utility>. Press Enter to open it' while typing; a found utility says 'Understood as ...' and who found it; the AI is named, with what it was shown", /data-intent-hint/.test(src) && /Looks like <strong>/.test(src) && /Press <kbd[^>]*>Enter<\/kbd> to open it/.test(src) && /data-intent-routed=/.test(src) && /Understood as <strong>/.test(src) && /Gemini, the AI, was shown only the line you typed, to find the right utility; nothing you enter in the utility is sent to it/.test(src) && /Found from the words of your line, in your browser; nothing was sent anywhere/.test(src));
ok("the utility is drawn by the same panel as ever: a card from its own sample line, or its form; the hint is not shown while one is open", /<ToolPanel query=\{routedQuery \?\? query\} form=\{toolForm\} onForm=\{setToolForm\} \/>/.test(src) && /toolForm \|\| routed \|\| q\.length < 4 \|\| detectTool\(q\) \? null : clearIntent\(q\)/.test(src) && /"form" in e\.open/.test(src));
ok("the modal never sends a figure of a utility anywhere: the only new call is askIntent(qTrim), with the typed line", (src.match(/askIntent\(/g) ?? []).length === 1 && !/askIntent\((?!qTrim)/.test(src));

console.log(`omnibarIntent: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
