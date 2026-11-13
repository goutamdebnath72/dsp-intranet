// src/tools/dates/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the date calculators, and a date question answered as you type (days between two dates, 90 days from today, age, retirement date).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { answerDateQuestion } from "./dateCalc";

export const datesTopic = defineTopic({
  id: "dates",
  form: {
    rank: 60,
    nouns: ["date", "dates", "age", "retirement", "superannuation", "days", "between", "difference"],
    wants: (c) => c.has(["date", "dates", "age", "retirement", "superannuation", "days"]) && c.calcWord && c.only(),
  },
  hits: [{ rank: 60, detect: (q, now) => { const answer = answerDateQuestion(q, now); return answer ? { kind: "date" as const, answer } : null; } }],
  samples: [
    { q: "days between 1 jan 2026 and 15 mar 2026", note: "days, weeks, months and working days", instant: true },
    { q: "90 days from today", note: "the date after 90 days", instant: true },
    { q: "age 15/08/1985", note: "age in years, months and days", instant: true },
    { q: "retirement date born 15/08/1975", note: "the end of the month of the 60th birthday", instant: true },
    { q: "what day is 26 jan 2027", note: "the weekday and week number", instant: true },
    { q: "days until 25 dec 2026", instant: true },
    { q: "working days between 1 jan 2026 and 31 jan 2026", note: "Monday to Friday; holidays are not taken out", instant: true },
    { q: "today's date", instant: true },
    { q: "date calculator", note: "between dates, add or subtract, age, retirement date" },
  ],
});
