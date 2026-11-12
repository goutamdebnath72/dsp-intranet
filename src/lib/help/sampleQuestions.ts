// src/lib/help/sampleQuestions.ts
//
// THE SAMPLE QUESTIONS OF THE USER GUIDE: one data file, read by src/components/HelpManualModal.tsx. Nothing about a question is written in the component, so a new area of the
// search (Executive Deep Synthesis beyond the circulars, a new directory) is one new entry here, not a change to the screen.
//
// Every question was taken from a question the project has already run or tested (the router and hospital tests, the employee-directory examples, the EDS panel of 9-12 Nov 2026
// and its fresh keys), with one rule: a question that names a PERSON is a template ("[name]"), never a real employee. src/lib/help/sampleQuestions.selftest.ts keeps the
// guide honest: every Deep Synthesis sample must be one the front gate really sends to Deep Synthesis (synthesisIntent.ts), and no ordinary sample may be.
//
// A "[bracket]" in a question is a blank to fill in: the guide shows it highlighted, and "Try it" puts the text in the search box for the reader to edit before pressing Enter.

export type SectionIcon = "calculator" | "lightbulb" | "users" | "chart" | "stethoscope" | "phone" | "calendar" | "title" | "content" | "layers" | "sparkles" | "megaphone";

export interface SampleQuestion {
  q: string;
  /** one short line: what the answer will be, or why the question is a good one */
  note?: string;
  /** the result appears as you type, with no Enter (a number, a site or department name); every other question needs Enter */
  instant?: boolean;
  /** answered by Deep Synthesis for an executive and by the ordinary search for everyone else (the front gate decides): not tested as ordinary */
  either?: boolean;
}

/** The same subject asked three ways, from the simplest to the deepest: teaches how a question grows. */
export interface Ladder {
  subject: string;
  title: string;
  content: string;
  deep: string;
}

export interface SampleSection {
  id: string;
  title: string;
  icon: SectionIcon;
  /** what this part of the search covers, in one sentence */
  covers: string;
  /** shown only for signed-in executives' use: the question is still tried, the badge says who gets the deep answer */
  executivesOnly?: boolean;
  /** how to run it, said plainly: which input appears as you type and which needs the Enter key */
  howToRun: string;
  /** how to ask well in this area (short, concrete) */
  tips: string[];
  questions: SampleQuestion[];
  /** a fill-in-the-blank shape of a good question */
  patterns?: string[];
  ladders?: Ladder[];
}

/** The window event that asks the search bar to open with a question typed in (the reader still presses Enter). */
export const OMNIBAR_PREFILL_EVENT = "omnibar-prefill";
/** The window event that opens the user guide (detail: { tab: "samples" | "how" }). */
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
    id: "people",
    title: "Find a person",
    icon: "users",
    howToRun: "Numbers (ticket, mobile, personal number) appear AS YOU TYPE: no Enter. A name, or part of a name with a department: type it, then press Enter.",
    covers: "The employee directory: by ticket number, CUG mobile, SAIL personal number, or by name (similar-sounding), with or without the department.",
    tips: [
      "A number needs no Enter: a 6-digit ticket, a 10-digit CUG mobile, a SAIL personal number, or the last 4 digits of an executive's CUG mobile.",
      "A name is matched by sound: a different spelling still finds the person. Honorifics (Mr, Dr, Shri) are ignored.",
      "Only part of the name? Add the department, in either order.",
      "Mobile numbers and emails are masked; sign in and press reveal to see them (every reveal is recorded).",
    ],
    questions: [
      { q: "[first name] [last name]", note: "similar-sounding: \"Goutam\" also finds \"Gautam\"" },
      { q: "anil kumar", note: "words match in order: finds \"Anil Kumar Salian\"" },
      { q: "[part of name] c&it", note: "part of a name plus the department, in any order" },
      { q: "c&it [part of name]", note: "the same, department first" },
      { q: "[6-digit ticket number]", note: "shows the person at once", instant: true },
      { q: "D111086", note: "a SAIL personal number, any case", instant: true },
      { q: "2584", note: "last 4 digits of an executive's CUG mobile", instant: true },
    ],
  },
  {
    id: "roster",
    title: "Count and compare employees",
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
      { q: "compare festival holidays 2025 and 2026", note: "two years side by side (executives get the deep briefing, others the holiday comparison)", either: true },
      { q: "holiday list for the year 2023", note: "opens the circular itself" },
    ],
  },
  {
    id: "titles",
    title: "Find a circular by its title",
    icon: "title",
    howToRun: "Type the words, then press Enter.",
    covers: "Circulars and announcements whose heading matches your words.",
    tips: [
      "Type the few words a title would hold: the subject, the year, the word circular.",
      "To find which circular carried a rule, ask \"which circular ...\".",
      "Put words in double quotes to match that exact phrase.",
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
    id: "eds",
    title: "Executive Deep Synthesis: compare, trace, list across circulars",
    icon: "sparkles",
    executivesOnly: true,
    howToRun: "Type the whole question, then press Enter. A signed-in executive gets the combined briefing by itself, and it takes longer than a normal search.",
    covers: "A question that needs several circulars built into one sourced briefing, with a summary, findings, tables and charts. It starts by itself for a signed-in executive (ticket starting with 4); everyone else gets the normal search.",
    tips: [
      "Ask in English, in one question: compare, what changed, how did it develop, list every, for each category.",
      "Name the years or editions and the things to compare (amounts, dates, eligibility, who approves).",
      "A good question here is long: it names the subject, the years or categories, and each thing you want to see (amounts, dates, eligibility, who approves). Every sample below is a complete question: copy its shape.",
      "The briefing quotes the circulars and says plainly what they do not state. Check the circular before acting.",
      "It takes longer than a normal search: watch the three progress messages.",
    ],
    questions: [
      { q: "Compare the holiday lists notified for DSP for 2022 and 2023: closed and public holidays, festival holidays for each category, restricted holidays, and what differs between the two years.", note: "Compare · subject + two years + four kinds of holiday + \"what differs\"" },
      { q: "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?", note: "Compare · three years + the dates that differ" },
      { q: "How did the holidays and leave entitlements for contractor workers in DSP change between 2023, 2024 and 2025?", note: "Change over time · one group of employees + two subjects + three years" },
      { q: "Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024: start dates, who is covered, technology used and what happens to those who do not register.", note: "Two rollouts · four points each" },
      { q: "Compare the Joint Industrial Adviser vacancy in the Ministry of Steel with the ICVL MD & CEO deputation in Mozambique: eligibility, pay, mode of filling and how to apply.", note: "Two notices side by side · four points" },
      { q: "Compare all the motivational award schemes of DSP by beneficiary grade, award amount, periodicity, executing authority and the occasion on which each is awarded.", note: "One table across many schemes · five columns named" },
      { q: "Under the scheme for sponsoring executives for higher specialised education, what bond amount and bond period apply to each type of sponsorship by course duration, and who approves study leave with financial assistance for each grade?", note: "Rules by category · two amounts + an approver for each grade" },
      { q: "Under the rules for retention of company accommodation by ex-employees at city locations, how long can an ex-employee keep the accommodation in Type A and Type B cities, what rent and which authority apply to each period, and what security deposit is required?", note: "Rules by category · period, rent, authority and deposit for each" },
      { q: "What revised GPAIS premium amounts apply to contract workers from 1 January 2025, and what are the minimum daily wages for contract workers in the Works, Projects and Town Services (Electrical) areas from 1 January 2024?", note: "Two amounts from two circulars · each with its date and its areas" },
      { q: "List every 2026 last date announced in the circulars and compare them across Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option.", note: "Deadlines gathered from many circulars · four named subjects" },
      { q: "Explain the online Leave Management System procedure for non-executives: from when it is compulsory, who recommends, who sanctions and what the employee must do.", note: "A procedure · start date, recommender, sanctioner, the employee's steps" },
      { q: "What selection trials, coach selections, venues, dates and entry conditions were announced for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25?", note: "Two seasons of one event · five points each" },
      { q: "What do the circulars say about SAIL Gaurav Diwas 2026 and about contributions on Armed Forces Flag Day: dates, how employees take part, and the ways to pay?", note: "Two subjects in one question · three points about them" },
    ],
    ladders: [
      {
        subject: "Zero tolerance safety rules",
        title: "zero tolerance safety rules circular",
        content: "What is the penalty at the fourth stage under the zero tolerance rules?",
        deep: "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?",
      },
      {
        subject: "Gift card",
        title: "gift card circular",
        content: "What is the gift card amount for employees?",
        deep: "Describe the 2026 gift card facility for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed.",
      },
      {
        subject: "Hindi teaching scheme",
        title: "Which circular announced the Hindi teaching scheme?",
        content: "Does the Hindi teaching scheme give a cash prize for Praveen?",
        deep: "How does the January to May 2026 Hindi Teaching Scheme session differ from the one starting in January 2024 in courses, eligibility, number of candidates and incentives?",
      },
      {
        subject: "Health check-up",
        title: "health check-up of non-executive employees",
        content: "What time does the health check-up start?",
        deep: "Compare the reporting time, venue, preparation instructions and report-collection arrangements for the non-executive health check-ups in December 2024, January 2025 and January 2026.",
      },
    ],
  },
  {
    id: "tools",
    title: "Calculators and converters",
    icon: "calculator",
    covers: "A calculator, unit and currency conversion, date calculations, and forms for loan EMI, probable PF maturity, gratuity and leave encashment. All of it runs in your browser: nothing you type is saved anywhere.",
    howToRun: "Sums, conversions and date questions appear AS YOU TYPE: no Enter. A calculator form (EMI, PF, gratuity...): type its name, then press Enter to open the form.",
    tips: [
      "Type a sum straight in: + - * / ^, brackets, % (200 + 10%), \"15% of 2400\", lakh and crore (5 lakh * 12).",
      "For a conversion write: number, unit, \"in\" or \"to\", unit. Units: length, area, volume, mass, temperature, angle (degrees and radians), energy (calories, kWh), force, power (bhp and kW), pressure, speed, time.",
      "Currency: dollar, pound, euro and others into rupees, with the day's reference rate (a bank or money changer will quote differently).",
      "Dates are written day first: 15/08/1985 is 15 August. Say \"days between ... and ...\", \"90 days from today\", \"age ...\", \"retirement date born ...\".",
      "Money results are approximations: please double-check them. The forms start with usual rates; change them to the figures of your own case.",
    ],
    questions: [
      { q: "calculator", note: "the full calculator, basic and scientific, like the Mac's: keys with the mouse or the keyboard, memory, brackets, powers, roots, trig, history" },
      { q: "scientific calculator", note: "opens the same calculator (switch between Basic and Scientific at the top of it)" },
      { q: "12*45+7", note: "a sum", instant: true },
      { q: "sq rt of 4^3", note: "square root of 4 to the power 3 (= 8); 'square root of 64' and '√64' also work", instant: true },
      { q: "cube root of 27", note: "cube root (= 3); 'cb rt of 27' and '∛27' also work; '5th root of 32' for any other root", instant: true },
      { q: "2*pi*8", note: "circumference of a circle of radius 8; pi and e are known ('2pi' also works, and 'value of pi' shows its digits)", instant: true },
      { q: "value of e", note: "Euler's number to 20 digits; 'value of pi' likewise", instant: true },
      { q: "golden ratio", note: "the golden ratio φ to 20 digits; it can also be used in a sum, e.g. '100 * golden ratio'", instant: true },
      { q: "12 squared", note: "a square (= 144); 'cube of 3' or '3 cubed' for a cube", instant: true },
      { q: "15% of 2400", note: "a percentage", instant: true },
      { q: "200 + 10%", note: "a pocket-calculator percentage: 220", instant: true },
      { q: "5 lakh * 12", note: "Indian number words", instant: true },
      { q: "5 km in miles", note: "length", instant: true },
      { q: "1 bhp in kw", note: "power", instant: true },
      { q: "100 bhp", note: "engine power is always shown in all three: PS (German Pferdestärke, metric horsepower), bhp and kW; 'engine power' or '1 kw in ps' work too", instant: true },
      { q: "205/55 R16 91V", note: "how to read a tyre size: width, aspect ratio (55 is a percentage of the width, giving the sidewall height), rim, load index (kg) and speed symbol, each explained", instant: true },
      { q: "tyre size", note: "opens the tyre reader with sample sizes to try and the load-index and speed tables" },
      { q: "ev charging time", note: "battery size, AC and DC chargers, time from 10% to 90%, and what the battery and charger words mean" },
      { q: "bhp to ps", note: "no number means one unit; the card is laid out like Google's, so you can retype either box or change either unit", instant: true },
      { q: "100 kw to bhp", note: "power, the other way", instant: true },
      { q: "180 degrees to radians", note: "angle", instant: true },
      { q: "98.6 f to c", note: "temperature", instant: true },
      { q: "1 kWh in calories", note: "energy", instant: true },
      { q: "1 kgf/cm2 to bar", note: "pressure", instant: true },
      { q: "1 acre in sq ft", note: "area", instant: true },
      { q: "72 km/h to m/s", note: "speed", instant: true },
      { q: "100 usd to inr", note: "currency", instant: true },
      { q: "gold rate today", note: "IBJA rates for 24 carat, 22 carat and silver, with the change and the trend of the last months; 'silver price' or '22k gold' also work", instant: true },
      { q: "petrol diesel lpg price", note: "petrol (E20), diesel and every LPG cylinder in Delhi, Mumbai, Chennai and Kolkata, subsidised and unsubsidised, in one table", instant: true },
      { q: "sensex nifty", note: "Sensex, Nifty and the biggest movers of a watch list with SAIL (market data, not advice); 'sail share price' and 'trending stocks' also work", instant: true },
      { q: "top news headlines", note: "today's headlines from the publishers' own feeds; each opens in a new tab", instant: true },
      { q: "hindi news", note: "the same, in Hindi; 'bengali news' for Bengali", instant: true },
      { q: "cricket news india", note: "sports headlines: those with India in them, and the big world events (World Cups, the Olympics, the Asian and Commonwealth Games)", instant: true },
      { q: "1 pound in rupees", note: "currency by words", instant: true },
      { q: "euro rate today", note: "one euro in rupees", instant: true },
      { q: "days between 1 jan 2026 and 15 mar 2026", note: "days, weeks, months and working days", instant: true },
      { q: "90 days from today", note: "the date after 90 days", instant: true },
      { q: "age 15/08/1985", note: "age in years, months and days", instant: true },
      { q: "retirement date born 15/08/1975", note: "the end of the month of the 60th birthday", instant: true },
      { q: "what day is 26 jan 2027", note: "the weekday and week number", instant: true },
      { q: "days until 25 dec 2026", instant: true },
      { q: "working days between 1 jan 2026 and 31 jan 2026", note: "Monday to Friday; holidays are not taken out", instant: true },
      { q: "today's date", instant: true },
      { q: "emi calculator", note: "opens the loan form: bank, PF or co-operative society loan" },
      { q: "pf loan emi", note: "the same form, started with a PF loan" },
      { q: "co-operative society loan emi", note: "flat or reducing balance" },
      { q: "pf maturity calculator", note: "your probable provident fund at retirement" },
      { q: "gratuity calculator", note: "from last pay and years of service" },
      { q: "leave encashment calculator", note: "EL / HPL encashment" },
      { q: "date calculator", note: "between dates, add or subtract, age, retirement date" },
      { q: "unit converter", note: "opens a converter with every unit and currency" },
      { q: "calculators", note: "the menu of all of them" },
    ],
  },
  {
    id: "announcements",
    title: "Announcements and intranet sites",
    icon: "megaphone",
    howToRun: "A site or department name appears AS YOU TYPE: no Enter. A question about an announcement: type it, then press Enter.",
    covers: "Announcements and happenings, and the links to the intranet's sites and departments' pages.",
    tips: [
      "A site or department name, in full, in short form or in part, shows its link under Intranet Sites with an Open button.",
      "Announcements are searched by title and by content like circulars.",
    ],
    questions: [
      { q: "ERP", note: "the site appears under Intranet Sites; no Enter", instant: true },
      { q: "attendance", note: "the site appears as you type; press Enter to search the circulars too", instant: true },
      { q: "e-Str", note: "a short form of a site name", instant: true },
      { q: "C&IT", note: "the department's site link; add a name and press Enter for its people", instant: true },
      { q: "Which theme was chosen for SAIL Gaurav Diwas?" },
    ],
  },
];

/** Every question of the guide, with the section it belongs to (the guide's search box and the selftest read this). */
export function allSamples(): Array<{ sectionId: string; q: string; note?: string; deep?: boolean; either?: boolean }> {
  const out: Array<{ sectionId: string; q: string; note?: string; deep?: boolean; either?: boolean }> = [];
  for (const s of SAMPLE_SECTIONS) {
    for (const x of s.questions) out.push({ sectionId: s.id, q: x.q, note: x.note, deep: !!s.executivesOnly, either: x.either });
    for (const l of s.ladders ?? []) {
      out.push({ sectionId: s.id, q: l.title, note: `${l.subject}: title` });
      out.push({ sectionId: s.id, q: l.content, note: `${l.subject}: content` });
      out.push({ sectionId: s.id, q: l.deep, note: `${l.subject}: deep`, deep: !!s.executivesOnly });
    }
  }
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
    const ladders = (s.ladders ?? []).filter((l) => has(`${l.subject} ${l.title} ${l.content} ${l.deep} ${head}`));
    const patterns = (s.patterns ?? []).filter((p) => has(`${p} ${head}`));
    if (questions.length || ladders.length || patterns.length) out.push({ ...s, questions, ladders, patterns });
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
