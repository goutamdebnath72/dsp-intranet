// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/live/live.selftest.tsx
// The live cards (gold and silver, fuel, news, sports, markets): what they show from known data, that every number comes with its source, that links open in a new tab safely, and that nothing typed can reach a source.
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { ToolPanel } from "../ToolPanel";
import { GoldBody } from "./GoldCard";
import { FuelBody, buildRows } from "./FuelCard";
import { MarketsBody } from "./MarketsCard";
import { StoryList, ago } from "./StoryList";
import { SourceLine, LiveGate, TrendChart, stamp } from "./LivePieces";
import { parseIbja } from "../../../lib/live/gold";
import { assemble, type City } from "../../../lib/live/fuel";
import { buildMarkets, INDICES, WATCHLIST, parseYahooChart } from "../../../lib/live/markets";
import { parseRss } from "../../../lib/live/rss";
import { validEnvelope } from "../../../lib/live/envelope";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const panel = (q: string) => h(<ToolPanel query={q} form={null} onForm={noop} />);
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");

// the panel: each topic opens its card as you type, in its own colours, with the privacy line that says what is downloaded
for (const [q, title] of [["gold rate today", "Gold and silver in India"], ["petrol diesel lpg price", "Petrol, diesel and LPG"], ["top news headlines", "Today&#x27;s top headlines"], ["sensex nifty", "Sensex, Nifty and shares"], ["cricket news india", "Sports headlines"]] as const) {
  const x = panel(q);
  ok(`"${q}" opens "${title}" with the Instant mark and a fetching state`, x.includes(title) && /Instant/.test(x) && /aria-busy="true"/.test(x) && /only public figures from the source named below are downloaded; what you typed is not sent/.test(x) && /Nothing you type here is saved anywhere/.test(x), x.slice(0, 200));
}

// gold
const gold = parseIbja(readFileSync("src/lib/live/fixtures/ibja.html", "utf8"));
const goldHtml = gold ? h(<GoldBody rates={gold} />) : "";
ok("gold: the three tiles, with per 10 g, per gram, and the change since the last close; the trend with its range", /Gold 24 carat/i.test(goldHtml) && /₹1,38,294/.test(goldHtml) && /₹1,26,677/.test(goldHtml) && /₹1,81,999/.test(goldHtml) && /per kg/.test(goldHtml) && /13,829\.40 per gram/.test(goldHtml) && /13 Jul to 11 Nov 2026/.test(goldHtml) && /before GST \(3%\) and making charges/.test(goldHtml) && /role="img"/.test(goldHtml));

// fuel
const fxs = (n: string) => readFileSync(`src/lib/live/fixtures/${n}.txt`, "utf8");
const cities = assemble(fxs("fuel-petrol"), fxs("fuel-diesel"), { Delhi: fxs("fuel-lpg-new-delhi"), Mumbai: fxs("fuel-lpg-mumbai"), Chennai: fxs("fuel-lpg-chennai"), Kolkata: fxs("fuel-lpg-kolkata") } as Record<City, string>);
const fuelHtml = h(<FuelBody cities={cities} />);
ok("fuel: one table, a column for each of the four metros, a row for petrol (E20), diesel and each cylinder, the cheapest and dearest marked", ["Delhi", "Mumbai", "Chennai", "Kolkata"].every((c) => fuelHtml.includes(`>${c}</th>`)) && /Petrol \(E20 blend\)/.test(fuelHtml) && /Diesel/.test(fuelHtml) && /Domestic 14\.2 kg/.test(fuelHtml) && /Domestic 5 kg/.test(fuelHtml) && /Commercial 19 kg/.test(fuelHtml) && /Commercial 47\.5 kg/.test(fuelHtml) && /₹102\.12/.test(fuelHtml) && /₹113\.51/.test(fuelHtml) && /text-emerald-700/.test(fuelHtml) && /text-rose-700/.test(fuelHtml));
ok("fuel: the subsidised and unsubsidised 14.2 kg cylinder side by side, the subsidy an editable figure of 300 with the warning that it can change", /the market \(unsubsidised\) price/.test(fuelHtml) && /Ujjwala beneficiary/.test(fuelHtml) && /after the subsidy of ₹300/.test(fuelHtml) && /value="300"/.test(fuelHtml) && /confirm the current figure with your distributor/.test(fuelHtml) && /General households get no subsidy/.test(fuelHtml) && /₹642\.00/.test(fuelHtml));
ok("fuel: the subsidy changes the row; nonsense or nothing means no subsidy", buildRows(cities, 500)[1].rows[1].values[0]?.price === 442 && buildRows(cities, NaN)[1].rows[1].values[0]?.price === 942 && buildRows(cities, 99999)[1].rows[1].values[0]?.price === 0);

// markets
const q = (i: { symbol: string; name: string }, price: number, prev: number) => parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev, regularMarketTime: DateTime.now().toSeconds() }, indicators: { quote: [{ close: [prev, price] }] } }] } }, i);
const mk = buildMarkets([q(INDICES[0], 84000, 83000), q(INDICES[1], 25500, 25600), null], WATCHLIST.map((w, i) => q(w, 100 + i, 100)));
const mkHtml = h(<MarketsBody data={mk} />);
ok("markets: Sensex and Nifty tiles with change, a line for the day, the watch-list movers with SAIL marked, what is missing named, and the not-advice line", /Sensex/i.test(mkHtml) && /84,000\.00/.test(mkHtml) && /Nifty 50/i.test(mkHtml) && /Top gainers/.test(mkHtml) && /Top losers|None is down/.test(mkHtml) && /SAIL/.test(mkHtml) && /Not answering just now: Nifty Bank/.test(mkHtml) && /Market data, not advice/.test(mkHtml) && /fixed list of large companies/.test(mkHtml) && /<polyline/.test(mkHtml));

// stories: a new tab, safely, only a headline and a link
const items = parseRss(fx("rss-thehindu.xml"), "The Hindu");
const storyHtml = h(<StoryList items={items} lang="en" empty="none" />);
ok("stories: the first large, the rest in rows; each link opens in a NEW TAB with noopener noreferrer; the publisher and the time are shown", (storyHtml.match(/target="_blank"/g) ?? []).length === items.length && (storyHtml.match(/rel="noopener noreferrer"/g) ?? []).length === items.length && /Read at The Hindu/.test(storyHtml) && /lang="en"/.test(storyHtml) && /https:\/\/www\.thehindu\.com\//.test(storyHtml) && !/javascript:/i.test(storyHtml));
ok("stories: an empty list says so; time is told in words", /none/.test(h(<StoryList items={[]} empty="none" />)) && ago("2026-11-12T11:55:00Z", DateTime.fromISO("2026-11-12T12:00:00Z")) === "5 min ago" && ago("2026-11-12T09:00:00Z", DateTime.fromISO("2026-11-12T12:00:00Z")) === "3 h ago" && ago("2026-11-11T09:00:00Z", DateTime.fromISO("2026-11-12T12:00:00Z")) === "yesterday" && ago("", DateTime.now()) === "");

// the shared parts
const env = { ok: true as const, fetchedAt: "2026-11-12T11:30:00.000Z", source: "IBJA", sourceUrl: "https://ibjarates.com/", stale: true, data: {} };
const src = h(<SourceLine env={env} reload={noop} loading={false} />);
ok("the source line names the source (a link in a new tab), the time in Indian time, and says when the figures are the last ones received", /IBJA/.test(src) && /target="_blank"/.test(src) && /5:00 pm, 12 Nov IST/.test(src) && /last figures received/.test(src) && stamp("2026-11-12T11:30:00.000Z") === "5:00 pm, 12 Nov");
ok("a failure is said plainly, with a retry, and no number is shown", /cannot be shown just now/.test(h(<LiveGate state="error" error="boom" reload={noop} what="Fuel prices"><b>NUMBERS</b></LiveGate>)) && !/NUMBERS/.test(h(<LiveGate state="error" error="boom" reload={noop} what="x"><b>NUMBERS</b></LiveGate>)) && /NUMBERS/.test(h(<LiveGate state="ok" error="" reload={noop} what="x"><b>NUMBERS</b></LiveGate>)));
ok("the trend chart says what it shows and refuses a single point", /role="img"/.test(h(<TrendChart points={[{ label: "a", value: 1 }, { label: "b", value: 2 }]} format={String} ariaLabel="Gold" />)) && /Not enough history/.test(h(<TrendChart points={[{ label: "a", value: 1 }]} format={String} ariaLabel="x" />)));
ok("the reply of a route is checked before it is shown", validEnvelope(env) && !validEnvelope({ ok: false, error: "x" }) && !validEnvelope(null) && !validEnvelope({ ok: true, fetchedAt: "x", source: "y", stale: false }));

// privacy: nothing typed reaches a source
const dir = "src/components/tools/live";
const comp = readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/selftest/.test(f)).map((f) => readFileSync(`${dir}/${f}`, "utf8").replace(/\/\/.*$/gm, ""));
ok("the live cards never call the network themselves, and write nothing to storage, cookies or the log", comp.every((t) => !/fetch\(|localStorage|sessionStorage|document\.cookie|indexedDB|console\.(log|info|warn|error)|sendBeacon|XMLHttpRequest/.test(t)));
const hook = readFileSync("src/hooks/useLive.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("the one fetch is a fixed route address (the news adds only its language tab), with no body and no query text", (hook.match(/fetch\(/g) ?? []).length === 1 && /fetch\(path, \{ cache: "no-store" \}\)/.test(hook) && /useLive<NewsData>\(`\/api\/live\/news\?lang=\$\{lang\}`\)/.test(readFileSync(`${dir}/NewsCard.tsx`, "utf8")));
const routes = ["gold", "fuel", "news", "sports", "markets"].map((n) => readFileSync(`src/app/api/live/${n}/route.ts`, "utf8").replace(/\/\/.*$/gm, ""));
ok("the routes read nothing of the caller (only the news reads its language, from a fixed list) and every upstream address is fixed in the code", routes.every((t) => !/req\.json|req\.text|formData|cookies\(|headers\(\)|searchParams\.get\((?!"lang")/.test(t)) && routes[2].includes('searchParams.get("lang")') && routes.slice(0, 2).concat(routes.slice(3)).every((t) => !/request|req\b/.test(t.replace(/Request/g, ""))));
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("a live line is a tool line: the search window returns before any search or lookup", modal.indexOf("const tool = detectTool(qTrim)") < modal.indexOf("fetchEmployees(\"id\"") && /if \(tool\) \{[\s\S]{0,200}return;\s*\}/.test(modal));

console.log(`live selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
