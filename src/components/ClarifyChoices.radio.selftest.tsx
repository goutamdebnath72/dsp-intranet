// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/ClarifyChoices.radio.selftest.tsx
// Step 54a: the clarifying question in RADIO mode (exactly one choice: a doctor), with a second line under each option, an "alternative search" button, and the question rewrite by pattern;
// and the checkbox mode (departments) exactly as before.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClarifyChoices } from "./ClarifyChoices";
import { queryFor, type DepartmentAsk } from "@/lib/nl2sql/departmentAsk";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

const doctors: DepartmentAsk = {
  message: "More than one doctor is called Dr. Mukherjee.",
  word: "mukherjee",
  question: "is dr mukherjee available on next tuesday?",
  mode: "one",
  pattern: "\\b(?:(?:dr|doctor)\\.?\\s+)?(?:[a-z]\\.?\\s+)*mukherjee\\b",
  options: [
    { id: "a", label: "Dr. Avisek Mukherjee", detail: "Dental surgery", phrase: "Dr. Avisek Mukherjee (ticket 490086)" },
    { id: "b", label: "Dr. Sumit Mukherjee", detail: "Psychiatry", phrase: "Dr. Sumit Mukherjee (ticket 490138)" },
    { id: "c", label: "Dr. Gourav Mukherjee", detail: "Chest medicine · non-permanent", phrase: "Dr. Gourav Mukherjee (list no. DTN0767)" },
  ],
  none: { label: "None of these", reply: "Please add the doctor's first name or the department and ask again." },
  alternative: { label: "Search all employees named Mukherjee", query: "mukherjee" },
};
const m = h(<ClarifyChoices ask={doctors} onAsk={noop} />);
ok("RADIO buttons: one per doctor, all in one group", (m.match(/type="radio"/g) ?? []).length === 3 && !/type="checkbox"/.test(m) && new Set(m.match(/name="clarify-choice"/g)).size === 1);
ok("no 'Select all' (exactly one doctor is meant)", !/Select all/.test(m));
ok("the legend says what to do, for a screen reader", /<legend class="sr-only">Choose the doctor you mean<\/legend>/.test(m));
ok("each option has its name and, under it, what tells him apart", m.includes("Dr. Avisek Mukherjee") && m.includes("Dental surgery") && m.includes("Chest medicine · non-permanent"));
ok("nothing is chosen yet: Continue is disabled and no 'I will answer for' line", /<button[^>]*disabled=""[^>]*>Continue<\/button>/.test(m) && !/I will answer for/.test(m));
ok("'None of these' and the alternative search are separate buttons", m.includes(">None of these<") && m.includes(">Search all employees named Mukherjee<"));
ok("a short list has no scroll box", !/max-h-72/.test(m));
const many: DepartmentAsk = { ...doctors, options: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, label: `Dr. Person ${i}`, phrase: `Dr. Person ${i} (ticket 49000${i})` })) };
const mm = h(<ClarifyChoices ask={many} onAsk={noop} />);
ok("a long list (10) scrolls inside a box of its own, so the answer does not run away", /max-h-72 overflow-y-auto/.test(mm) && (mm.match(/type="radio"/g) ?? []).length === 10 && !/block text-xs text-neutral-500/.test(mm));
const none = h(<ClarifyChoices ask={{ ...doctors, options: [] }} onAsk={noop} />);
ok("no options: nothing is drawn", none === "");
const evil = h(<ClarifyChoices ask={{ ...doctors, options: [{ id: "x", label: "<script>alert(1)</script>", detail: "<img src=x onerror=alert(1)>", phrase: "p" }], alternative: { label: "<b>all</b>", query: "q" } }} onAsk={noop} />);
ok("labels, details and buttons are escaped", !/<script>|<img|<b>/.test(evil) && evil.includes("&lt;script&gt;"));

// the checkbox mode (departments) is exactly as before
const dept: DepartmentAsk = {
  message: "Which department?", word: "refractory", question: "refractory people",
  options: [{ id: "1", label: "REFRACTORY (code 86000)", phrase: "REFRACTORY (code 86000)" }, { id: "2", label: "COKE OVEN REFRACTORY (code 86600)", phrase: "COKE OVEN REFRACTORY (code 86600)" }],
  none: { label: "None of these", reply: "ok" },
};
const d = h(<ClarifyChoices ask={dept} onAsk={noop} />);
ok("departments still get CHECKBOXES, 'Select all' and the old legend", (d.match(/type="checkbox"/g) ?? []).length === 2 && !/type="radio"/.test(d) && /Select all/.test(d) && /Tick the department or departments you mean/.test(d));
ok("...and no detail line, no alternative button", !/block text-xs text-neutral-500/.test(d) && !/Search all employees/.test(d));

// the question rewrite
ok("the typed name (with 'dr') is replaced by the chosen doctor and his exact marker; the day is kept", queryFor(doctors, ["b"]) === "is Dr. Sumit Mukherjee (ticket 490138) available on next tuesday?");
ok("initials typed before the name are replaced too", queryFor({ ...doctors, question: "which days does dr a k mukherjee sit in opd" }, ["a"]) === "which days does Dr. Avisek Mukherjee (ticket 490086) sit in opd");
ok("'doctor' + the name is replaced too", queryFor({ ...doctors, question: "is doctor mukherjee in opd on monday" }, ["c"]) === "is Dr. Gourav Mukherjee (list no. DTN0767) in opd on monday");
ok("if the words are not found, the marker is added at the end", queryFor({ ...doctors, pattern: undefined, word: "zzz", question: "is he in opd on monday" }, ["b"]) === "is he in opd on monday Dr. Sumit Mukherjee (ticket 490138)");
ok("nothing chosen: no question", queryFor(doctors, []) === "");
ok("departments are rewritten exactly as before (a plain word)", queryFor(dept, ["1", "2"]) === "REFRACTORY (code 86000) and COKE OVEN REFRACTORY (code 86600) people");
console.log(`ClarifyChoices radio selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
