// src/lib/help/searchBarIntro.ts
//
// THE INTRODUCTION TO THE SEARCH BAR, at the top of the user guide, for a new user: what the bar is, what it can be asked, and what it cannot (yet). One data file, read by
// src/components/help/SearchBarIntro.tsx. It follows the bar as it is drawn (23 Nov 2026): the two rows of buttons under the box. AREAS is the first row, "Search in", button by button in the bar's own order; MORE_TOOLS
// is the second row. When a button is added to the bar (src/records/domains.ts) it is ONE new item in AREAS here, and the guide's test (searchBarIntro.selftest.ts) fails until it is, so the introduction cannot fall behind the bar.

export interface IntroArea {
  /** the name of the area */
  label: string;
  /** what can be asked, in plain words */
  detail: string;
  /** an area with several distinct things to know gets a sub-title for each, drawn under the line (the Vehicles area: five) */
  parts?: IntroPart[];
}

export interface IntroPart {
  title: string;
  /** what it covers and what to type */
  detail: string;
}

export const INTRO_TITLE = "The search bar";

export const INTRO_LEAD =
  "The search bar at the top centre of the home page opens the omnibar when you click it (or press Ctrl + K). The omnibar is a powerful tool, backed by AI, that replies to your questions in your own words: type what you want to know and press Enter, and it answers from the right source. Under the box are two rows of buttons. Search in lets you say where to look, so that nothing is guessed; More tools holds the Utility Services, the Executive Deep Search and Admin. The bar's main work is to find things in the plant's own records, which are listed below, button by button.";

/** THE TITLES OF THE TWO ROWS, as the bar draws them (src/components/RecordsScopeBar.tsx) */
export const ROW_TITLES = { searchIn: "Search in", moreTools: "More tools" } as const;

/** THE POINTER TO THE UTILITY SERVICES: the helpers beside the main features (news, prices, weather, trains, calculators, vehicle readers) have their own tab, "Utility Services" (src/lib/help/utilityServices.ts). */
export const UTILITY_POINTER: { before: string; term: string; after: string } = {
  before: "To help employees in different ways, the app also provides a host of",
  term: "Utility Services",
  after: "(the day's news, prices, the weather, trains and flights, calculators, readers for number plates, tyres and VINs, and more). They are auxiliary to the features above. The Utility Services button, under More tools, opens them on a page of their own with a Back button, and they have a tab of their own here, with the words that open each one.",
};

/** THE POINTER TO THE EXECUTIVE DEEP SEARCH, the other button of More tools; the Deep search (EDS) tab tells all */
export const EDS_POINTER: { before: string; term: string; after: string } = {
  before: "For a question that needs several circulars read together, press",
  term: "Executive Deep Search",
  after: "under More tools: you get one written summary with the circulars it rests on. It is for signed-in executives; anyone else who presses it is asked first (Are you an executive?), and Yes opens the sign-in window. The Deep search (EDS) tab tells all.",
};

/** THE POINTER TO THE ADMIN BUTTON, the third button of More tools: the management pages */
export const ADMIN_POINTER: { before: string; term: string; after: string } = {
  before: "For the management pages (the Employee, PAX directory, Holiday, Circular and Announcement managers and the Contact access log) press",
  term: "Admin",
  after: "under More tools. If you have not signed in it first asks \"Are you authorised to access them?\": Yes opens the sign-in window and, once you are in, your authority is checked; No returns you to Everything. An authorised person gets the admin home page; anyone else sees a red message that they are not authorised to access it.",
};

/** HOW THE BUTTONS BEHAVE, said once for the whole row */
export const CHOICE_RULES: string[] = [
  "Everything is where the bar starts, and every way back lands on it. The bar then decides for itself where to look, as it always did. A small dot on a button says \"this looks like a People question\": it is only a suggestion, and Enter still searches everything.",
  "Press any other button and only that part of the intranet is searched. If it has nothing, the bar says so (\"I found nothing for ... under People\") and does not wander on to the circulars: press Everything to look wider.",
  "Each button shows what it takes and a few examples under the row: press an example to try it.",
  "Pressing another button clears the box, so that words typed for one are never searched under another.",
];

/** THE FIRST ROW, button by button, in the bar's own order (the labels are those of src/records/domains.ts; the test compares them) */
export const AREAS: IntroArea[] = [
  { label: "Everything", detail: "the button the bar starts on. You type, and the bar works out for itself where to look: the records below, the circulars and the announcements. The links to intranet sites and departments (type C&IT or ERP) appear only here, as you type" },
  { label: "People", detail: "the employee directory, three ways, each a button under People:", parts: [
    { title: "Name or number", detail: "a name (a different spelling still finds the person, with or without the department), or a ticket number, a CUG mobile number (or the last 4 digits of an executive's) or, when you are signed in, a SAIL personal number; the person shows as you type. No AI." },
    { title: "Department & designation", detail: "pick a department and a designation from two lists and press the button: the people come in seniority order, and the bar says in one line what it understood. No AI." },
    { title: "Ask in words", detail: "counts, who is in charge of a department, the count by designation, seniority and comparisons; the AI writes the query." },
  ] },
  { label: "PAX", detail: "the internal telephone extensions of offices and places, and whose an extension is. When the exact place is not listed, the nearest related entries are shown with their numbers" },
  { label: "Hospital OPD", detail: "which doctor sits when and in which OPD, a department's OPD list (its department names are buttons that open each one), token timings, and whether a doctor is permanent" },
  { label: "Holidays", detail: "closed, festival and restricted holidays, by festival, month or year, and comparisons between years" },
  { label: "Degrees", detail: "what a degree is and its level (is DNB a postgraduate degree), the people who hold a PhD, and the degrees of the hospital's doctors" },
  { label: "Circulars & Notices", detail: "find a circular or an announcement by the words of its title, or ask a question and get the answer from inside it: rules, schemes, amounts, last dates, who is eligible; an announcement is also found by what its attached PDF says. The answer names the document and opens it. If a word of yours is in no document, the bar says so" },
];

/** what the search bar's main features cannot do yet, said plainly (what the Utility Services cannot do is on their own tab) */
export const LIMITS: string[] = [
  "Plant production data is not answered yet: no daily or monthly production data of the plant is connected to the search bar (the DSP tab of the steel card shows only the yearly figures that SAIL's annual reports state).",
  "The management pages (Employee, PAX directory, Circular, Announcement and Holiday managers, and the Contact access log) change the plant's data. The HOD of C&IT opens them after signing in, and can delegate each page (the Contact access log to executives only). Signed in, type management to see the titles of the pages you may open (only those the HOD has given you).",
  "AI can make mistakes: check the circular or the source before you act on a figure.",
];

/** how to get started, in three steps */
export const START: string[] = [
  "Click the search bar (or press Ctrl + K).",
  "Under the box, press where to look (the Search in row), or leave Everything.",
  "Type a question, a name, a number, or a few words such as \"gold rate today\", and press Enter. The answer appears below.",
];
