// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/dates/dateCalc.selftest.ts
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { answerDateQuestion, parseDate, retirementDate, weekdaysBetween, ZONE } from "./dateCalc";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
// today is fixed: Thursday, 12 November 2026
const NOW = DateTime.fromISO("2026-11-12T15:30:00", { zone: ZONE });
const a = (q: string) => answerDateQuestion(q, NOW);
const head = (q: string) => a(q)?.headline;

ok("dates are read the Indian way, in many spellings", ["15/08/1985", "15-08-1985", "15.08.1985", "15 aug 1985", "15 August 1985", "15th Aug 1985", "Aug 15 1985", "August 15, 1985", "1985-08-15"].every((s) => parseDate(s, NOW)?.toISODate() === "1985-08-15"));
ok("today, tomorrow, yesterday", parseDate("today", NOW)?.toISODate() === "2026-11-12" && parseDate("tomorrow", NOW)?.toISODate() === "2026-11-13" && parseDate("yesterday", NOW)?.toISODate() === "2026-11-11");
ok("an impossible date is not a date", parseDate("31/02/2026", NOW) === null && parseDate("45 jan 2026", NOW) === null && parseDate("hello", NOW) === null);
ok("a date without a year is the next one, only when asked", parseDate("25 dec", NOW, true)?.toISODate() === "2026-12-25" && parseDate("1 jan", NOW, true)?.toISODate() === "2027-01-01" && parseDate("25 dec", NOW) === null);

ok("days between two dates", head("days between 1 jan 2026 and 15 mar 2026") === "73 days" && head("days from 01/01/2026 to 31/12/2026") === "364 days");
ok("the order of the two dates does not matter", head("days between 15 mar 2026 and 1 jan 2026") === "73 days");
ok("between: years, months, days, weeks, working days", (() => { const x = a("days between 1 jan 2026 and 15 mar 2026")!; const g = (l: string) => x.lines.find((y) => y.label.startsWith(l))?.value; return g("In years") === "2 months, 14 days" && g("In weeks") === "10 weeks and 3 days" && g("Working days") === "52"; })());
ok("the difference between", head("difference between 1 jan 2026 and 11 jan 2026") === "10 days");
ok("a date plus days, weeks, months, years", head("90 days from today") === "Wednesday, 10 February 2027" && head("2 weeks after 1 dec 2026") === "Tuesday, 15 December 2026" && head("1 month after 31 jan 2026") === "Saturday, 28 February 2026" && head("5 jan 2026 + 3 months") === "Sunday, 5 April 2026" && head("1 year before 29 feb 2024") === "Tuesday, 28 February 2023");
ok("before and ago", head("30 days before 5 march 2026") === "Tuesday, 3 February 2026" && head("45 days ago") === "Monday, 28 September 2026");
ok("age", (() => { const x = a("age 15/08/1985")!; return x.headline === "41 years, 2 months, 28 days" && x.lines.some((l) => l.label === "Next birthday" && /15 August 2027/.test(l.value)); })() && head("age of 15 aug 1985") === "41 years, 2 months, 28 days" && head("my age born on 15-08-1985") === "41 years, 2 months, 28 days" && head("age if born 12 nov 2000") === "26 years");
ok("a date of birth in the future is not an age", a("age 15/08/2030") === null);
ok("retirement: end of the month of the 60th birthday; the 1st means the month before", head("retirement date born 15/08/1975") === "Friday, 31 August 2035" && head("retirement date 01/08/1975") === "Tuesday, 31 July 2035" && head("superannuation date of 31 jan 1980") === "Tuesday, 31 January 2040");
ok("retirement says its rule and the time left", (() => { const x = a("retirement date born 15/08/1975")!; return /last day of the month/.test(x.notes[0]) && x.lines.some((l) => /Time left/.test(l.label) && /8 years/.test(l.value)); })());
ok("retirementDate directly, with another age", retirementDate(DateTime.fromISO("1975-08-15", { zone: ZONE }), 58).retires.toISODate() === "2033-08-31");
ok("what day is a date", head("what day is 26 jan 2027") === "Tuesday, 26 January 2027" && head("day of 15 aug 2026") === "Saturday, 15 August 2026" && head("day on 25/12/2026") === "Friday, 25 December 2026");
ok("week number", head("week number of 3 march 2026") === "Week 10 of 2026" && head("week number 1 jan 2026") === "Week 1 of 2026");
ok("days until, days since, days left in the year", head("days until 25 dec 2026") === "43 days" && head("days to 25/12/2026") === "43 days" && head("days until 12 nov 2026") === "That is today" && head("days since 1 jan 2026") === "315 days" && head("days left in 2026") === "49 days" && head("days left in the year") === "49 days");
ok("days until a date with no year is the next one", head("days until 25 dec") === "43 days" && head("days until 1 nov") === "354 days");
ok("days until a past date, or days since a future date, is nothing", a("days until 1 jan 2026") === null && a("days since 1 jan 2027") === null);
ok("working days, both ends included, holidays not taken out", (() => { const x = a("working days between 1 jan 2026 and 31 jan 2026")!; return x.headline === "22 working days" && /Holidays are NOT taken out/.test(x.notes[0]); })() && weekdaysBetween(DateTime.fromISO("2026-11-09", { zone: ZONE }), DateTime.fromISO("2026-11-16", { zone: ZONE })) === 5);
ok("today's date", head("today's date") === "Thursday, 12 November 2026" && head("what day is today") === "Thursday, 12 November 2026" && head("date today") === "Thursday, 12 November 2026");
ok("'what is' and a trailing ? are ignored", head("what is today's date?") === "Thursday, 12 November 2026" && head("how many days between 1 jan 2026 and 15 mar 2026?") === "73 days");
ok("not a date question: arithmetic dates, sentences, years, circular titles", ["24-01-2026", "15/03/2026 - 01/01/2026", "holiday list for the year 2026", "days of casual leave for contract workers", "when is the health check-up in January 2026", "2026", "age of the blast furnace", "retirement benefits circular", "who retires in 2027"].every((q) => a(q) === null), JSON.stringify(["24-01-2026", "holiday list for the year 2026", "days of casual leave for contract workers", "age of the blast furnace", "retirement benefits circular"].map((q) => a(q))));
ok("a very long text is refused", a("days between 1 jan 2026 and 15 mar 2026 " + "x".repeat(200)) === null);
ok("the module uses Luxon and never the Date object", !/new Date\(|Date\.now\(/.test(readFileSync("src/tools/dates/dateCalc.ts", "utf8").replace(/\/\/.*$/gm, "")));

console.log(`dateCalc selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
