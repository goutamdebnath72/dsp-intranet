// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/sampleQuestions.selftest.ts
//
// The user guide's sample questions must not drift from how the search really behaves: no ordinary sample may be one the front gate sends to the deep search (an executive who tries it would otherwise
// wait for a briefing he did not ask for). The deep search (EDS) is NOT described on this page at all: it has its own tab (edsGuide.selftest.ts).
import { readFileSync } from "node:fs";
import { SAMPLE_SECTIONS, TOOLS_SECTION, RECIPE, WEAK_VS_GOOD, allSamples, filterSections, splitBlanks, OMNIBAR_PREFILL_EVENT, OPEN_GUIDE_EVENT } from "./sampleQuestions";
import { detectSynthesisIntent } from "../search/synthesisIntent";
import { isIdQuery } from "../search/idQuery";
import { searchSites } from "../search/siteSearch";
import { detectTool, isLive } from "../tools/detect";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

// the main features have their sample questions on the first tab; the sample questions of the Utility Services (TOOLS_SECTION) are on the Utility Services tab; the guide as a whole is both
const EVERY = [...SAMPLE_SECTIONS, TOOLS_SECTION];
const all = allSamples();
ok("the guide has many questions (more than 80) in at least nine sections", all.length > 80 && EVERY.length >= 9, `${all.length} / ${EVERY.length}`);
ok("section ids are unique and every section says what it covers and how to ask", new Set(EVERY.map((s) => s.id)).size === EVERY.length && EVERY.every((s) => s.covers.length > 20 && s.tips.length >= 2 && s.title.length > 3));
ok("no question is written twice in one section", EVERY.every((s) => { const qs = s.questions.map((x) => x.q); return new Set(qs.map((q) => q.toLowerCase())).size === qs.length; }));
ok("the recipe and the weak/good pairs exist", RECIPE.length === 4 && WEAK_VS_GOOD.length >= 4 && WEAK_VS_GOOD.every((p) => p.weak.length > 2 && p.good.length > p.weak.length));

// routing: no ordinary sample is sent to the deep search
const plainBad = all.filter((x) => !x.either && !/\[[^\]]+\]/.test(x.q) && detectSynthesisIntent(x.q).synthesis);
ok("no ordinary sample is routed to the deep search", plainBad.length === 0, JSON.stringify(plainBad.map((x) => [x.q.slice(0, 70), detectSynthesisIntent(x.q).score])));

// the deep search is described on its own tab only: nothing of it is left on this page (owner, 16 Nov 2026)
const pageText = JSON.stringify(EVERY) + JSON.stringify(allSamples());
ok("the sample page has no deep-search section, no ladders, no executives-only badge, and says nothing of EDS or Deep Synthesis", !EVERY.some((s) => s.id === "eds" || "ladders" in s || "executivesOnly" in s) && !/deep synthesis|\bEDS\b|briefing|executive deep|deep briefing|ladder/i.test(pageText), (/deep synthesis|\bEDS\b|briefing|executive deep|deep briefing|ladder/i.exec(pageText) ?? [""])[0]);

// "appears as you type" is said only of what really does, and everything else is said to need Enter
const live = all.filter((x) => (EVERY.flatMap((s) => s.questions).find((y) => y.q === x.q)?.instant));
ok("some questions are marked as appearing as you type (numbers, sites)", live.length >= 5, String(live.length));
const liveBad = live.filter((x) => !/\[[^\]]+\]/.test(x.q) && !isIdQuery(x.q) && searchSites(x.q, 6).length === 0 && !isLive(detectTool(x.q)));
ok("every instant sample really is one: an identifier the directory answers live, a site or department the site list finds, or a sum, conversion or date question the calculator answers", liveBad.length === 0, JSON.stringify(liveBad.map((x) => x.q)));
const needEnter = EVERY.flatMap((s) => s.questions.filter((x) => !x.instant).map((x) => x.q));
ok("every sample marked 'press Enter' that is a calculator request opens a form, the menu or the page of all the services, and none of them is a live tool answer", TOOLS_SECTION.questions.filter((x) => !x.instant).every((x) => { const h = detectTool(x.q); return !!h && (h.kind === "form" || h.kind === "menu" || h.kind === "services"); }));
ok("no sample that needs Enter is an identifier (those appear on their own)", needEnter.every((q) => !isIdQuery(q) && !isLive(detectTool(q))), JSON.stringify(needEnter.filter((q) => isIdQuery(q))));
ok("every area says how to run it, and says Enter or 'as you type'", EVERY.every((s) => s.howToRun.length > 15 && /Enter|AS YOU TYPE/.test(s.howToRun)));

// the first tab lists the MAIN features, in the owner's order, and the Utility Services' sample questions are not among them (17 Nov 2026)
ok("the first tab's sections are the main features, in order: circulars by title, circulars by content, employees, departments, holidays, hospital, PAX, announcements and sites; none of them is the utility block", SAMPLE_SECTIONS.map((s) => s.id).join() === "titles,content,people,roster,holidays,doctors,pax,announcements" && !SAMPLE_SECTIONS.some((s) => s.id === TOOLS_SECTION.id) && TOOLS_SECTION.id === "tools");
ok("the department section is named for what it is, and the utility block still carries the calculators, converters and live cards", /^Department search/.test(SAMPLE_SECTIONS.find((s) => s.id === "roster")!.title) && /Calculators, converters and live cards/.test(TOOLS_SECTION.title) && TOOLS_SECTION.questions.length > 20);

// people: a template, never a real name; blanks are bracketed
const peopleQs = SAMPLE_SECTIONS.find((s) => s.id === "people")!.questions.map((x) => x.q);
ok("a name search is a template", peopleQs.some((q) => /^\[first name\] \[last name\]$/.test(q)));
ok("blanks are found and split", JSON.stringify(splitBlanks("who is senior to [name] today")) === JSON.stringify([{ text: "who is senior to ", blank: false }, { text: "[name]", blank: true }, { text: " today", blank: false }]) && splitBlanks("no blank").length === 1);

// the guide's own search box
ok("an empty search keeps every section", filterSections("").length === SAMPLE_SECTIONS.length);
const hol = filterSections("holiday");
ok("a word narrows to the questions that hold it, in their sections", hol.length >= 1 && hol.some((s) => s.id === "holidays") && hol.every((s) => s.questions.length + (s.patterns?.length ?? 0) > 0));
ok("all words must be present, and nothing found gives nothing", filterSections("pax number fire").some((s) => s.id === "pax") && filterSections("zzzzqqq").length === 0);

// wiring
ok("the two window events have distinct names the guide, the top bar and the search bar share", (OMNIBAR_PREFILL_EVENT as string) !== (OPEN_GUIDE_EVENT as string) && OMNIBAR_PREFILL_EVENT === "omnibar-prefill" && OPEN_GUIDE_EVENT === "open-user-guide");
const help = readFileSync("src/components/HelpManualModal.tsx", "utf8");
const top = readFileSync("src/components/TopBar.tsx", "utf8");
const omni = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the guide reads its questions from the data file and has its four tabs (sample questions, Utility Services, how it works, deep search)", /SAMPLE_SECTIONS/.test(help) && /TOOLS_SECTION/.test(help) && /UtilityServicesTab/.test(help) && /Utility Services/.test(help) && /filterSections/.test(help) && /Sample questions/.test(help) && /How it works/.test(help) && /Deep search \(EDS\)/.test(help) && /EdsTab/.test(help));
ok("the top bar opens the guide on request and sends a question to the search bar", /OPEN_GUIDE_EVENT/.test(top) && /OMNIBAR_PREFILL_EVENT/.test(top) && /isExecutive=\{isExecutiveUser\}/.test(top));
ok("the search bar types a prefilled question into its box", /OMNIBAR_PREFILL_EVENT/.test(omni) && /setQuery\(/.test(omni));

{
  // the name example names all three spellings (the search finds them by sound: Goutam, Gautam and Gautham are one sound, checked in the database)
  const names = EVERY.flatMap((x) => x.questions).find((q) => /similar-sounding/.test(q.note ?? ""));
  ok("the similar-sounding example names Goutam, Gautam and Gautham", !!names && /Goutam/.test(names.note!) && /Gautam\b/.test(names.note!) && /Gautham/.test(names.note!), JSON.stringify(names));
}
console.log(`sampleQuestions selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
