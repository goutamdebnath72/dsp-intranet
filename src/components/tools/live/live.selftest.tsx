// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/live/live.selftest.tsx
// The live cards (gold and silver, fuel, news, sports, markets): what they show from known data, that every number comes with its source, that links open in a new tab safely, and that nothing typed can reach a source.
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { ToolPanel } from "../ToolPanel";
import { TyreCard } from "@/tools/tyre/TyreCard";
import { GoldBody } from "./GoldCard";
import { FuelBody, buildRows } from "./FuelCard";
import { MarketsBody } from "./MarketsCard";
import { StoryList, ago } from "./StoryList";
import { SourceLine, LiveGate, TrendChart, stamp, niceTicks, dateTicks, spanText } from "./LivePieces";
import { parseIbja, extendHistory, parseEtfSeries } from "../../../lib/live/gold";
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
const ser = [100, 120, 90, 150, 130, 110, 140].map((v, i) => ({ label: `${i + 1} Jul`, full: `${i + 1} Jul 2026`, value: v }));
const chart = h(<TrendChart points={ser} format={(v) => `R${v}`} ariaLabel="Gold" />);
ok("the trend chart marks the highest and lowest day with date and value, and dates run along the bottom", /High R150 · 4 Jul 2026/.test(chart) && /Low R90 · 3 Jul 2026/.test(chart) && /Highest/.test(chart) && /Lowest/.test(chart) && /1 Jul/.test(chart) && /7 Jul/.test(chart) && /4 Jul/.test(chart) && /7 trading days shown/.test(chart) && /Start/.test(chart) && /R100/.test(chart) && /the latest is 40\.0% above it/.test(chart));
ok("how long ago the chart begins is said in days, weeks, months or years", spanText("2026-11-01", "2026-11-12") === "11 days" && spanText("2026-10-15", "2026-11-12") === "4 weeks" && spanText("2026-07-13", "2026-11-12") === "4 months" && spanText("2025-11-12", "2026-11-12") === "1 year" && spanText(undefined, "2026-11-12") === "");
ok("the trend has tabs for gold 24 carat, gold 22 carat and silver, the first selected, and a panel they control", /role="tablist"/.test(goldHtml) && (goldHtml.match(/role="tab"/g) ?? []).length === 3 && /id="gold-tab-gold24"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="gold-tab-gold24"/.test(goldHtml) && /role="tabpanel"/.test(goldHtml) && /Trend: |Highest/.test(goldHtml));
const ext = gold ? extendHistory(gold, parseEtfSeries(JSON.parse(fx("yahoo-goldbees-1y.json"))), parseEtfSeries(JSON.parse(fx("yahoo-silverbees-1y.json")))) : null;
const extHtml = ext ? h(<GoldBody rates={ext} />) : "";
const flags: Record<string, boolean> = { dashed: /stroke-dasharray="6 5"/.test(extHtml), legend: /estimated before/.test(extHtml), officialFrom: /IBJA official from 13 Jul 2026/.test(extHtml), areEstimates: /are estimates/.test(extHtml), fund: /Gold BeES/.test(extHtml), closeness: new RegExp(`${ext?.estimate?.gold.avgPct}% on average`).test(extHtml), start: /Start(?:<!-- -->)? · (?:1 year|\d+ months)(?:<!-- -->)? ago/.test(extHtml) && /1 year/.test(extHtml), estMark: /\(est\.\)/.test(extHtml), year: /Nov 2025/.test(extHtml) };
ok("the year's chart draws the estimated days dashed, says they are estimates, how close the method came, and where IBJA's own record begins", !!ext?.estimate && Object.values(flags).every(Boolean), JSON.stringify(flags));
ok("without estimated days the chart says IBJA's record only, with no dashed part and no legend", !/estimated before|are estimates/.test(goldHtml) && !/stroke-dasharray="6 5"/.test(goldHtml));
ok("axis values are round and dates are evenly spread (never crowded)", niceTicks(137524, 162154, 4).every((v) => v % 5000 === 0) && niceTicks(0, 10, 4).join() === "0,5,10" && niceTicks(0, 10, 8).join() === "0,2,4,6,8,10" && dateTicks(83, 6).length === 6 && dateTicks(83, 6)[0] === 0 && dateTicks(83, 6)[5] === 82 && dateTicks(3, 6).length === 3 && dateTicks(1, 6).join() === "0");
const rimHtml = panel("8Jx20");
ok("typing a wheel marking shows the rim guide at once, part by part", /How to read a wheel \(rim\) marking/.test(rimHtml) && /Rim width/.test(rimHtml) && /203\.2 mm/.test(rimHtml) && /Flange profile/.test(rimHtml) && /one-piece wheel with a drop centre/.test(rimHtml) && /Tyre fitment/.test(rimHtml) && /Vehicle clearance/.test(rimHtml) && /225–255 mm/.test(rimHtml) && /Instant/.test(rimHtml));
const tyreHtml = h(<TyreCard start="205/55 R16 91V" />);
const posTyre = tyreHtml.indexOf("Rolling circumference"), posTables = tyreHtml.indexOf("speed-symbol tables"), posRim = tyreHtml.indexOf("reading a rim marking");
ok("under the tyre reader, after the tyre's own specification and its tables, comes the wheel (rim) section, naming the wheel this tyre asks for", posTyre > 0 && posTables > posTyre && posRim > posTables && /For the tyre above/.test(tyreHtml) && /<b>16<\/b>?-inch|16-inch/.test(tyreHtml) && /Wheel marking, as stamped on the wheel/.test(tyreHtml) && /8Jx20/.test(tyreHtml) && /aria-label="Wheel \(rim\) markings"/.test(tyreHtml));
const vinHtml = panel("MALBM51BLKM000001");
ok("typing a VIN shows the reader at once: the number section by section, each part explained, then the literature", /How to read a VIN/.test(vinHtml) && /Instant/.test(vinHtml) && /Hyundai Motor India/.test(vinHtml) && /Model year/.test(vinHtml) && /2019/.test(vinHtml) && /WMI/.test(vinHtml) && /World Manufacturer Identifier/.test(vinHtml) && /Vehicle Descriptor Section/.test(vinHtml) && /Understanding the Vehicle Identification Number/.test(vinHtml) && /Why I, O and Q are never used/.test(vinHtml) && /The model-year code/.test(vinHtml) && /The check digit/.test(vinHtml) && /Show how the check digit is worked out/.test(vinHtml));
ok("a VIN with a wrong length or an O says so, and the literature is still there", (() => { const x = panel("vin MALBM51BLKMO0001"); return /never used in a VIN/.test(x) && /Understanding the Vehicle Identification Number/.test(x) && !/Model year/.test(x.split("Understanding the Vehicle")[0]); })());
ok("the reply of a route is checked before it is shown", validEnvelope(env) && !validEnvelope({ ok: false, error: "x" }) && !validEnvelope(null) && !validEnvelope({ ok: true, fetchedAt: "x", source: "y", stale: false }));

// privacy: nothing typed reaches a source
const dir = "src/components/tools/live";
const comp = readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/selftest/.test(f)).map((f) => readFileSync(`${dir}/${f}`, "utf8").replace(/\/\/.*$/gm, ""));
ok("the live cards never call the network themselves, and write nothing to storage, cookies or the log", comp.every((t) => !/fetch\(|localStorage|sessionStorage|document\.cookie|indexedDB|console\.(log|info|warn|error)|sendBeacon|XMLHttpRequest/.test(t)));
const hook = readFileSync("src/hooks/useLive.ts", "utf8").replace(/\/\/.*$/gm, "");
ok("the one fetch is a fixed route address (the news adds only its language tab), with no body and no query text", (hook.match(/fetch\(/g) ?? []).length === 1 && /fetch\(path, \{ cache: "no-store" \}\)/.test(hook) && /useLive<NewsData>\(`\/api\/live\/news\?lang=\$\{lang\}`[,)]/.test(readFileSync(`${dir}/NewsCard.tsx`, "utf8")));
const routes = ["gold", "fuel", "news", "sports", "markets", "fuel-trend", "usd-inr"].map((n) => readFileSync(`src/app/api/live/${n}/route.ts`, "utf8").replace(/\/\/.*$/gm, ""));
ok("the routes read nothing of the caller (only the news reads its language, from a fixed list) and every upstream address is fixed in the code", routes.every((t) => !/req\.json|req\.text|formData|cookies\(|headers\(\)|searchParams\.get\((?!"lang")/.test(t)) && routes[2].includes('searchParams.get("lang")') && routes.slice(0, 2).concat(routes.slice(3)).every((t) => !/request|req\b/.test(t.replace(/Request/g, ""))));
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("a live line is a tool line: the search window returns before any search or lookup", modal.indexOf("const tool = detectTool(qTrim)") < modal.indexOf("fetchEmployees(\"id\"") && /if \(tool\) \{[\s\S]{0,200}return;\s*\}/.test(modal));

// the news card: Business is the first tab and the one that opens; a line can open another tab
const tabs = (q: string) => { const x = panel(q); return { x, sel: (/role="tab"[^>]*aria-selected="true"[^>]*>([^<]*)</.exec(x) ?? [])[1] }; };
const nb = tabs("top news headlines");
ok("the news card has four tabs, Business first, and opens on Business", /aria-label="Kind and language of the news"/.test(nb.x) && nb.x.indexOf(">Business<") < nb.x.indexOf(">English<") && nb.x.indexOf(">English<") < nb.x.indexOf(">हिन्दी<") && nb.x.indexOf(">हिन्दी<") < nb.x.indexOf(">বাংলা<") && nb.sel === "Business", nb.sel);
ok("'business news' opens Business, 'english news' English, 'hindi news' Hindi", tabs("business news").sel === "Business" && tabs("english news").sel === "English" && tabs("hindi news").sel === "हिन्दी" && tabs("bengali news").sel === "বাংলা");
ok("the Business tab asks the business route address only (a fixed tab word), and says what the free headlines do and do not cover", /useLive<NewsData>\(`\/api\/live\/news\?lang=\$\{lang\}`[,)]/.test(readFileSync(`${dir}/NewsCard.tsx`, "utf8")) && /Business Standard and Financial Express are not included/.test(readFileSync(`${dir}/NewsCard.tsx`, "utf8")) && /ask for a subscription for some of its own stories/.test(readFileSync(`${dir}/NewsCard.tsx`, "utf8")));

console.log(`live selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
