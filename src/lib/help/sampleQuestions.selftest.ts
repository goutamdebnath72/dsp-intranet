// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/sampleQuestions.selftest.ts
//
// The user guide's sample questions must not drift from how the search really behaves: a Deep Synthesis sample must be one the front gate sends to Deep Synthesis,
// and no ordinary sample may be (an executive who tries it would otherwise wait for a briefing he did not ask for).
import { readFileSync } from "node:fs";
import { SAMPLE_SECTIONS, RECIPE, WEAK_VS_GOOD, allSamples, filterSections, splitBlanks, OMNIBAR_PREFILL_EVENT, OPEN_GUIDE_EVENT } from "./sampleQuestions";
import { detectSynthesisIntent } from "../search/synthesisIntent";
import { isIdQuery } from "../search/idQuery";
import { searchSites } from "../search/siteSearch";
import { detectTool, isLive } from "../tools/detect";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const all = allSamples();
ok("the guide has many questions (more than 80) in at least nine sections", all.length > 80 && SAMPLE_SECTIONS.length >= 9, `${all.length} / ${SAMPLE_SECTIONS.length}`);
ok("section ids are unique and every section says what it covers and how to ask", new Set(SAMPLE_SECTIONS.map((s) => s.id)).size === SAMPLE_SECTIONS.length && SAMPLE_SECTIONS.every((s) => s.covers.length > 20 && s.tips.length >= 2 && s.title.length > 3));
ok("no question is written twice in one section", SAMPLE_SECTIONS.every((s) => { const qs = [...s.questions.map((x) => x.q), ...(s.ladders ?? []).flatMap((l) => [l.title, l.content, l.deep])]; return new Set(qs.map((q) => q.toLowerCase())).size === qs.length; }));
ok("the recipe and the weak/good pairs exist", RECIPE.length === 4 && WEAK_VS_GOOD.length >= 4 && WEAK_VS_GOOD.every((p) => p.weak.length > 2 && p.good.length > p.weak.length));

// routing: a deep sample reaches Deep Synthesis, an ordinary sample does not
const deepBad = all.filter((x) => x.deep && !x.note?.endsWith(": title") && !x.note?.endsWith(": content") && !detectSynthesisIntent(x.q).synthesis);
ok("every Deep Synthesis sample is routed to Deep Synthesis by the front gate", deepBad.length === 0, JSON.stringify(deepBad.map((x) => [x.q.slice(0, 70), detectSynthesisIntent(x.q).score])));
const plainBad = all.filter((x) => !x.deep && !x.either && !/\[[^\]]+\]/.test(x.q) && detectSynthesisIntent(x.q).synthesis);
ok("no ordinary sample is routed to Deep Synthesis", plainBad.length === 0, JSON.stringify(plainBad.map((x) => [x.q.slice(0, 70), detectSynthesisIntent(x.q).score])));
const ladderBad = SAMPLE_SECTIONS.flatMap((s) => s.ladders ?? []).filter((l) => detectSynthesisIntent(l.title).synthesis || detectSynthesisIntent(l.content).synthesis || !detectSynthesisIntent(l.deep).synthesis);
ok("in every ladder only the last step is a deep question", ladderBad.length === 0, JSON.stringify(ladderBad.map((l) => l.subject)));

// Deep Synthesis samples are COMPLETE questions: no blank to fill, nothing to choose
const eds = SAMPLE_SECTIONS.find((s) => s.id === "eds")!;
ok("every Deep Synthesis sample is a complete question, with no [blank] and no pattern", eds.questions.length >= 12 && eds.questions.every((x) => !/[\[\]]/.test(x.q) && x.q.split(/\s+/).length >= 15) && !eds.patterns?.length && (eds.ladders ?? []).every((l) => !/[\[\]]/.test(l.deep)));
ok("every Deep Synthesis sample says what its parts are (the note)", eds.questions.every((x) => (x.note ?? "").length > 20));

// "appears as you type" is said only of what really does, and everything else is said to need Enter
const live = all.filter((x) => (SAMPLE_SECTIONS.flatMap((s) => s.questions).find((y) => y.q === x.q)?.instant));
ok("some questions are marked as appearing as you type (numbers, sites)", live.length >= 5, String(live.length));
const liveBad = live.filter((x) => !/\[[^\]]+\]/.test(x.q) && !isIdQuery(x.q) && searchSites(x.q, 6).length === 0 && !isLive(detectTool(x.q)));
ok("every instant sample really is one: an identifier the directory answers live, a site or department the site list finds, or a sum, conversion or date question the calculator answers", liveBad.length === 0, JSON.stringify(liveBad.map((x) => x.q)));
const needEnter = SAMPLE_SECTIONS.flatMap((s) => [...s.questions.filter((x) => !x.instant).map((x) => x.q), ...(s.ladders ?? []).flatMap((l) => [l.title, l.content, l.deep])]);
ok("every sample marked 'press Enter' that is a calculator request opens a form or the menu, and none of them is a live tool answer", SAMPLE_SECTIONS.find((s) => s.id === "tools")!.questions.filter((x) => !x.instant).every((x) => { const h = detectTool(x.q); return !!h && (h.kind === "form" || h.kind === "menu"); }));
ok("no sample that needs Enter is an identifier (those appear on their own)", needEnter.every((q) => !isIdQuery(q) && !isLive(detectTool(q))), JSON.stringify(needEnter.filter((q) => isIdQuery(q))));
ok("every area says how to run it, and says Enter or 'as you type'", SAMPLE_SECTIONS.every((s) => s.howToRun.length > 15 && /Enter|AS YOU TYPE/.test(s.howToRun)));

// people: a template, never a real name; blanks are bracketed
const peopleQs = SAMPLE_SECTIONS.find((s) => s.id === "people")!.questions.map((x) => x.q);
ok("a name search is a template", peopleQs.some((q) => /^\[first name\] \[last name\]$/.test(q)));
ok("blanks are found and split", JSON.stringify(splitBlanks("who is senior to [name] today")) === JSON.stringify([{ text: "who is senior to ", blank: false }, { text: "[name]", blank: true }, { text: " today", blank: false }]) && splitBlanks("no blank").length === 1);

// the guide's own search box
ok("an empty search keeps every section", filterSections("").length === SAMPLE_SECTIONS.length);
const hol = filterSections("holiday");
ok("a word narrows to the questions that hold it, in their sections", hol.length >= 1 && hol.some((s) => s.id === "holidays") && hol.every((s) => s.questions.length + (s.ladders?.length ?? 0) + (s.patterns?.length ?? 0) > 0));
ok("all words must be present, and nothing found gives nothing", filterSections("pax number fire").some((s) => s.id === "pax") && filterSections("zzzzqqq").length === 0);

// wiring
ok("the two window events have distinct names the guide, the top bar and the search bar share", (OMNIBAR_PREFILL_EVENT as string) !== (OPEN_GUIDE_EVENT as string) && OMNIBAR_PREFILL_EVENT === "omnibar-prefill" && OPEN_GUIDE_EVENT === "open-user-guide");
const help = readFileSync("src/components/HelpManualModal.tsx", "utf8");
const top = readFileSync("src/components/TopBar.tsx", "utf8");
const omni = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the guide reads its questions from the data file and has both tabs", /SAMPLE_SECTIONS/.test(help) && /filterSections/.test(help) && /Sample questions/.test(help) && /How it works/.test(help));
ok("the top bar opens the guide on request and sends a question to the search bar", /OPEN_GUIDE_EVENT/.test(top) && /OMNIBAR_PREFILL_EVENT/.test(top) && /isExecutive=\{isExecutiveUser\}/.test(top));
ok("the search bar types a prefilled question into its box", /OMNIBAR_PREFILL_EVENT/.test(omni) && /setQuery\(/.test(omni));

console.log(`sampleQuestions selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
