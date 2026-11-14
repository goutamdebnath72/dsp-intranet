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
}

export const INTRO_TITLE = "The search bar";

export const INTRO_LEAD =
  "The search bar at the top centre of the home page opens the omnibar when you click it (or press Ctrl + K). The omnibar is a powerful tool, backed by AI, that replies to your questions in your own words: type what you want to know and press Enter, and it works out what you are asking and answers from the right source. It covers a vast area.";

/** THE ONE LINE ABOUT THE "CALCULATORS" COMMAND: it opens a menu of tools, and the line names every one. The guide's test checks that each tool of the menu is named here. */
export const CALCULATORS_LINE: { before: string; command: string; after: string; tools: string[] } = {
  before: "Type",
  command: "calculators",
  after: "and press Enter: it opens a menu of ready tools, which are",
  tools: [
    "Calculator (basic and scientific)",
    "Converters (length, area, energy, power, currencies)",
    "Dates (between dates, add days, age, retirement)",
    "Loan EMI",
    "PF maturity",
    "Gratuity",
    "Leave encashment",
    "Tyre and rim size reader",
    "Vehicle number (VIN) reader",
    "Bharat (BH) series number plate",
    "Electric car charging",
  ],
};

export const AREAS: IntroArea[] = [
  { label: "Circulars", detail: "by heading and by content: rules, schemes, amounts, last dates, who is eligible" },
  { label: "Holiday calendars", detail: "festival and other holidays, and comparisons between years" },
  { label: "Employees and departments", detail: "find a person, a department, who is in charge" },
  { label: "Hospital OPDs and doctors", detail: "which doctor sits when, and in which OPD" },
  { label: "PAX telephone numbers", detail: "of a few important locations" },
  { label: "Announcements and intranet sites", detail: "type a site or department name and its link appears as you type" },
  { label: "News", detail: "current headlines: business, English, Hindi and Bengali papers, and sports" },
  { label: "Petrol, diesel and LPG prices", detail: "with a one-year trend graph" },
  { label: "Gold and silver rates", detail: "with a one-year trend graph" },
  { label: "Dollar and other currencies", detail: "the dollar-rupee rate with a one-year graph, and the converter" },
  { label: "Sensex, Nifty and SAIL share", detail: "market figures (not advice)" },
  { label: "Durgapur weather", detail: "the weather now, the next 24 hours and a seven-day forecast" },
  { label: "Andal Airport flights", detail: "departures and arrivals between Andal (RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, from the airport's own timetable" },
  { label: "Durgapur Railway Station trains", detail: "the express and mail trains that stop at Durgapur in both directions, and the local MEMU trains, with arrival, departure and the days each runs; the railway's fare from Durgapur to the end of each run and to every stop on the way (type train fare to find the fare to a station), and a fare hint for each local train; full forms of the class codes are written out on the card" },
  { label: "AICPI, SAIL DA and inflation", detail: "one window, two tabs: the consumer price index for industrial workers with the quarterly DA of SAIL employees worked out from it (the formula, the quarters and a calculator for your basic pay), and MoSPI's Consumer Price Index month by month as column charts (Combined, Urban, Rural, and any State) with India's inflation for the last 1, 3, 5 and 10 years and a note when it crosses the Reserve Bank's limit" },
  { label: "Calculators and converters", detail: "a full calculator, units, currency, dates, and loan EMI, PF, gratuity and leave encashment forms (the list is one line above)" },
  { label: "Vehicles", detail: "tyre and rim sizes, VIN and BH-series numbers explained, EV specifications and charging time" },
  { label: "Deep Synthesis (executives)", detail: "a combined briefing across many circulars for a signed-in executive" },
];

/** what it cannot do yet, said plainly */
export const LIMITS: string[] = [
  "Plant production data is not answered yet: no production data is connected to the search bar.",
  "Live figures (news, prices, markets) come from free public sources: a source can be late or briefly unavailable, and each card names its source and when it was fetched.",
  "Nearby EV charging stations are not available yet: no free public source covers Durgapur.",
  "The flights card is the airport's timetable, not live status: it does not show a delay or a cancellation.",
  "The trains card is the station timetable, not live running status: it does not show a delay, a cancellation or a platform. The railway revises timings, so check the Indian Railways enquiry (NTES) on the day.",
  "Train fares are approximate. They were read from the railway's reservation system and saved with the date they were received, which the card shows; the paid fare service ends on 13 December 2026, so after that date the saved fares stay as they were and are no longer refreshed. Unreserved fares of express trains are not available, and a local train's fare is an estimate from the Railway Board's fare table.",
  "Inflation and the Consumer Price Index come from MoSPI's open data and are saved; April and May 2020 have no published figure, so the chart leaves a gap there. The index of a month is released on the 12th of the next month.",
  "The DA card works out the quarterly CPSE IDA rate from the Labour Bureau's index by the Department of Public Enterprises' formula: SAIL's own circular is the authority for what is paid.",
  "AI can make mistakes: check the circular or the source before you act on a figure.",
  "What you type into a calculator, converter or form is not saved or sent anywhere.",
];

/** how to get started, in three steps */
export const START: string[] = [
  "Click the search bar (or press Ctrl + K).",
  "Type a question, a name, a number, or a few words such as \"gold rate today\".",
  "Press Enter. The answer appears below.",
];
