// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/aicpi.selftest.ts
// The AICPI-IW record (read from the Labour Bureau's two pages, saved as they were on 13 Nov 2026) and the SAIL / CPSE dearness allowance (IDA, 2017 pay scales, revised every quarter) worked out from it: the formula is tested
// against the rates the Department of Public Enterprises announced (53.4% from 1 January 2026, 59.1% from 1 October 2026), which is what makes its constants trustworthy.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { AicpiError, announcedFor, buildAicpi, IDA_ANNOUNCED, idaAmount, idaForQuarter, idaFromAverage, idaProjected, monthsOfQuarter, parseChart, parseHome, PERCENT_PER_POINT, quarterOf, quartersOf, validAicpi } from "./aicpi";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const chart = fx("labourbureau-cpiiw-page.html"), home = fx("labourbureau-home-cpiiw.html");
const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });
const throws = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return e instanceof AicpiError && re.test(e.message); } };

const c = parseChart(chart);
ok("the chart holds twelve months, Sep 2025 to Aug 2026, with the figures the Labour Bureau shows (147.3 ... 154.4)", c.length === 12 && c[0].month === "2025-09" && c[0].value === 147.3 && c[11].month === "2026-08" && c[11].value === 154.4 && c[5].month === "2026-02" && c[5].value === 148.5);
const h = parseHome(home);
ok("the home page box holds the latest two months: Aug 2026 154.4 and Sep 2026 155.5", h.length === 2 && h[0].month === "2026-08" && h[0].value === 154.4 && h[1].month === "2026-09" && h[1].value === 155.5);
const a = buildAicpi(chart, home, NOW);
ok("the two pages are merged into the year to the latest month: 13 months, Sep 2025 to Sep 2026 (the same span as the other one-year charts: the same month a year back to the latest), the latest 155.5", a.points.length === 13 && a.points[0].month === "2025-09" && a.points[12].month === "2026-09" && a.points[12].value === 155.5 && validAicpi(a));
const only = buildAicpi(chart, null, NOW);
ok("without the home page the twelve months of the chart are still a year of readings, the latest Aug 2026", only.points.length === 12 && only.points[11].month === "2026-08");
ok("a home page that cannot be read (no box) leaves the chart as it is", buildAicpi(chart, "<html></html>", NOW).points.length === 12);

// refusals
ok("a page without the chart is an error", throws(() => buildAicpi("<html></html>", home, NOW), /no longer has the chart/));
ok("a chart whose months and figures do not match in number is an error", throws(() => buildAicpi(chart.replace("147.3,", ""), home, NOW), /twelve months with a figure each/));
ok("the two pages must agree on a month they share", throws(() => buildAicpi(chart, home.replace("154.4", "154.9"), NOW), /disagree/));
ok("a gap in the months is an error", throws(() => buildAicpi(chart.replace("'Nov -25',", ""), home, NOW), /twelve months with a figure each|one after the other/) || throws(() => buildAicpi(chart.replace("'Nov -25',", "").replace("148.2,148.2", "148.2"), home, NOW), /one after the other/));
ok("an implausible figure (15.5 for a 155.5) is an error", throws(() => buildAicpi(chart, home.replace("155.5", "15.5"), NOW), /not a plausible/));
ok("a record whose latest month is more than three months old is out of date", throws(() => buildAicpi(chart, home, DateTime.fromISO("2027-02-10T10:00:00", { zone: "Asia/Kolkata" })), /out of date/) && !throws(() => buildAicpi(chart, home, DateTime.fromISO("2026-12-31T10:00:00", { zone: "Asia/Kolkata" })), /out of date/));
ok("a record that is shorter than a year is refused", throws(() => buildAicpi(chart.replace(/labels: \[[^\]]*\]/, "labels: ['Jun -26','Jul -26','Aug -26']").replace(/data: \[[^\]]*\]/, "data: [151.9,153.2,154.4]"), null, NOW), /twelve months/));

// THE FORMULA, AGAINST THE ORDERS (see the head of aicpi.ts for the orders it comes from)
ok("the three months of each quarter: 1 January is September to November, 1 April December to February, 1 July March to May, 1 October June to August (the DPE order of 3 April 2020 uses December to February for 1 April)", monthsOfQuarter("2026-01-01").join() === "2025-09,2025-10,2025-11" && monthsOfQuarter("2026-04-01").join() === "2025-12,2026-01,2026-02" && monthsOfQuarter("2026-07-01").join() === "2026-03,2026-04,2026-05" && monthsOfQuarter("2026-10-01").join() === "2026-06,2026-07,2026-08" && monthsOfQuarter("2017-01-01").join() === "2016-09,2016-10,2016-11");
const q1 = idaForQuarter(a.points, "2026-01-01"), q2 = idaForQuarter(a.points, "2026-04-01"), q3 = idaForQuarter(a.points, "2026-07-01"), q4 = idaForQuarter(a.points, "2026-10-01");
ok("1 January 2026: September to November 2025 average 147.73, x 2.88 = 425.47, 53.42% over the link point 277.33, so 53.4%: the rate in the DPE order (circulated by Coal India)", !!q1 && q1.average === 147.73 && q1.linked === 425.47 && q1.exact === 53.42 && q1.rate === 53.4 && announcedFor("2026-01-01")?.rate === 53.4, JSON.stringify(q1));
ok("1 October 2026: June to August 2026 average 153.17, x 2.88 = 441.12, increase 163.79, 59.06%, so 59.1%: the rate in DPE's OM of 27 Oct 2026, and it is ROUNDED to the nearest tenth (cut it would be 59.0)", !!q4 && q4.average === 153.17 && q4.linked === 441.12 && q4.increase === 163.79 && q4.exact === 59.06 && q4.rate === 59.1 && announcedFor("2026-10-01")?.rate === 59.1, JSON.stringify(q4));
ok("1 April 2026 gives 54.1% and 1 July 2026 gives 55.7% (they agree with the rates a third party reports: not orders, so not listed as announced)", !!q2 && !!q3 && q2.rate === 54.1 && q3.rate === 55.7 && announcedFor("2026-04-01") === null && announcedFor("2026-07-01") === null, JSON.stringify([q2, q3]));
ok("the DPE order of 3 April 2020 worked the same way: an average of 329.33 over the link point 277.33 is 52, 18.7% (52 / 277.33 = 18.75%, printed 18.7)", (() => { const r = (329.33 - 277.33) / 277.33 * 100; return r > 18.74 && r < 18.76; })());
ok("the DPE order of 3 August 2017: the average of September to November 2016 is the link point 277.33, so the DA that day is zero", idaFromAverage(277.33 / 2.88).rate === 0 && idaFromAverage(277.33 / 2.88).exact === 0);
ok("one point of the index (base 2016) adds 1.04 percentage points of DA (2.88 / 277.33 x 100)", PERCENT_PER_POINT === 1.04);
ok("a quarter whose months are not all in the record is not worked out (October 2025 needs June to August 2025)", idaForQuarter(a.points, "2025-10-01") === null);
const pj = idaProjected(a.points, "2027-01-01");
ok("1 January 2027 is a projection: September 2026 is published (1 of 3), October and November stand at 155.5, so the average is 155.50, x 2.88 = 447.84, 61.48%, 61.5%", !!pj && pj.known === 1 && pj.average === 155.5 && pj.linked === 447.84 && pj.exact === 61.48 && pj.rate === 61.5, JSON.stringify(pj));
ok("a projection with nothing published (a quarter far ahead) is not made, and a quarter fully published is not a projection (known 3)", idaProjected(a.points, "2027-07-01") === null && idaProjected(a.points, "2026-10-01")?.known === 3 && idaProjected([], "2027-01-01") === null);
const qs = quartersOf(a.points, NOW);
ok("the quarters of the record on 13 Nov 2026: 1 Jan, 1 Apr, 1 Jul and 1 Oct 2026, then 1 Jan 2027 (projected); 53.4, 54.1, 55.7, 59.1, 61.5", qs.map((x) => x.startsOn).join() === "2026-01-01,2026-04-01,2026-07-01,2026-10-01,2027-01-01" && qs.map((x) => x.rate).join() === "53.4,54.1,55.7,59.1,61.5" && qs[4].known === 1 && qs[3].known === 3, JSON.stringify(qs.map((x) => [x.startsOn, x.rate, x.known])));
ok("the quarter a date is in: 13 Nov 2026 is in the quarter from 1 October (next 1 January 2027); 1 Jan and 31 Mar are in the first quarter; 1 Apr in the second", quarterOf(NOW).startsOn === "2026-10-01" && quarterOf(NOW).next === "2027-01-01" && quarterOf(DateTime.fromISO("2027-01-01T00:30:00", { zone: "Asia/Kolkata" })).startsOn === "2027-01-01" && quarterOf(DateTime.fromISO("2026-03-31T23:00:00", { zone: "Asia/Kolkata" })).startsOn === "2026-01-01" && quarterOf(DateTime.fromISO("2026-04-01T00:10:00", { zone: "Asia/Kolkata" })).startsOn === "2026-04-01");
ok("the list of announced rates holds the two orders that were read (53.4 from 1 Jan 2026, 59.1 from 1 Oct 2026)", IDA_ANNOUNCED.length === 2 && IDA_ANNOUNCED[0].rate === 53.4 && IDA_ANNOUNCED[1].rate === 59.1);
ok("the rupees of DA on a basic pay at a rate, to the nearest rupee: 50,000 at 59.1% is 29,550; 56,100 at 59.1% is 33,155.1, so 33,155; 56,150 at 59.1% is 33,184.65, so 33,185", idaAmount(50000, 59.1) === 29550 && idaAmount(56100, 59.1) === 33155 && idaAmount(56150, 59.1) === 33185 && idaAmount(0, 59.1) === 0);

console.log(`aicpi: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
