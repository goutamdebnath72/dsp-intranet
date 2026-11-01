// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/PeopleAndEvents.selftest.tsx
// Step 65a: the "People & Events" widget as it is drawn: the cards, the initials, the empty sentences, the four tabs, the note about placeholder dates, and guards on the hook's risky lines.
// (The loading of the data, the midnight refresh and the clicks are covered by the click-through described in STATUS.)

import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PeopleAndEvents, PeopleTab, TABS_FOR_TEST } from "./PeopleAndEvents";
import { Avatar, PeopleScrollList, PersonCard, dayText, initialsOf } from "./PeopleScrollList";
import { DIRECTION } from "@/lib/SCROLL_CONFIG";
import type { PersonEvent } from "@/lib/peopleEvents/query";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const P = (over: Partial<PersonEvent> = {}): PersonEvent => ({ id: 1, name: "OLIVIA REED", designation: "Dy. General Manager", department: "Finance & A/C", imageUrl: null, on: null, ...over });

// ---- helpers ----
ok("initials: the first letter of the first and of the last word", initialsOf("MOHD ANWAR ULLAH") === "MU" && initialsOf("Olivia Reed") === "OR" && initialsOf("  rakesh   ojha ") === "RO");
ok("initials: one word gives one letter; nothing gives a question mark", initialsOf("Madonna") === "M" && initialsOf("") === "?" && initialsOf("   ") === "?");
ok("dayText: the form the retirement card always used, 'Oct 31, 2026'; nothing for nothing", dayText("2026-10-31") === "Oct 31, 2026" && dayText("2026-02-05") === "Feb 05, 2026" && dayText(null) === "" && dayText("") === "");

// ---- the cards ----
const bd = h(<PersonCard person={P()} kind="birthday" />);
ok("a birthday card: the name, the designation, the department; no extra line", bd.includes(">OLIVIA REED<") && bd.includes(">Dy. General Manager<") && bd.includes("Finance &amp; A/C") && !bd.includes("Retiring") && !bd.includes("25 years") && bd.includes('data-person-card="birthday"'));
const rt = h(<PersonCard person={P({ on: "2026-10-31" })} kind="retirement" />);
ok("a retirement card: 'Retiring: Oct 31, 2026' in red, as before", rt.includes("Retiring: Oct 31, 2026") && /text-red-500[^>]*>Retiring/.test(rt));
const jb = h(<PersonCard person={P({ on: "2026-10-12" })} kind="jubilee" />);
ok("a silver jubilee card: '25 years: Oct 12, 2026'", jb.includes("25 years: Oct 12, 2026") && !jb.includes("Retiring"));
ok("a birthday card never shows a date, even if one is passed", !h(<PersonCard person={P({ on: "2026-10-31" })} kind="birthday" />).includes("Oct 31"));
ok("a person with no photo gets the INITIALS in the same 64 x 80 box", (() => { const a = h(<Avatar person={P()} />); return a.includes('data-avatar="initials"') && a.includes(">OR<") && a.includes("width:64px") && a.includes("height:80px") && !a.includes("<img"); })());
ok("a person with a photo gets the photo (lazy, with his name as the description)", (() => { const a = h(<Avatar person={P({ imageUrl: "https://photos.example/o.jpg" })} />); return a.includes('src="https://photos.example/o.jpg"') && a.includes('alt="OLIVIA REED"') && a.includes('loading="lazy"') && !a.includes("data-avatar"); })());
ok("everything typed in a record is escaped", !h(<PersonCard person={P({ name: "<img src=x onerror=alert(1)>", designation: "<b>x</b>", department: "<script>" })} kind="birthday" />).match(/<img src=x|<b>x|<script>/));

// ---- the list ----
const two = [P({ id: 1, name: "ONE ONE" }), P({ id: 2, name: "TWO TWO" })];
const list = h(<PeopleScrollList people={two} direction={DIRECTION.UP} kind="birthday" emptyText="No birthdays today." />);
ok("a list shows each person ONCE at first (the repeat for the seamless loop is made only after it is measured and found taller than its box: with one or two people a repeat would show as a second identical card)", (list.match(/data-person-card="birthday"/g) ?? []).length === 2 && (list.match(/>ONE ONE</g) ?? []).length === 1 && (list.match(/>TWO TWO</g) ?? []).length === 1 && list.includes('data-people-list="birthday"'));
ok("an empty list says so in words", h(<PeopleScrollList people={[]} direction={DIRECTION.UP} kind="birthday" emptyText="No birthdays today." />).includes("No birthdays today.") && h(<PeopleScrollList people={[]} direction={DIRECTION.DOWN} kind="retirement" emptyText="Nobody retires this month." />).includes("Nobody retires this month."));
ok("the same card for the three lists, each with its own kind", ["birthday", "retirement", "jubilee"].every((k) => h(<PeopleScrollList people={two} direction={DIRECTION.DOWN} kind={k as "birthday"} emptyText="x" />).includes(`data-people-list="${k}"`)));

// ---- the tab states ----
ok("loading: a spinner and 'Loading...'", h(<PeopleTab loading={true} error={null} ready={false}><i>list</i></PeopleTab>).includes("Loading...") && !h(<PeopleTab loading={true} error={null} ready={false}><i>list</i></PeopleTab>).includes("<i>list"));
ok("an error is a sentence in red, announced; it names the fix when the database has no dates yet", (() => { const e = h(<PeopleTab loading={false} error="Run src/lib/nl2sql/sql/14_people_events.sql once in the Supabase SQL editor." ready={false}><i>list</i></PeopleTab>); return e.includes('role="alert"') && e.includes("14_people_events.sql") && !e.includes("<i>list"); })());
ok("once the data is there the list is shown, even if a later refresh failed", h(<PeopleTab loading={false} error="x" ready={true}><i>list</i></PeopleTab>).includes("<i>list</i>") && h(<PeopleTab loading={true} error={null} ready={true}><i>list</i></PeopleTab>).includes("<i>list</i>"));

// ---- the widget ----
const w = h(<PeopleAndEvents />);
ok("the four tabs, in this order: Birthdays (Today), Calendar, Retirements (month), Silver Jubilee (month)", TABS_FOR_TEST.join() === "Birthdays,Calendar,Retirements,Silver Jubilee" && /Birthdays[\s\S]*\(Today\)[\s\S]*Calendar[\s\S]*Retirements[\s\S]*Silver Jubilee/.test(w), w.slice(0, 300));
ok("the month shows on Retirements and on Silver Jubilee, in three letters ('Oct'), the month in India", (w.match(/\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\)/g) ?? []).length === 2);
ok("the tabs are a real tab list; the first is chosen", w.includes('role="tablist"') && (w.match(/role="tab"/g) ?? []).length === 4 && /aria-selected="true"[^>]*>(?:(?!<button)[\s\S])*Birthdays/.test(w));
ok("the tab strip scrolls sideways (the four tabs do not fit the small panel), with no visible scrollbar, and no tab shrinks or wraps", w.includes("overflow-x-auto") && w.includes("[&amp;::-webkit-scrollbar]:hidden") && (w.match(/flex-shrink-0 whitespace-nowrap/g) ?? []).length === 4);
ok("at first, before the data arrives: loading", w.includes("Loading..."));
ok("there is no 'sample' note on the widget (the data is sample data by design in this development phase; owner, 1 Nov 2026)", !w.includes("data-sample-note") && !/Sample dates/i.test(readFileSync("src/components/PeopleAndEvents.tsx", "utf8")));

// ---- guards on the hook (the render above never runs effects) ----
const hook = readFileSync("src/components/usePeopleEvents.ts", "utf8");
ok("the 'still mounted' flag is switched ON again at every mount (StrictMode mounts, unmounts, mounts: the same bug that once greyed the PAX editor for ever)", /useEffect\(\(\) => \{\s*alive\.current = true;/.test(hook));
ok("the lists are fetched fresh at midnight India time (+ a few seconds), by a timer that arms itself again", /msUntilNextMidnight\(\) \+ MIDNIGHT_GRACE_MS/.test(hook) && /arm\(\);\s*\}, msUntilNextMidnight/.test(hook) && /clearTimeout\(timer\)/.test(hook));
ok("a page left open comes back on a new day: it asks again when it becomes visible and the day has changed", /visibilitychange/.test(hook) && /loadedDay\.current !== isoDay\(todayIST\(\)\)/.test(hook) && /removeEventListener\("visibilitychange"/.test(hook));
ok("the data is never cached by the browser", /cache: "no-store"/.test(hook));
const widget = readFileSync("src/components/PeopleAndEvents.tsx", "utf8");
ok("the mock lists are gone from the widget (no mock names, no mock files)", !/mockBirthdays|mockRetirements|BirthdayScrollList|RetirementScrollList|Eleanor|Sophia Clarke/.test(widget));
ok("the calendar tab and its holiday fetch are as they were (EventCalendar still gets its FetchedHoliday type from this file)", /export type FetchedHoliday/.test(widget) && /<EventCalendar holidays=\{holidays\}/.test(widget) && /api\/holidays\/get-by-year/.test(widget));

console.log(`PeopleAndEvents selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
