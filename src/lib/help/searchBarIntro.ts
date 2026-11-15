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
  { label: "Gold and silver rates", detail: "with a one-year trend graph; at weekends and on holidays, the last day IBJA published, dated" },
  { label: "Dollar and other currencies", detail: "the dollar-rupee rate with a one-year graph, and the converter" },
  { label: "Sensex, Nifty and SAIL share", detail: "market figures (not advice); the last close at weekends, and the last saved figures, marked Not live, when the source does not answer" },
  { label: "Durgapur weather", detail: "the weather now, the next 24 hours and a seven-day forecast" },
  { label: "Andal Airport flights", detail: "departures and arrivals between Andal (RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, from the airport's own timetable" },
  { label: "Durgapur Railway Station trains", detail: "the express and mail trains that stop at Durgapur in both directions, and the local MEMU trains, with arrival, departure and the days each runs; the railway's fare from Durgapur to the end of each run and to every stop on the way (type train fare to find the fare to a station), and a fare hint for each local train; full forms of the class codes are written out on the card" },
  { label: "AICPI, SAIL DA and inflation", detail: "one window, two tabs: the consumer price index for industrial workers with the quarterly DA of SAIL employees worked out from it (the formula, the quarters and a calculator for your basic pay), and MoSPI's Consumer Price Index month by month as column charts (Combined, Urban, Rural, and any State) with India's inflation for the last 1, 3, 5 and 10 years and a note when it crosses the Reserve Bank's limit" },
  { label: "Durgapur PIN codes, Wards, Assembly seats and Police stations", detail: "through the lens of the Steel Plant: the 19 PIN codes of the city with their post offices, the 43 wards of the Durgapur Municipal Corporation with the areas of each, the two assembly seats (Durgapur Purba and Paschim) with their wards, and which of the four police stations (thana) each area is under; search by ward number, area name or PIN, and press a PIN on a ward to jump to its areas" },
  { label: "Steel prices, production and companies", detail: "the Ministry of Steel's retail prices of TMT bar, HR coil and CR coil in Mumbai month by month with the iron ore price; SAIL, Tata Steel, JSW Steel and Jindal Steel quarter by quarter from their own results (production, sales, EBITDA per tonne); SAIL, RINL and NMDC Steel month by month; and India's and the world's steel production" },
  { label: "Calculators and converters", detail: "a full calculator, units, currency, dates, and loan EMI, PF, gratuity and leave encashment forms (the list is one line above)" },
  { label: "Vehicles", detail: "tyre and rim sizes, VIN and BH-series numbers explained, EV specifications and charging time" },
  { label: "Deep Synthesis (executives)", detail: "a combined briefing across many circulars for a signed-in executive" },
];

/** what it cannot do yet, said plainly */
export const LIMITS: string[] = [
  "Plant production data is not answered yet: no production data is connected to the search bar.",
  "Live figures (news, prices, markets) come from free public sources: a source can be late or briefly unavailable, and each card names its source and when it was fetched.",
  "The Sensex, Nifty and shares card comes from Yahoo Finance, which sometimes turns the site away for a few minutes. The card then shows the last figures it saved, marked \"Not live\" with the time they were received, and says so; the market is shut at weekends, so the last close is what you see then.",
  "The steel card is published figures, not live: the Ministry of Steel's monthly report (prices at the end of each month, in Mumbai) and the companies' own quarterly results. SAIL, Tata Steel, JSW and the other makers do not publish a price list (their rates differ by dealer, city and day), so there is no brand-by-brand price table; the makers are compared by what each reports. It does not include Durgapur Steel Plant's own production. The companies' figures are on slightly different bases (the card says how), and a figure a company does not state is left blank, never estimated.",
  "Nearby EV charging stations are not available yet: no free public source covers Durgapur.",
  "The flights card is the airport's timetable, not live status: it does not show a delay or a cancellation.",
  "The trains card is the station timetable, not live running status: it does not show a delay, a cancellation or a platform. The railway revises timings, so check the Indian Railways enquiry (NTES) on the day.",
  "Train fares are approximate and are never fetched live: they were read from the railway's reservation system while the plant's paid fare service lasted (it ends on 13 December 2026) and are kept in the intranet's own database, with the date each was received, which the card shows. They are not refreshed after that date. A train whose fares were not collected says so and points you to IRCTC. Unreserved fares of express trains are not available, and a local train's fare is an estimate from the Railway Board's fare table.",
  "The Durgapur PIN codes come from India Post; the wards and their areas come from the Election Commission's 2026 draft electoral roll (page 1 of each part, which names the ward, PIN and area), prepared in November 2026. The English spellings are written out from the roll, so check one before you put it on a form. The wards may be re-drawn (a change from 43 to 53 has been reported, not confirmed), and the plant's gates have no PIN code of their own on the card. The police station of an area is the one printed on its roll part: a ward can have areas under more than one station, and station boundaries can change, so for an address ask the station or use the Commissionerate's Know Your Police Station. The telephone numbers and the investigation centres and outposts are as the Commissionerate, the Municipal Corporation, the state's police directory and Wikipedia give them (the card names each and says how old it is): a number or a post can change, and two posts are listed without a station because no source says which one they work under.",
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
