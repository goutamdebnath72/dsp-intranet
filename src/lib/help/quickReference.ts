// src/lib/help/quickReference.ts
//
// THE "WHAT TO TYPE" PAGE OF THE USER GUIDE: for each feature of the search bar's tools, its NAME and the words that open it, with the alternatives separated by a front slash ("gold rate today / silver price / 22k gold").
// One data file, read by src/components/help/QuickReferenceTab.tsx; nothing about a feature is written in the component.
//
// The list is kept honest by src/lib/help/quickReference.selftest.ts: every string of every entry is run through the REAL detector (src/lib/tools/detect.ts) and must open the feature the entry says it opens,
// so a word that stops working, or a feature listed under a word that opens another, fails the tests. A string here is something the reader types AS IT IS; there is no blank to fill in.
// (The questions about people, hospital, circulars, announcements and Deep Synthesis are on the Sample questions page: they are sentences, not words that open a tool.)
//
// `expect` is what the detector must answer for every string of the entry: the kind of line, and for a form or a live card its id, and for the news card the tab ("live:news:hi").

export interface RefEntry {
  /** the feature's name, as the reader knows it */
  feature: string;
  /** the words that open it: each alternative is shown with a "/" between */
  strings: string[];
  /** one short line: what opens, and anything worth knowing */
  what: string;
  /** the result appears as you type (true), or the line needs the Enter key (false) */
  instant: boolean;
  /** what the detector answers for each string (checked by the selftest) */
  expect: string;
}

export interface RefGroup {
  id: string;
  title: string;
  covers: string;
  entries: RefEntry[];
}

export const QUICK_REFERENCE: RefGroup[] = [
  {
    id: "calc",
    title: "Calculators and converters",
    covers: "Sums, conversions, currency, dates and the loan, PF, gratuity and leave forms. All of it runs in your browser; nothing you type is saved.",
    entries: [
      { feature: "Calculator (basic and scientific)", strings: ["calculator", "scientific calculator", "calc"], what: "the full calculator, like the Mac's: keys or keyboard, memory, brackets, powers, roots, trigonometry, history", instant: false, expect: "form:calc" },
      { feature: "A sum typed straight in", strings: ["12*45+7", "15% of 2400", "200 + 10%", "5 lakh * 12", "sq rt of 4^3", "cube root of 27", "12 squared"], what: "the answer appears under the search line; + - * / ^, brackets, %, lakh and crore, roots and squares", instant: true, expect: "expression" },
      { feature: "Constants", strings: ["value of pi", "value of e", "golden ratio"], what: "the value to 20 digits (they can also be used in a sum: 2*pi*8)", instant: true, expect: "expression" },
      { feature: "Unit converter (all units and currencies)", strings: ["unit converter"], what: "opens a converter with every unit and currency; retype either box or change either unit", instant: false, expect: "form:converter" },
      { feature: "Unit conversion", strings: ["5 km in miles", "98.6 f to c", "72 km/h to m/s", "1 kgf/cm2 to bar", "1 kWh in calories", "bhp to ps"], what: "number, unit, \"in\" or \"to\", unit: length, area, volume, mass, temperature, angle, energy, force, power, pressure, speed, time", instant: true, expect: "convert" },
      { feature: "Engine power (PS, bhp and kW together)", strings: ["100 bhp"], what: "engine power is always shown in all three", instant: true, expect: "engine" },
      { feature: "Land units (bigha, katha, decimal)", strings: ["1 bigha in sq ft", "2 katha to sq m", "bigha to decimal"], what: "the land-record units with acre, hectare and square feet; bigha and katha as used in West Bengal unless a state is named", instant: true, expect: "convert" },
      { feature: "Currency converter (with the USD/INR one-year graph)", strings: ["100 usd to inr", "1 pound in rupees", "euro rate today", "dollar rate"], what: "the day's reference rate; for dollar and rupee a graph of the last year is shown under the converter", instant: true, expect: "currency" },
      { feature: "Date questions", strings: ["days between 1 jan 2026 and 15 mar 2026", "90 days from today", "age 15/08/1985", "retirement date born 15/08/1975", "what day is 26 jan 2027", "days until 25 dec 2026", "today's date"], what: "days, weeks, months, working days, age, the end of the month of the 60th birthday, the weekday; dates are written day first", instant: true, expect: "date" },
      { feature: "Date calculator (form)", strings: ["date calculator"], what: "between dates, add or subtract, age, retirement date", instant: false, expect: "form:dates" },
      { feature: "Loan EMI", strings: ["emi calculator", "pf loan emi", "loan emi", "co-operative society loan emi"], what: "the loan form: bank, PF or co-operative society loan (flat or reducing balance)", instant: false, expect: "form:emi" },
      { feature: "Probable PF maturity", strings: ["pf maturity calculator", "provident fund calculator"], what: "your probable provident fund at retirement", instant: false, expect: "form:pf" },
      { feature: "Gratuity", strings: ["gratuity calculator"], what: "from last pay and years of service", instant: false, expect: "form:gratuity" },
      { feature: "Leave encashment", strings: ["leave encashment calculator"], what: "EL / HPL encashment", instant: false, expect: "form:encashment" },
      { feature: "List of all the calculators", strings: ["calculators", "all tools", "calculator menu"], what: "the menu of every calculator and reader", instant: false, expect: "menu" },
    ],
  },
  {
    id: "vehicles",
    title: "Vehicles",
    covers: "Reading a tyre, a wheel, a VIN and a BH-series number, and EV charging.",
    entries: [
      { feature: "Tyre and rim size reader (page)", strings: ["tyre size", "wheel size"], what: "sample sizes to try, the load-index and speed tables and the wheel marking guide", instant: false, expect: "form:tyre" },
      { feature: "A tyre size read out", strings: ["205/55 R16 91V"], what: "width, aspect ratio, rim, load index and speed symbol, each explained", instant: true, expect: "tyre" },
      { feature: "A wheel (rim) marking read out", strings: ["8Jx20"], what: "width, flange letter, diameter, the tyre widths that suit it, and what else must match the car", instant: true, expect: "rim" },
      { feature: "EV charging time", strings: ["ev charging time"], what: "battery size, AC and DC chargers, time from 10% to 90%", instant: false, expect: "form:ev" },
      { feature: "VIN guide (page)", strings: ["vin number"], what: "the 17 characters of a Vehicle Identification Number section by section, with samples to try", instant: false, expect: "form:vin" },
      { feature: "A VIN read out", strings: ["MALBM51BLKM000001"], what: "country, maker, descriptor, check digit, model year, plant and serial", instant: true, expect: "vin" },
      { feature: "BH (Bharat) series guide (page)", strings: ["bh series"], what: "what the all-India plate is, who is eligible, how to apply, and the road tax with an estimate", instant: false, expect: "form:bh" },
      { feature: "A BH number read out", strings: ["26 BH 1234 AA"], what: "the year, BH, the four digits and the letters, each explained", instant: true, expect: "bh" },
    ],
  },
  {
    id: "live",
    title: "Live prices, markets, weather, flights, trains and DA",
    covers: "Figures read from free public sources when you ask. Each card names its source and when it was fetched.",
    entries: [
      { feature: "Gold and silver rates", strings: ["gold rate today", "silver price", "22k gold", "gold price"], what: "IBJA rates for 24 carat, 22 carat and silver, with the change and the trend of the last months", instant: true, expect: "live:gold" },
      { feature: "Petrol, diesel and LPG prices", strings: ["petrol diesel lpg price", "lpg cylinder price", "petrol price today", "diesel price", "fuel price"], what: "petrol (E20), diesel and every LPG cylinder in Delhi, Mumbai, Chennai and Kolkata, in one table", instant: true, expect: "live:fuel" },
      { feature: "Fuel price history (one-year chart)", strings: ["petrol price trend"], what: "the same fuel card; under its table, tabs chart Kolkata's petrol, diesel and LPG price over the last year", instant: true, expect: "live:fuel" },
      { feature: "Sensex, Nifty and SAIL share", strings: ["sensex nifty", "sensex", "sail share price", "trending stocks", "banknifty"], what: "Sensex, Nifty and the biggest movers of a watch list with SAIL (market data, not advice)", instant: true, expect: "live:markets" },
      { feature: "Durgapur weather and forecast", strings: ["durgapur weather report with forecast", "weather", "forecast", "durgapur weather", "weather today", "mausam"], what: "the weather at Durgapur now (temperature, what it feels like, humidity, wind, rain, sunrise and sunset), the next 24 hours three hours at a time, and seven days with the highest and lowest temperature and the chance of rain", instant: true, expect: "live:weather" },
      { feature: "Andal Airport flights (to and from)", strings: ["andal airport flights to and from", "durgapur flights", "flights", "andal airport", "durgapur airport", "kaji nazrul airport", "rdp flights", "flight schedule"], what: "departures and arrivals between Andal Airport (RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, with times and flight numbers, from the airport's own page; the next flight is marked (the timetable, not live status)", instant: true, expect: "live:flights" },
      { feature: "Durgapur Railway Station trains (express and local)", strings: ["durgapur railway station trains", "trains", "dgr trains", "train timetable", "local trains", "memu", "railway", "train fare"], what: "every mail and express train that stops at Durgapur (DGR) in both directions, towards Howrah and away from it, with arrival, departure and the days it runs (Daily or the weekdays), the special trains marked; below them the local MEMU trains in both directions (violet); junction stations in amber, Vande Bharat and Shatabdi badged; a ₹ Fares button on each express or mail train shows its approximate reserved-class fares from Durgapur to the end of its run and, under them, the fare to every stop on the route (a table, one row per stop and one column per class); and a fare finder (press ₹ Find a fare to a station, pick where you are going from Durgapur, and see every train that goes there with its fare for each class, by time or cheapest first; type \"train fare\" to open it) (the railway's reservation system via RailRadar; the fares are saved and shown with the date they were last received, because the paid fare service is used for one month only; no unreserved or local fares exist there, so each local MEMU train has a ₹ Fare hint instead: an estimate from the Railway Board's published ordinary-class fare table for the distance to the end station, marked as an estimate); the timetable from RailRadar, not live running status", instant: true, expect: "live:railway" },
      { feature: "AICPI-IW and the quarterly dearness allowance (DA)", strings: ["aicpi da", "sail da", "da formula", "dearness allowance", "cpi-iw", "da calculator", "aicpi"], what: "the consumer price index for industrial workers from the Labour Bureau as a graph of the last year, and the quarterly DA of SAIL employees worked out from it (the CPSE IDA pattern of the 2017 pay scales): the rate in force, the expected rate of the next quarter, a table of the quarters with the work of each, the formula and a calculator for your basic pay; SAIL's own circular is the authority", instant: true, expect: "live:aicpi" },
      { feature: "CPI and inflation (MoSPI)", strings: ["cpi", "inflation", "india inflation", "cpi urban"], what: "the second tab of the AICPI card: the Consumer Price Index of MoSPI month by month as column charts for all India (Combined, Urban, Rural tabs) and for any State, and India's inflation rate for the last 1, 3, 5 or 10 years (tabs), from the ministry's own open data, saved in the database", instant: true, expect: "live:aicpi:cpi" },
    ],
  },
  {
    id: "news",
    title: "News and sports headlines",
    covers: "Headlines from the papers' own free feeds, newest first, refreshed every minute while the card is open. A story opens on the paper's own page in a new tab. A paper's full name opens its own tab.",
    entries: [
      { feature: "News headlines (opens on Business)", strings: ["top news headlines", "news feed", "newsfeed", "newspaper", "headlines"], what: "four tabs: Business, English, Hindi and Bengali; the same story from several papers is one card", instant: true, expect: "live:news" },
      { feature: "Business news", strings: ["business news", "economy news", "corporate news", "economic times", "wall street journal", "business line"], what: "The Economic Times, Mint, The Hindu BusinessLine and The Wall Street Journal (some stories need a subscription at the paper)", instant: true, expect: "live:news:biz" },
      { feature: "English news", strings: ["english news", "the telegraph", "the hindu", "times of india", "hindustan times", "indian express", "ndtv"], what: "The Telegraph, The Hindu and The Times of India first, then Hindustan Times and The Indian Express", instant: true, expect: "live:news:en" },
      { feature: "Hindi news", strings: ["hindi news", "samachar", "dainik bhaskar", "dainik jagran", "amar ujala", "navbharat times", "hindustan hindi"], what: "Dainik Bhaskar, Dainik Jagran, Amar Ujala, Hindustan and Navbharat Times, in that order", instant: true, expect: "live:news:hi" },
      { feature: "Bengali news", strings: ["bengali news", "bangla news", "anandabazar", "anandabazar patrika", "sangbad pratidin"], what: "Anandabazar Patrika first, mixed with Sangbad Pratidin, Bartaman, Ei Samay, Aajkaal and BBC বাংলা", instant: true, expect: "live:news:bn" },
      { feature: "Sports headlines", strings: ["sports news feed", "sports headlines", "cricket news india", "cricket", "ipl", "olympics", "football news"], what: "ESPNcricinfo, The Hindu Sport and BBC Sport: tabs India, World events and All sports (headlines, not live scores)", instant: true, expect: "live:sports" },
    ],
  },
];

/** every string of the page with its feature, group and expectation (the selftest reads this) */
export function allReferenceStrings(): Array<{ group: string; feature: string; q: string; expect: string; instant: boolean }> {
  return QUICK_REFERENCE.flatMap((g) => g.entries.flatMap((e) => e.strings.map((q) => ({ group: g.id, feature: e.feature, q, expect: e.expect, instant: e.instant }))));
}

/** the groups (and, inside them, the entries) that hold every word of `text` in a feature name, a string or a note; an empty text keeps everything */
export function filterReference(text: string, groups: RefGroup[] = QUICK_REFERENCE): RefGroup[] {
  const words = (text || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return groups;
  const out: RefGroup[] = [];
  for (const g of groups) {
    const head = `${g.title} ${g.covers}`;
    const entries = g.entries.filter((e) => { const hay = `${e.feature} ${e.strings.join(" ")} ${e.what} ${head}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
    if (entries.length) out.push({ ...g, entries });
  }
  return out;
}
