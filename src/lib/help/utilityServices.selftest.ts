// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/utilityServices.selftest.ts
// I check the "Utility Services" tab of the guide: the term, the services with their bold names, the words that open each one (every word is on the tested "What to type" list), and the facts the services' prose keeps.
// The prose is the text the services had in the introduction of the Sample questions tab, moved unchanged; the pins that guarded it moved here with it.
import { CALCULATORS_LINE, UTILITY_HOW, UTILITY_LEAD, UTILITY_LIMITS, UTILITY_SERVICES, UTILITY_TITLE } from "./utilityServices";
import { allReferenceStrings, QUICK_REFERENCE } from "./quickReference";
import { AREAS } from "./searchBarIntro";
import { TOOLS_SECTION } from "./sampleQuestions";
import { TOPIC_UIS } from "@/tools/registry.ui";
import { TOPICS } from "@/tools/registry";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = UTILITY_SERVICES.map((a) => `${a.label} ${a.detail} ${(a.parts ?? []).map((p) => `${p.title} ${p.detail}`).join(" ")}`).join(" ").toLowerCase();

// ---- the term, and what the tab says up front
ok("the tab is called Utility Services; the lead calls them a host of Utility Services given to help employees in many different ways, says they are auxiliary, and says each has a bold name and the words that open it", UTILITY_TITLE === "Utility Services" && /host of Utility Services/.test(UTILITY_LEAD) && /help employees in many different ways/.test(UTILITY_LEAD) && /auxiliary/.test(UTILITY_LEAD) && /name, shown in bold/.test(UTILITY_LEAD) && /words that open it/.test(UTILITY_LEAD));
ok("two steps say how to get a service: click or type the words, press Enter (a sum, a conversion, a PIN code or a ward show as you type)", UTILITY_HOW.length === 2 && /Click the words/.test(UTILITY_HOW[0]) && /Press Enter/.test(UTILITY_HOW[1]) && /as you type/.test(UTILITY_HOW[1]));

// ---- every tool of the registry is named
const NAMED_BY: Record<string, string> = { dsphistory: "dsp history", steel: "steel prices", calc: "calculator", pf: "pf", gratuity: "gratuity", encashment: "encashment", dates: "dates", converter: "converters", tyre: "tyre", rim: "rim", ev: "ev ", vin: "vin", bh: "bh-series", gold: "gold", markets: "sensex", fuel: "petrol", news: "news", sports: "sports", weather: "weather", flights: "flights", railway: "trains", aicpi: "inflation", pincode: "pin codes" };
const unmapped = TOPICS.map((t) => t.id).filter((id) => !NAMED_BY[id]);
ok("every topic of the registry has a word in the table above (so a new tool cannot be forgotten)", unmapped.length === 0, unmapped.join());
ok("every topic of the registry is named in the Utility Services", TOPICS.every((t) => !NAMED_BY[t.id] || text.includes(NAMED_BY[t.id])), TOPICS.filter((t) => !text.includes(NAMED_BY[t.id])).map((t) => t.id).join());
ok("it says the one-year graphs exist (fuel, gold and silver, dollar-rupee)", (text.match(/one-year/g) ?? []).length >= 3);
ok("every service has a bold name and a detail, and none is listed twice; none is a main feature of the first tab", UTILITY_SERVICES.every((a) => a.label.length > 3 && a.detail.length > 10) && new Set(UTILITY_SERVICES.map((a) => a.label)).size === UTILITY_SERVICES.length && !UTILITY_SERVICES.some((a) => AREAS.some((m) => m.label === a.label)));

// ---- the words that open each service: all on the tested list, from the right group
const ref = new Map(allReferenceStrings().map((x) => [x.q.toLowerCase(), x]));
const chips = UTILITY_SERVICES.flatMap((s) => [...(s.type ?? []).map((w) => ({ owner: s.label, w })), ...(s.parts ?? []).flatMap((p) => p.type.map((w) => ({ owner: p.title, w })))]);
ok("every service, or every part of a service that has parts, shows the words that open it (a service with parts carries them on its parts, not on itself)", UTILITY_SERVICES.every((s) => (s.parts ? !s.type && s.parts.every((p) => p.type.length >= 1) : (s.type ?? []).length >= 1)));
ok("every word shown is on the 'What to type' list, which the quick-reference test runs through the real detector (so each really opens the service)", chips.every((c) => ref.has(c.w.toLowerCase())), JSON.stringify(chips.filter((c) => !ref.has(c.w.toLowerCase()))));
const GROUP_OF: Record<string, string> = { News: "news", "Petrol, diesel and LPG prices": "live", "Gold and silver rates": "live", "Dollar and other currencies": "calc", "Sensex, Nifty and SAIL share": "live", "Durgapur weather": "live", "Andal Airport flights": "live", "Durgapur and Asansol railway stations": "live", "AICPI, SAIL DA and inflation": "live", "Durgapur PIN codes, Wards, Assembly seats and Police stations": "durgapur", "Durgapur Steel Plant: its story and its heads": "dsphistory", "Steel prices, production and companies": "steel", "Calculators and converters": "calc" };
ok("each service's words come from the group of the list that is about it (news, live, calculators, Durgapur, DSP story, steel, vehicles)", chips.every((c) => { const svc = UTILITY_SERVICES.find((s) => s.label === c.owner); return ref.get(c.w.toLowerCase())?.group === (svc ? GROUP_OF[svc.label] : "vehicles"); }), JSON.stringify(chips.filter((c) => { const svc = UTILITY_SERVICES.find((s) => s.label === c.owner); return ref.get(c.w.toLowerCase())?.group !== (svc ? GROUP_OF[svc.label] : "vehicles"); })));
const utilityGroups = QUICK_REFERENCE.map((g) => g.id).filter((id) => id !== "records");
ok("every utility group of the 'What to type' list (calculators, vehicles, live, Durgapur, steel, DSP story, news) is represented among the words of the services", utilityGroups.every((id) => chips.some((c) => ref.get(c.w.toLowerCase())?.group === id)), utilityGroups.join());
ok("each service shows the words as a short command or a value to type (no word has a slash, which is the separator on the 'What to type' list), and no word is shown twice", chips.every((c) => !c.w.includes("/") || /^\d/.test(c.w)) && new Set(chips.map((c) => c.w.toLowerCase())).size === chips.length, chips.map((c) => c.w).filter((w, i, a) => a.indexOf(w) !== i).join());

// ---- the calculators line (moved here with the services)
const menuTitles = TOPIC_UIS.flatMap((u) => (u.form ? [u.form.menu.title] : []));
const lineText = CALCULATORS_LINE.tools.join(" ").toLowerCase();
const wordOf = (title: string) => title.toLowerCase().replace(/ \(.*$/, "").split(" ")[0];
ok("the Calculators line names the command and says Enter opens a menu", CALCULATORS_LINE.command === "calculators" && /Enter/.test(CALCULATORS_LINE.after) && /menu/.test(CALCULATORS_LINE.after));
ok("every tool of the calculators menu is named in that line (a new tool cannot be forgotten)", menuTitles.length >= 10 && menuTitles.every((m) => lineText.includes(wordOf(m))), menuTitles.filter((m) => !lineText.includes(wordOf(m))).join(" | "));

// ---- the prose that moved: the railway, steel and DA entries are short and I keep their facts
const svc = (l: string) => UTILITY_SERVICES.find((x) => x.label === l)!;
const rail = UTILITY_SERVICES.find((a) => /railway/i.test(a.label))!;
ok("the railway entry names BOTH stations as two tabs, Durgapur (DGR) and Asansol Junction (ASN), and says in brief WHY Asansol is there: trains that pass Durgapur without stopping, and trains that stop at Asansol but do not come to Durgapur, which a person at Durgapur can only take from Asansol", /Durgapur and Asansol/.test(rail.label) && /two tabs/.test(rail.detail) && /Durgapur \(DGR\)/.test(rail.detail) && /Asansol Junction \(ASN\)/.test(rail.detail) && /pass Durgapur without stopping/.test(rail.detail) && /stop at Asansol but do not come to Durgapur at all/.test(rail.detail) && /a person at Durgapur has to go to Asansol/.test(rail.detail) && /is there because/.test(rail.detail));
ok("the railway, steel and AICPI entries are short (each under 450, 300 and 350 characters) and keep their facts: the two stations and why Asansol; the Ministry's prices, DSP's capacity, the companies and the world's production; the DA, MoSPI's index and the Reserve Bank's limit",
  svc("Durgapur and Asansol railway stations").detail.length < 450 && svc("Steel prices, production and companies").detail.length < 300 && svc("AICPI, SAIL DA and inflation").detail.length < 350 && /Ministry of Steel/.test(svc("Steel prices, production and companies").detail) && /capacity/.test(svc("Steel prices, production and companies").detail) && /world/.test(svc("Steel prices, production and companies").detail) && /DA/.test(svc("AICPI, SAIL DA and inflation").detail) && /MoSPI/.test(svc("AICPI, SAIL DA and inflation").detail) && /Reserve Bank/.test(svc("AICPI, SAIL DA and inflation").detail));

// ---- Vehicles: five numbered sub-titles, each with its own words
const veh = svc("Vehicles");
ok("the Vehicles entry has five numbered sub-titles, in order: National number plate, Tyre and rim specifications, EV cars: battery and charger (AC and DC) specifications, Engine power: PS, bhp and kW, VIN (vehicle identification number), simplified", (veh.parts ?? []).map((p) => p.title).join("|") === "National number plate|Tyre and rim specifications|EV cars: battery and charger (AC and DC) specifications|Engine power: PS, bhp and kW|VIN (vehicle identification number), simplified" && veh.parts!.every((p) => p.detail.length > 80));
const power = veh.parts![3].detail;
ok("the engine-power part gives the three units (bhp, PS, kW), says an electric car is described by two numbers (the battery in kWh, the size of its tank and the range; the power in kW, the actual power of the motor or motors turning the wheels), and says makers print bhp or PS beside kW", /bhp or PS/.test(power) && /kW/.test(power) && /100 bhp/.test(power) && /battery in kWh, the size of its tank/.test(power) && /decides the range/.test(power) && /actual power of the car/.test(power) && /motor \(or motors\) turning the wheels/.test(power) && /bhp or PS beside the kW/.test(power));
ok("the number-plate part says it is the all-India BH-series plate and no longer carries the VIN; the tyre part names a tyre and a wheel marking; the EV part names kWh, kW, Blade, AC and DC, CCS2 and C-rate and points to the guide tab", /all-India Bharat BH-series plate/.test(veh.parts![0].detail) && !/VIN/.test(veh.parts![0].detail) && /205\/55 R16 91V/.test(veh.parts![1].detail) && /8Jx20/.test(veh.parts![1].detail) && ["kWh", "kW", "Blade", "AC and DC", "CCS2", "C-rate", "second tab"].every((w) => veh.parts![2].detail.includes(w)));
const vin = veh.parts![4].detail;
ok("the VIN part says what a VIN is (17 characters, on the chassis and in the papers, never I, O or Q), the three blocks (3 for country and maker, 6 for the type in the maker's own code, 8 for year, plant and serial), the year character (10th: K is 2019), and what to type", /17-character code that identifies one vehicle/.test(vin) && /chassis/.test(vin) && /papers/.test(vin) && /I, O and Q are never used/.test(vin) && /first 3 characters give the country and the maker/.test(vin) && /next 6 the type of vehicle in the maker's own code/.test(vin) && /last 8 the model year/.test(vin) && /10th character: K is 2019/.test(vin) && /serial number/.test(vin) && /vin number/.test(vin) && /MALBM51BLKM000001/.test(vin));

// ---- what the services cannot do yet
ok("the limits say train fares are approximate and saved (until 13 December 2026), that CPI and inflation are MoSPI's saved data, that nearby EV charging stations are not there yet, that the flights and trains are timetables, and that nothing typed in a calculator is saved", UTILITY_LIMITS.some((l) => /fares are approximate/i.test(l) && /13 December 2026/.test(l)) && UTILITY_LIMITS.some((l) => /MoSPI/.test(l)) && UTILITY_LIMITS.some((l) => /ev charging stations are not available yet/i.test(l)) && UTILITY_LIMITS.some((l) => /timetable, not live status/i.test(l)) && UTILITY_LIMITS.some((l) => /not saved or sent/i.test(l)));
ok("the limits call them Utility Services: any words can open one, and only the typed line goes to Gemini, never a figure entered in a service, an ID or a name", UTILITY_LIMITS.some((l) => /Any words can open a Utility Service/.test(l) && /only the typed line goes/i.test(l) && /never a figure entered in a service, an ID or a name/.test(l)));
ok("no 'Good to know' point is long: each is under 400 characters", UTILITY_LIMITS.every((l) => l.length < 400), UTILITY_LIMITS.filter((l) => l.length >= 400).map((l) => `${l.length}: ${l.slice(0, 40)}`).join(" | "));
ok("the utility tab's sample questions block (calculators, converters and live cards) is the data file's TOOLS_SECTION and is not empty", TOOLS_SECTION.questions.length > 20 && TOOLS_SECTION.id === "tools");
console.log(`utilityServices: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
