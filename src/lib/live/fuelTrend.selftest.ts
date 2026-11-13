// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/fuelTrend.selftest.ts
// The Kolkata price of petrol, diesel and LPG over the last year: PPAC's daily table (read from a PDF), GoodReturns' monthly LPG table, the copy kept with the app, and the route that joins them.
// The fixtures are the real sources of 12-13 Nov 2026 (see their first lines).
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { expandChanges, inYearWindow, parseLpgKolkata, parsePpacKolkata, ppacPdfLink, seriesFromSnapshot, toChanges, TrendError, validSeries, type Snapshot } from "./fuelTrend";
import snapshot from "./fuelTrendSnapshot.json";
import { fromYearAgo } from "./yearWindow";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });
const ppacText = fx("ppac-metro-pdftext.txt");
const throws = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return e instanceof TrendError && re.test(e.message); } };

// the address of the PDF
const page = fx("ppac-page-link.html");
ok("the PDF is found on PPAC's page by its name (which carries a date and a number that change daily)", ppacPdfLink(page) === "https://ppac.gov.in/uploads/page-images/1794462819_PP_9_a_DailyPriceMSHSD_Metro_12.11.2026.pdf");
ok("a relative link on the page is made whole; an address on another host, or not https, is refused; a page without the link is an error", ppacPdfLink('<a href="/uploads/x/9_DailyPriceMSHSD_Metro_1.pdf">') === "https://ppac.gov.in/uploads/x/9_DailyPriceMSHSD_Metro_1.pdf" && throws(() => ppacPdfLink('<a href="https://evil.example/DailyPriceMSHSD_Metro_1.pdf">'), /leads away from ppac\.gov\.in/) && throws(() => ppacPdfLink('<a href="http://ppac.gov.in/DailyPriceMSHSD_Metro_1.pdf">'), /leads away/) && throws(() => ppacPdfLink("<p>nothing</p>"), /no link/));

// PPAC: Kolkata petrol and diesel, every day of the year
const p = parsePpacKolkata(ppacText, NOW);
ok("a year of days from the same date a year before today (13 Nov 2025; today is 13 Nov 2026) to the latest day of the table (12 Nov 2026), both ends in, is 365 days, petrol and diesel alike, each day once and in order", p.petrol.length === 365 && p.diesel.length === 365 && p.petrol[0].date === "2025-11-13" && p.petrol[364].date === "2026-11-12" && p.diesel[0].date === "2025-11-13" && p.petrol.every((x, i) => i === 0 || DateTime.fromISO(x.date).diff(DateTime.fromISO(p.petrol[i - 1].date), "days").days === 1));
ok("Kolkata is the fourth price of each table: petrol 105.41 a year ago and 113.51 now, diesel 92.02 and 99.82 (not Delhi's 102.12 or 95.20)", p.petrol[0].value === 105.41 && p.petrol[364].value === 113.51 && p.diesel[0].value === 92.02 && p.diesel[364].value === 99.82);
ok("the days on which Kolkata petrol changed: 1 Jan 105.45, then 15, 19, 23 and 25 May 2026 up to 113.51; diesel on the four May days", JSON.stringify(toChanges(p.petrol)) === JSON.stringify([["2025-11-13", 105.41], ["2026-01-01", 105.45], ["2026-05-15", 108.74], ["2026-05-19", 109.7], ["2026-05-23", 110.64], ["2026-05-25", 113.51]]) && JSON.stringify(toChanges(p.diesel)) === JSON.stringify([["2025-11-13", 92.02], ["2026-05-15", 95.13], ["2026-05-19", 96.07], ["2026-05-23", 97.02], ["2026-05-25", 99.82]]));
ok("the highest petrol price of the year is 113.51 and the lowest 105.41; diesel 99.82 and 92.02", Math.max(...p.petrol.map((x) => x.value)) === 113.51 && Math.min(...p.petrol.map((x) => x.value)) === 105.41 && Math.max(...p.diesel.map((x) => x.value)) === 99.82 && Math.min(...p.diesel.map((x) => x.value)) === 92.02);
const spaced = ppacText.split("\n").map((l) => l.replace(/^(\d{1,2}-[A-Za-z]{3}-\d{2})(?=\d)/, "$1   ").replace(/(\s)(\d{1,2}-[A-Za-z]{3}-\d{2})(?=\d)/, "$1$2   ")).join("\n");
ok("the text of a layout reader (spaces between the date and the price) is read the same", JSON.stringify(parsePpacKolkata(spaced, NOW)) === JSON.stringify(p));
ok("the page can be asked a few days late (the table is posted each morning) but not a week late: 19 Nov is fine, 25 Nov is out of date", parsePpacKolkata(ppacText, DateTime.fromISO("2026-11-19T08:00:00", { zone: "Asia/Kolkata" })).petrol[0].date === "2025-11-19" && throws(() => parsePpacKolkata(ppacText, DateTime.fromISO("2026-11-25T08:00:00", { zone: "Asia/Kolkata" })), /out of date/));
const edit = (starts: string, f: (l: string) => string) => ppacText.split("\n").map((l) => (l.startsWith(starts) ? f(l) : l)).join("\n");
ok("a missing day, a row whose two dates differ, a price that is not plausible, and a table that is not there are each an error, never a number",
  throws(() => parsePpacKolkata(ppacText.split("\n").filter((l) => !l.startsWith("20-Mar-26")).join("\n"), NOW), /missing 20 Mar 2026/)
  && throws(() => parsePpacKolkata(edit("5-Jan-26", (l) => l.replace(/(\s)5-Jan-26/, "$14-Jan-26")), NOW), /same date on both/)
  && throws(() => parsePpacKolkata(edit("3-Dec-25", (l) => l.replace(/(\S+\s+\S+\s+\S+\s+)(\d{2,3}\.\d{2})(\s+\d{1,2}-)/, "$1405.45$3")), NOW), /not a plausible figure/)
  && throws(() => parsePpacKolkata("Petroleum Planning & Analysis Cell", NOW), /not found/));

// LPG: GoodReturns' monthly table
const lpgText = fx("fuel-lpg-kolkata-months.txt");
const l = parseLpgKolkata(lpgText, NOW);
ok("ten months and today: Jan 2026 879, Feb 879, Mar 939 (the rise of 60), Apr, May 939, Jun 968 (the rise of 29) to Oct, and today 968 on 13 Nov 2026", l.length === 11 && JSON.stringify(l.map((x) => [x.date, x.value])) === JSON.stringify([["2026-01-01", 879], ["2026-02-01", 879], ["2026-03-01", 939], ["2026-04-01", 939], ["2026-05-01", 939], ["2026-06-01", 968], ["2026-07-01", 968], ["2026-08-01", 968], ["2026-09-01", 968], ["2026-10-01", 968], ["2026-11-13", 968]]));
ok("when the table already has the current month, today's price replaces it (no month twice)", (() => { const x = parseLpgKolkata(lpgText, DateTime.fromISO("2026-10-20T10:00:00", { zone: "Asia/Kolkata" })); return x[x.length - 1].date === "2026-10-20" && !x.some((q) => q.date === "2026-10-01") && x.length === 10; })());
ok("each month's stated change must equal its price less the month before: a column read in the wrong place is an error", throws(() => parseLpgKolkata(lpgText.replace("March 2026| ₹939.00| (+60.00)", "March 2026| ₹939.00| (+50.00)"), NOW), /does not agree with the prices/));
ok("a missing month, an implausible price, and a page without the table are each an error", throws(() => parseLpgKolkata(lpgText.replace(/April 2026\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/, ""), NOW), /one after the other/) && throws(() => parseLpgKolkata(lpgText.replace(/February 2026\| ₹879\.00/, "February 2026| ₹87900.00").replace("(+60.00)", "(+60.00)"), NOW), /plausible|does not agree/) && throws(() => parseLpgKolkata("LPG Price in Kolkata Today", NOW), /not found/));

// the copy kept with the app
const snap = snapshot as Snapshot;
ok("the saved copy says when it was saved and through which day", snap.savedOn === "2026-11-13" && snap.through === "2026-11-12");
ok("the saved copy of petrol and diesel, expanded to every day, is exactly what PPAC's table gives for the same window (from 13 Nov 2025)", JSON.stringify(fromYearAgo(seriesFromSnapshot(snap, "petrol").points, NOW)) === JSON.stringify(p.petrol) && JSON.stringify(fromYearAgo(seriesFromSnapshot(snap, "diesel").points, NOW)) === JSON.stringify(p.diesel));
ok("the saved copy of LPG is exactly what the table gives", JSON.stringify(seriesFromSnapshot(snap, "lpg").points) === JSON.stringify(l) && seriesFromSnapshot(snap, "lpg").grain === "month" && seriesFromSnapshot(snap, "petrol").grain === "day" && seriesFromSnapshot(snap, "petrol").savedOn === "2026-11-13");
ok("all three saved series are usable; a series that is empty, out of order or implausible is not", (["petrol", "diesel", "lpg"] as const).every((id) => validSeries(seriesFromSnapshot(snap, id))) && !validSeries(null) && !validSeries({ id: "lpg", grain: "month", points: [{ date: "2026-01-01", value: 879 }] }) && !validSeries({ id: "petrol", grain: "day", points: [{ date: "2026-01-02", value: 100 }, { date: "2026-01-01", value: 100 }] }) && !validSeries({ id: "petrol", grain: "day", points: [{ date: "2026-01-01", value: 100 }, { date: "2026-01-02", value: 1000 }] }));
ok("changes and days go round: only the days of a change are kept, and each day holds the last price", (() => { const ch: Array<[string, number]> = [["2026-01-01", 10], ["2026-01-04", 12]]; const d = expandChanges(ch, "2026-01-06"); return d.map((x) => x.value).join() === "10,10,10,12,12,12" && JSON.stringify(toChanges(d)) === JSON.stringify(ch) && expandChanges([], "2026-01-06").length === 0; })());

// the route
const route = readFileSync("src/app/api/live/fuel-trend/route.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok("the route reads nothing of the caller (GET takes no request) and its two sources are fixed addresses", /export async function GET\(\)/.test(route) && !/req\b|request|searchParams|cookies\(|headers\(\)/.test(route.replace(/Request/g, "")) && /const PPAC_PAGE = "https:\/\/ppac\.gov\.in\//.test(route) && /const LPG_PAGE = "https:\/\/www\.goodreturns\.in\//.test(route));
ok("the two kinds are asked separately (a failure of one does not take the other down), each falls back to the saved copy, and all three missing is an error", /Promise\.allSettled/.test(route) && (route.match(/seriesFromSnapshot/g) ?? []).length >= 3 && /if \(!petrol && !diesel && !lpgSeries\) throw/.test(route));
ok("pdf-parse is read from its lib file, kept external and included in the deployed route (or the PDF engine would be missing on the host)", /pdf-parse\/lib\/pdf-parse\.js/.test(route) && /"pdf-parse",/.test(readFileSync("next.config.js", "utf8")) && /"\/api\/live\/fuel-trend": \["\.\/node_modules\/pdf-parse\/\*\*\/\*"\]/.test(readFileSync("next.config.js", "utf8")));

// THE ONE-YEAR WINDOW: from the same date a year before today to today
{
  const w = inYearWindow({ id: "petrol", grain: "day", points: p.petrol }, NOW);
  ok("petrol is carried on to today: the table ends on 12 Nov 2026, so the chart ends on 13 Nov 2026 with that day's price (a fuel price stays until it is changed), and says from which day it was carried", w.carriedFrom === "2026-11-12" && w.series.points.length === 366 && w.series.points[0].date === "2025-11-13" && w.series.points[365].date === "2026-11-13" && w.series.points[365].value === 113.51);
  const already = inYearWindow({ id: "petrol", grain: "day", points: p.petrol }, DateTime.fromISO("2026-11-12T20:00:00", { zone: "Asia/Kolkata" }));
  ok("a record that already ends today is not carried", already.carriedFrom === null && already.series.points[already.series.points.length - 1].date === "2026-11-12");
  // the copy kept with the app begins earlier than the window: it is cut at the anniversary, the price in force that day first
  const saved = seriesFromSnapshot(snapshot as Snapshot, "petrol");
  const cut = inYearWindow(saved, NOW);
  ok("the saved copy is cut at the same date a year back (13 Nov 2025) and carried to today, whatever its own first day", cut.series.points[0].date === "2025-11-13" && cut.series.points[cut.series.points.length - 1].date === "2026-11-13" && cut.series.points.length === 366);
  const lpgPts = [{ date: "2026-01-01", value: 900 }, { date: "2026-11-13", value: 1000 }];
  ok("LPG (monthly, ten months at the source) is left as it is: the source cannot give a year", inYearWindow({ id: "lpg", grain: "month", points: lpgPts }, NOW).series.points === lpgPts);
}

console.log(`fuelTrend selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
