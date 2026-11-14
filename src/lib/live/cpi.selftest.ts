// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/cpi.selftest.ts
// The consumer price index of MoSPI: replies are checked (only the "General" rows, plausible figures), the answer is built from saved rows with nothing added, the inflation of the old and new series joins at
// December 2025 / January 2026, the windows of 1, 3, 5, 10 years, and the days MoSPI releases. The sample is MoSPI's own reply of 14 Nov 2026 (all India, West Bengal, Kerala for 2026; all India Combined 2016 to 2025).
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { askAll, askNew, askNewMonths, askOld, buildCpi, dueDay, inflationAlert, inflationWindow, latestDue, monthsBetween, parseRows, type CpiRow } from "./cpi";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = JSON.parse(readFileSync("src/lib/live/fixtures/mospi-cpi-sample.json", "utf8")) as { new: any[]; old: any[] };
const newRows = parseRows({ data: fx.new, statusCode: true }, "2024");
const oldRows = parseRows({ data: fx.old, statusCode: true }, "2012");
const IST = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });

ok("the new series reads: 3 States x 3 sectors x 10 months", newRows.length === 90, String(newRows.length));
ok("the old series reads: all India Combined, 120 months", oldRows.length === 120 && oldRows.every((r) => r.state === "All India" && r.sector === "Combined"), String(oldRows.length));
ok("the figures are MoSPI's own (all India October 2026: Combined 110.05 (6.09%), Urban 109.22, Rural 110.73)", (() => { const g = (s: string) => newRows.find((r) => r.month === "2026-10" && r.state === "All India" && r.sector === s); return g("Combined")?.index === 110.05 && g("Combined")?.inflation === 6.09 && g("Urban")?.index === 109.22 && g("Rural")?.index === 110.73; })());
ok("a reply that is not an answer, or that has no General rows, is an error", (() => { let a = 0; for (const j of [null, "x", {}, { data: "x" }, { data: [{ division: "Food and beverages", sector: "Combined", state: "All India", year: "2026", month: "May", index: "110", base_year: "2024" }] }]) { try { const r = parseRows(j, "2024"); if (j && typeof j === "object" && Array.isArray((j as any).data)) { if (r.length === 0) a++; } } catch { a++; } } return a === 5; })());
ok("a row with an implausible index or rate, an unknown sector or month is dropped", (() => { const base = { division: "CPI (General)", group: null, base_year: "2024", sector: "Combined", state: "All India", year: "2026", month: "May", index: "110", inflation: "3" }; const bad = [{ ...base, index: "5" }, { ...base, inflation: "900" }, { ...base, sector: "Mixed" }, { ...base, month: "Mayy" }, { ...base, state: "" }]; return parseRows({ data: [base, ...bad] }, "2024").length === 1; })());
ok("the old series' rows carry the base under the other spelling (baseyear) and are read", oldRows.length > 0 && oldRows.every((r) => r.base === "2012"));

const cpi = buildCpi([...oldRows, ...newRows]);
ok("the latest month and the months of the chart (Jan to Oct 2026)", cpi.latest === "2026-10" && cpi.months.length === 10 && cpi.months[0] === "2026-01" && cpi.months[9] === "2026-10");
ok("all India is the headline, the States are the others, in order, and All India is not one of them", cpi.states.map((s) => s.name).join() === "Kerala,West Bengal");
ok("West Bengal Urban follows MoSPI month by month (Jan 103.93 ... Oct 108.33)", (() => { const s = cpi.states.find((x) => x.name === "West Bengal")!.sectors.Urban; return s.index[0] === 103.93 && s.index[9] === 108.33 && s.inflation[9] === 4.13; })());
ok("the all-India tabs hold the three sectors", cpi.india.Rural.index[9] === 110.73 && cpi.india.Urban.index[9] === 109.22 && cpi.india.Combined.index[0] === 104.45);
ok("the inflation series joins the old and the new: December 2025 1.33 (base 2012) then January 2026 2.74 (base 2024)", (() => { const m = (x: string) => cpi.inflation.find((p) => p.month === x); return m("2025-12")?.value === 1.33 && m("2025-12")?.base === "2012" && m("2026-01")?.value === 2.74 && m("2026-01")?.base === "2024" && m("2025-10")?.value === 0.25 && m("2026-10")?.value === 6.09; })());
ok("the inflation series is in order from January 2016 to October 2026, and the two months MoSPI has no figure for (April and May 2020) are absent, not made up", cpi.inflation.length === 128 && !cpi.inflation.some((p) => p.month === "2020-04" || p.month === "2020-05") && cpi.inflation[0].month === "2016-01" && cpi.inflation.every((p, i, a) => i === 0 || p.month > a[i - 1].month));
ok("the next month and the day its index is due", cpi.next.month === "Nov 2026" && cpi.next.day === "12 December 2026", JSON.stringify(cpi.next));
ok("nothing saved of the new series is an error (never an empty chart taken for the truth)", (() => { try { buildCpi(oldRows); return false; } catch { return true; } })());
ok("a month that is missing for a State is null, not a made-up figure", (() => { const rows = newRows.filter((r) => !(r.state === "Kerala" && r.month === "2026-05")); const k = buildCpi([...oldRows, ...rows]).states.find((s) => s.name === "Kerala")!.sectors.Combined; return k.index[4] === null && k.index[3] !== null; })());
ok("only the latest twelve months are charted when more are saved", (() => { const extra: CpiRow[] = []; for (let m = 11; m <= 12; m++) extra.push({ base: "2024", month: `2026-${m}`, state: "All India", sector: "Combined", index: 111, inflation: 6 }); for (let m = 1; m <= 3; m++) extra.push({ base: "2024", month: `2027-0${m}`, state: "All India", sector: "Combined", index: 112, inflation: 6 }); const c = buildCpi([...oldRows, ...newRows, ...extra]); return c.months.length === 12 && c.months[0] === "2026-04" && c.latest === "2027-03"; })());

ok("the 1-year window runs from the same month a year back (Oct 2025 to Oct 2026: 13 points, 0.25 to 6.09)", (() => { const w = inflationWindow(cpi.inflation, 1); return w.length === 13 && w[0].month === "2025-10" && w[0].value === 0.25 && w[12].value === 6.09; })());
ok("the 3, 5 and 10-year windows hold 37, 61 and 121 months", [3, 5, 10].map((y) => inflationWindow(cpi.inflation, y as 3 | 5 | 10).length).join() === "37,61,121");
ok("10 years begin in Oct 2016, and a month without a figure stays in the window as a gap (null)", (() => { const w = inflationWindow(cpi.inflation, 10); return w[0].month === "2016-10" && w.filter((p) => p.value === null).map((p) => p.month).join() === "2020-04,2020-05"; })());
ok("a shorter record gives what it has", inflationWindow(cpi.inflation.slice(-20), 10).length === 20 && inflationWindow([], 1).length === 0);

const A = (rows: Array<[string, number]>) => inflationAlert(rows.map(([month, value]) => ({ month, value, base: "2024" as const })));
ok("the alarm for October 2026: 6.09% from 5.54%, above the Reserve Bank's upper limit of 6% for the first time since October 2024 (read from the data: Oct 2024 was 6.21%, and every month since was below 6)", (() => { const a = inflationAlert(cpi.inflation)!; return a.level === "above" && a.text === "India's headline inflation rate rose to 6.09% in Oct 2026 from 5.54% in Sep 2026, above the Reserve Bank of India's upper tolerance limit of 6% for the first time since Oct 2024." && cpi.inflation.find((p) => p.month === "2024-10")!.value > 6 && cpi.inflation.filter((p) => p.month > "2024-10" && p.month < "2026-10").every((p) => p.value <= 6); })(), JSON.stringify(inflationAlert(cpi.inflation)));
ok("above for several months in a row: says how many and since when", A([["2026-07", 5.2], ["2026-08", 6.3], ["2026-09", 6.5], ["2026-10", 6.4]])?.text.includes("rate eased to 6.40% in Oct 2026 from 6.50% in Sep 2026") === true && A([["2026-07", 5.2], ["2026-08", 6.3], ["2026-09", 6.5], ["2026-10", 6.4]])?.text.includes("now 3 months in a row above it (since Aug 2026)") === true);
ok("exactly 6% is within the band, not above it; the band is 2% to 6% with a 4% target", A([["2026-09", 5.9], ["2026-10", 6]])?.level === "within" && /tolerance band of 2% to 6% \(target 4%\)/.test(A([["2026-09", 5.9], ["2026-10", 6]])!.text));
ok("below 2% is said to be below the lower limit; the very first month of a record, and a missing month before, still read", A([["2026-09", 2.4], ["2026-10", 1.33]])?.level === "below" && A([["2026-10", 4.1]])?.text === "India's headline inflation rate was 4.10% in Oct 2026, within the Reserve Bank of India's tolerance band of 2% to 6% (target 4%)." && A([["2026-08", 4.1], ["2026-10", 4.1]])?.text.startsWith("India's headline inflation rate was 4.10% in Oct 2026") === true);
ok("above for the first time in the whole record says so, and January looks back to December", A([["2025-12", 5.0], ["2026-01", 6.5]])?.text.endsWith("for the first time in the record from Dec 2025.") === true && A([["2025-12", 5.0], ["2026-01", 6.5]])?.text.includes("from 5.00% in Dec 2025") === true && inflationAlert([]) === null);
ok("months between two months, both included", monthsBetween("2025-11", "2026-02").join() === "2025-11,2025-12,2026-01,2026-02" && monthsBetween("2026-03", "2026-02").length === 0);
ok("MoSPI releases the 12th at 4 pm: before it the month before last is the latest due, after it the last month", latestDue(IST("2026-11-14T10:00")) === "2026-10" && latestDue(IST("2026-11-12T10:00")) === "2026-09" && latestDue(IST("2026-11-12T16:30")) === "2026-10" && latestDue(IST("2026-11-01T09:00")) === "2026-09" && latestDue(IST("2027-01-05T09:00")) === "2026-11" && latestDue(IST("2027-01-20T09:00")) === "2026-12");
ok("the day the index of a month is due", dueDay("2026-10") === "12 November 2026" && dueDay("2026-12") === "12 January 2027", dueDay("2026-12"));

// the asking: pages, months by year, everything
const calls: string[] = [];
const pageGet = (rowsFor: (u: string) => any[], total = 1) => async (url: string) => { calls.push(url); const page = Number(/page=(\d+)/.exec(url)?.[1] ?? 1); return { data: page === 1 || total > 1 ? rowsFor(url) : [], meta_data: { page, totalPages: total }, statusCode: true }; };
const gen = (n: number, month = "October") => Array.from({ length: n }, (_, i) => ({ division: "CPI (General)", group: null, base_year: "2024", sector: "Combined", state: `State ${i}`, year: "2026", month, index: "105", inflation: "3" }));
(async () => {
  const r = await askNew(2026, [9, 10], pageGet(() => gen(100), 3));
  ok("every page is asked (100 rows a page, up to the pages the reply names) with the filters", r.length === 300 && calls.length === 3 && /base_year=2024/.test(calls[0]) && /month_code=9,10/.test(calls[0]) && /division_code=0/.test(calls[0]) && /limit=100/.test(calls[0]) && /page=3/.test(calls[2]), calls.join("\n"));
  calls.length = 0;
  await askNewMonths("2026-11", "2027-02", pageGet(() => gen(3)));
  ok("months are asked a year at a time", calls.length === 2 && /year=2026&month_code=11,12/.test(calls[0]) && /year=2027&month_code=1,2/.test(calls[1]), calls.join("\n"));
  calls.length = 0;
  await askOld([2016, 2017], pageGet(() => []));
  ok("the old series is asked for the years, all India, General", calls.length === 1 && /getCPIIndex\?base_year=2012&series=Current&year=2016,2017&state_code=99&group_code=0/.test(calls[0]), calls.join("\n"));
  calls.length = 0;
  await askAll(IST("2026-11-14T10:00"), pageGet(() => []));
  ok("everything: the new months of 2026 to the latest due (October), and the ten old years", calls.length === 2 && /month_code=1,2,3,4,5,6,7,8,9,10&/.test(calls.find((c) => /getCPIData/.test(c)) ?? "") && /year=2016,2017,2018,2019,2020,2021,2022,2023,2024,2025/.test(calls.find((c) => /getCPIIndex/.test(c)) ?? ""), calls.join("\n"));
  ok("a reply that claims more than 40 pages is refused", await (async () => { try { await askNew(2026, [10], async () => ({ data: gen(1), meta_data: { totalPages: 99 }, statusCode: true })); return false; } catch { return true; } })());
  ok("a failing service is an error, not an empty answer", await (async () => { try { await askNew(2026, [10], async () => { throw new Error("down"); }); return false; } catch { return true; } })());
  console.log(`cpi: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
