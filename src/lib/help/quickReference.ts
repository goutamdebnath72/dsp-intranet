// src/lib/help/quickReference.ts
//
// THE "WHAT TO TYPE" PAGE OF THE USER GUIDE: for each feature of the search bar's tools, its NAME and the words that open it, with the alternatives separated by a front slash ("gold rate today / silver price / 22k gold").
// One data file, read by src/components/help/QuickReferenceTab.tsx; nothing about a feature is written in the component.
//
// The list is kept honest by src/lib/help/quickReference.selftest.ts: every string of every entry is run through the REAL detector (src/lib/tools/detect.ts) and must open the feature the entry says it opens,
// so a word that stops working, or a feature listed under a word that opens another, fails the tests. A string here is something the reader types AS IT IS; there is no blank to fill in.
// (The questions about people, hospital, circulars, announcements are on the Sample questions page: they are sentences, not words that open a tool.)
//
// EVERY feature is given its SHORT command (one or two words) and its LONG command (a phrase or a full question), or says in words why one of them does not exist (a value you type yourself, a command that needs all its words);
// the selftest checks that no feature is missing one of the two without saying so.
// `expect` is what the detector must answer for every string of the entry: the kind of line, and for a form or a live card its id, and for the news card the tab ("live:news:hi").

export interface RefEntry {
  /** the feature's name, as the reader knows it */
  feature: string;
  /** the SHORT commands: the fewest words that open it (one or two), each alternative shown with a "/" between */
  short: string[];
  /** the LONG commands: the same thing asked in full, in a phrase or a whole question, each alternative shown with a "/" between */
  long: string[];
  /** said on the page when there is no short command, and why (a value you type yourself, or a command that needs all its words) */
  noShort?: string;
  /** said on the page when there is no long command, and why */
  noLong?: string;
  /** one short line: what opens, and anything worth knowing; words between ** ** are shown in bold */
  what: string;
  /** the result appears as you type (true), or the line needs the Enter key (false) */
  instant: boolean;
  /** what the detector answers for each string (checked by the selftest); "records" is a question or a name that opens no tool but goes to the ordinary search of the intranet's own records */
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
    id: "records",
    title: "The intranet's own records: people, hospital, holidays, circulars",
    covers: "These open no tool: you type a name, a number or a question, and the search answers from the intranet's own records (the employee directory, the hospital's OPD schedule, the PAX list, the holiday lists, the circulars and the announcements); the management pages are asked for the same way. A short command is a name, a number or a few words; a long command is a full question. A site or department name shows its link as you type. The questions to try, area by area, are on the Sample questions page.",
    entries: [
      { feature: "A person, by number", short: ["D000896", "2584"], long: [], noLong: "A number is the whole command.", what: "a SAIL personal number (D000896), a 6-digit ticket number, a 10-digit CUG mobile number, or the last 4 digits of an executive's CUG mobile (2584): the person appears as you type; mobile numbers and emails are masked until you press reveal", instant: true, expect: "records" },
      { feature: "A person, by name", short: ["rakesh ojha", "ojha"], long: ["rakesh ojha c&it", "c&it rakesh ojha"], what: "type the whole name (rakesh ojha) or only a part of it (ojha); a name is matched by sound, so another spelling still finds the person; add the department (c&it) when you have only part of the name; honorifics are ignored", instant: false, expect: "records" },
      { feature: "Count and compare employees", short: ["who is in charge of blast furnace", "how many DGMs in mechanical"], long: ["how many employees are currently posted in the C&IT department, and who is the Head of Department"], what: "headcounts, designations, heads of department, seniority and grades, from the employee directory; name the department the way people say it", instant: false, expect: "records" },
      { feature: "Doctors and OPD", short: ["medicine opd lists", "opd token timings", "is opd open today"], long: ["can I see dr karmakar on tuesday at 5pm", "on which day of the week can I see dr karmakar in opd"], what: "which doctor sits on which day, a department's OPD list, token timings; the answer is from the hospital's OPD schedule only", instant: false, expect: "records" },
      { feature: "PAX telephone extensions", short: ["pax number of fire service", "pax number of central store"], long: ["how many pax numbers does civil have", "is 42046 a pax number"], what: "the internal telephone numbers of offices and places, and whose an extension is", instant: false, expect: "records" },
      { feature: "Holidays", short: ["holidays in November", "restricted holidays in 2026"], long: ["when is Durga Puja holiday in 2026", "compare festival holidays 2025 and 2026"], what: "closed, festival and restricted holidays by festival, month or year, and a comparison of two years", instant: false, expect: "records" },
      { feature: "A circular, by its title", short: ["gift card circular", "canteen timings circular", "Mediclaim policy extension"], long: ["Which circular announced the Hindi teaching scheme?", "\"retention of company accommodation\""], what: "the circulars whose heading holds your words; put words in double quotes to match that exact phrase", instant: false, expect: "records" },
      { feature: "What a circular says", short: ["What time does the health check-up start?", "What is the gift card amount for employees?"], long: ["What documents are needed for the pre-mature repayment of a PF loan?", "What is the minimum daily wage for contract workers from 1 January 2024?"], what: "an amount, a last date, who is eligible, how to apply: the answer cites the circular and you can open it; check the circular before you act on a figure", instant: false, expect: "records" },
      { feature: "Management pages (for the HOD of C&IT and the people he has authorised)", short: ["management", "admin"], long: ["open the management page", "show all managers"], what: "after you sign in, one page with the titles of the management pages you may open (Employee manager, PAX directory editor, Holiday, Circular and Announcement managers, Contact access log), each opens its page and every page has a Back button to this one; the HOD of C&IT sees all of them, a person he has authorised sees only the pages given to him; if you are not signed in you are asked to sign in (a Sign in button opens the login window) and, once you have, the page opens if you are authorised and otherwise you are told that you are not authorised to access it", instant: false, expect: "records" },
    ],
  },
  {
    id: "calc",
    title: "Calculators and converters",
    covers: "Sums, conversions, currency, dates and the loan, PF, gratuity and leave forms. All of it runs in your browser; nothing you type is saved.",
    entries: [
      { feature: "List of all the calculators (the menu)", short: ["calculators", "all tools", "calculator menu"], long: ["list of all the calculators"], what: "opens the menu of ready tools: calculator, converters, dates, provident fund (PF maturity and PF loan EMI), gratuity, leave encashment, tyre and rim sizes, VIN reader, BH series, electric car charging", instant: false, expect: "menu" },
      { feature: "Calculator (basic and scientific)", short: ["calculator", "scientific calculator", "calc"], long: ["open the scientific calculator"], what: "the full calculator, like the Mac's: keys or keyboard, memory, brackets, powers, roots, trigonometry, history; the scientific one also has a **DEC · BIN · OCT · HEX** switch (see the next entry)", instant: false, expect: "form:calc" },
      { feature: "Number in binary, octal, decimal or hexadecimal", short: ["0xFF", "0b1010", "0o17"], long: ["255 to binary", "10 in hex", "1010 binary to decimal", "ff hex to octal"], what: "the scientific calculator opens on the number in that base, with the number in the other bases under it; whole numbers only (a fraction, or a number beyond 9,007,199,254,740,991, is refused, never rounded); in HEX the keys sin to tanh become A to F, and the keys a base does not have are greyed", instant: true, expect: "calcbase" },
      { feature: "A sum typed straight in", short: ["12*45+7", "12 squared"], long: ["15% of 2400", "200 + 10%", "5 lakh * 12", "sq rt of 4^3", "cube root of 27"], what: "the answer appears under the search line; + - * / ^, brackets, %, lakh and crore, roots and squares", instant: true, expect: "expression" },
      { feature: "Constants", short: ["golden ratio"], long: ["value of pi", "value of e"], what: "the value to 20 digits (they can also be used in a sum: 2*pi*8)", instant: true, expect: "expression" },
      { feature: "Unit converter (all units and currencies)", short: ["unit converter", "converters"], long: ["open the unit converter"], what: "opens a converter with every unit and currency; retype either box or change either unit", instant: false, expect: "form:converter" },
      { feature: "Unit conversion", short: [], long: ["5 km in miles", "98.6 f to c", "72 km/h to m/s", "1 kgf/cm2 to bar", "1 kWh in calories", "bhp to ps"], noShort: "You type the value itself, with your own figures, so there is no fixed short command: write it in the shape shown.", what: "number, unit, \"in\" or \"to\", unit: length, area, volume, mass, temperature, angle, energy, force, power, pressure, speed, time", instant: true, expect: "convert" },
      { feature: "Land units (bigha, katha, decimal, acre)", short: [], long: ["1 bigha in sq ft", "2 katha to sq m", "bigha to decimal", "1 acre in sq ft", "2 acre to bigha", "acre to hectare"], noShort: "You type the value itself, with your own figures, so there is no fixed short command: write it in the shape shown.", what: "the land-record units (bigha, katha, decimal, acre) with hectare and square feet, each into any other; bigha and katha as used in West Bengal unless a state is named", instant: true, expect: "convert" },
      { feature: "Colour converter (RGB, HEX and HSL)", short: ["colour converter"], long: ["rgb to hex to hsl", "#ff5733 to rgb", "rgb(255, 87, 51) to hex", "hsl(11, 100%, 60%) to rgb"], what: "a colour between RGB, HEX and HSL in any direction, the colour shown under it; type in any of the three panels and the other two follow (the short form opens it on a sample colour)", instant: true, expect: "colour" },
      { feature: "Currency converter (with the USD/INR one-year graph)", short: ["dollar rate"], long: ["100 usd to inr", "1 pound in rupees", "euro rate today"], what: "the day's reference rate; for dollar and rupee a graph of the last year is shown under the converter", instant: true, expect: "currency" },
      { feature: "Date questions", short: ["age 15/08/1985", "today's date"], long: ["days between 1 jan 2026 and 15 mar 2026", "90 days from today", "retirement date born 15/08/1975", "what day is 26 jan 2027", "days until 25 dec 2026"], what: "days, weeks, months, working days, age, the end of the month of the 60th birthday, the weekday; dates are written day first", instant: true, expect: "date" },
      { feature: "Date calculator (form)", short: ["date calculator"], long: ["open the date calculator"], what: "between dates, add or subtract, age, retirement date", instant: false, expect: "form:dates" },
      { feature: "PF loan EMI (refundable PF loan)", short: ["emi calculator", "pf loan"], long: ["pf loan emi", "refundable pf loan", "pf loan calculator"], what: "the monthly instalment of a refundable PF loan, on the second tab of the provident fund page: the loan's interest is always 1% more than the PF deposit's, the period is at most 10 years and not beyond your service left, and the interest is on the balance still owed, month by month; a non-refundable (NRL) loan has no instalment", instant: false, expect: "form:pf" },
      { feature: "Probable PF maturity (provident fund page, first tab)", short: ["pf maturity", "pf calculator"], long: ["pf maturity calculator", "provident fund calculator"], what: "your probable provident fund on the day you retire, worked month by month from the figures of your DSP PF page (opening balance, monthly contributions and the interest on them, for PF (Emp), PF (Comp) and VPF), your payslip and your retirement date; with a what-if table and the tax on interest", instant: false, expect: "form:pf" },
      { feature: "Gratuity", short: ["gratuity calculator"], long: ["calculate my gratuity", "gratuity amount calculator"], what: "from last pay and years of service", instant: false, expect: "form:gratuity" },
      { feature: "Leave encashment", short: [], long: ["leave encashment calculator", "leave encashment amount"], noShort: "This one needs all its words: leave, encashment and a word such as calculator or amount.", what: "EL / HPL encashment", instant: false, expect: "form:encashment" },
    ],
  },
  {
    id: "vehicles",
    title: "Vehicles",
    covers: "The national (BH-series) number plate and the VIN, tyre and rim specifications, EV battery and charger specifications, and engine power in PS, bhp and kW.",
    entries: [
      { feature: "Tyre and rim size reader (page)", short: ["tyre size", "wheel size"], long: ["read my tyre size", "tyre and rim size"], what: "sample sizes to try, the load-index and speed tables and the wheel marking guide", instant: false, expect: "form:tyre" },
      { feature: "A tyre size read out", short: [], long: ["205/55 R16 91V"], noShort: "Type the marking printed on the tyre, as it is.", what: "width, aspect ratio, rim, load index and speed symbol, each explained", instant: true, expect: "tyre" },
      { feature: "A wheel (rim) marking read out", short: ["8Jx20"], long: [], noLong: "The value you type is the whole command; there is no longer form.", what: "width, flange letter, diameter, the tyre widths that suit it, and what else must match the car", instant: true, expect: "rim" },
      { feature: "EV charging time (first tab of the electric car window)", short: ["ev charging"], long: ["ev charging time", "how long to charge an electric car", "charging time of electric car"], what: "battery size, AC and DC chargers, time from 10% to 90%", instant: false, expect: "form:ev" },
      { feature: "EV specifications explained (second tab of the electric car window)", short: ["ev specifications"], long: ["ev specifications explained", "electric car battery specifications"], what: "six sections in plain words: kWh and kW (the tank and the engine), power in kW, bhp and PS, the battery (usable capacity, volts, LFP and NMC), the BYD Blade battery and the Indian cars that use it, AC and DC charging with the on-board charger and C-rate, and the single CCS2 socket", instant: false, expect: "form:ev" },
      { feature: "Engine power: PS, bhp and kW", short: ["100 bhp"], long: [], noLong: "The value you type is the whole command; there is no longer form.", what: "engine power is always shown in all three, and an electric car's power is given in kW (the motor or motors turning the wheels) beside the battery's kWh, the size of its tank", instant: true, expect: "engine" },
      { feature: "VIN guide (page)", short: ["vin number", "vin guide"], long: ["read a vin number", "vin number guide"], what: "the 17 characters of a Vehicle Identification Number section by section, with samples to try", instant: false, expect: "form:vin" },
      { feature: "A VIN read out", short: ["MALBM51BLKM000001"], long: [], noLong: "The value you type is the whole command; there is no longer form.", what: "country, maker, descriptor, check digit, model year, plant and serial", instant: true, expect: "vin" },
      { feature: "BH (Bharat) series guide (page)", short: ["bh series"], long: ["what is bh series number plate", "bh series number plate guide"], what: "what the all-India plate is, who is eligible, how to apply, and the road tax with an estimate", instant: false, expect: "form:bh" },
      { feature: "A BH number read out", short: [], long: ["26 BH 1234 AA"], noShort: "Type the number plate, as it is.", what: "the year, BH, the four digits and the letters, each explained", instant: true, expect: "bh" },
    ],
  },
  {
    id: "live",
    title: "Live prices, markets, weather, flights, trains, DA and inflation",
    covers: "Figures read from free public sources when you ask. Each card names its source and when it was fetched.",
    entries: [
      { feature: "Gold and silver rates", short: ["silver price", "22k gold", "gold price"], long: ["gold rate today"], what: "IBJA rates for 24 carat, 22 carat and silver, with the change and the trend of the last months; IBJA publishes no rates on Saturdays, Sundays and holidays, so then the card shows the last day it published, with that day's date", instant: true, expect: "live:gold" },
      { feature: "Petrol, diesel and LPG prices", short: ["diesel price", "fuel price"], long: ["petrol diesel lpg price", "lpg cylinder price", "petrol price today"], what: "petrol (E20), diesel and every LPG cylinder in Delhi, Mumbai, Chennai and Kolkata, in one table", instant: true, expect: "live:fuel" },
      { feature: "Fuel price history (one-year chart)", short: ["petrol trend"], long: ["petrol price trend", "petrol price chart"], what: "the same fuel card; under its table, tabs chart Kolkata's petrol, diesel and LPG price over the last year", instant: true, expect: "live:fuel" },
      { feature: "Sensex, Nifty and SAIL share", short: ["sensex nifty", "sensex", "trending stocks", "banknifty"], long: ["sail share price"], what: "Sensex, Nifty and the biggest movers of a watch list with SAIL (market data, not advice); the market is shut at weekends, so the last close is shown, and when Yahoo Finance does not answer the card shows the last figures it saved, marked Not live, with the time they were received", instant: true, expect: "live:markets" },
      { feature: "Durgapur weather and forecast", short: ["weather", "forecast", "durgapur weather", "weather today", "mausam"], long: ["durgapur weather report with forecast"], what: "the weather at Durgapur now (temperature, what it feels like, humidity, wind, rain, sunrise and sunset), the next 24 hours three hours at a time, and seven days with the highest and lowest temperature and the chance of rain", instant: true, expect: "live:weather" },
      { feature: "Andal Airport flights (to and from)", short: ["durgapur flights", "flights", "andal airport", "durgapur airport", "rdp flights", "flight schedule"], long: ["andal airport flights to and from", "kaji nazrul airport"], what: "departures and arrivals between Andal Airport (RDP) and Bengaluru, Hyderabad, Chennai, Delhi and Mumbai, with times and flight numbers, from the airport's own page; the next flight is marked (the timetable, not live status)", instant: true, expect: "live:flights" },
      { feature: "Durgapur Railway Station trains (express and local)", short: ["trains", "dgr", "dgr trains", "train timetable", "local trains", "memu", "railway"], long: ["durgapur railway station trains"], what: "every mail and express train that stops at Durgapur (DGR), in both directions, with arrival, departure and the days it runs (Daily or the weekdays); special trains are marked, junctions are in amber, Vande Bharat and Shatabdi carry their own badges, and the local MEMU trains follow in violet. A second tab, Asansol Railway Junction (ASN), lists the trains that stop at Asansol but not at Durgapur: those that pass Durgapur without stopping and those that do not go over it. Type dgr alone, in any case, and the card opens as you type, without Enter. The timetable is RailRadar's, not live running status", instant: true, expect: "live:railway" },
      { feature: "Asansol Junction trains (the Asansol tab)", short: ["asn", "asn trains"], long: ["asn train fare"], what: "the same card as above, opened on its second tab, Asansol Railway Junction (ASN): the trains that stop at Asansol but not at Durgapur. Type asn alone, in any case, and it opens as you type, without Enter. The times and days are those at Asansol", instant: true, expect: "live:railway:asn" },
      { feature: "Train fares (to the end station, to every stop, and a fare finder)", short: ["train fare", "train fares"], long: ["train fare from durgapur"], what: "the same card, with the fare tools open: a ₹ Fares button on each express or mail train gives the approximate fare of every reserved class (2S, SL, CC, EC, 3E, 3A, 2A, 1A) from Durgapur to the end of its run, with the parts of the fare, and under it the fare to every stop on the way; ₹ Find a fare to a station lists every train that goes there, by time or cheapest first; each local MEMU train has a ₹ Fare hint, an estimate from the Railway Board's fare table. Fares are read from the saved data only, with the date they were received (they were collected while the paid fare service lasted, which ends on 13 December 2026); a train whose fares were not collected says so; the class codes are written out under each table", instant: true, expect: "live:railway" },
      { feature: "AICPI-IW and the quarterly dearness allowance (DA): first tab", short: ["aicpi da", "sail da", "da formula", "dearness allowance", "cpi-iw", "da calculator", "aicpi"], long: ["da of sail employees", "sail employees da calculation"], what: "the consumer price index for industrial workers from the Labour Bureau as a graph of the last year, and the quarterly DA of SAIL employees worked out from it (the CPSE IDA pattern of the 2017 pay scales): the rate in force, the expected rate of the next quarter, a table of the quarters with the work of each, the formula and a calculator for your basic pay; SAIL's own circular is the authority", instant: true, expect: "live:aicpi" },
      { feature: "CPI and inflation (MoSPI): second tab", short: ["cpi", "inflation", "india inflation", "cpi urban"], long: ["india cpi inflation rate", "inflation rate in india"], what: "the second tab of the window \"AICPI, SAIL DA and inflation\": the Consumer Price Index of MoSPI month by month as column charts for all India (Combined, Urban and Rural tabs) and for any State (hover or touch a column for its month, index and inflation rate), and India's inflation for the last 1, 3, 5 or 10 years (tabs) with a red alarm note under the chart when it is above the Reserve Bank's 6% limit; from the ministry's own open data, saved in the database", instant: true, expect: "live:aicpi:cpi" },
    ],
  },
  {
    id: "durgapur",
    title: "Durgapur: PIN codes, Wards, Assembly seats and Police stations",
    covers: "The PIN codes of the city, the 43 wards of the Durgapur Municipal Corporation with their areas, the two assembly seats, and which police station each area is under, through the lens of the Steel Plant. One card with four tabs; the data is saved, nothing is fetched.",
    entries: [
      { feature: "PIN codes of Durgapur (713201 to 713219)", short: ["pin code", "pincode", "post office", "zip code"], long: ["durgapur pin code"], what: "the 19 PIN codes, each in its own colour, with its post offices (head, sub and branch) and the wards that use it; the post offices named for the Steel Plant are marked DSP, and the Steel Plant's own PIN, 713203, is at the top", instant: true, expect: "live:pincode:pins|" },
      { feature: "One PIN code", short: ["pin 713203"], long: ["pin code 713203"], what: "the same card with that PIN code searched: any of the 19 codes works", instant: true, expect: "live:pincode:pins|713203" },
      { feature: "DMC wards with their areas", short: ["dmc wards", "dmc", "wards"], long: ["municipal corporation wards"], what: "the 43 wards of the Durgapur Municipal Corporation, each with its seat, its PIN codes and its areas, with a search box for a ward number, an area (try Sagarbhanga or Bengal Ambuja) or a PIN; press a PIN on a ward to jump to the areas with that PIN", instant: true, expect: "live:pincode:wards|" },
      { feature: "One ward", short: ["ward 22"], long: ["dmc ward 22"], what: "the same card opened on that ward: any number from 1 to 43 works", instant: true, expect: "live:pincode:wards|ward 22" },
      { feature: "Assembly seats (Durgapur Purba and Paschim)", short: ["durgapur purba", "durgapur paschim", "assembly seats", "vidhan sabha", "constituency"], long: ["durgapur assembly seats", "vidhan sabha seats of durgapur"], what: "the two assembly seats (constituencies) of the city (No. 276 and No. 277) with the wards of each, and the three gram panchayats of Kanksa block that Durgapur Purba adds; press a PIN on a panchayat to jump to its areas", instant: true, expect: "live:pincode:seats|" },
      { feature: "Police stations (thana) of the areas", short: ["thana", "police stations"], long: ["durgapur police station"], what: "which of the four police stations (Durgapur, Coke Oven, Kanksa, New Township) each area is under, as the Election Commission's roll prints it, with each station's address, telephone numbers, whom it reports to and its page on the Commissionerate's site, the investigation centres and outposts that work under it (Waria near the Steel Plant's main gate, City Centre, B-Zone, DTPS, Bidhannagar), and the emergency number; type an area or the name of a post in the box to see its station", instant: true, expect: "live:pincode:police|" },
      { feature: "Police station of one ward", short: [], long: ["ward 22 police station", "ward 22 thana", "thana ward 22"], noShort: "A ward and its police station take three words; ward 22 alone opens the Wards tab.", what: "the same tab with that ward searched: its areas, each under its station", instant: true, expect: "live:pincode:police|ward 22" },
    ],
  },
  {
    id: "steel",
    title: "Steel: prices, production and companies",
    covers: "What steel costs, who makes how much, and how India is doing: the Ministry of Steel's retail prices, the makers' own quarterly results, and SAIL month by month. One card with five tabs; the figures are published ones, saved, not live.",
    entries: [
      { feature: "Steel prices (TMT, HR coil, CR coil)", short: ["steel prices", "tmt price", "hrc", "rebar price"], long: ["steel rate today"], what: "the retail prices of TMT bar (10 mm), HR coil (2.50 mm) and CR coil (0.63 mm) in Mumbai at the end of each month, with the month's change and a graph, and the iron ore price; the Ministry of Steel's figures. No mill publishes a price list, so there is no brand-by-brand table, and the card says so", instant: true, expect: "live:steel:prices|" },
      { feature: "DSP's own products with Durgapur market prices", short: ["dsp products", "durgapur steel", "billet price"], long: ["tmt price durgapur"], what: "what the Durgapur Steel Plant makes to sell (TMT bars, channels, angles, joists and beams, billets and blooms, wheels and axles, pig iron) with its sizes and capacity from the plant's manuals, beside the Durgapur market's quotes for the same kind of steel: dated, GST not included, from a trade-price site. It also shows what the plant produced, as SAIL's annual reports state it: hot metal for the last ten years as a column chart (only the years SAIL states; the rest are left empty), crude, saleable and finished steel by year, the output of the Bloom cum Round Caster and the Medium Structural and Merchant Mills, the product mix, and wheels and axles supplied to the Railways (a dash where the reports give no figure). They are market quotes, not DSP's or SAIL's own prices (nobody publishes those); where no quote was found the card says so, and it warns when the quotes are over a week old", instant: true, expect: "live:steel:dsp|" },
      { feature: "Steel companies compared (SAIL, Tata Steel, JSW, Jindal Steel)", short: ["steel companies", "tata steel", "jsw steel", "steel comparison", "jindal steel"], long: ["compare steel companies"], what: "the four makers quarter by quarter from their own results: production, sales and EBITDA per tonne, who is ahead and by how much, with the results and where each figure was read", instant: true, expect: "live:steel:companies|" },
      { feature: "SAIL and the other steel public-sector companies", short: ["sail steel"], long: ["sail steel production"], what: "SAIL, RINL and NMDC Steel month by month in Million Tonnes, MT (the Ministry's table, converted from lakh tonnes), SAIL against the same month a year earlier and the year to date, and SAIL's average selling price by quarter", instant: true, expect: "live:steel:sail|" },
      { feature: "India's and the world's steel", short: ["steel production", "crude steel"], long: ["india steel production"], what: "India's crude steel, consumption and trade by year, the month-by-month production, and the biggest producing countries", instant: true, expect: "live:steel:india|" },
    ],
  },
  {
    id: "dsphistory",
    title: "Durgapur Steel Plant: its story and its heads",
    covers: "How the Durgapur Steel Plant came to be, who made it, what it made first, who has headed it, and the family of SAIL it belongs to, with SAIL's own photographs and the source of every entry. One card with five tabs; the history is saved, not live. Where two sources differ the card shows both, and where nothing is published it leaves a gap.",
    entries: [
      { feature: "The story of DSP", short: ["dsp history", "dsp story", "about dsp"], long: ["history of dsp", "durgapur steel plant history", "tell me about dsp"], what: "the five dates (contract, October 1956; construction, January 1957; first blast furnace, December 26, 1959; first ingot, April 24, 1960; SAIL, January 24, 1973), the plant in a few facts and the timeline with photographs", instant: true, expect: "live:dsphistory:story|" },
      { feature: "Who made it: the technology, Dr B C Roy, Pandit Nehru, the Queen", short: ["nehru durgapur", "dsp foundation"], long: ["queen elizabeth durgapur", "bc roy durgapur", "who built dsp"], what: "why Durgapur was built, the British consortium that built it (the Indian Steel Works Construction Company, ISCON), Dr B C Roy's part, Pandit Nehru's two visits, Queen Elizabeth II's visit of February 1961 and the President at the first blast furnace, with SAIL's pictures", instant: true, expect: "live:dsphistory:makers|" },
      { feature: "What the plant made first", short: [], long: ["dsp first products"], noShort: "This one needs all its words: dsp first products.", what: "iron, ingots, the Section Mill and the railway wheels and axles of the first years, each with its page and the words of the source, and what no source records (what the Merchant Mill first rolled, DSP's own early tonnes)", instant: true, expect: "live:dsphistory:first|" },
      { feature: "The heads of DSP, in order", short: ["dsp heads"], long: ["heads of dsp", "dsp chief executives", "dsp general managers", "former heads of dsp"], what: "the chronological list of the plant's heads under the title each bore (General Manager, Director-in-Charge, Managing Director, Chief Executive Officer, Director In-charge), with a picture where SAIL has one, what each entry rests on, and the gaps the sources leave", instant: true, expect: "live:dsphistory:heads|" },
      { feature: "SAIL and its units", short: ["sail history", "sail foundation", "sail units"], long: ["history of sail"], what: "Hindustan Steel (January 19, 1954) and the foundation of SAIL (January 24, 1973), its integrated and special steel plants with the country each came from (Britain, Germany, the USSR), and SAIL's other bodies", instant: true, expect: "live:dsphistory:sail|" },
    ],
  },
  {
    id: "news",
    title: "News and sports headlines",
    covers: "Headlines from the papers' own free feeds, newest first, refreshed every minute while the card is open. A story opens on the paper's own page in a new tab. A paper's full name opens its own tab.",
    entries: [
      { feature: "News headlines (opens on Business)", short: ["news feed", "newsfeed", "newspaper", "headlines"], long: ["top news headlines"], what: "four tabs: Business, English, Hindi and Bengali; the same story from several papers is one card", instant: true, expect: "live:news" },
      { feature: "Business news", short: ["business news", "economy news", "corporate news", "economic times", "business line"], long: ["wall street journal"], what: "The Economic Times, Mint, The Hindu BusinessLine and The Wall Street Journal (some stories need a subscription at the paper)", instant: true, expect: "live:news:biz" },
      { feature: "English news", short: ["english news", "the telegraph", "the hindu", "hindustan times", "indian express", "ndtv"], long: ["times of india"], what: "The Telegraph, The Hindu and The Times of India first, then Hindustan Times and The Indian Express", instant: true, expect: "live:news:en" },
      { feature: "Hindi news", short: ["hindi news", "samachar", "dainik bhaskar", "dainik jagran", "amar ujala", "navbharat times", "hindustan hindi"], long: ["hindi newspaper headlines", "today's hindi news headlines"], what: "Dainik Bhaskar, Dainik Jagran, Amar Ujala, Hindustan and Navbharat Times, in that order", instant: true, expect: "live:news:hi" },
      { feature: "Bengali news", short: ["bengali news", "bangla news", "anandabazar", "anandabazar patrika", "sangbad pratidin"], long: ["bengali newspaper headlines", "anandabazar patrika news"], what: "Anandabazar Patrika first, mixed with Sangbad Pratidin, Bartaman, Ei Samay, Aajkaal and BBC বাংলা", instant: true, expect: "live:news:bn" },
      { feature: "Sports headlines", short: ["sports headlines", "cricket", "ipl", "olympics", "football news"], long: ["sports news feed", "cricket news india"], what: "ESPNcricinfo, The Hindu Sport and BBC Sport: tabs India, World events and All sports (headlines, not live scores)", instant: true, expect: "live:sports" },
    ],
  },
];

/** all the commands of an entry, short first */
export const entryStrings = (e: RefEntry): string[] => [...e.short, ...e.long];

/** every string of the page with its feature, group and expectation, and whether it is a short or a long command (the selftest reads this) */
export function allReferenceStrings(): Array<{ group: string; feature: string; q: string; expect: string; instant: boolean; kind: "short" | "long" }> {
  return QUICK_REFERENCE.flatMap((g) => g.entries.flatMap((e) => [
    ...e.short.map((q) => ({ group: g.id, feature: e.feature, q, expect: e.expect, instant: e.instant, kind: "short" as const })),
    ...e.long.map((q) => ({ group: g.id, feature: e.feature, q, expect: e.expect, instant: e.instant, kind: "long" as const })),
  ]));
}

/** the groups (and, inside them, the entries) that hold every word of `text` in a feature name, a string or a note; an empty text keeps everything */
export function filterReference(text: string, groups: RefGroup[] = QUICK_REFERENCE): RefGroup[] {
  const words = (text || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return groups;
  const out: RefGroup[] = [];
  for (const g of groups) {
    const head = `${g.title} ${g.covers}`;
    const entries = g.entries.filter((e) => { const hay = `${e.feature} ${entryStrings(e).join(" ")} ${e.what.replace(/\*\*/g, "")} ${head}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
    if (entries.length) out.push({ ...g, entries });
  }
  return out;
}

/** a line's pieces for the screen: the plain text and the bold text (written between ** **), in order; an odd, unclosed ** is left as plain text */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  const parts = text.split("**");
  if (parts.length % 2 === 0) return [{ text, bold: false }];
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text !== "");
}
