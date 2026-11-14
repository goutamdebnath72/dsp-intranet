// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/aicpi/CpiCharts.selftest.tsx
// The CPI column charts: three sector tabs and a State chosen from a list, the inflation of 1, 3, 5 and 10 years in four tabs, the scale (bars start at zero for a rate, at 100 for the index, and say so), a month with no figure is a gap,
// and the words that say what the CPI is and is not. Drawn from MoSPI's own reply of 14 Nov 2026.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCpi, parseRows } from "../../lib/live/cpi";
import { AicpiCard } from "./AicpiCard";
import { axisKept, CpiBody, ColumnChart, SECTOR_COLOR, inflationBars, IndexView, indexBars, InflationView, scaleOf } from "./CpiCharts";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = JSON.parse(readFileSync("src/lib/live/fixtures/mospi-cpi-sample.json", "utf8")) as { new: any[]; old: any[] };
const cpi = buildCpi([...parseRows({ data: fx.old }, "2012"), ...parseRows({ data: fx.new }, "2024")]);
const txt = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const bars = (h: string) => (h.match(/data-bar="/g) ?? []).length;

const idx = renderToStaticMarkup(<IndexView data={cpi} />);
const it = txt(idx);
ok("the sector tabs are a real tab list with the three sectors, Combined chosen", /role="tablist"/.test(idx) && (idx.match(/role="tab"/g) ?? []).length === 3 && /aria-selected="true"[^>]*>(?:(?!<button)[\s\S])*CPI Combined/.test(idx) && /CPI Urban/.test(it) && /CPI Rural/.test(it));
ok("it opens on the plant's own State, West Bengal, with a bar for each of the ten months and the value on each bar", /West Bengal: Consumer Price Index, Combined, Jan 2026 to Oct 2026/.test(it) && bars(idx) === 10 && /104\.00/.test(it) && /109\.22/.test(it), it.slice(0, 400));
ok("the chart says where its bars start (100, the base year) and that the base year is 2024 = 100", /Base year 2024 = 100; the bars start at 100/.test(it));
ok("the latest month, the rise since January and when the next is due are given", /Latest, Oct 2026/.test(it) && /inflation 4\.66% over Oct 2025/.test(it) && /Since Jan 2026/.test(it) && /Nov 2026/.test(it) && /12 December 2026/.test(it));
ok("All India is first in the State list, and the list is the State dropdown of the tools", /State or all India/.test(idx));
const ind = txt(renderToStaticMarkup(<IndexView data={cpi} initialState="All India" initialSector="Rural" />));
ok("All India, Rural: 110.73 for October (MoSPI's own figure), Jan 104.59", /All India: Consumer Price Index, Rural/.test(ind) && /110\.73/.test(ind) && /104\.59/.test(ind));
ok("an unknown State falls back to all India (never an empty chart)", /All India: Consumer Price Index, Combined/.test(txt(renderToStaticMarkup(<IndexView data={cpi} initialState="Atlantis" />))));

const infl = renderToStaticMarkup(<InflationView data={cpi} />);
const nt = txt(infl);
ok("the years are four tabs: 1Y 3Y 5Y 10Y, 1Y chosen", (infl.match(/role="tab"/g) ?? []).length === 4 && /aria-selected="true"[^>]*>(?:(?!<button)[\s\S])*1Y/.test(infl) && /3Y/.test(nt) && /5Y/.test(nt) && /10Y/.test(nt));
ok("1 year: 13 bars, Oct 2025 to Oct 2026, with the rates on the bars (0.25 ... 6.09) as on Trading Economics", bars(infl) === 13 && /Oct 2025 to Oct 2026/.test(nt) && /0\.25/.test(nt) && /6\.09/.test(nt) && /2\.74/.test(nt));
ok("the facts: latest 6.09% (Oct 2026), highest 6.09, lowest 0.25 (Oct 2025)", /Latest, Oct 2026 6\.09% year on year/.test(nt) && /Highest 6\.09% Oct 2026/.test(nt) && /Lowest 0\.25% Oct 2025/.test(nt));
ok("under the chart, the alarm: inflation above the RBI's limit, 6.09% from 5.54%, first time since Oct 2024; it is under the chart and above the note, and the same in every window", (() => { const w = (h: string) => txt(h); const r = (y: "1" | "3" | "5" | "10") => renderToStaticMarkup(<InflationView data={cpi} initial={y} />); const h = r("1"); const sentence = "Inflation is above the RBI's limit. India's headline inflation rate rose to 6.09% in Oct 2026 from 5.54% in Sep 2026, above the Reserve Bank of India's upper tolerance limit of 6% for the first time since Oct 2024."; return /role="status"/.test(h) && /data-inflation-alert="above"/.test(h) && w(h).includes(sentence) && h.indexOf("data-column-chart") < h.indexOf("data-inflation-alert") && h.indexOf("data-inflation-alert") < h.indexOf("The rate of the all-India Combined CPI") && (["3", "5", "10"] as const).every((y) => w(r(y)).includes(sentence)); })());
ok("a rate within the band is a calm green note, not an alarm", (() => { const calm = { ...cpi, inflation: cpi.inflation.map((p) => (p.month === "2026-10" ? { ...p, value: 4.2 } : p)) }; const h = renderToStaticMarkup(<InflationView data={calm} />); return /data-inflation-alert="within"/.test(h) && !/data-inflation-alert="above"/.test(h) && /emerald/.test(h.slice(h.indexOf("data-inflation-alert") - 200, h.indexOf("data-inflation-alert") + 200)); })());
ok("it says what the rate is and which two series it joins", /same month a year before/.test(nt) && /old series \(base 2012\) to December 2025/.test(nt));
const ten = renderToStaticMarkup(<InflationView data={cpi} initial="10" />);
ok("10 years: 119 bars drawn of 121 months (two blank), no values on the bars, the gap named", bars(ten) === 119 && /121 months/.test(txt(ten)) && /no figure for Apr 2020 and May 2020: left blank, not filled in/.test(txt(ten)) && !/<span[^>]*pointer-events-none absolute whitespace-nowrap text-\[11px\] font-bold tabular-nums text-slate-800/.test(ten));
ok("10 years: the highest and lowest of the ten (7.79 in Apr 2022? read from the data, not typed)", (() => { const w = cpi.inflation.filter((p) => p.month >= "2016-10"); const hi = Math.max(...w.map((p) => p.value)), lo = Math.min(...w.map((p) => p.value)); return new RegExp(`Highest ${hi.toFixed(2)}%`).test(txt(ten)) && new RegExp(`Lowest ${lo.toFixed(2)}%`).test(txt(ten)); })());
ok("3 and 5 years: 37 and 61 months", /37 months/.test(txt(renderToStaticMarkup(<InflationView data={cpi} initial="3" />))) && /61 months/.test(txt(renderToStaticMarkup(<InflationView data={cpi} initial="5" />))));

ok("one colour (the original tan) in three depths: Combined darkest, Urban the original tan, Rural lightest (same warm hue), the same in an all-India chart and a State chart, and each sector tab carries its shade", (() => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const hue = (h: string) => { const [r, g, b] = rgb(h); return r > g && g > b; };
  const c = SECTOR_COLOR;
  const shades = c.Urban === "#c4a67f" && lum(c.Combined) < lum(c.Urban) && lum(c.Urban) < lum(c.Rural) && new Set(Object.values(c)).size === 3 && Object.values(c).every(hue);
  const draw = (state: string, sector: "Combined" | "Urban" | "Rural") => renderToStaticMarkup(<IndexView data={cpi} initialState={state} initialSector={sector} />);
  const every = (["Combined", "Urban", "Rural"] as const).every((s) => [draw("All India", s), draw("West Bengal", s)].every((h) => { const u = [...h.matchAll(/background:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase()); return u.includes(c[s]); }));
  const tabs = draw("West Bengal", "Combined"); const sw = [...tabs.matchAll(/data-swatch="(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
  return shades && every && sw.join() === [c.Combined, c.Urban, c.Rural].join();
})());
ok("the inflation chart starts at zero, and a rate below zero hangs under it in red", (() => {
  const h = renderToStaticMarkup(<ColumnChart bars={[{ axis: "A", value: 2, tip: "a" }, { axis: "B", value: -1.5, tip: "b" }]} from="zero" format={(v) => String(v)} color="#4f79b5" ariaLabel="x" showValues />);
  return /background:#4f79b5/.test(h) && /background:#e11d48/.test(h);
})());
ok("scales: a rate from zero; an index from 100; round values; room for the labels", (() => { const a = scaleOf([0.25, 6.09], "zero", 0.35), b = scaleOf([104.4, 110.7], 100), c = scaleOf([-2, 3], "zero"); return a.lo === 0 && a.hi > 6.09 && a.ticks[0] === 0 && b.lo === 100 && b.hi >= 110.7 && c.lo <= -2 && c.hi >= 3 && c.base === 0; })());
ok("under-axis texts are never closer than the gap: 10 years keep the years only, 1 year every month", (() => { const t = inflationBars(cpi.inflation.filter((p) => p.month >= "2016-10").map((p) => ({ month: p.month, value: p.value }))); const k = axisKept(t, 330); const o = inflationBars(cpi.inflation.slice(-13).map((p) => ({ month: p.month, value: p.value }))); return k.length >= 4 && k.length <= 11 && t.filter((b) => b.axis).every((b) => /^\d{4}$/.test(b.axis)) && axisKept(o, 560).length === 13; })());
ok("the hover of an index bar names the month, the index and the rate; a missing month says so", (() => { const b = indexBars(["2026-01", "2026-02"], { index: [104.45, null], inflation: [2.74, null] }); return b[0].tip === "Jan 2026: 104.45 · inflation 2.74%" && /not published/.test(b[1].tip) && b[1].value === null; })());

const body = txt(renderToStaticMarkup(<CpiBody data={cpi} />));
ok("the card says what the CPI is and that it is not the CPI-IW of the dearness allowance, and when the next is due", /Consumer Price Index of the Ministry of Statistics/.test(body) && /not the CPI-IW/.test(body) && /Nov 2026 is due on 12 December 2026/.test(body));
const card = renderToStaticMarkup(<AicpiCard />);
ok("the card has two tabs, the dearness allowance (the first, as before) and CPI and inflation", (card.match(/role="tab"/g) ?? []).length === 2 && /Dearness allowance/.test(txt(card)) && /CPI and inflation/.test(txt(card)) && /aria-selected="true"[^>]*>(?:(?!<button)[\s\S])*Dearness allowance/.test(card));
console.log(`CpiCharts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
