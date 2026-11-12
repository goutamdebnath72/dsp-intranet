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
ok("the guide opens on the sample questions, with both tabs", /role="tab"[^>]*aria-selected="true"[^>]*>Sample questions/.test(samples) && />How it works</.test(samples));
ok("the recipe and the weak/good pairs are shown first", /How to ask a good question/.test(samples) && /Thin and good/.test(samples) && /gift card/.test(samples));
ok("every area is listed with its title", SAMPLE_SECTIONS.every((s) => samples.includes(s.title.replace(/&/g, "&amp;"))), SAMPLE_SECTIONS.map((s) => s.title).filter((t) => !samples.includes(t.replace(/&/g, "&amp;"))).join(" | "));
ok("the first area is open and shows its questions with Try it and Copy; the others are closed", /Fill in the blanks|Sample questions<\/p>/.test(samples) && /Try it/.test(samples) && /aria-label="Copy this question"/.test(samples) && (samples.match(/aria-expanded="true"/g) || []).length === 1);
ok("a [blank] is highlighted", /bg-amber-100[^>]*>\[first name\]/.test(samples));
ok("there is a box to find a question", /aria-label="Find a sample question"/.test(samples));
ok("without a Try handler the questions carry no Try button", (h(<HelpManualModal isOpen onClose={noop} />).match(/Put this question in the search bar/g) || []).length === 0);
ok("with a Try handler every visible question has one", (samples.match(/title="Put this question in the search bar"/g) || []).length >= 5);

// the first render starts on the tab it is asked for
const how = h(<HelpManualModal isOpen onClose={noop} initialTab="how" />);
ok("the 'How it works' tab names every area the search covers and the old text is gone", /doctors and OPD/.test(how) && /telephone extension/.test(how) && /holiday/.test(how) && !/It covers circulars only/.test(how) && !/Find a sample question/.test(how));
ok("the 'How it works' tab still has the people, badge and shortcut sections", /Finding people/.test(how) && /red badge/.test(how) && /Keyboard shortcuts/.test(how));

ok("the page says, in an eye-catching banner, that these are sample questions showing what the search can handle", /Everything on this page is a <span[^>]*>sample<\/span>/.test(samples) && /the kind of question our search engine can handle/.test(samples) && /from-amber-500 via-orange-500/.test(samples));
ok("the two marks are explained once at the top and shown on questions: Press Enter, Appears as you type", (samples.match(/Press Enter/g) || []).length >= 3 && /Appears as you type · no Enter/.test(samples) && /type the whole question, then press the Enter key/.test(samples));
ok("an open area says in a boxed line how to run it", /How to run it:/.test(samples) && /AS YOU TYPE: no Enter/.test(samples));

const exec = h(<HelpManualModal isOpen onClose={noop} isExecutive onTry={noop} />);
ok("an executive is told the Deep Synthesis section is for them", /Executives: you can use this/.test(exec) && /Executives only/.test(samples));

console.log(`HelpManualModal selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
