// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/markets.selftest.ts
// The sample below is HAND-MADE in the documented shape of the feed (chart.result[0].meta, timestamp, indicators.quote[0].close): it tests our reading of that shape, not the live source.
import { DateTime } from "luxon";
import { parseYahooChart, buildMarkets, movers, sessionState, INDICES, WATCHLIST, type Quote } from "./markets";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const sample = (price: number, prev: number, closes: Array<number | null>) => ({
  chart: { result: [{ meta: { symbol: "X", regularMarketPrice: price, chartPreviousClose: prev, regularMarketTime: DateTime.fromISO("2026-11-12T08:40:00Z").toSeconds(), regularMarketDayHigh: price + 50, regularMarketDayLow: prev - 30 }, timestamp: closes.map((_, i) => DateTime.fromISO("2026-11-12T03:45:00Z").toSeconds() + i * 900), indicators: { quote: [{ close: closes }] } }], error: null },
});
const inst = { symbol: "^BSESN", name: "Sensex" };

const q = parseYahooChart(sample(84250.55, 83900.1, [83950, 84000, null, 84100, 84250.55]), inst);
ok("a quote: price, previous close, change and percent to two places", !!q && q.price === 84250.55 && q.prevClose === 83900.1 && q.change === 350.45 && q.pct === 0.42, JSON.stringify(q));
ok("the day's prices for the line, with the gaps (null) left out", !!q && q.spark.length === 4 && q.spark[3] === 84250.55);
ok("the time of the last price is read as that instant", !!q && q.time === "2026-11-12T08:40:00.000Z", q?.time);
ok("a fall is negative", (parseYahooChart(sample(99, 100, [100, 99]), inst)?.pct ?? 0) === -1 && (parseYahooChart(sample(99, 100, [100, 99]), inst)?.change ?? 0) === -1);
ok("an answer without a usable price is nothing, never a guess", [null, {}, { chart: {} }, { chart: { result: [] } }, sample(0, 100, []), sample(NaN, 100, []), sample(100, 0, []), { chart: { result: [{ meta: { regularMarketPrice: 100 } }] } }].every((j) => parseYahooChart(j, inst) === null));
ok("a long day is thinned to about 40 points, ending on the last price", (() => { const closes = Array.from({ length: 200 }, (_, i) => 100 + i); const x = parseYahooChart(sample(299, 100, closes), inst); return !!x && x.spark.length <= 42 && x.spark[x.spark.length - 1] === 299; })());

const mk = (name: string, pct: number): Quote => ({ symbol: name, name, price: 100, prevClose: 100, change: pct, pct, high: null, low: null, time: "", spark: [] });
const m = movers([mk("A", 3), mk("B", -2), mk("C", 1), mk("D", -5), mk("E", 0), mk("F", 7), mk("G", -1), mk("H", 2)]);
ok("movers: the three biggest risers and the three biggest fallers, only those that moved", m.gainers.map((x) => x.name).join() === "F,A,H" && m.losers.map((x) => x.name).join() === "D,B,G");
ok("movers: a flat day has none", movers([mk("A", 0), mk("B", 0)]).gainers.length === 0 && movers([mk("A", 0)]).losers.length === 0);

const all = buildMarkets([mk("Sensex", 1), null, mk("Nifty Bank", 2)], WATCHLIST.map((w, i) => (i < 2 ? mk(w.name, i - 0.5) : null)));
ok("what could not be fetched is named, and the rest is shown", all.indices.length === 2 && all.stocks.length === 2 && all.missing.includes("Nifty 50") && all.missing.includes("Tata Steel") === false && all.missing.includes("JSW Steel") && all.missing.length === 1 + (WATCHLIST.length - 2));
let threw = false; try { buildMarkets([null, null, null], WATCHLIST.map(() => null)); } catch { threw = true; }
ok("nothing fetched at all is an error", threw);
ok("the lists: Sensex, Nifty 50, Nifty Bank; SAIL first of the watch list; symbols unique", INDICES.map((i) => i.name).join() === "Sensex,Nifty 50,Nifty Bank" && WATCHLIST[0].name === "SAIL" && new Set(WATCHLIST.map((w) => w.symbol)).size === WATCHLIST.length);

const at = (iso: string) => DateTime.fromISO(iso);
ok("session: a fresh price during trading hours on a weekday is live; the same price after 3:35 pm, or at the weekend, is the last close", sessionState("2026-11-12T08:40:00Z", at("2026-11-12T08:45:00Z")) === "live" && sessionState("2026-11-12T08:40:00Z", at("2026-11-12T10:30:00Z")) === "closed" && sessionState("2026-11-14T08:40:00Z", at("2026-11-14T08:45:00Z")) === "closed" && sessionState("2026-11-12T08:00:00Z", at("2026-11-12T08:45:00Z")) === "closed" && sessionState("", at("2026-11-12T08:45:00Z")) === "closed");

console.log(`markets selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
