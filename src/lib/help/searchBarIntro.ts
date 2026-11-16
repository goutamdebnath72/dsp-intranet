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
  "The search bar at the top centre of the home page opens the omnibar when you click it (or press Ctrl + K). The omnibar is a powerful tool, backed by AI, that replies to your questions in your own words: type what you want to know and press Enter, and it works out what you are asking and answers from the right source. It covers a vast area. Most tools open with a short command (gold price) or a long one (gold rate today); the What to type page gives both for every feature.";

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
  { label: "Durgapur and Asansol railway stations", detail: "one card, two tabs. Durgapur (DGR): the express, mail and local MEMU trains that stop at Durgapur, with times and running days. Asansol Junction (ASN) is there because some trains cannot be taken at Durgapur: a few pass Durgapur without stopping, and some stop at Asansol but do not come to Durgapur at all, so a person at Durgapur has to go to Asansol. Both tabs show the fare to the end of each run and to every stop (type train fare)" },
  { label: "AICPI, SAIL DA and inflation", detail: "two tabs: the consumer price index for industrial workers with SAIL's quarterly DA worked out from it (and a calculator for your basic pay), and MoSPI's Consumer Price Index month by month, for all India or any State, with India's inflation over 1, 3, 5 and 10 years and a note when it passes the Reserve Bank's limit" },
  { label: "Durgapur PIN codes, Wards, Assembly seats and Police stations", detail: "through the lens of the Steel Plant: the 19 PIN codes of the city with their post offices, the 43 wards of the Durgapur Municipal Corporation with the areas of each, the two assembly seats (Durgapur Purba and Paschim) with their wards, and which of the four police stations (thana) each area is under; search by ward number, area name or PIN, and press a PIN on a ward to jump to its areas" },
  { label: "Durgapur Steel Plant: its story and its heads", detail: "how the plant came to be (the British collaboration, Dr B C Roy, Pandit Nehru, the Queen's visit), what it made first, the chronological list of its heads and SAIL's foundation and units, with SAIL's photographs and the source of every entry; type dsp history, heads of dsp or sail history" },
  { label: "Steel prices, production and companies", detail: "the Ministry of Steel's monthly prices of TMT bar, HR coil and CR coil with iron ore; what the Durgapur Steel Plant makes, with its capacity and Durgapur market quotes; SAIL, Tata Steel, JSW and Jindal quarter by quarter; India's and the world's steel production" },
  { label: "Calculators and converters", detail: "a full calculator, units, currency, dates, and loan EMI, PF, gratuity and leave encashment forms (the list is one line above); the PF form takes the figures of your DSP PF page and your payslip and gives the probable PF on your retirement day" },
  { label: "Vehicles", detail: "five things to know about a vehicle, each with its own command:", parts: [
    { title: "National number plate", detail: "the all-India Bharat BH-series plate: what it is, who can have it, how to apply, the road tax with an estimate, and any BH number read out part by part (type bh series, or a plate such as 26 BH 1234 AA)." },
    { title: "Tyre and rim specifications", detail: "what a tyre marking such as 205/55 R16 91V says (width, aspect ratio, rim size, load index and speed symbol) and what a wheel marking such as 8Jx20 says, with the load-index and speed tables (type tyre size)." },
    { title: "EV cars: battery and charger (AC and DC) specifications", detail: "the words of an electric car's spec sheet in plain words (kWh, kW, volts, LFP and the Blade battery, AC and DC charging, the CCS2 socket, C-rate), and how long a charge takes from your own charger (type ev charging; the second tab is the guide)." },
    { title: "Engine power: PS, bhp and kW", detail: "petrol and diesel engines give their power in bhp or PS, electric cars in kW, and one line shows all three together (type 100 bhp). An electric car is usually described by two numbers: the battery in kWh, the size of its tank, which decides the range, and the power in kW, which is the actual power of the car, that of the motor (or motors) turning the wheels. Many makers print the bhp or PS beside the kW so that you can compare." },
    { title: "VIN (vehicle identification number), simplified", detail: "the 17-character code that identifies one vehicle, stamped on its chassis and given in its papers (the letters I, O and Q are never used). It has three blocks: the first 3 characters give the country and the maker, the next 6 the type of vehicle in the maker's own code, and the last 8 the model year (the 10th character: K is 2019), the plant and the vehicle's own serial number. Type vin number to see each block explained, or type a VIN such as MALBM51BLKM000001 and it is read as you type." },  ] },
];

/** what it cannot do yet, said plainly */
export const LIMITS: string[] = [
  "Plant production data is not answered yet: no daily or monthly production data of the plant is connected to the search bar (the DSP tab of the steel card shows only the yearly figures that SAIL's annual reports state).",
  "Live figures (news, prices, markets) come from free public sources: a source can be late or briefly unavailable, and each card names its source and when it was fetched.",
  "The shares card comes from Yahoo Finance, which sometimes turns the site away for a few minutes: the card then shows its last saved figures, marked \"Not live\" with their time. At weekends it shows the last close.",
  "The steel card shows published figures, not live ones: the Ministry of Steel's monthly report (prices in Mumbai) and the companies' quarterly results. Makers publish no price list, so there is no brand-by-brand table. Durgapur market quotes (DSP tab) come from a trade-price site and are not DSP's or SAIL's prices. A dash means no figure is published; none is estimated.",
  "Nearby EV charging stations are not available yet: no free public source covers Durgapur.",
  "The flights card is the airport's timetable, not live status: it does not show a delay or a cancellation.",
  "The trains card is the station timetable, not live running status: it does not show a delay, a cancellation or a platform. The railway revises timings, so check the Indian Railways enquiry (NTES) on the day.",
  "Train fares are approximate and never fetched live: they were read from the railway's reservation system while the plant's paid fare service lasted (it ends on 13 December 2026) and are kept with the date received. A train without saved fares points you to IRCTC; a local train's fare is an estimate from the Railway Board's table.",
  "The PIN codes are India Post's; the wards, areas and police stations come from the Election Commission's 2026 draft electoral roll, so check an English spelling before using it on a form. Wards may be re-drawn, and a ward's areas can fall under more than one police station: for an address, ask the station. Phone numbers and posts are as the sources give them and can change.",
  "Inflation and the Consumer Price Index are MoSPI's open data, saved here; April and May 2020 have no published figure, so the chart has a gap. A month's index is released on the 12th of the next.",
  "The DA card applies the Department of Public Enterprises' CPSE IDA formula to the Labour Bureau's index: SAIL's own circular is the authority for what is paid.",
  "The PF calculator is an approximation: future yearly rates are declared later and your pay changes. The PF trust's figure on the day is the one that counts.",
  "Any words can open a utility: the box says which one it means (Looks like ... Press Enter to open it); for a long sentence it cannot settle, it asks Gemini, the AI, which utility is meant. Only the typed line goes, never a figure entered in a utility, an ID or a name.",
  "The management pages (Employee, PAX directory, Circular, Announcement and Holiday managers, and the Contact access log) change the plant's data. Currently only the HOD of C&IT can open them, after signing in with his own login; he can delegate each page to other executives and non-executives (the Contact access log to executives only).",
  "AI can make mistakes: check the circular or the source before you act on a figure.",
  "What you type into a calculator, converter or form is not saved or sent anywhere.",
];

/** how to get started, in three steps */
export const START: string[] = [
  "Click the search bar (or press Ctrl + K).",
  "Type a question, a name, a number, or a few words such as \"gold rate today\".",
  "Press Enter. The answer appears below.",
];
