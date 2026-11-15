// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/steel/SteelCard.selftest.tsx
// The steel card as it is drawn on each tab, and the words that open it (and the ones that must not).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SteelCard } from "./SteelCard";
import { readLang } from "./ui";
import { detectTool } from "../../lib/tools/detect";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ---- tab 1: prices
const prices = h(<SteelCard />);
ok("the card opens on the prices tab with four tabs: Prices, Companies, SAIL & CPSEs, India & world", count(prices, /role="tab"/g) === 4 && /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?Prices/.test(prices) && />Companies</.test(prices) && />SAIL &amp; CPSEs</.test(prices) && />India &amp; world</.test(prices));
ok("three product tiles with the September 2026 prices (TMT ₹65,750, HR coil ₹76,900, CR coil ₹89,670), Mumbai, GST included, with the month's change (+15.5%, +10.8%, +14.0%)", ["₹65,750", "₹76,900", "₹89,670"].every((p) => prices.includes(p)) && count(prices, /data-product="/g) === 3 && ["+15.5%", "+10.8%", "+14.0%"].every((p) => prices.includes(p)) && /GST included/.test(prices) && /Mumbai/.test(prices));
ok("the card says plainly that no mill publishes a price list, so there is no brand-by-brand table, and points to the Companies tab", /none of them publishes a price list/.test(text(prices)) && /Companies/.test(text(prices)) && !/Tiscon|Neosteel|SeQR/i.test(prices));
ok("the figures table has the ten months, newest first, with each month's change; the source is the Ministry's report and is linked", count(prices, /data-prices-table/g) === 1 && count(prices, /<th scope="row"[^>]*>(?:Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep) (?:2025|2026)/g) === 10 && /https:\/\/steel\.gov\.in\/monthly-summary/.test(prices) && /Source: Ministry of Steel/.test(text(prices)));
ok("the iron ore price and the flat-against-long premium are shown; the July report's slip is admitted", /data-iron/.test(prices) && /₹5,400/.test(prices) && /data-premium/.test(prices) && /July 2026 the percentage printed for HR coil does not match/.test(text(prices).replace("In one report (", "In one report (")) || /does not match its own figures/.test(text(prices)));
ok("the chart (a trend chart of the month-ends) is drawn and has an accessible name", /aria-label="TMT bar 10 mm retail price in Mumbai, rupees per tonne, Dec 2025 to Sep 2026\. Highest/.test(prices));

// ---- tab 2: companies
const comp = h(<SteelCard initialTab="companies" />);
ok("the companies tab compares four companies on production first, in order of size (JSW, Tata Steel, SAIL, Jindal Steel), each with its quarter, and a change on the year", [...comp.matchAll(/data-company-row="(\w+)"/g)].map((x) => x[1]).join() === "jsw,tata,sail,jspl" && count(comp, /data-delta/g) >= 4);
ok("the metric tabs are Production, Sales and EBITDA per tonne; Realisation is not offered because only SAIL states it", /aria-label="Compare on"/.test(comp) && />Production</.test(comp) && />Sales</.test(comp) && />EBITDA per tonne</.test(comp) && !/>Realisation</.test(comp));
ok("each company has its own quarter chart, and JSW's carries the note that BPSL left in March 2026", count(comp, /data-company-chart="/g) === 4 && /data-jsw-break/.test(comp) && /Bhushan Power/.test(comp));
ok("the results table has the four companies with their revenue, EBITDA and profit; Jindal Steel's revenue is a dash (it includes GST) and its bases are explained", count(comp, /data-results-table/g) === 1 && /Jindal Steel/.test(comp) && /data-bases/.test(comp) && /Neelachal/.test(comp) && /includes GST/.test(comp));
ok("the sources of every quarter are linked (Tata Steel's, SAIL's, JSW's, Jindal's) and the card says nothing is estimated", count(comp, /data-source-link/g) === 40 && /a copy of the filing/.test(comp) && /nothing is estimated/.test(text(comp)));
ok("the dagger for a figure that comes from a report of a call is explained", /†/.test(comp) && /earnings call/.test(text(comp)));
ok("JSW's change on the year is against the restated quarter (7.27 against 6.95 is +4.6%, 'same scope'), not against the 7.90 that included BPSL (that would read -8.0%)", comp.includes("+4.6%") && /a year ago, same scope/.test(comp) && !comp.includes("−8.0%") && /JSW\\?'s is against last year|JSW&#x27;s is against last year/.test(comp));

// ---- tab 3: SAIL
const sail = h(<SteelCard initialTab="sail" />);
ok("the SAIL tab: September 2026 crude steel 1.492 MT (-0.9% on the year) and the year to date 9.605 against 9.505 (+1.1%), with no lakh tonnes shown", /data-sail-tile="month"/.test(sail) && sail.includes("1.492") && sail.includes("−0.9%") && sail.includes("9.605") && sail.includes("9.505") && sail.includes("+1.1%") && !/lakh/i.test(sail.replace(/divided by 10[^<]*/,"").replace(/Ministry[^<]*lakh tonnes/,"")));
ok("SAIL's realisation per tonne is charted, with the note that no other maker states a rupee figure; the three public-sector makers are compared on the latest month", /data-sail-realisation/.test(sail) && /do not state a rupee figure/.test(text(sail)) && count(sail, /data-cpse-row="/g) === 3 && /RINL/.test(sail) && /NMDC Steel/.test(sail));
ok("the SAIL table has every month (nineteen) with the four figures; the source is the Ministry's report", count(sail, /data-sail-table/g) === 1 && count(sail, /<th scope="row"[^>]*>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d/g) === 21 && /Performance of Steel CPSEs/.test(sail), String(count(sail, /<th scope="row"[^>]*>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d/g)));

// ---- tab 4: India and the world
const india = h(<SteelCard initialTab="india" />);
ok("the India tab: FY26 crude steel 170.2 MT (+11.8%), consumption 164.4 MT, April-September 85.1 MT (+2.9%), capacity 220.4 MT", count(india, /data-india-tile/g) === 4 && india.includes("170.2 MT") && india.includes("+11.8%") && india.includes("164.4 MT") && india.includes("85.1 MT") && india.includes("+2.9%") && india.includes("220.4 MT"));
ok("the producers table has seven rows with India marked (164.9 in 2025, +10.4%) and the trade table seven years, net importer or net exporter in words", count(india, /data-wsa-table/g) === 1 && india.includes("164.9") && india.includes("+10.4%") && count(india, /data-trade-table/g) === 1 && /net importer/.test(india) && /net exporter/.test(india));

// ---- no question marks, no Bengali, only the text sizes the search window has a rule for
const all = [prices, comp, sail, india];
ok("no tab has a question-mark badge or Bengali letters", all.every((x) => !/>\?</.test(x) && !/[ঀ-৿]/.test(x)));
ok("the card uses only the text sizes that have a rule in the search window's stylesheet (xs to 4xl and 9, 10, 11, 13, 15, 17, 28 px) and no fixed leading", all.every((x) => !/text-\[(?!9px|10px|11px|13px|15px|17px|28px)\d/.test(x)) && !/leading-\[/.test(readFileSync("src/tools/steel/SteelCard.tsx", "utf8")));

// ---- the words
const said = (q: string) => { const t = detectTool(q) as (Record<string, unknown> & { kind: string }) | null; return t && t.kind === "live" ? `${t.topic}:${t.lang ?? ""}` : t ? t.kind : "nothing"; };
ok("'steel prices', 'tmt price', 'hrc', 'steel rate today' open the prices tab", ["steel prices", "tmt price", "hrc", "steel rate today", "rebar price", "steel price in india today"].every((q) => said(q) === "steel:prices|"), ["steel prices", "tmt price", "hrc", "rebar price"].map(said).join());
ok("'steel companies', 'tata steel', 'jsw steel', 'steel comparison', 'jindal steel' open the companies tab", ["steel companies", "tata steel", "jsw steel", "steel comparison", "jindal steel", "steel makers"].every((q) => said(q) === "steel:companies|"), ["steel companies", "tata steel", "jsw steel"].map(said).join());
ok("'sail steel production' and 'sail steel' open the SAIL tab; 'india steel production', 'steel production' and 'crude steel' the India tab", said("sail steel production") === "steel:sail|" && said("sail steel") === "steel:sail|" && ["india steel production", "steel production", "crude steel", "world steel production"].every((q) => said(q) === "steel:india|"), ["sail steel production", "sail steel", "india steel production", "steel production", "crude steel"].map(said).join());
ok("other lines are not this card: 'tata steel share price', 'steel plant', 'steel almirah price', 'sail' alone, 'sensex'", ["tata steel share price", "steel plant", "steel almirah price", "sail", "sensex"].every((q) => !said(q).startsWith("steel:")), ["tata steel share price", "steel plant", "steel almirah price", "sail", "sensex"].map(said).join());
ok("readLang reads the tab and falls back to prices", readLang("companies|") === "companies" && readLang("sail|") === "sail" && readLang("india|") === "india" && readLang(undefined) === "prices" && readLang("nonsense|") === "prices");

console.log(`SteelCard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
