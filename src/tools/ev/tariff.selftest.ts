// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/ev/tariff.selftest.ts
// What a charge costs: the official figures, the three times of day, the person's own rate, and the sums.
import { readFileSync } from "node:fs";
import { BANDS, SERVICE_CEILING, SUPPLY_RATE, TARIFF_SOURCES, chargeCost, ratePerUnit, unitPrice, usableOwnRate } from "./tariff";
import { EV_DEFAULTS, estimateCharge, isEvProblem } from "./ev";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, t = 1e-9) => Math.abs(a - b) <= t;

// the figures are the documents' (WBERC order of 20 March 2025; Ministry of Power guidelines of 17 September 2024, clause 10)
ok("West Bengal: Rs 6.00 in the peak hours, Rs 5.50 in the others", SUPPLY_RATE.peak === 6 && SUPPLY_RATE.other === 5.5);
ok("the service charge ceilings: AC 3 and 4, DC 11 and 13", SERVICE_CEILING.AC.solar === 3 && SERVICE_CEILING.AC.nonSolar === 4 && SERVICE_CEILING.DC.solar === 11 && SERVICE_CEILING.DC.nonSolar === 13);
ok("three times of day: day, evening, night", BANDS.map((b) => b.id).join() === "day,evening,night");

// the price per unit at each time (supply + service)
const price = (k: "AC" | "DC", b: "day" | "evening" | "night") => unitPrice(k, b).total;
ok("AC by day 5.50 + 3 = 8.50; evening 6.00 + 4 = 10.00; night 5.50 + 4 = 9.50", price("AC", "day") === 8.5 && price("AC", "evening") === 10 && price("AC", "night") === 9.5);
ok("DC by day 5.50 + 11 = 16.50; evening 6.00 + 13 = 19.00; night 5.50 + 13 = 18.50", price("DC", "day") === 16.5 && price("DC", "evening") === 19 && price("DC", "night") === 18.5);
ok("the peak electricity tariff goes with the evening only, the lower service charge with the day only", unitPrice("DC", "evening").supply === 6 && unitPrice("DC", "day").supply === 5.5 && unitPrice("DC", "night").supply === 5.5 && unitPrice("AC", "day").service === 3 && unitPrice("AC", "night").service === 4 && unitPrice("AC", "evening").service === 4);
ok("a fast charger is dearer than a slow one at every time of day", (["day", "evening", "night"] as const).every((b) => price("DC", b) > price("AC", b)));

// the sums, from the card's own default (40 kWh, 10% to 90%)
const ac = estimateCharge(EV_DEFAULTS, { kind: "AC", kw: 7.4 }), dc = estimateCharge(EV_DEFAULTS, { kind: "DC", kw: 60 });
if (isEvProblem(ac) || isEvProblem(dc)) throw new Error("estimate failed");
const cAc = chargeCost(ac.fromGridKwh, "AC", { band: "day" }), cDc = chargeCost(dc.fromGridKwh, "DC", { band: "day" });
ok("AC by day: 32 kWh added, 35.56 units drawn at Rs 8.50 is about Rs 302", near(ac.fromGridKwh, 32 / 0.9) && near(cAc.cost, (32 / 0.9) * 8.5) && Math.round(cAc.cost) === 302, String(cAc.cost));
ok("DC by day: 33.68 units drawn at Rs 16.50 is about Rs 556", near(dc.fromGridKwh, 32 / 0.95) && Math.round(cDc.cost) === 556, String(cDc.cost));
ok("the standard figure says its two parts", cAc.basis === "standard" && cAc.supply === 5.5 && cAc.service === 3 && cAc.rate === 8.5);
ok("the evening costs more than the day, for the same charge", chargeCost(35, "DC", { band: "evening" }).cost > chargeCost(35, "DC", { band: "day" }).cost);

// the person's own rate replaces the standard
const own = chargeCost(35.56, "AC", { band: "day", ownRate: 7 });
ok("a typed rate (a home bill, a charger's display) replaces the standard: 35.56 units at Rs 7 is Rs 248.92", own.basis === "own" && own.rate === 7 && near(own.cost, 248.92, 1e-6) && own.supply === undefined);
ok("an unusable rate (zero, negative, text, over Rs 100, not a number) is ignored: the standard figures are used", [0, -3, NaN, 101, undefined, Infinity].every((v) => chargeCost(10, "AC", { band: "day", ownRate: v as number }).basis === "standard") && usableOwnRate(100) === 100 && usableOwnRate(0.5) === 0.5);
ok("rates are written with two decimals", ratePerUnit(8.5) === "₹ 8.50" && ratePerUnit(16.5) === "₹ 16.50" && ratePerUnit(19) === "₹ 19.00");

// the sources are named, dated and complete
const src = TARIFF_SOURCES.map((s) => s.what + " " + s.source).join(" ");
ok("every figure has its source: the WBERC order of 20 March 2025 and the Ministry of Power guidelines of 17 September 2024, with the validity and the review", TARIFF_SOURCES.length === 3 && /20 March 2025/.test(src) && /17 September 2024/.test(src) && /31 March 2028/.test(src) && /annual review/.test(src) && /clause 10\(1\)/.test(src) && /clause 15\(4\)/.test(src));
const file = readFileSync("src/tools/ev/tariff.ts", "utf8");
ok("the file states what it is not: a ceiling, not a station's promise; GST and land cost excluded", /HIGHEST a station may charge/.test(file) && /GST and land cost excluded/.test(file));

console.log(`tariff selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
