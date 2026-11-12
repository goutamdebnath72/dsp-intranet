// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/gold.selftest.ts
import { readFileSync } from "node:fs";
import { parseIbja } from "./gold";

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

console.log(`gold selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
