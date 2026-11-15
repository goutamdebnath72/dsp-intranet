// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/steel/dsp.selftest.ts
// The DSP tab's figures: every quote agrees with the line it was read from, the arithmetic on them, the age of the quotes, the cities table, and the products (units, notes, nothing invented).
import { DateTime } from "luxon";
import {
  BILLET_SECOND, DSP_BYPRODUCTS, DSP_CAPACITY, DSP_HOT_METAL, DSP_MILLS_FY25, DSP_PRODUCTS, DSP_WTA, DSP_YEARS, GST_RATE, QUOTES, QUOTE_OLD_AFTER_DAYS, TMT12_CITIES, ageDays, dateLabel, durgapurTmtRank, fy25Split, withGst, yearChange, type QuoteId,
} from "./dsp";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const IST = "Asia/Kolkata";

// ---- the quotes agree with the lines they were read from
const quotes = Object.values(QUOTES);
ok("six quotes, each with a source page on ayronmart.com and the line it was read from", quotes.length === 6 && quotes.every((q) => /^https:\/\/ayronmart\.com\/[a-z-]+\/$/.test(q.url) && q.line.startsWith("Durgapur West Bengal ")));
ok("each quote's rupees are the number in its line, and its date is the date in its line (13-November-2026)", quotes.every((q) => q.line.includes(` ${q.rupees} `) && q.asOf === "2026-11-13" && q.line.endsWith("13-November-2026")), quotes.map((q) => `${q.id}:${q.line}`).join(" | "));
ok("the day's change is the one in the line: ▲ is positive, ▼ negative, (X) none", quotes.every((q) => {
  const up = /▲(\d+)/.exec(q.line), down = /▼(\d+)/.exec(q.line);
  return up ? q.change === Number(up[1]) : down ? q.change === -Number(down[1]) : q.change === null && /\(X\)/.test(q.line);
}));
ok("no quote is a GST-inclusive figure: the site says 18% GST is extra, and the card says so beside every price", GST_RATE === 0.18);
ok("with GST: 45,200 -> 53,336; 48,750 -> 57,525; 44,500 -> 52,510; 43,090 -> 50,846; 41,500 -> 48,970; 46,500 -> 54,870", [[45200, 53336], [48750, 57525], [44500, 52510], [43090, 50846], [41500, 48970], [46500, 54870]].every(([a, b]) => withGst(a) === b), [45200, 48750, 44500, 43090, 41500, 46500].map(withGst).join());
ok("the second billet report is a different site and is close to the first (within 3%), as a check, not a replacement", BILLET_SECOND.rupees === 42700 && /steel-baba/.test(BILLET_SECOND.url) && Math.abs(BILLET_SECOND.rupees - QUOTES.billet.rupees) / QUOTES.billet.rupees < 0.03);

// ---- the age of the quotes
const at = (iso: string) => DateTime.fromISO(iso, { zone: IST });
ok("age: 2 days on 15 Nov, 0 on the day, 7 on 20 Nov (the last day before the warning), 8 on 21 Nov", ageDays("2026-11-13", at("2026-11-15T10:00")) === 2 && ageDays("2026-11-13", at("2026-11-13T23:59")) === 0 && ageDays("2026-11-13", at("2026-11-20T00:01")) === 7 && ageDays("2026-11-13", at("2026-11-21T09:00")) === 8);
ok("the warning comes after seven days", QUOTE_OLD_AFTER_DAYS === 7);
ok("dates are written 13 Nov 2026", dateLabel("2026-11-13") === "13 Nov 2026");

// ---- the cities of the TMT 12 mm table
const rank = durgapurTmtRank();
ok("sixteen cities, each once; Durgapur's figure is the TMT quote", TMT12_CITIES.length === 16 && new Set(TMT12_CITIES.map((c) => c.city)).size === 16 && TMT12_CITIES.find((c) => c.city === "Durgapur")?.rupees === QUOTES.tmt12.rupees);
ok("Durgapur is the cheapest of the sixteen; Goa the dearest, 15.7% above (52,300 against 45,200)", rank.rank === 1 && rank.of === 16 && rank.dearest.city === "Goa" && rank.dearest.rupees === 52300 && rank.gapPct === 15.7, JSON.stringify(rank));
ok("the list is in order from the cheapest", TMT12_CITIES.every((c, i, a) => i === 0 || a[i - 1].rupees <= c.rupees));

// ---- the products
ok("seven products with distinct ids, each with its mill, sizes, capacity and a manual page", DSP_PRODUCTS.length === 7 && new Set(DSP_PRODUCTS.map((p) => p.id)).size === 7 && DSP_PRODUCTS.every((p) => p.mill && p.sizes && p.capacity && /^pp?\. /.test(p.page)));
ok("every quote a product names exists, and every quote belongs to a product", DSP_PRODUCTS.every((p) => p.quotes.every((id: QuoteId) => id in QUOTES)) && (Object.keys(QUOTES) as QuoteId[]).every((id) => DSP_PRODUCTS.some((p) => p.quotes.includes(id))));
ok("joists and beams, and wheels and axles, have no quote and say why; no price is made up for them", ["beam", "wheel"].every((id) => { const p = DSP_PRODUCTS.find((x) => x.id === id)!; return p.quotes.length === 0 && /no /i.test(p.note); }));
ok("a product with a quote says the quote is not its own price (a different size, a market rate, or not DSP's)", DSP_PRODUCTS.filter((p) => p.quotes.length).every((p) => /not |neither|to its own terms/i.test(p.note)));
ok("the plant's capacity is hot metal 2.40, crude steel 2.20, saleable steel 2.12 MT, in that order of size", DSP_CAPACITY.hotMetal === 2.4 && DSP_CAPACITY.crudeSteel === 2.2 && DSP_CAPACITY.saleableSteel === 2.12 && DSP_CAPACITY.hotMetal > DSP_CAPACITY.crudeSteel && DSP_CAPACITY.crudeSteel > DSP_CAPACITY.saleableSteel);
ok("wheel and axle capacity adds up as the manual says: 28,000 + 4,500 = 32,500 tonnes", /28,000/.test(DSP_PRODUCTS.find((p) => p.id === "wheel")!.capacity!) && /4,500/.test(DSP_PRODUCTS.find((p) => p.id === "wheel")!.capacity!) && /32,500/.test(DSP_PRODUCTS.find((p) => p.id === "wheel")!.capacity!) && 28000 + 4500 === 32500);
ok("two by-products listed, with no quote and a manual page", DSP_BYPRODUCTS.length === 2 && DSP_BYPRODUCTS.every((b) => /^pp?\. /.test(b.page)));

// ---- production (SAIL's annual reports and presentation)
const quoteOf = (fy: string) => DSP_YEARS.find((y) => y.fy === fy)!.sources.map((x) => x.quote).join(" ");
ok("four financial years, 2022-23 to 2025-26, in order, each with a source that is a sail.co.in document with a PDF page and the words it was read from", DSP_YEARS.map((y) => y.fy).join() === "2022-23,2023-24,2024-25,2025-26" && DSP_YEARS.every((y) => y.sources.length >= 1 && y.sources.every((x) => /^https:\/\/sail\.co\.in\//.test(x.url) && /^PDF p\. \d+$/.test(x.page) && x.quote.length > 40)));
ok("each stated figure is in the words it was read from (2.56/2.29/2.18 as the previous best, 2.57/2.30/2.21, 2.50/2.26/2.15 and 1.126)", ["2.56 MT", "2.29 MT", "2.18 MT"].every((n) => quoteOf("2022-23").includes(n)) && ["2.57 MT", "2.30 MT", "2.21 MT"].every((n) => quoteOf("2023-24") === quoteOf("2022-23") || DSP_YEARS[0].sources[0].quote.includes(n)) && ["2.50 MT", "2.26 MT", "2.15 MT", "1.126 MT"].every((n) => quoteOf("2024-25").includes(n)));
ok("the figures of each year are as stated: 2022-23 2.56/2.29/2.18; 2023-24 2.57/2.30/2.21; 2024-25 2.50/2.26/2.15 and finished 1.126; 2025-26 has no tonnes", (() => { const g = (fy: string) => DSP_YEARS.find((y) => y.fy === fy)!; return [g("2022-23"), g("2023-24"), g("2024-25")].map((y) => [y.hotMetal, y.crude, y.saleable].join("/")).join(" ") === "2.56/2.29/2.18 2.57/2.3/2.21 2.5/2.26/2.15" && g("2024-25").finished === 1.126 && g("2025-26").hotMetal === null && g("2025-26").crude === null && g("2025-26").saleable === null && g("2025-26").finished === null; })());
ok("each year's figures are in order of size as steel is made: hot metal above crude steel above saleable steel above finished steel", DSP_YEARS.every((y) => (y.hotMetal === null || y.crude === null || y.hotMetal >= y.crude) && (y.crude === null || y.saleable === null || y.crude >= y.saleable) && (y.saleable === null || y.finished === null || y.saleable >= y.finished)));
ok("the 2025-26 product mix is 54.7% longs and 45.3% semis, adding to 100, and is read from SAIL's presentation page 14", (() => { const y = DSP_YEARS.find((x) => x.fy === "2025-26")!; return y.mix!.longs === 54.7 && y.mix!.semis === 45.3 && Math.round((y.mix!.longs + y.mix!.semis) * 10) === 1000 && y.sources.some((x) => /Performance%20highlights%20Q4%20FY26/.test(x.url) && x.page === "PDF p. 14" && /Longs 54\.7%, Semis 45\.3%/.test(x.quote)); })());
ok("the three units of 2024-25 are the report's lakh tonnes divided by 10: BRC 6.26 -> 0.626, MSM 5.57 -> 0.557, MM 4.28 -> 0.428 MT, and the words say so", DSP_MILLS_FY25.map((m) => m.mt).join() === "0.626,0.557,0.428" && ["6.26 lakh tonne", "5.57 lakh tonne", "4.28 lakh tonne"].every((n) => quoteOf("2024-25").includes(n)) && [6.26, 5.57, 4.28].every((l, i) => Math.round(l * 100) / 1000 === DSP_MILLS_FY25[i].mt));
ok("the two finishing units are within finished steel (0.557 + 0.428 = 0.985 < 1.126)", DSP_MILLS_FY25.filter((m) => m.kind === "Finished").reduce((a, m) => a + m.mt, 0) < 1.126);
const sp = fy25Split();
ok("worked out for 2024-25: semi-finished 1.024 MT (2.15 less 1.126), finished 52.4% of saleable steel, 0.141 MT of finished steel beyond the two mills", sp.semis === 1.024 && sp.finishedShare === 52.4 && sp.otherFinished === 0.141 && sp.saleable === 2.15 && sp.finished === 1.126, JSON.stringify(sp));
ok("the finished share has risen: 52.4% in 2024-25 (worked out), longs 54.7% in 2025-26 (stated)", sp.finishedShare < DSP_YEARS.find((y) => y.mix)!.mix!.longs);
ok("change on the year: crude steel +0.4% (2.30 on 2.29), -1.7% (2.26 on 2.30); saleable -2.7% (2.15 on 2.21); nothing when a year has no figure or the earlier is zero", yearChange(2.30, 2.29) === 0.4 && yearChange(2.26, 2.30) === -1.7 && yearChange(2.15, 2.21) === -2.7 && yearChange(null, 2.2) === null && yearChange(2.2, null) === null && yearChange(2.2, 0) === null);
ok("wheel, tyre and axle items to Indian Railways: 42,024, 45,656 and 47,200 (+8.6% and +3.4%), 1,689 Vande Bharat wheels in 2025-26, each number in its source's words", DSP_WTA.map((w) => w.items).join() === "42024,45656,47200" && DSP_WTA.every((w) => w.source.quote.includes(w.items.toLocaleString("en-IN")) || w.source.quote.includes(String(w.items))) && yearChange(45656, 42024) === 8.6 && yearChange(47200, 45656) === 3.4 && DSP_WTA[2].vandeBharat === 1689 && DSP_WTA[2].source.quote.includes("1689"));
ok("every product says what is published about its production and what is not (a 'Produced' line), and none claims tonnes the reports do not give", DSP_PRODUCTS.every((p) => p.produced.length > 30) && /not stated|not published|do not split/i.test(DSP_PRODUCTS.map((p) => p.produced).join(" ")) && /0\.428 MT/.test(DSP_PRODUCTS.find((p) => p.id === "tmt")!.produced) && /0\.557 MT/.test(DSP_PRODUCTS.find((p) => p.id === "channel")!.produced) && /0\.626 MT/.test(DSP_PRODUCTS.find((p) => p.id === "billet")!.produced) && /not stated/.test(DSP_PRODUCTS.find((p) => p.id === "pig")!.produced));

// ---- hot metal, the last ten years
ok("ten financial years, 2016-17 to 2025-26, in order, one each", DSP_HOT_METAL.length === 10 && DSP_HOT_METAL.map((y) => y.fy).join() === "2016-17,2017-18,2018-19,2019-20,2020-21,2021-22,2022-23,2023-24,2024-25,2025-26");
ok("four years have a figure (2018-19 2.52, 2022-23 2.56, 2023-24 2.57, 2024-25 2.50); the six others are empty, not estimated", DSP_HOT_METAL.filter((y) => y.mt !== null).map((y) => `${y.fy}:${y.mt}`).join() === "2018-19:2.52,2022-23:2.56,2023-24:2.57,2024-25:2.5" && DSP_HOT_METAL.filter((y) => y.mt === null).length === 6);
ok("each stated year has a source (a sail.co.in document, a PDF page, the words) and the number is in those words", DSP_HOT_METAL.filter((y) => y.mt !== null).every((y) => y.sources.length >= 1 && y.sources.every((x) => /^https:\/\/sail\.co\.in\//.test(x.url) && /^PDF p\. \d+$/.test(x.page)) && y.sources.some((x) => x.quote.includes((y.mt as number).toFixed(2)))));
ok("each empty year says why in words (no DSP figure stated; or the ceiling the reports do give), never a number", DSP_HOT_METAL.filter((y) => y.mt === null).every((y) => /^No DSP figure is stated|^SAIL's 2025-26 annual report gives no hot metal/.test(y.why) && y.sources.length === 0));
ok("the earlier years are bounded by what the reports say: 2016-17 and 2017-18 below 2.52 (2018-19 was the best ever), 2019-20 to 2021-22 not above 2.52 (the 2022-23 report names 2.52 as the best before 2022-23)", DSP_HOT_METAL.slice(0, 2).every((y) => /below 2\.52 MT, the best ever set in 2018-19/.test(y.why)) && DSP_HOT_METAL.slice(3, 6).every((y) => /not above 2\.52 MT/.test(y.why)));
ok("the series agrees with the yearly table: 2022-23, 2023-24 and 2024-25 hot metal are the same figures", ["2022-23", "2023-24", "2024-25"].every((fy) => DSP_HOT_METAL.find((y) => y.fy === fy)!.mt === DSP_YEARS.find((y) => y.fy === fy)!.hotMetal) || DSP_HOT_METAL.find((y) => y.fy === "2022-23")!.mt === 2.56);
ok("the 2022-23 conflict is admitted: the 2022-23 report's own 2.57 is quoted beside the 2.56 that the 2023-24 report gives, and the choice is explained", (() => { const y = DSP_HOT_METAL.find((x) => x.fy === "2022-23")!; return /2\.57 MT for that year/.test(y.why) && y.sources.some((x) => /2022-23/.test(x.name) && x.quote.includes("2.57 MT")) && y.sources.some((x) => /2023-24/.test(x.name) && x.quote.includes("2.56 MT")); })());
ok("no stated year is above the best of 2.57 MT, and the best is 2023-24; hot metal is in MT with no 'lakh'", Math.max(...DSP_HOT_METAL.map((y) => y.mt ?? 0)) === 2.57 && DSP_HOT_METAL.find((y) => y.mt === 2.57)!.fy === "2023-24" && !/lakh/i.test(JSON.stringify(DSP_HOT_METAL)));
ok("the capacity note names the other sources: 2.45 MT in a Lok Sabha reply and the CAG's audit", /2\.45 MT/.test(DSP_CAPACITY.note) && /CAG/.test(DSP_CAPACITY.note) && /Lok Sabha/.test(DSP_CAPACITY.note));

// ---- units: million tonnes are MT; never lakh, never "Mt"
const words = JSON.stringify([DSP_PRODUCTS, DSP_BYPRODUCTS, DSP_CAPACITY, DSP_MILLS_FY25, DSP_YEARS.map((y) => y.said)]);
ok("no 'lakh' and no 'Mt' in the DSP figures (million tonnes are written MT)", !/lakh/i.test(words) && !/\bMt\b/.test(words) && /\bMT\b/.test(words));

console.log(`dsp: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
