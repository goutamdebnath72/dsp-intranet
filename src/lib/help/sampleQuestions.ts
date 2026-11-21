// src/lib/help/sampleQuestions.ts
//
// THE SAMPLE QUESTIONS OF THE USER GUIDE: one data file, read by src/components/HelpManualModal.tsx. Nothing about a question is written in the component, so a new area of the
// search (a new directory, a new tool) is one new entry here, not a change to the screen.
//
// Every question was taken from a question the project has already run or tested (the router and hospital tests, the employee-directory examples), with one rule: a question that names a
// PERSON is a template ("[name]"), never a real employee. src/lib/help/sampleQuestions.selftest.ts keeps the guide honest: no ordinary sample may be one the front gate sends to the deep search
// (synthesisIntent.ts), except those marked `either`. The deep search (EDS) has its own tab of the guide (src/lib/help/edsGuide.ts); nothing about it is described on the sample questions page.
//
// A "[bracket]" in a question is a blank to fill in: the guide shows it highlighted, and "Try it" puts the text in the search box for the reader to edit before pressing Enter.

import { TOPICS } from "@/tools/registry";
import { MENU_SAMPLES } from "@/tools/menu";
import type { TopicLogic } from "@/tools/types";

export type SectionIcon = "calculator" | "lightbulb" | "users" | "chart" | "stethoscope" | "phone" | "calendar" | "title" | "content" | "layers" | "sparkles" | "megaphone";

export interface SampleQuestion {
  q: string;
  /** one short line: what the answer will be, or why the question is a good one */
  note?: string;
  /** the result appears as you type, with no Enter (a number, a site or department name); every other question needs Enter */
  instant?: boolean;
  /** may be sent to the deep search for a signed-in executive and to the ordinary search for everyone else (the front gate decides): not tested as ordinary */
  either?: boolean;
}

export interface SampleSection {
  id: string;
  title: string;
  icon: SectionIcon;
  /** what this part of the search covers, in one sentence */
  covers: string;
  /** how to run it, said plainly: which input appears as you type and which needs the Enter key */
  howToRun: string;
  /** how to ask well in this area (short, concrete) */
  tips: string[];
  questions: SampleQuestion[];
  /** a fill-in-the-blank shape of a good question */
  patterns?: string[];
}

/** The window event that asks the search bar to open with a question typed in (the reader still presses Enter). */
export const OMNIBAR_PREFILL_EVENT = "omnibar-prefill";
/** The window event that opens the user guide (detail: { tab: "samples" | "utility" | "how" | "eds" }). */
export const OPEN_GUIDE_EVENT = "open-user-guide";

/** A pair that shows what makes a question good: the same need, asked thinly and asked well. */
export const WEAK_VS_GOOD: Array<{ weak: string; good: string; why: string }> = [
  { weak: "gift card", good: "What is the gift card amount for employees, who can opt and what is the last date?", why: "says what you want to know about the topic" },
  { weak: "holidays", good: "Compare the festival holidays notified for 2025 and 2026", why: "names the years and what to compare" },
  { weak: "hindi scheme", good: "Does the Hindi teaching scheme give a cash prize for Praveen?", why: "one clear question the circular can answer" },
  { weak: "doctor", good: "can I see dr karmakar on tuesday at 5pm", why: "a name, a day and a time" },
  { weak: "who is incharge", good: "who is in charge of blast furnace", why: "names the department" },
];

/** The recipe in four lines, shown first. */
export const RECIPE: string[] = [
  "Name the subject the way the circular does: the scheme, the facility, the rule, the department.",
  "Say what you want about it: an amount, a last date, who approves, who is eligible, how to apply.",
  "When you compare, name the years or editions (2025 and 2026) and what to compare (amounts, dates, eligibility).",
  "Ask one thing, or a few things about one subject. Spelling need not be perfect for names; numbers and dates should be.",
];

export const SAMPLE_SECTIONS: SampleSection[] = [
  {
    id: "titles",
    title: "Find a circular by its title",
    icon: "title",
    howToRun: "Type the words, then press Enter.",
    covers: "Circulars and announcements whose heading matches your words.",
    tips: [
      "Type the few words a title would hold: the subject, the year, the word circular.",
      "To find which circular carried a rule, ask \"which circular ...\".",
      "Put words in double quotes to match that exact phrase. The matched words are highlighted in the result, and inside an announcement when you open it.",
    ],
    patterns: ["circular on [subject] [year]", "which circular announced [scheme or rule]"],
    questions: [
      { q: "canteen timings circular" },
      { q: "gift card circular" },
      { q: "Mediclaim policy extension" },
      { q: "holiday list for the year 2026" },
      { q: "circular on SIR declaration" },
      { q: "Which circular announced the Hindi teaching scheme?" },
      { q: "Which circular mentions the Kaushal Award?" },
      { q: "\"retention of company accommodation\"", note: "in quotes: that exact phrase" },
    ],
  },
  {
    id: "content",
    title: "Ask what a circular says",
    icon: "content",
    howToRun: "Type the whole question, then press Enter.",
    covers: "A question whose answer is inside one or a few circulars: an amount, a last date, an eligibility rule, a procedure. The answer cites the circular, and you can open it.",
    tips: [
      "Ask the question as you would ask a colleague. The search reads the circulars by meaning, not by exact words.",
      "Ask for the fact you need: how much, by when, who can apply, what documents, where.",
      "A rule for one group (executives, contract workers, retired employees) should say which group.",
      "If the answer says it is not stated, ask again with the circular's own words for the subject.",
    ],
    patterns: ["what is the [amount / last date / eligibility] of [scheme]", "how do I apply for [facility]", "who can apply for [scheme]"],
    questions: [
      { q: "What is the gift card amount for employees?" },
      { q: "What is the deadline for submitting the SIR declaration in Format B?" },
      { q: "How do I return my provident fund advance before the due date?" },
      { q: "What documents are needed for the pre-mature repayment of a PF loan?" },
      { q: "Can a retired employee keep their company quarters in Kolkata or Mumbai?" },
      { q: "What time does the health check-up start?" },
      { q: "Where is the health check-up held in January 2026?" },
      { q: "How do I apply for LinkedIn membership as an executive?" },
      { q: "How to apply for the higher education sponsorship scheme" },
      { q: "What is the minimum daily wage for contract workers from 1 January 2024?" },
      { q: "Does the Hindi teaching scheme give a cash prize for Praveen?" },
      { q: "What is the extended last date for Mediclaim renewal?" },
      { q: "Which executives were promoted from E1 to E2 with effect from 31 December 2025, with their present designation, promoted designation and pay scale?", note: "a list taken from an order" },
    ],
  },
  {
    id: "people",
    title: "Find a person",
    icon: "users",
    howToRun: "Numbers (ticket, mobile, personal number) appear AS YOU TYPE: no Enter. A name, or part of a name with a department: type it, then press Enter.",
    covers: "The employee directory: by ticket number, CUG mobile, SAIL personal number, or by name (similar-sounding), with or without the department.",
    tips: [
      "A number needs no Enter: a 6-digit ticket, a 10-digit CUG mobile, a SAIL personal number, or the last 4 digits of an executive's CUG mobile.",
      "A card shows the name, ticket number, SAIL personal number, designation and department. The ticket number, the personal number, the mobile number and the e-mail are all masked: press one to see it. Before you sign in, only a ticket number or a name can be looked up; a mobile or SAIL personal number needs a sign-in. The personal number is also the first password, so only a few can be revealed in an hour.",
      "A name is matched by sound: a different spelling still finds the person. Honorifics (Mr, Dr, Shri) are ignored.",
      "Only part of the name? Add the department, in either order.",
      "Press a masked ticket number, personal number, mobile number or e-mail to see it. If you have not signed in, the sign-in window opens and, once you are in, it is shown; every reveal is recorded (see Contact details under How it works for who can reveal and copy).",
    ],
    questions: [
      { q: "[first name] [last name]", note: "similar-sounding: \"Goutam\" also finds \"Gautam\" and \"Gautham\"" },
      { q: "anil kumar", note: "words match in order: finds \"Anil Kumar Salian\"" },
      { q: "[part of name] c&it", note: "part of a name plus the department, in any order" },
      { q: "c&it [part of name]", note: "the same, department first" },
      { q: "[6-digit ticket number]", note: "shows the person at once", instant: true },
      { q: "D123456", note: "a SAIL personal number, any case (signed-in people only: the card shows it with its middle hidden)", instant: true },
      { q: "2584", note: "last 4 digits of an executive's CUG mobile", instant: true },
    ],
  },
  {
    id: "roster",
    title: "Department search, counts and comparisons",
    icon: "chart",
    howToRun: "Type the whole question, then press Enter.",
    covers: "Headcounts, designations, heads of department, seniority, grades and name patterns, answered from the employee directory.",
    tips: [
      "Ask in plain words: how many, who is, which department, top N, most senior.",
      "Name the department the way people say it (C&IT, blast furnace, mechanical, plant garage).",
      "Add a grade or designation to narrow it: DGM, executives, non-executives, S-5 and above.",
    ],
    patterns: [
      "how many [designation] are there in [department]",
      "who is the Head of Department of [department]",
      "who is senior to [name]",
      "designation wise count of employees in [department]",
    ],
    questions: [
      { q: "how many executives are there in C&IT" },
      { q: "who is the Head of Department of C&IT" },
      { q: "how many employees are currently posted in the C&IT department, and who is the Head of Department", note: "two things about one department" },
      { q: "who is in charge of blast furnace" },
      { q: "designation wise count of employees in plant garage" },
      { q: "how many DGMs in mechanical" },
      { q: "how many women executives" },
      { q: "who are the 10 most senior non executives" },
      { q: "which department has the most executives and what share of all executives is that" },
      { q: "how many executives and non-executives work in each blast furnace section" },
      { q: "who is senior to [name]" },
      { q: "which department is ticket [6-digit ticket number] in" },
      { q: "find the names which end with kumar", note: "a name pattern" },
    ],
  },
  {
    id: "holidays",
    title: "Holidays",
    icon: "calendar",
    howToRun: "Type the whole question, then press Enter.",
    covers: "The plant's closed, festival and restricted holidays, by festival, month or year, and comparisons between years.",
    tips: [
      "Name the festival (Durga Puja, Diwali, Eid), the month, or the year.",
      "Closed/public, festival and restricted holidays are different lists: say which one you mean, or ask for all.",
      "To see what differs between years, ask to compare, and name the years.",
    ],
    patterns: ["when is [festival] holiday in [year]", "holidays in [month]", "compare festival holidays [year] and [year]"],
    questions: [
      { q: "when is Durga Puja holiday in 2026" },
      { q: "holidays in November", note: "a month's holidays" },
      { q: "restricted holidays in 2026" },
      { q: "list of festival holidays 2026" },
      { q: "is Diwali a holiday this year" },
      { q: "compare festival holidays 2025 and 2026", note: "two years side by side", either: true },
      { q: "holiday list for the year 2023", note: "opens the circular itself" },
    ],
  },
  {
    id: "doctors",
    title: "Doctors and OPD",
    icon: "stethoscope",
    howToRun: "Type the whole question, then press Enter.",
    covers: "The DSP Main Hospital: which doctor sits on which day, department OPD lists, OPD token timings, qualifications, permanent or contractual.",
    tips: [
      "Give the doctor's surname (or full name), and a day or a time if you have one.",
      "For a department, say its name: medicine, surgery, ENT, eye, orthopaedics, dental, chest, gynae.",
      "The answer comes from the hospital's OPD schedule only: it never invents a timing.",
    ],
    patterns: [
      "on which day of the week can I see dr [surname] in opd",
      "[department] opd lists",
      "list the doctors with [MD / MS / DNB] qualification",
    ],
    questions: [
      { q: "on which day of the week can I see dr karmakar in opd" },
      { q: "can I see dr karmakar on tuesday at 5pm", note: "a day and a time" },
      { q: "medicine opd lists", note: "one department's OPD" },
      { q: "opd token timings" },
      { q: "is opd open today" },
      { q: "is opd open on 25 december", note: "a date, to check a holiday" },
      { q: "list the permanent doctors with their specializations" },
      { q: "list the permanent doctors with their qualifications" },
      { q: "list the non-permanent doctors with their specializations" },
      { q: "is dr rajeev kumar permanent" },
      { q: "list the doctors with MD qualification" },
    ],
  },
  {
    id: "pax",
    title: "Telephone extensions (PAX)",
    icon: "phone",
    howToRun: "Type the whole question, then press Enter.",
    covers: "Internal telephone and intercom numbers of offices, departments and places.",
    tips: [
      "Name the place or department: fire service, central store, civil.",
      "Got a number and want to know whose it is? Ask whether it is a PAX number, or who holds it.",
    ],
    patterns: ["pax number of [office or department]", "is [number] a pax number"],
    questions: [
      { q: "pax number of fire service" },
      { q: "pax number of central store" },
      { q: "how many pax numbers does civil have" },
      { q: "how many pax numbers in plant" },
      { q: "is 42046 a pax number", note: "who holds an extension" },
    ],
  },
  {
    id: "announcements",
    title: "Announcements and intranet sites",
    icon: "megaphone",
    howToRun: "A site or department name appears AS YOU TYPE: no Enter. A question about an announcement: type it, then press Enter.",
    covers: "Announcements and happenings, and the links to the intranet's sites and departments' pages.",
    tips: [
      "A site or department name, in full, in short form or in part, shows its link under Intranet Sites with an Open button that launches the site in a new tab. A site not yet linked still appears, marked \"Link not available yet\". Typing just a department name brings up its site link.",
      "Announcements are searched like circulars: by title, by the words of their text, and by what their attached PDF says (a PDF is read when the announcement is published, so an announcement that is only a title and a PDF is found by what the PDF says). A result found inside a PDF says \"In the PDF, page N\" and opens the PDF at that page.",
    ],
    questions: [
      { q: "ERP", note: "the site appears under Intranet Sites; no Enter", instant: true },
      { q: "attendance", note: "the site appears as you type; press Enter to search the circulars too", instant: true },
      { q: "e-Str", note: "a short form of a site name", instant: true },
      { q: "C&IT", note: "the department's site link; add a name and press Enter for its people", instant: true },
      { q: "Which theme was chosen for SAIL Gaurav Diwas?" },
      { q: "procedure for digital signature certificate", note: "an announcement, found by its title" },
      { q: "who do I contact for DSC queries", note: "an answer from inside the announcement's PDF; it opens at the page, once the PDF has been read" },
    ],
  },
];

/** The sample questions of the Utility Services (shown on the Utility Services tab, not among the sample questions of the main features). The questions are written by the topics themselves. */
export const TOOLS_SECTION: SampleSection = {
  id: "tools",
  title: "Calculators, converters and live cards",
  icon: "calculator",
  covers: "Type calculators and press Enter for the menu of ready tools (calculator, converters, dates, provident fund (PF maturity and PF loan EMI), gratuity, leave encashment, tyre and rim sizes, VIN reader, BH series, electric car charging); then the live cards: gold, fuel, markets, news, weather, flights, trains and fares, AICPI, SAIL DA and inflation, the PIN codes, wards, assembly seats and police stations of Durgapur, and steel (prices, the makers compared, SAIL and India). The calculators run in your browser: nothing you type is saved anywhere.",
  howToRun: "Sums, conversions and date questions appear AS YOU TYPE: no Enter. A calculator form (EMI, PF, gratuity...): type its name, then press Enter to open the form.",
  tips: [
    "Most tools open with a short command (gold price, weather, ev charging) or a long one (gold rate today, durgapur weather report with forecast, how long to charge an electric car): the What to type list (at the end of the How it works tab) gives both for every feature.",
    "Type a sum straight in: + - * / ^, brackets, % (200 + 10%), \"15% of 2400\", lakh and crore (5 lakh * 12).",
    "For a conversion write: number, unit, \"in\" or \"to\", unit. Units: length, area, volume, mass, temperature, angle (degrees and radians), energy (calories, kWh), force, power (bhp and kW), pressure, speed, time.",
    "Currency: dollar, pound, euro and others into rupees, with the day's reference rate (a bank or money changer will quote differently).",
    "Dates are written day first: 15/08/1985 is 15 August. Say \"days between ... and ...\", \"90 days from today\", \"age ...\", \"retirement date born ...\".",
    "Money results are approximations: please double-check them. The forms start with usual rates; change them to the figures of your own case.",
  ],
  // the questions are written by the topics themselves (src/tools/<topic>/topic.ts), in the order of the registry; the list of calculators is last
  questions: [...(TOPICS as readonly TopicLogic[]).flatMap((t) => [...(t.samples ?? [])]), ...MENU_SAMPLES],
};

/** Every question of the guide, with the section it belongs to (the guide's search box and the selftest read this). */
export function allSamples(): Array<{ sectionId: string; q: string; note?: string; either?: boolean }> {
  const out: Array<{ sectionId: string; q: string; note?: string; either?: boolean }> = [];
  for (const s of [...SAMPLE_SECTIONS, TOOLS_SECTION]) for (const x of s.questions) out.push({ sectionId: s.id, q: x.q, note: x.note, either: x.either });
  return out;
}

/** The sections (and, inside them, the questions) that hold every word of `text`; an empty text keeps everything. */
export function filterSections(text: string, sections: SampleSection[] = SAMPLE_SECTIONS): SampleSection[] {
  const words = (text || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return sections;
  const has = (hay: string) => words.every((w) => hay.toLowerCase().includes(w));
  const out: SampleSection[] = [];
  for (const s of sections) {
    const head = `${s.title} ${s.covers}`;
    const questions = s.questions.filter((x) => has(`${x.q} ${x.note ?? ""} ${head}`));
    const patterns = (s.patterns ?? []).filter((p) => has(`${p} ${head}`));
    if (questions.length || patterns.length) out.push({ ...s, questions, patterns });
  }
  return out;
}

/** Splits a question at its "[blanks]" so the guide can highlight them: [{ text, blank }]. */
export function splitBlanks(q: string): Array<{ text: string; blank: boolean }> {
  const out: Array<{ text: string; blank: boolean }> = [];
  let last = 0;
  for (const m of q.matchAll(/\[[^\]]+\]/g)) {
    if (m.index! > last) out.push({ text: q.slice(last, m.index), blank: false });
    out.push({ text: m[0], blank: true });
    last = m.index! + m[0].length;
  }
  if (last < q.length) out.push({ text: q.slice(last), blank: false });
  return out;
}
