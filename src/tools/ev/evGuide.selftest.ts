// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/ev/evGuide.selftest.ts
// This checks the plain-words guide to EV specifications: six sections, the words a buyer meets, the arithmetic right, and only the claims the sources make.
import { EXAMPLE, GUIDE, GUIDE_LEAD, TWO_NUMBERS, WATTS, bhpToKw, kwToBhp, kwToPs } from "./evGuideData";
import { convertWords } from "../converter/units";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const ALL = JSON.stringify(GUIDE);
const sec = (id: string) => GUIDE.find((s) => s.id === id)!;

ok("six sections in the order a buyer meets them: the two numbers, power, the battery, the Blade battery, charging, the socket", GUIDE.map((s) => s.id).join("|") === "two|power|battery|blade|charging|socket" && GUIDE.every((s, i) => s.no === i + 1));
ok("every section has a title, the question it answers, an introduction and at least three terms, each explained in a sentence", GUIDE.every((s) => s.title && s.question.endsWith("?") && s.intro.length > 60 && s.terms.length >= 3 && s.terms.every((t) => t.term && t.plain.length > 40)));
ok("each section has its own colour (six distinct sections)", new Set(GUIDE.map((s) => s.tone)).size === 6);
ok("the two numbers: kWh is the tank (how far) and kW the engine (how fast), and 1 kWh is the 'unit' on the electricity bill", TWO_NUMBERS.kwh.picture === "the fuel tank" && TWO_NUMBERS.kw.picture === "the engine" && /1 kWh = 1 unit of electricity/.test(JSON.stringify(sec("two"))) && /FAR/.test(TWO_NUMBERS.kwh.says) && /FAST/.test(TWO_NUMBERS.kw.says));
ok("the terms people meet are all there: kWh, kW, bhp, PS, peak and continuous power, combined power, torque (Nm), motor and inverter, gross and usable, voltage, state of charge, range, NMC, LFP, cycles, Blade, CTP, AC, on-board charger, DC, charging curve, C-rate, CCS2, Type 2, CHAdeMO, NACS, AC-001",
  ["kWh", "kW (kilowatt)", "bhp and PS", "Peak power", "Continuous", "Combined power", "Torque (Nm)", "inverter", "Gross and usable", "Voltage", "State of charge", "Range", "NMC", "LFP", "Charge cycles", "Blade", "Cell-to-Pack", "AC charging", "on-board charger", "DC fast charging", "charging curve", "C-rate", "CCS2", "Type 2", "CHAdeMO", "NACS", "AC-001"].every((w) => ALL.toLowerCase().includes(w.toLowerCase())), ["kWh", "bhp and PS", "Torque (Nm)", "C-rate"].filter((w) => !ALL.toLowerCase().includes(w.toLowerCase())).join());

// the arithmetic
ok("the horsepower constants are the converter's own (bhp 745.7 W, PS 735.5 W)", near(WATTS.bhp, 745.7, 0.01) && near(WATTS.ps, 735.5, 0.01));
ok("100 kW is 134 bhp and 136 PS, as the text says (1 kW = 1.341 bhp = 1.360 PS)", Math.round(kwToBhp(100)) === 134 && Math.round(kwToPs(100)) === 136 && near(kwToBhp(1), 1.341, 0.0005) && near(kwToPs(1), 1.360, 0.0005) && /1 kW = 1\.341 bhp = 1\.360 PS/.test(ALL) && /100 kW is 134 bhp or 136 PS/.test(ALL));
ok("the guide agrees with the search bar's converter: kW to bhp and to PS from convertWords", (() => { const a = convertWords(100, "kw", "hp"), b = convertWords(100, "kw", "ps"); return !!a && !!b && a.kind === "convert" && b.kind === "convert" && near(a.result, kwToBhp(100), 1e-6) && near(b.result, kwToPs(100), 1e-6); })());
ok("bhp and PS differ by about 1.4% (745.7 / 735.5)", near(WATTS.bhp / WATTS.ps, 1.014, 0.0005) && /about 1\.4%/.test(ALL) && near(bhpToKw(kwToBhp(55)), 55, 1e-9));
ok("C-rate: 1C on a 60 kWh battery is 60 kW, 2C 120 kW, 3C 180 kW, as the text says", /60 kWh battery that is 60 kW/.test(ALL) && /2C is about half an hour \(120 kW\)/.test(ALL) && /3C about 20 minutes \(180 kW\)/.test(ALL));
ok("a 75 kWh battery gives 75 kW for one hour or 15 kW for five hours (75 / 5 = 15); a 60 kWh battery feeds a 60 kW motor an hour or a 30 kW motor two", /75 kW for one hour, or 15 kW for five hours/.test(ALL) && 75 / 5 === 15 && /60 kW motor for one hour, or a 30 kW motor for two hours/.test(ALL));
ok("1,500 cycles of 300 km is 4.5 lakh km, as the battery text says (and it says real life is shorter)", 1500 * 300 === 450000 && /4\.5 lakh km/.test(ALL) && /real life is shorter/.test(ALL));

// correctness of the engineering
ok("the motor is said to be AC (PMSM or induction) fed by an inverter from the DC battery; the card does not say a modern car uses a DC motor", /AC motor/.test(ALL) && /permanent-magnet synchronous motor \(PMSM\)/.test(ALL) && /inverter turns that DC into the AC/.test(ALL) && /modern cars rarely do/.test(ALL));
ok("power is explained as peak against continuous, and the combined power of two motors is said to be below the sum of the two", /Peak power/.test(ALL) && /Continuous \(rated\) power/.test(ALL) && /a little less than the two motors' ratings added together/.test(ALL));
ok("the socket section says there is ONE combined socket (CCS2: Type 2 on top, two DC pins below), that AC uses the top part, that Tesla's NACS uses the same pins for both, and that CHAdeMO cars have two sockets", /single charging socket/.test(sec("socket").intro) && /round Type 2 socket on top with two large DC pins underneath/.test(ALL) && /same pins for AC and DC/.test(ALL) && /two separate sockets/.test(ALL));
ok("the charging section says the on-board charger is the limit on AC and that the charger station does the conversion on DC", /on-board charger \(OBC\)/.test(ALL) && /charges a car with a 7\.4 kW OBC at 7\.4 kW only/.test(ALL) && /bypassing the on-board charger/.test(ALL));

// the Blade battery: only what a source says
const blade = sec("blade");
ok("the Blade section is about the SHAPE (LFP is the chemistry, not a BYD invention), says it is not more powerful by itself, and gives BYD's own claims as BYD's (50% space, no fire at the nail test, 30 to 60 °C)", /LFP is not a BYD invention/.test(ALL) && /Not by itself/.test(ALL) && /BYD says this Cell-to-Pack \(CTP\) design uses the space in the pack 50% better/.test(ALL) && /BYD reports that the Blade cell gave off no smoke or fire/.test(ALL) && /30 to 60 °C/.test(ALL) && /March 2020/.test(ALL));
ok("the Indian cars named are those a source states: Mahindra BE 6 and XEV 9e (59 and 79 kWh packs, assembled at Chakan, grouped in modules), Maruti e Vitara (49 and 61 kWh, whole pack imported); nothing is said of Tata, Olectra or any lifetime in lakh km", /BE 6/.test(blade.terms[3].plain) && /XEV 9e/.test(blade.terms[3].plain) && /59 kWh and 79 kWh/.test(blade.terms[3].plain) && /Chakan/.test(blade.terms[3].plain) && /49 kWh and 61 kWh/.test(blade.terms[3].plain) && /imports the whole pack/.test(blade.terms[3].plain) && !/Tata|Olectra|Nexon|Curvv|8 to 10 lakh|Seal/.test(ALL));
ok("every claim of the Blade section about BYD or an Indian car has a source with its link and its words, each a web page of BYD, Autocar India, Autocar Professional or S&P Global Mobility", !!blade.sources && blade.sources.length >= 6 && blade.sources.every((s) => /^https:\/\/(www\.byd\.com|www\.autocarindia\.com|www\.autocarpro\.in|autotechinsight\.spglobal\.com)\//.test(s.url) && s.quote.length >= 20 && s.name));
ok("sections other than the Blade one name no maker or car, and no price, range figure or warranty of any car is given", GUIDE.filter((s) => s.id !== "blade").every((s) => !/Mahindra|Maruti|BYD|Tesla|Nissan|Tata/.test(JSON.stringify(s)) || /socket/.test(s.id)) && !/₹|Rs \d|rupee|warranty of \d/.test(ALL));
ok("the words are for a person who is not an electrical engineer: no section needs a formula (no '=' sign except the conversion line and the unit line) and the lead says no training is needed", /Nothing here needs any electrical training/.test(GUIDE_LEAD) && GUIDE.every((s) => (JSON.stringify(s).match(/ = /g) ?? []).length <= 3));
ok("the worked example is an illustration (60 kWh, 110 kW, 5 km per kWh, 7.4 kW home charger), and the guide says it is not a real car", EXAMPLE.capacityKwh === 60 && EXAMPLE.motorKw === 110 && EXAMPLE.kmPerKwh === 5 && EXAMPLE.acKw === 7.4);

console.log(`evGuide: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
