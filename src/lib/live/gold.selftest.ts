// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/gold.selftest.ts
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { extendHistory, parseEtfSeries, parseIbja, type EtfSeries } from "./gold";

const NOW = DateTime.fromISO("2026-11-13T11:00:00", { zone: "Asia/Kolkata" });

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const page = readFileSync("src/lib/live/fixtures/ibja.html", "utf8");
const r = parseIbja(page);
ok("the page is read", !!r);
if (r) {
  ok("24 carat is 999 purity and 22 carat is 916: today's opening rates per 10 g", r.gold24Per10g === 138294 && r.gold22Per10g === 126677 && r.session === "AM");
  ok("per gram: 13,829.4 / 10 and 12,667.7 / 10", r.gold24PerGram === 13829.4 && r.gold22PerGram === 12667.7);
  ok("silver per kg and per gram", r.silverPerKg === 181999 && r.silverPerGram === 182);
  ok("the trend is IBJA's own PM rates of every trading day, oldest first, four months or so", r.history.length === 83 && r.history[0].date === "2026-07-13" && r.history[r.history.length - 1].date === "2026-11-11" && r.history.every((p, i, a) => i === 0 || p.date > a[i - 1].date) && r.rangeText === "13 Jul to 11 Nov 2026", r.rangeText);
  ok("every point has a gold 24, a gold 22 and a silver rate, the 22 carat below the 24", r.history.every((p) => p.gold24 > p.gold22 && p.gold22 > 0 && p.silver > 0));
  ok("the change is against the last PM close: gold 24 down about 1.6 percent", r.change.gold24 !== null && r.change.gold24.abs < 0 && Math.abs(r.change.gold24.pct + 1.64) < 0.1, JSON.stringify(r.change));
}
ok("a page without the rates (it changed, or it is another page) gives nothing, not wrong numbers", parseIbja("<html><body>Welcome</body></html>") === null && parseIbja("") === null && parseIbja(page.replace(/lblGold999_AM">\d+/, 'lblGold999_AM">')) === null);
ok("a PM rate, when published, replaces the AM one", (() => { const x = parseIbja(page.replace('id="lblGold999_PM"></span>', 'id="lblGold999_PM">139000</span>')); return !!x && x.gold24Per10g === 139000 && x.session === "PM"; })());
ok("a point missing from the silver chart is left out, never invented", (() => { const x = parseIbja(page.replace('&quot;13/07/2026&quot;', '&quot;13/07/2099&quot;')); return !!x && x.history.length === 82 && x.history.some((p) => p.date === "2026-07-14") ; })());

// ---- the year before IBJA's page begins ----
const etfG = parseEtfSeries(JSON.parse(readFileSync("src/lib/live/fixtures/yahoo-goldbees-1y.json", "utf8")));
const etfS = parseEtfSeries(JSON.parse(readFileSync("src/lib/live/fixtures/yahoo-silverbees-1y.json", "utf8")));
ok("the ETF record is read: about a year of daily closes, oldest first, Indian dates", !!etfG && !!etfS && etfG.dates.length > 200 && etfG.dates.every((d, i, a) => i === 0 || d > a[i - 1]) && etfG.closes.every((c) => c > 0));
ok("a record that is not an ETF chart (or too short) is refused", parseEtfSeries(null) === null && parseEtfSeries({ chart: { result: [] } }) === null && parseEtfSeries({ chart: { result: [{ timestamp: [1, 2], indicators: { quote: [{ close: [1, 2] }] } }] } }) === null);
if (r && etfG && etfS) {
  const x = extendHistory(r, etfG, etfS, undefined, NOW);
  ok("earlier days are added before IBJA's first day, all marked as estimates, and IBJA's own days are untouched and not marked", !!x.estimate && x.history.length > r.history.length + 100 && x.history.filter((p) => p.est).every((p) => p.date < r.history[0].date) && x.history.slice(-r.history.length).every((p, i) => !p.est && p.gold24 === r.history[i].gold24 && p.silver === r.history[i].silver) && x.history.every((p, i, a) => i === 0 || p.date > a[i - 1].date));
  ok("the chart BEGINS ON THE SAME DATE A YEAR BACK (13 Nov 2025 when today is 13 Nov 2026), that day's own estimate, not marked as carried", x.history[0].date === "2025-11-13" && x.history[0].est === true && x.history[0].carried === undefined && x.history[0].gold24 === 128440, JSON.stringify(x.history[0]));
  const sun = extendHistory(r, etfG, etfS, undefined, DateTime.fromISO("2026-11-15T11:00:00", { zone: "Asia/Kolkata" }));
  ok("when the date a year back is a Saturday (15 Nov 2025) the chart still begins on it, holding the figure of Friday 14 Nov, marked as carried; no point is dated before it", sun.history[0].date === "2025-11-15" && sun.history[0].carried === "2025-11-14" && sun.history.every((p) => p.date >= "2025-11-15"));
  ok("the range text begins on that date too", x.rangeText.startsWith("13 Nov 2025 to"), x.rangeText);
  ok("the estimate says how close it was on the days where both records exist: well under one percent on average", !!x.estimate && x.estimate.checkedDays >= 80 && x.estimate.gold.avgPct < 0.5 && x.estimate.silver.avgPct < 0.8 && x.estimate.gold.maxPct < 1.5 && x.estimate.silver.maxPct < 2.5, JSON.stringify(x.estimate));
  ok("the 22 carat estimate keeps IBJA's 916/999 relation and every estimated point is complete", x.history.filter((p) => p.est).every((p) => p.gold24 > p.gold22 && Math.abs(p.gold22 / p.gold24 - 0.916) < 0.002 && p.silver > 0));
  ok("the range text names the year of both ends", x.rangeText === "13 Nov 2025 to 11 Nov 2026" || /^\d+ \w{3} 2025 to \d+ \w{3} 2026$/.test(x.rangeText), x.rangeText);
  ok("today's rates and the change are those of IBJA, not of the estimate", x.gold24Per10g === r.gold24Per10g && JSON.stringify(x.change) === JSON.stringify(r.change));
  ok("without both ETF records nothing is added (the rates come back unchanged)", extendHistory(r, null, etfS) === r && extendHistory(r, etfG, null) === r);
  const wrong: EtfSeries = { dates: etfG.dates, closes: etfG.closes.map((c, i) => (i % 2 ? c * 1.3 : c * 0.8)) };
  ok("an ETF record that does not follow IBJA closely enough is not used", extendHistory(r, wrong, etfS) === r);
  const stale: EtfSeries = { dates: etfG.dates.slice(0, 100), closes: etfG.closes.slice(0, 100) };
  ok("a record that stops well before IBJA's first day (a hole would be left) is not used", extendHistory(r, stale, { dates: etfS.dates.slice(0, 100), closes: etfS.closes.slice(0, 100) }) === r);
  const sv = extendHistory(r, etfG, etfS, "2026-11-12");
  ok("when the saved copy is used the estimate says so", sv.estimate?.savedThrough === "2026-11-12" && !extendHistory(r, etfG, etfS).estimate?.savedThrough);
  const snap = JSON.parse(readFileSync("src/lib/live/etfSnapshot.json", "utf8"));
  const sg = parseEtfSeries(snap.gold), ss = parseEtfSeries(snap.silver);
  ok("the copy kept with the app is a readable year of both records, as recent as its date says, and gives an estimate", !!sg && !!ss && sg.dates[sg.dates.length - 1] >= "2026-11-10" && sg.dates[0] <= "2025-11-15" && snap.savedThrough === "2026-11-12" && !!extendHistory(r, sg, ss, snap.savedThrough).estimate);
  const short: EtfSeries = { dates: etfG.dates.filter((d) => d >= r.history[0].date), closes: etfG.closes.slice(-60) };
  ok("a record with no earlier days adds nothing", extendHistory(r, short, etfS) === r);
}

console.log(`gold selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
