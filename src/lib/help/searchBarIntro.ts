// src/lib/help/searchBarIntro.ts
//
// THE INTRODUCTION TO THE SEARCH BAR, at the top of the user guide, for a new user: what the bar is, what it can be asked, and what it cannot (yet). One data file, read by
// src/components/help/SearchBarIntro.tsx. When a new area is added to the search (a tool, a live card, a directory), it is ONE new item in AREAS here, and the guide's test (searchBarIntro.selftest.ts) checks that
// every tool the registry knows is named, so the introduction does not fall behind the search.

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
  "The search bar at the top centre of the home page opens the omnibar when you click it (or press Ctrl + K). The omnibar is a powerful tool, backed by AI, that replies to your questions in your own words: type what you want to know and press Enter, and it works out what you are asking and answers from the right source. Its main work is to find things in the plant's own records, listed below. Beside that it offers a host of Utility Services, which have a tab of their own.";

/** THE POINTER TO THE UTILITY SERVICES: the helpers beside the main features (news, prices, weather, trains, calculators, vehicle readers) have their own tab, "Utility Services" (src/lib/help/utilityServices.ts). */
export const UTILITY_POINTER: { before: string; term: string; after: string } = {
  before: "To help employees in different ways, the app also provides a host of",
  term: "Utility Services",
  after: "(the day's news, prices, the weather, trains and flights, calculators, readers for number plates, tyres and VINs, and more). They are auxiliary to the features above and have a tab of their own, with the words that open each one.",
};

export const AREAS: IntroArea[] = [
  { label: "Circulars, by title and by content", detail: "find a circular by the words of its heading, or ask a question and get the answer from inside the circulars: rules, schemes, amounts, last dates, who is eligible; the answer names the circular and opens it" },
  { label: "Executive Deep Search (EDS) on circulars, for executives only", detail: "a question that needs several circulars read together (what changed between two years, one summary across circulars) gets one written summary with the circulars it rests on, for a signed-in executive; anyone else is asked first and otherwise gets the ordinary answer (the Deep search (EDS) tab tells all)" },
  { label: "Employees, in many ways", detail: "by ticket number, CUG mobile number (or the last 4 digits of an executive's) or SAIL personal number, which show the person as you type; by name, where a different spelling still finds the person, with or without the department; and counts, designations and seniority" },
  { label: "Departments", detail: "type a department's name (C&IT, blast furnace) for its intranet site link; ask who is in charge, how many people work there, the count by designation, or its PAX numbers" },
  { label: "Holidays", detail: "closed, festival and restricted holidays, by festival, month or year, and comparisons between years" },
  { label: "Hospital OPDs and doctors", detail: "which doctor sits when, and in which OPD" },
  { label: "PAX telephone numbers", detail: "of a few important locations" },
  { label: "Announcements and intranet sites", detail: "type a site or department name and its link appears as you type" },
];

/** what the search bar's main features cannot do yet, said plainly (what the Utility Services cannot do is on their own tab) */
export const LIMITS: string[] = [
  "Plant production data is not answered yet: no daily or monthly production data of the plant is connected to the search bar (the DSP tab of the steel card shows only the yearly figures that SAIL's annual reports state).",
  "The management pages (Employee, PAX directory, Circular, Announcement and Holiday managers, and the Contact access log) change the plant's data. Currently only the HOD of C&IT can open them, after signing in with his own login; he can delegate each page to other executives and non-executives (the Contact access log to executives only).",
  "AI can make mistakes: check the circular or the source before you act on a figure.",
];

/** how to get started, in three steps */
export const START: string[] = [
  "Click the search bar (or press Ctrl + K).",
  "Type a question, a name, a number, or a few words such as \"gold rate today\".",
  "Press Enter. The answer appears below.",
];
