// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/HelpManualModal.selftest.tsx
// The user guide: two tabs, the sample questions tab first (every area of the search, each question with Try it and Copy), the "How it works" tab brought up to date.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HelpManualModal from "./HelpManualModal";
import { SAMPLE_SECTIONS } from "../lib/help/sampleQuestions";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

const closed = h(<HelpManualModal isOpen={false} onClose={noop} />);
ok("a closed guide draws nothing", closed === "");

const samples = h(<HelpManualModal isOpen onClose={noop} onTry={noop} />);
ok("the guide opens on the sample questions, with all three tabs (Sample questions, What to type, How it works)", /role="tab"[^>]*aria-selected="true"[^>]*>Sample questions/.test(samples) && />What to type</.test(samples) && />How it works</.test(samples));
ok("the recipe and the weak/good pairs are shown first", /How to ask a good question/.test(samples) && /Thin and good/.test(samples) && /gift card/.test(samples));
ok("every area is listed with its title", SAMPLE_SECTIONS.every((s) => samples.includes(s.title.replace(/&/g, "&amp;"))), SAMPLE_SECTIONS.map((s) => s.title).filter((t) => !samples.includes(t.replace(/&/g, "&amp;"))).join(" | "));
ok("the first area is open and shows its questions with Try it and Copy; the others are closed", /Fill in the blanks|Sample questions<\/p>/.test(samples) && /Try it/.test(samples) && /aria-label="Copy this question"/.test(samples) && (samples.match(/aria-expanded="true"/g) || []).length === 1);
ok("a [blank] is highlighted", /bg-amber-100[^>]*>\[first name\]/.test(samples));
ok("there is a box to find a question", /aria-label="Find a sample question"/.test(samples));
ok("without a Try handler the questions carry no Try button", (h(<HelpManualModal isOpen onClose={noop} />).match(/Put this question in the search bar/g) || []).length === 0);
ok("with a Try handler every visible question has one", (samples.match(/title="Put this question in the search bar"/g) || []).length >= 5);

// the first render starts on the tab it is asked for
const how = h(<HelpManualModal isOpen onClose={noop} initialTab="how" />);
ok("the 'How it works' tab holds only what the other tabs do not say: how one Enter works, contact details (reveal and copy), the access log, languages, the red badge, the New mark, shortcuts", /How search works/.test(how) && /Contact details: reveal and copy/.test(how) && /Contact access log/.test(how) && /Searching in Hindi/.test(how) && /red badge/.test(how) && /The “New” mark on announcements/.test(how) && /Keyboard shortcuts/.test(how) && !/Find a sample question/.test(how));
ok("the 'How it works' tab points to the other tabs for the areas and the words to type, instead of listing them again", /Sample questions<\/strong> tab/.test(how) && /What to type<\/strong>/.test(how));

ok("the page says, in an eye-catching banner, that these are sample questions showing what the search can handle", /Everything on this page is a <span[^>]*>sample<\/span>/.test(samples) && /the kind of question our search engine can handle/.test(samples) && /from-amber-500 via-orange-500/.test(samples));
ok("the two marks are explained once at the top and shown on questions: Press Enter, Appears as you type", (samples.match(/Press Enter/g) || []).length >= 3 && /Appears as you type · no Enter/.test(samples) && /type the whole question, then press the Enter key/.test(samples));
ok("an open area says in a boxed line how to run it", /How to run it:/.test(samples) && /AS YOU TYPE: no Enter/.test(samples));

// the "What to type" tab: each feature by name, its words with front slashes between the alternatives
const types = h(<HelpManualModal isOpen onClose={noop} initialTab="types" onTry={noop} />);
ok("the 'What to type' tab opens when asked, is the selected tab, and replaces the other two bodies", /role="tab"[^>]*aria-selected="true"[^>]*>What to type/.test(types) && /Each feature, and the words that open it/.test(types) && !/Find a sample question/.test(types) && !/Keyboard shortcuts/.test(types));
ok("it names each group and feature, and the alternatives of a feature stand side by side with a front slash between them (gold rate today / silver price / 22k gold)", /Calculators and converters/.test(types) && /Live prices, markets, weather, flights, trains and DA/.test(types) && /News and sports headlines/.test(types) && /Gold and silver rates/.test(types) && /gold rate today<\/button><span[^>]*>\/<\/span><button[^>]*>silver price<\/button><span[^>]*>\/<\/span><button[^>]*>22k gold</.test(types));
ok("every string is a button that puts it in the search bar, and without a handler it is plain text", (types.match(/title="Put this in the search bar"/g) || []).length > 100 && !/title="Put this in the search bar"/.test(h(<HelpManualModal isOpen onClose={noop} initialTab="types" />)));
ok("each feature says whether it appears as you type or needs Enter, and there is a box to find a feature", /as you type/.test(types) && /press Enter/.test(types) && /aria-label="Find a feature or a word that opens it"/.test(types));
ok("the news, sports and Hindi/Bengali paper words are all there", /hindi news/.test(types) && /dainik bhaskar/.test(types) && /anandabazar/.test(types) && /sports news feed/.test(types) && /news feed/.test(types) && /Bengali news/.test(types));

// the introduction to the search bar, at the top of both the Sample questions and the How it works tabs
ok("the introduction to the search bar opens the guide: what it is (click, Ctrl + K, omnibar, backed by AI), the three steps, what can be asked, and what cannot be answered yet (plant production data)", /aria-label="The search bar"/.test(samples) && /opens the omnibar when you click it/.test(samples) && /backed by AI/.test(samples) && /Press Enter/.test(samples) && /What you can ask/.test(samples) && /Plant production data is not answered yet/.test(samples) && samples.indexOf("The search bar") < samples.indexOf("Sample questions</p>"));
ok("the introduction names circulars, holidays, employees, hospital, PAX, news, fuel, gold, markets, calculators and vehicles, and is shown ONCE (on the first tab, not again on How it works)", ["Circulars", "Holiday calendars", "Employees and departments", "Hospital OPDs and doctors", "PAX telephone numbers", "News", "Petrol, diesel and LPG prices", "Gold and silver rates", "Sensex, Nifty and SAIL share", "Calculator and converters", "Vehicles"].every((a) => samples.includes(a)) && !/aria-label="The search bar"/.test(how) && !/aria-label="The search bar"/.test(types));
// no repeats between the tabs: each fact is on ONE of them
const dataText = SAMPLE_SECTIONS.map((x) => [x.title, x.covers, x.howToRun, ...x.tips, ...x.questions.flatMap((q) => [q.q, q.note ?? ""])].join(" ")).join(" ");
const ONLY_IN_SAMPLES_RENDERED = ["What you can ask", "Plant production data is not answered yet"];
const ONLY_IN_SAMPLES_DATA = ["Intranet Sites", "6-digit", "similar-sounding", "double quotes", "Link not available yet", "highlighted", "department name brings up its site link", "Contact details under How it works"];
ok("nothing the Sample questions tab says is said again on How it works: not the introduction, the areas, the list of what Enter does, the sites section, the ways to find a person, the exact-phrase section, the Deep Synthesis paragraph or the 'At a glance' timings", ONLY_IN_SAMPLES_RENDERED.every((w) => samples.includes(w) && !how.includes(w)) && ONLY_IN_SAMPLES_DATA.every((w) => dataText.includes(w) && !how.includes(w)) && !/At a glance/.test(how) && !/Exact-phrase search/.test(how) && !/Finding intranet sites/.test(how) && !/Finding people \(employee directory\)/.test(how) && !/Executive Deep Synthesis/.test(how) && !/Circular “new” window/.test(how) && !/Press <span[^>]*>Enter<\/span> works out/.test(samples));
ok("the facts that lived only in a removed repeat are now in the sample questions (the sites, quotes and contact tips above), and the red badge and New mark timings are stated once, in their own sections", /Circular badge|red badge/.test(how) && (how.match(/hours<\/strong>/g) ?? []).length === 1 && (how.match(/days<\/strong>/g) ?? []).length === 1);
ok("the 'Try it' explanation is said once on the Sample questions tab (not again in the box below the recipe)", (samples.match(/types the question in the search bar/g) ?? []).length === 0 && (samples.match(/press <strong>Try it<\/strong>/g) ?? []).length === 1);
const exec = h(<HelpManualModal isOpen onClose={noop} isExecutive onTry={noop} />);
ok("an executive is told the Deep Synthesis section is for them", /Executives: you can use this/.test(exec) && /Executives only/.test(samples));

console.log(`HelpManualModal selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
