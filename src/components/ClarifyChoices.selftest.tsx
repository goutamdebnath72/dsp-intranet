// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/ClarifyChoices.selftest.tsx
// The options under a clarifying question: checkboxes, Select all, Continue, None of these, documents; nothing when there is no option.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClarifyChoices } from "./ClarifyChoices";
import { garageAsk, refractoryAsk } from "../lib/nl2sql/__fixtures__/askExamples";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

const ref = refractoryAsk("how many executives are there in refractory, list them?");
const html = h(<ClarifyChoices ask={ref} onAsk={noop} />);
ok("one checkbox per department, in order", (html.match(/type="checkbox"/g) ?? []).length === 3 && html.indexOf("REFRACTORY (code 86000)") < html.indexOf("REFRACTORY (OFFICE) (code 86030)") && html.indexOf("REFRACTORY (OFFICE) (code 86030)") < html.indexOf("COKE OVEN REFRACTORY (code 86600)"), html);
ok("nothing is ticked at the start", !/checked/.test(html));
ok("Select all is offered (three options)", html.includes("Select all") && !html.includes("Clear all"));
ok("Continue is there and disabled until something is ticked", /<button[^>]*disabled[^>]*>Continue<\/button>/.test(html), html);
ok("None of these is a separate button, not a checkbox", /<button[^>]*type="button"[^>]*>None of these<\/button>/.test(html) && (html.match(/type="checkbox"/g) ?? []).length === 3);
ok("a question about people has no documents button", !html.includes("documents"));
ok("nothing is said about the search before something is ticked", !html.includes("I will search for"));
ok("it is a fieldset with a legend for a screen reader", /<fieldset/.test(html) && /<legend[^>]*>Tick the department or departments you mean<\/legend>/.test(html));
ok("every button is a plain button (none submits a form)", (html.match(/<button/g) ?? []).length === (html.match(/<button[^>]*type="button"/g) ?? []).length);

const gar = garageAsk("garage", true);
const ghtml = h(<ClarifyChoices ask={gar} onAsk={noop} />);
ok("one option only: one checkbox and NO Select all (it would mean nothing)", (ghtml.match(/type="checkbox"/g) ?? []).length === 1 && !ghtml.includes("Select all"), ghtml);
ok("a bare word offers the documents button", ghtml.includes("I am looking for documents (circulars) about \u201Cgarage\u201D instead"));
ok("no options: nothing at all", h(<ClarifyChoices ask={{ ...gar, options: [] }} onAsk={noop} />) === "");
ok("a label with an apostrophe or quotes is escaped, not broken", /Don&#x27;t|Don't/.test(h(<ClarifyChoices ask={{ ...gar, options: [{ id: "x", label: "Don't know", phrase: "x" }] }} onAsk={noop} />)));

console.log(`ClarifyChoices selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
