// src/lib/help/utilityServices.ts
//
// THE "UTILITY SERVICES" TAB OF THE USER GUIDE (text and data; the screen is src/components/help/UtilityServicesTab.tsx).
//
// A Utility Service is one of the helpers the app offers beside its main search (circulars, EDS, employees, departments, holidays, hospital, PAX, announcements and sites): the day's news, a price, the weather,
// a train, a calculator, the meaning of a number plate. They are auxiliary: they give something useful at once and do not look into the intranet's own records. The owner asked (17 Nov 2026) for them to
// have a tab of their own, with the words that open each one shown up front. The prose of every service is the prose they had in the introduction of the Sample questions tab (moved here, not changed).
//
// `type` is the words to type for a service (a SHORT or LONG command of the "What to type" list, so each is already tested against the real detector; src/lib/help/utilityServices.selftest.ts checks that every
// one of them is on that list and that no utility of that list is left out of the services).

export const UTILITY_TITLE = "Utility Services";

export const UTILITY_LEAD =
  "To help employees in many different ways, the app provides a host of Utility Services beside its main search. They are auxiliary: they do not look into the intranet's records, but give you something useful at once, such as the day's news, a price, the weather, a train, a calculator, or the meaning of a number plate. Each service has a name, shown in bold below, and the words that open it, shown with the name.";

/** how to get any service, in two steps */
export const UTILITY_HOW: string[] = [
  "Click the words shown with a service (they go into the search bar), or type them yourself.",
  "Press Enter. A sum, a conversion and a PIN code or a ward number show their answer under the search line as you type, with no Enter.",
];

export interface UtilityPart {
  title: string;
  detail: string;
  /** the words that open it */
  type: string[];
}
export interface UtilityService {
  /** the bold name */
  label: string;
  detail: string;
  /** the words that open it (a service with parts has them on its parts) */
  type?: string[];
  parts?: UtilityPart[];
}

/** THE ONE LINE ABOUT THE "CALCULATORS" COMMAND: it opens a menu of tools, and the line names every one. The guide's test checks that each tool of the menu is named here. */
export const CALCULATORS_LINE: { before: string; command: string; after: string; tools: string[] } = {
  before: "Type",
  command: "calculators",
  after: "and press Enter: it opens a menu of ready tools, which are",
  tools: [
    "Calculator (basic and scientific)",
    "Converters (length, area, energy, power, colours RGB/HEX/HSL, currencies)",
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

export const UTILITY_SERVICES: UtilityService[] = [
  { label: "News", detail: "current headlines: business, English, Hindi and Bengali papers, and sports", type: ["news feed", "hindi news", "bengali news", "sports headlines"] },
  { label: "Petrol, diesel and LPG prices", detail: "with a one-year trend graph", type: ["fuel price", "lpg cylinder price"] },
  { label: "Gold and silver rates", detail: "with a one-year trend graph; at weekends and on holidays, the last day IBJA published, dated", type: ["gold price", "silver price"] },
  { label: "Dollar and other currencies", detail: "the dollar-rupee rate with a one-year graph, and the converter", type: ["dollar rate", "100 usd to inr"] },
  { label: "Sensex, Nifty and SAIL share", detail: "market figures (not advice); the last close at weekends, and the last saved figures, marked Not live, when the source does not answer", type: ["sensex nifty", "sail share price"] },
  { label: "Durgapur weather", detail: "the weather now, the next 24 hours and a seven-day forecast", type: ["weather", "forecast"] },
  { label: "Andal Airport flights", detail: "departures and arrivals between Andal (RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, from the airport's own timetable", type: ["flights", "andal airport"] },
  { label: "Durgapur and Asansol railway stations", detail: "one card, two tabs. Durgapur (DGR): the express, mail and local MEMU trains that stop at Durgapur, with times and running days. Asansol Junction (ASN) is there because some trains cannot be taken at Durgapur: a few pass Durgapur without stopping, and some stop at Asansol but do not come to Durgapur at all, so a person at Durgapur has to go to Asansol. Both tabs show the fare to the end of each run and to every stop (type train fare)", type: ["trains", "memu", "train fare"] },
  { label: "AICPI, SAIL DA and inflation", detail: "two tabs: the consumer price index for industrial workers with SAIL's quarterly DA worked out from it (and a calculator for your basic pay), and MoSPI's Consumer Price Index month by month, for all India or any State, with India's inflation over 1, 3, 5 and 10 years and a note when it passes the Reserve Bank's limit", type: ["sail da", "inflation"] },
  { label: "Durgapur PIN codes, Wards, Assembly seats and Police stations", detail: "through the lens of the Steel Plant: the 19 PIN codes of the city with their post offices, the 43 wards of the Durgapur Municipal Corporation with the areas of each, the two assembly seats (Durgapur Purba and Paschim) with their wards, and which of the four police stations (thana) each area is under; search by ward number, area name or PIN, and press a PIN on a ward to jump to its areas", type: ["pin code", "dmc wards", "assembly seats", "thana"] },
  { label: "Durgapur Steel Plant: its story and its heads", detail: "how the plant came to be (the British collaboration, Dr B C Roy, Pandit Nehru, the Queen's visit), what it made first, the chronological list of its heads and SAIL's foundation and units, with SAIL's photographs and the source of every entry; type dsp history, heads of dsp or sail history", type: ["dsp history", "dsp heads", "sail history"] },
  { label: "Steel prices, production and companies", detail: "the Ministry of Steel's monthly prices of TMT bar, HR coil and CR coil with iron ore; what the Durgapur Steel Plant makes, with its capacity and Durgapur market quotes; SAIL, Tata Steel, JSW and Jindal quarter by quarter; India's and the world's steel production", type: ["steel prices", "steel companies", "steel production", "dsp products"] },
  { label: "Calculators and converters", detail: "a full calculator, units, currency, dates, and loan EMI, PF, gratuity and leave encashment forms (the list is one line above); the PF form takes the figures of your DSP PF page and your payslip and gives the probable PF on your retirement day", type: ["calculators", "5 km in miles", "emi calculator", "pf maturity", "gratuity calculator", "leave encashment calculator", "date calculator"] },
  { label: "Vehicles", detail: "five things to know about a vehicle, each with its own command:", parts: [
    { title: "National number plate", detail: "the all-India Bharat BH-series plate: what it is, who can have it, how to apply, the road tax with an estimate, and any BH number read out part by part (type bh series, or a plate such as 26 BH 1234 AA).", type: ["bh series", "26 BH 1234 AA"] },
    { title: "Tyre and rim specifications", detail: "what a tyre marking such as 205/55 R16 91V says (width, aspect ratio, rim size, load index and speed symbol) and what a wheel marking such as 8Jx20 says, with the load-index and speed tables (type tyre size).", type: ["tyre size", "205/55 R16 91V"] },
    { title: "EV cars: battery and charger (AC and DC) specifications", detail: "the words of an electric car's spec sheet in plain words (kWh, kW, volts, LFP and the Blade battery, AC and DC charging, the CCS2 socket, C-rate), and how long a charge takes from your own charger (type ev charging; the second tab is the guide).", type: ["ev charging", "ev specifications"] },
    { title: "Engine power: PS, bhp and kW", detail: "petrol and diesel engines give their power in bhp or PS, electric cars in kW, and one line shows all three together (type 100 bhp). An electric car is usually described by two numbers: the battery in kWh, the size of its tank, which decides the range, and the power in kW, which is the actual power of the car, that of the motor (or motors) turning the wheels. Many makers print the bhp or PS beside the kW so that you can compare.", type: ["100 bhp"] },
    { title: "VIN (vehicle identification number), simplified", detail: "the 17-character code that identifies one vehicle, stamped on its chassis and given in its papers (the letters I, O and Q are never used). It has three blocks: the first 3 characters give the country and the maker, the next 6 the type of vehicle in the maker's own code, and the last 8 the model year (the 10th character: K is 2019), the plant and the vehicle's own serial number. Type vin number to see each block explained, or type a VIN such as MALBM51BLKM000001 and it is read as you type.", type: ["vin number", "MALBM51BLKM000001"] },  ] },
];

/** what these services cannot do yet, said plainly */
export const UTILITY_LIMITS: string[] = [
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
  "Any words can open a Utility Service: the box says which one it means (Looks like ... Press Enter to open it); for a long sentence it cannot settle, it asks Gemini, the AI, which service is meant. Only the typed line goes, never a figure entered in a service, an ID or a name.",
  "What you type into a calculator, converter or form is not saved or sent anywhere.",
];
