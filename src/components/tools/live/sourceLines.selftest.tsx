// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/live/sourceLines.selftest.tsx
// EVERY CARD THAT USES SOMEONE ELSE'S DATA NAMES ITS SOURCE, at the bottom, with a link: the live cards through the one SourceLine (several sources: each named and linked), the currency converter through RatesSource.
// The scans below fail when a new data card is added without one, or a route has no source to name.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { liveRoute, type LiveEnvelope } from "../../../lib/live/envelope";
import { SourceLine } from "./LivePieces";
import { RatesSource, ratesProviders } from "../../../tools/converter/RatesSource";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const env = (extra: Partial<LiveEnvelope<unknown>> = {}): LiveEnvelope<unknown> => ({ ok: true, fetchedAt: "2026-11-13T15:30:00.000Z", source: "One Source", sourceUrl: "https://one.example/", stale: false, data: {}, ...extra });
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const one = renderToStaticMarkup(<SourceLine env={env()} />);
ok("one source: 'Source:' with its name as a link in a new tab, and the time it was fetched", /Source:/.test(text(one)) && /href="https:\/\/one\.example\/"/.test(one) && /target="_blank"/.test(one) && /rel="noopener noreferrer"/.test(one) && /Fetched/.test(text(one)));
const many = renderToStaticMarkup(<SourceLine env={env({ sources: [{ name: "Paper A", url: "https://a.example/" }, { name: "Paper B", url: "https://b.example/" }, { name: "Paper C", url: "https://c.example/" }] })} />);
ok("several sources: 'Sources:' and each is named and linked to its own site (not all to the first)", /Sources:/.test(text(many)) && ["a", "b", "c"].every((x) => new RegExp(`href="https://${x}\\.example/"[^>]*>[^<]*Paper ${x.toUpperCase()}`).test(many)) && (many.match(/target="_blank"/g) ?? []).length === 3);
ok("a failed source says so, in the same line", /not answering now/.test(text(renderToStaticMarkup(<SourceLine env={env({ stale: true })} />))));

const rates = { base: "USD" as const, date: "2026-11-13", rates: { INR: 83 }, source: "European Central Bank reference rates (Frankfurter) and open.er-api.com" };
const rs = renderToStaticMarkup(<RatesSource rates={rates} />);
ok("the currency converter names both providers with links (Frankfurter for the ECB's rates, Exchange Rate API for the Gulf currencies, as its free terms ask) and the date of the rates", /Sources:/.test(text(rs)) && /frankfurter\.dev/.test(rs) && /exchangerate-api\.com/.test(rs) && /Rates By Exchange Rate API/.test(rs) && /Rates of 13 Nov 2026/.test(text(rs)) && (rs.match(/target="_blank"/g) ?? []).length === 2);
ok("only the providers that answered are named", ratesProviders({ ...rates, source: "open.er-api.com" }).length === 1 && ratesProviders({ ...rates, source: "European Central Bank reference rates (Frankfurter)" }).length === 1 && /Source:/.test(text(renderToStaticMarkup(<RatesSource rates={{ ...rates, source: "open.er-api.com" }} />))));

// the route puts the links in the answer
async function viaRoute() {
  const r1 = await (await liveRoute<{ big: boolean }>({ key: "srcline-test-1", ttlMs: 1000, source: "S", sourceUrl: "https://s.example/", sourceLinks: (d) => [{ name: "S", url: "https://s.example/" }, ...(d.big ? [{ name: "Extra", url: "https://extra.example/" }] : [])], load: async () => ({ big: true }) })).json();
  const r2 = await (await liveRoute<{ big: boolean }>({ key: "srcline-test-2", ttlMs: 1000, source: "S", sourceUrl: "https://s.example/", sourceLinks: (d) => [{ name: "S", url: "https://s.example/" }, ...(d.big ? [{ name: "Extra", url: "https://extra.example/" }] : [])], load: async () => ({ big: false }) })).json();
  const r3 = await (await liveRoute<{ big: boolean }>({ key: "srcline-test-3", ttlMs: 1000, source: "S", sourceUrl: "https://s.example/", load: async () => ({ big: false }) })).json();
  ok("a route can name its sources from what it found (the estimate's extra source only when the estimate is there), and without links the answer is as before", r1.sources?.length === 2 && r2.sources?.length === 1 && r3.sources === undefined && r3.source === "S");
}

// the scans
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk("src").filter((p) => /\.(ts|tsx)$/.test(p) && !/selftest/.test(p));
const read = (p: string) => readFileSync(p, "utf8");
const users = files.filter((p) => p.endsWith(".tsx") && /\buseLive[<(]/.test(read(p)) && !/hooks|LivePieces/.test(p));
// the fare panels use FareSource, the same source line in the fewest words ("Source: RailRadar"); either one satisfies the rule
const hasSource = (p: string) => /<SourceLine\b/.test(read(p)) || /<FareSource\b/.test(read(p));
ok("every card that asks a live route (useLive) ends with a source line (SourceLine, or the fare panels' short FareSource): " + users.map((p) => p.split("/").pop()).join(", "), users.length >= 10 && users.every(hasSource), users.filter((p) => !hasSource(p)).join());
const converter = read("src/tools/converter/ConverterCard.tsx");
ok("the currency converter shows its RatesSource", /<RatesSource\b/.test(converter) && /kind === "currency" && rates && info/.test(converter));
const routes = files.filter((p) => /app\/api\/live\/[^/]+\/route\.ts$/.test(p) && /liveRoute/.test(read(p)));
ok("every live route names its source and its link: " + routes.length + " routes", routes.length >= 9 && routes.every((p) => /\bsource:\s*\S/.test(read(p)) && /\bsourceUrl:\s*\S/.test(read(p))), routes.filter((p) => !/\bsource:\s*\S/.test(read(p)) || !/\bsourceUrl:\s*\S/.test(read(p))).join());
const multi = ["news", "sports", "gold", "fuel-trend"].map((n) => `src/app/api/live/${n}/route.ts`);
ok("the routes with several sources link each of them (news, sports, gold with its fund prices, the fuel history)", multi.every((p) => /sourceLinks:/.test(read(p))) && /Yahoo Finance/.test(read("src/app/api/live/gold/route.ts")) && /GoodReturns/.test(read("src/app/api/live/fuel-trend/route.ts")));
ok("the gold chart's note names where the fund prices come from (Yahoo Finance)", /as published by Yahoo Finance/.test(read("src/components/tools/live/GoldCard.tsx")));

viaRoute().then(() => { console.log(`sourceLines: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
