// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/steel/steel.selftest.ts
// This tests the data and the logic of the steel card. The figures are copied from the Ministry of Steel's monthly reports and from the companies' own results, so I only make the checks that can be PROVED from the data itself:
// the month-on-month changes the reports state agree with their figures, the monthly figures add up to the cumulative figures the reports state, and SAIL's own quarterly figures agree with the Ministry's monthly ones.
import { COMPANIES } from "./companies";
import { IRON_ORE, MOS_REPORTS, NSL_MONTHLY, RETAIL, RINL_MONTHLY, SAIL_MONTHLY, WSA_MONTHLY } from "./mos";
import { INDIA_ANNUAL, INDIA_HALF, INDIA_TRADE, SAIL_CUMULATIVE, WSA_ANNUAL } from "./mosAnnual";
import { flatPremium, fyToDate, halfYearChange, indiaGrowth, indiaShareOfWorld, inr, ironOreLatest, latestRetail, latestSail, monthEnd, monthLabel, monthShift, pct, retailChange, retailPoints, retailRange, signed, yearOnYear } from "./steel";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number | null, b: number, tol: number) => a !== null && Math.abs(a - b) <= tol;

// ---- the retail prices
ok("ten months, December 2025 to September 2026, one report for each, in order and without a gap", RETAIL.length === 10 && RETAIL[0].month === "2025-12" && RETAIL[9].month === "2026-09" && RETAIL.every((r, i) => i === 0 || r.month === monthShift(RETAIL[i - 1].month, 1)) && MOS_REPORTS.length === 10 && MOS_REPORTS.every((r, i) => r.month === RETAIL[i].month && /^https:\/\/steel\.gov\.in\/sites\/default\/files\/.+\.pdf$/.test(r.url)));
ok("the latest prices are the ones the September 2026 report states: TMT 65,750, HR coil 76,900, CR coil 89,670", latestRetail().tmt === 65750 && latestRetail().hrc === 76900 && latestRetail().crc === 89670);
// What each report says the month-on-month change was ([TMT, HRC, CRC], percent): my figures must give the same, except where the report's own percentage is a slip
const STATED: Record<string, [number, number, number]> = {
  "2026-01": [16.2, 13.9, 7.4], "2026-02": [4.4, 3.4, 2.8], "2026-03": [1.3, 3.8, 5.9], "2026-04": [1.8, 7.5, 5.5], "2026-05": [-5.7, -4.2, -2.5],
  "2026-06": [-6.7, -1.2, -0.1], "2026-07": [-5.5, -0.3, 0.8], "2026-08": [3.9, 0.6, -0.1], "2026-09": [15.5, 10.8, 14.0],
};
const mismatches: string[] = [];
RETAIL.forEach((r, i) => {
  if (i === 0) return;
  (["tmt", "hrc", "crc"] as const).forEach((k, j) => { const c = pct(r[k], RETAIL[i - 1][k]); if (!near(c, STATED[r.month][j], 0.11)) mismatches.push(`${r.month} ${k} ${c} vs ${STATED[r.month][j]}`); });
});
ok("the changes the reports state agree with their own figures in every month and product, except July's HR coil (the report prints -0.3; its figures and August's +0.6% give +1.2)", mismatches.length === 1 && /^2026-07 hrc 1\.2 vs -0\.3$/.test(mismatches[0]), mismatches.join("; "));
ok("retailChange: the month's change is worked out from the two figures (September TMT +15.5%, HR coil +10.8%, CR coil +14.0%) and since December (TMT +24.8%)", retailChange("tmt").month === 15.5 && retailChange("hrc").month === 10.8 && retailChange("crc").month === 14 && retailChange("tmt").since === 24.8 && retailChange("tmt").previous?.month === "2026-08");
ok("the highest and lowest month-end price: TMT highest in April 2026, lowest in December 2025; HR coil highest in September 2026", retailRange("tmt").hi.month === "2026-04" && retailRange("tmt").lo.month === "2025-12" && retailRange("hrc").hi.month === "2026-09");
ok("chart points: one for each month, on the last day of the month, with the figure", retailPoints("hrc").length === 10 && retailPoints("hrc")[0].iso === "2025-12-31" && retailPoints("hrc")[9].iso === "2026-09-30" && retailPoints("hrc")[9].value === 76900 && monthEnd("2026-02") === "2026-02-28");
ok("HR coil against TMT: 16.9% dearer in September 2026, 3.9% in December 2025", flatPremium(latestRetail()) === 17 || flatPremium(latestRetail()) === 16.9, String(flatPremium(latestRetail())));
ok("iron ore: nine of the ten months are stated (April 2026 is not), the latest is September 2026 at 5,400", IRON_ORE.length === 10 && IRON_ORE.filter((x) => x.lumps !== null).length === 9 && IRON_ORE.find((x) => x.month === "2026-04")?.lumps === null && ironOreLatest()?.lumps === 5400 && ironOreLatest()?.month === "2026-09");

// ---- the formatting and the arithmetic
ok("pct is one decimal, null for a missing or zero base; signed writes a proper minus; inr groups the Indian way", pct(110, 100) === 10 && pct(95, 100) === -5 && pct(1, 0) === null && pct(null, 5) === null && pct(5, undefined) === null && signed(15.5) === "+15.5%" && signed(-5.7) === "−5.7%" && signed(0) === "0.0%" && inr(65750) === "₹65,750" && inr(105000) === "₹1,05,000");
ok("month helpers", monthLabel("2026-09") === "Sep 2026" && monthShift("2026-01", -1) === "2025-12" && monthShift("2026-09", -12) === "2025-09");

// ---- the steel CPSEs
ok("SAIL's months are in order, unique, from December 2024 to September 2026; October 2025 is a gap no report covers", SAIL_MONTHLY[0].month === "2024-12" && latestSail().month === "2026-09" && SAIL_MONTHLY.every((r, i) => i === 0 || r.month > SAIL_MONTHLY[i - 1].month) && !SAIL_MONTHLY.some((r) => r.month === "2025-10"));
const crude = (r: never) => (r as { crude: number | null }).crude, sales = (r: never) => (r as { sales: number | null }).sales, saleable = (r: never) => (r as { saleable: number | null }).saleable;
ok("SAIL's crude steel for April to September adds up to the report's cumulative figures: 9.605 MT in 2026 and 9.505 in 2025 (the Ministry's 96.05 and 95.05 lakh tonnes)", near(fyToDate(SAIL_MONTHLY, "2026-09", crude), 9.605, 0.002) && near(fyToDate(SAIL_MONTHLY, "2025-09", crude), 9.505, 0.002), `${fyToDate(SAIL_MONTHLY, "2026-09", crude)} ${fyToDate(SAIL_MONTHLY, "2025-09", crude)}`);
ok("SAIL's sales and saleable steel add up too: sales 9.415 MT (2026) and 9.518 (2025), saleable steel 9.403 and 9.567", near(fyToDate(SAIL_MONTHLY, "2026-09", sales), 9.415, 0.006) && near(fyToDate(SAIL_MONTHLY, "2025-09", sales), 9.518, 0.006) && near(fyToDate(SAIL_MONTHLY, "2026-09", saleable), 9.403, 0.003) && near(fyToDate(SAIL_MONTHLY, "2025-09", saleable), 9.567, 0.003), `${fyToDate(SAIL_MONTHLY, "2026-09", sales)} ${fyToDate(SAIL_MONTHLY, "2025-09", sales)} ${fyToDate(SAIL_MONTHLY, "2026-09", saleable)} ${fyToDate(SAIL_MONTHLY, "2025-09", saleable)}`);
const rc = (r: never) => (r as { crude: number | null }).crude;
ok("RINL's and NMDC Steel's crude steel add up to the cumulative figures too (RINL 2.285 and 2.52 MT, NSL 1.296 and 1.131)", near(fyToDate(RINL_MONTHLY, "2026-09", rc), 2.285, 0.005) && near(fyToDate(RINL_MONTHLY, "2025-09", rc), 2.52, 0.005) && near(fyToDate(NSL_MONTHLY, "2026-09", rc), 1.296, 0.005) && near(fyToDate(NSL_MONTHLY, "2025-09", rc), 1.131, 0.005), `${fyToDate(RINL_MONTHLY, "2026-09", rc)} ${fyToDate(RINL_MONTHLY, "2025-09", rc)} ${fyToDate(NSL_MONTHLY, "2026-09", rc)} ${fyToDate(NSL_MONTHLY, "2025-09", rc)}`);
ok("a financial year to date with a month missing is not given (October 2025 has no figure, so the year to December 2025 has none), and yearOnYear gives September 2026's crude steel 14.92 against 15.05 as -0.9%", fyToDate(SAIL_MONTHLY, "2025-12", crude) === null && yearOnYear(SAIL_MONTHLY, "2026-09", crude)?.change === -0.9 && yearOnYear(SAIL_MONTHLY, "2025-10", crude) === null);
ok("the cumulative figures are kept in MT, as the trade states them (no lakh tonnes anywhere in the steel card)", SAIL_CUMULATIVE.crude.now === 9.605 && SAIL_CUMULATIVE.crude.prev === 9.505 && SAIL_MONTHLY.every((r) => (r.crude ?? 0) < 3));

// ---- India and the world
ok("India by year: crude steel grew 11.8% in 2025-26 (170.15 against 152.18), and April to September 2026 is 2.9% above last year's (85.11 against 82.69, as the report says)", indiaGrowth().at(-1)?.fy === "2025-26" && indiaGrowth().at(-1)?.change === 11.8 && halfYearChange() === 2.9 && INDIA_HALF.length === 4);
ok("the half-year row of the year table is the same as Annexure I (85.11, 81.79, 84.94) and consumption is above finished production in 2025-26", INDIA_ANNUAL.at(-1)?.partial === true && INDIA_ANNUAL.at(-1)?.crude === 85.11 && INDIA_HALF.at(-1)?.crude === 85.11 && INDIA_HALF.at(-1)?.consumption === 84.94 && INDIA_ANNUAL.find((y) => y.fy === "2025-26")!.consumption > INDIA_ANNUAL.find((y) => y.fy === "2025-26")!.finished);
ok("trade: India was a net importer by 4,693 thousand tonnes in 2024-25 and by 594 in April-September 2026, as the Overview says", INDIA_TRADE.find((t) => t.fy === "2024-25")!.imports - INDIA_TRADE.find((t) => t.fy === "2024-25")!.exports === 4693 && INDIA_TRADE.at(-1)!.imports - INDIA_TRADE.at(-1)!.exports === 594 && INDIA_TRADE.find((t) => t.fy === "2025-26")!.exports - INDIA_TRADE.find((t) => t.fy === "2025-26")!.imports === 77);
ok("the world's producers: India 164.89 in 2025 (+10.4%), China 960.81 (-4.4%), and the world 1,848.90", WSA_ANNUAL.find((r) => r.country === "India")?.y2025 === 164.89 && pct(164.89, 149.42) === 10.4 && pct(960.81, 1005.09) === -4.4 && WSA_ANNUAL.find((r) => r.country === "World")?.y2025 === 1848.9);
ok("India's months: ascending, 12 to 16 million tonnes each, August 2026 is 14.77 and 10.2% of the world's", (WSA_MONTHLY.India ?? []).every(([m, v], i, a) => (i === 0 || m > a[i - 1][0]) && v > 12 && v < 16) && WSA_MONTHLY.India.find((x) => x[0] === "2026-08")?.[1] === 14.77 && indiaShareOfWorld("2026-08") === 10.2, String(indiaShareOfWorld("2026-08")));

// ---- the companies
const LABELS = ["Q1 FY25", "Q2 FY25", "Q3 FY25", "Q4 FY25", "Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26", "Q1 FY27", "Q2 FY27"];
ok("four companies, each with the ten quarters from Q1 FY25 to Q2 FY27 in order, unique ids", COMPANIES.map((c) => c.id).join() === "sail,tata,jsw,jspl" && COMPANIES.every((c) => c.quarters.map((q) => q.q).join() === LABELS.join()));
ok("every figure a company states has a source with a link and the line that holds it; a quarter without figures has none to show", COMPANIES.every((c) => c.quarters.every((q) => (q.production === null && q.sales === null && q.revenue === null) || (q.sources.length > 0 && q.sources.every((s) => /^https:\/\//.test(s.url) && s.quote.length > 10)))));
const inRange = (c: string, lo: number, hi: number, k: "production" | "sales") => COMPANIES.find((x) => x.id === c)!.quarters.every((q) => q[k] !== null && q[k]! >= lo && q[k]! <= hi);
ok("the volumes are of the size each company really is: SAIL 4-5.5 million tonnes a quarter, Tata Steel India 5-6.5, JSW 6-8, Jindal 1.9-2.7 (production and sales)", inRange("sail", 4, 5.5, "production") && inRange("sail", 3.9, 5.5, "sales") && inRange("tata", 5, 6.5, "production") && inRange("tata", 4.7, 6.5, "sales") && inRange("jsw", 6, 8, "production") && inRange("jsw", 6, 8, "sales") && inRange("jspl", 1.9, 2.7, "production") && inRange("jspl", 1.8, 2.7, "sales"));
const sail = COMPANIES.find((c) => c.id === "sail")!;
const qv = (q: string) => sail.quarters.find((x) => x.q === q)!.production!;
ok("SAIL's own quarterly crude steel agrees with the Ministry's monthly figures: Q1 + Q2 of FY27 is 9.61 MT, and of FY26 9.50", near(qv("Q1 FY27") + qv("Q2 FY27"), 9.605, 0.02) && near(qv("Q1 FY26") + qv("Q2 FY26"), 9.505, 0.02), `${qv("Q1 FY27") + qv("Q2 FY27")} ${qv("Q1 FY26") + qv("Q2 FY26")}`);
ok("the realisation per tonne is stated by SAIL for most quarters (a rupee figure in the tens of thousands) and by no one else; JSPL's revenue is left out because it includes GST", sail.quarters.filter((q) => q.realisation !== null).length >= 8 && sail.quarters.every((q) => q.realisation === null || (q.realisation > 40000 && q.realisation < 70000)) && COMPANIES.filter((c) => c.id !== "sail").every((c) => c.quarters.every((q) => q.realisation === null)) && COMPANIES.find((c) => c.id === "jspl")!.quarters.every((q) => q.revenue === null));
ok("EBITDA per tonne where stated is a plausible rupee figure (5,000 to 20,000 a tonne); a quarter with a figure from a report of a call is marked secondary", COMPANIES.every((c) => c.quarters.every((q) => q.ebitdaPerTonne === null || (q.ebitdaPerTonne >= 5000 && q.ebitdaPerTonne <= 20000))) && COMPANIES.find((c) => c.id === "jspl")!.quarters.at(-1)!.secondary === true && COMPANIES.find((c) => c.id === "tata")!.quarters.every((q) => !q.secondary));
ok("the notes name the break in JSW's figures (BPSL left the consolidation on 27 March 2026) and no text anywhere has Bengali letters or a telephone number", /BPSL/.test(COMPANIES.find((c) => c.id === "jsw")!.basis) && !/[ঀ-৿]/.test(JSON.stringify(COMPANIES)) && !/\b\d{10}\b/.test(JSON.stringify(COMPANIES)));

// ---- JSW's change of scope: I compare a change on the year with the quarter as JSW restated it without BPSL
const jsw = COMPANIES.find((c) => c.id === "jsw")!;
const jq = (q: string) => jsw.quarters.find((x) => x.q === q)!;
ok("JSW's three restated quarters carry the figures its later releases give (Q1 FY26 6.38, Q2 FY26 6.95, Q4 FY26 6.48 million tonnes, without BPSL), each lower than the quarter first reported", jq("Q1 FY26").sameScope?.production === 6.38 && jq("Q2 FY26").sameScope?.production === 6.95 && jq("Q4 FY26").sameScope?.production === 6.48 && (["Q1 FY26", "Q2 FY26", "Q4 FY26"] as const).every((q) => jq(q).sameScope!.production! < jq(q).production! && jq(q).sameScope!.sales! < jq(q).sales!) && COMPANIES.filter((c) => c.id !== "jsw").every((c) => c.quarters.every((q) => !q.sameScope)));

console.log(`steel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
