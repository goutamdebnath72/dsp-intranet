// src/tools/steel/SteelCard.tsx
//
// THE STEEL CARD: what steel costs, who makes how much, and how India and the world are doing. Five tabs.
//  1 "Prices": the retail prices of TMT bar, HR coil and CR coil in Mumbai, month by month, from the Ministry of Steel's monthly reports (the official benchmark), with the iron ore price beside them.
//  1b "DSP products": what the Durgapur Steel Plant makes to sell (its manuals: sizes, capacities) beside the Durgapur market's quotes for the same kind of steel (a trade-price site, dated, GST not included). The quotes are
//     the market's, never DSP's or SAIL's own price: the tab says so. dsp.ts holds the figures and their sources.
//  2 "Companies": SAIL, Tata Steel, JSW Steel and Jindal Steel & Power quarter by quarter, from their own results: production, sales, EBITDA per tonne, and the results.
//  3 "SAIL & CPSEs": SAIL, RINL and NMDC Steel month by month (the Ministry's tables), SAIL against the same month a year earlier.
//  4 "India & world": India's crude steel, consumption and trade by year, and the biggest producers.
// There is NO price list of SAIL, Tata Steel or JSW to show: the mills sell at their own dealer rates, which differ by city, size and day, and none publishes them. The card says so, and I compare the companies by
// what they themselves report (the Companies tab). I fetch nothing here: the figures are reviewed files with their sources and dates (mos.ts, companies.ts); a figure that is not published is a dash.
"use client";

import React, { useMemo, useState } from "react";
import { ExternalLink, Factory, Info, Landmark, Scale, TrendingUp } from "lucide-react";
import { Pills } from "@/components/tools/Pills";
import { ColumnChart, type Bar } from "@/components/tools/ColumnChart";
import { TrendChart } from "@/components/tools/live/LivePieces";
import { COMPANIES, COMPANIES_READ_ON, type Company, type CompanyQuarter } from "./companies";
import { IRON_ORE, MOS_OVERVIEW, MOS_REPORTS, MOS_SITE, NSL_MONTHLY, RETAIL, RINL_MONTHLY, SAIL_MONTHLY, WSA_MONTHLY } from "./mos";
import {
  BILLET_SECOND, DSP_BYPRODUCTS, DSP_CAPACITY, DSP_HOT_METAL, DSP_MANUAL, DSP_MILLS_FY25, DSP_PRODUCTS, DSP_WTA, DSP_YEARS, MSM_CE_MARK, QUOTES, QUOTES_READ_ON, QUOTE_OLD_AFTER_DAYS, QUOTE_SOURCE, TICKER_NOTE, TMT12_CITIES, ageDays, dateLabel, durgapurTmtRank, fy25Split, withGst, yearChange, type ProdSource, type Quote,
} from "./dsp";
import { INDIA_ANNUAL, INDIA_FACTS, INDIA_HALF, INDIA_TRADE, SAIL_CUMULATIVE, WSA_ANNUAL } from "./mosAnnual";
import {
  PRODUCTS, f1, f2, f3, flatPremium, fyToDate, halfYearChange, indiaGrowth, indiaShareOfWorld, inr, ironOreLatest, latestRetail, latestSail, monthLabel, monthShift, monthShort, pct, retailChange, retailPoints, retailRange, signed, yearOnYear,
  type Product,
} from "./steel";

export type SteelTab = "prices" | "dsp" | "companies" | "sail" | "india";
const TABS: Array<{ id: SteelTab; text: string }> = [
  { id: "prices", text: "Prices" },
  { id: "dsp", text: "DSP products" },
  { id: "companies", text: "Companies" },
  { id: "sail", text: "SAIL & CPSEs" },
  { id: "india", text: "India & world" },
];
const PILL = "from-sky-600 to-blue-700 shadow-sky-600/30";
/** I give each DSP product one colour, written as whole class names so that Tailwind finds them: the strip and price tile (grad), the mill chip (chip), the card's edge (border) and the small labels (label). */
const DSP_ACCENT: Record<string, { grad: string; chip: string; border: string; label: string }> = {
  tmt: { grad: "from-orange-500 to-amber-600", chip: "bg-orange-100 text-orange-800", border: "border-orange-200", label: "text-orange-700" },
  channel: { grad: "from-blue-600 to-indigo-600", chip: "bg-blue-100 text-blue-800", border: "border-blue-200", label: "text-blue-700" },
  angle: { grad: "from-violet-600 to-purple-600", chip: "bg-violet-100 text-violet-800", border: "border-violet-200", label: "text-violet-700" },
  beam: { grad: "from-teal-600 to-emerald-600", chip: "bg-teal-100 text-teal-800", border: "border-teal-200", label: "text-teal-700" },
  billet: { grad: "from-rose-500 to-pink-600", chip: "bg-rose-100 text-rose-800", border: "border-rose-200", label: "text-rose-700" },
  wheel: { grad: "from-sky-600 to-cyan-600", chip: "bg-sky-100 text-sky-800", border: "border-sky-200", label: "text-sky-700" },
  pig: { grad: "from-amber-500 to-yellow-600", chip: "bg-amber-100 text-amber-900", border: "border-amber-200", label: "text-amber-800" },
};
const DSP_CAPACITY_TILES = [
  { name: "Hot metal", grad: "from-orange-500 to-amber-600", v: DSP_CAPACITY.hotMetal },
  { name: "Crude steel", grad: "from-blue-600 to-indigo-600", v: DSP_CAPACITY.crudeSteel },
  { name: "Saleable steel", grad: "from-teal-600 to-emerald-600", v: DSP_CAPACITY.saleableSteel },
] as const;

/* ---------- small pieces ---------- */

/** I show a percentage change as a chip: green for up, red for down, grey for none, and "no figure" when it cannot be worked out. */
function Delta({ p, label }: { p: number | null; label?: string }) {
  if (p === null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">no figure</span>;
  const tone = p > 0 ? "bg-emerald-100 text-emerald-800" : p < 0 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tone}`} data-delta>{signed(p)}{label && <span className="font-semibold opacity-70">{label}</span>}</span>;
}

function Band({ icon, tone, children }: { icon: React.ReactNode; tone: "sky" | "amber"; children: React.ReactNode }) {
  const c = tone === "sky" ? "border-sky-100 bg-sky-50/70 text-slate-700 [&>svg]:text-sky-700" : "border-amber-200 bg-amber-50 text-amber-900";
  return <p className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed ${c}`}>{icon}<span>{children}</span></p>;
}

/** A few of the documents are read from a copy of the company's filing (on a data site or an exchange's mirror), so I say so beside the link. */
function hostNote(url: string): React.ReactNode {
  const host = (/^https?:\/\/([^/]+)/.exec(url)?.[1] ?? "").replace(/^www\./, "");
  const copy = /tijorifinance|links\.sgx/.test(host);
  return copy ? <span className="text-[11px] font-normal text-slate-500"> (a copy of the filing, {host})</span> : null;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={11} aria-hidden="true" /></a>;
}

/** Bars for every month from the first to the last of a series; I leave a month with no figure as a gap. */
function monthBars(rows: ReadonlyArray<{ month: string; v: number | null }>, unit: string, digits = 2): Bar[] {
  if (!rows.length) return [];
  const by = new Map(rows.map((r) => [r.month, r.v]));
  const out: Bar[] = [];
  for (let m = rows[0].month; m <= rows[rows.length - 1].month; m = monthShift(m, 1)) {
    const v = by.get(m) ?? null;
    out.push({ tip: v === null ? `${monthLabel(m)}: no figure published` : `${monthLabel(m)}: ${v.toFixed(digits)} ${unit}`, axis: m.endsWith("-01") ? `Jan ${m.slice(0, 4)}` : monthShort(m), value: v });
  }
  return out;
}

/* ---------- tab 1: prices ---------- */

function PricesTab() {
  const [id, setId] = useState<Product>("tmt");
  const last = latestRetail();
  const meta = PRODUCTS.find((p) => p.id === id)!;
  const points = useMemo(() => retailPoints(id), [id]);
  const range = retailRange(id);
  const iron = ironOreLatest();
  const first = RETAIL[0];
  return (
    <div role="tabpanel" id="steel-panel-prices" aria-labelledby="steel-tabs" className="space-y-3">
      <Band icon={<Scale size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>Retail steel prices in Mumbai</strong>, at the end of each month, from the Ministry of Steel&apos;s monthly economic report: the official benchmark for what steel costs the buyer (rupees per tonne, GST included). SAIL, Tata Steel,
        JSW and the other makers sell through dealers at rates that differ by city, size and day, and none of them publishes a price list, so a brand-by-brand price table cannot be honestly shown: for a rate, ask a dealer or the mill&apos;s
        sales office. The <strong>Companies</strong> tab compares the makers by what each reports.
      </Band>
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Choose a steel product">
        {PRODUCTS.map((p) => {
          const ch = retailChange(p.id), on = p.id === id;
          return (
            <button key={p.id} type="button" onClick={() => setId(p.id)} aria-pressed={on} data-product={p.id}
              className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-left text-white shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${p.gradient} ${on ? "ring-2 ring-slate-900/30 ring-offset-2" : "opacity-85 hover:opacity-100"}`}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
              <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">{p.name} · {p.spec}</div>
              <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{inr(last[p.id])}</div>
              <div className="relative text-xs font-semibold opacity-90">per tonne, GST included · {monthLabel(last.month)}</div>
              <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
                <Delta p={ch.month} label="on the month" />
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{meta.name} ({meta.spec}): {meta.use}. Press a product to chart it.</p>
      <div className="rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Month-end retail price, Mumbai · {monthLabel(RETAIL[0].month)} to {monthLabel(last.month)}</span>
        </div>
        <TrendChart key={id} points={points} color={meta.color} format={inr} latestLabel="Latest month-end" pointsText={`${points.length} month-ends`} ariaLabel={`${meta.name} ${meta.spec} retail price in Mumbai, rupees per tonne, ${monthLabel(first.month)} to ${monthLabel(last.month)}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Highest and lowest</div>
          <div className="text-sm font-bold text-slate-900">{inr(range.hi[id])} <span className="font-semibold text-slate-500">({monthLabel(range.hi.month)})</span></div>
          <div className="text-sm font-bold text-slate-900">{inr(range.lo[id])} <span className="font-semibold text-slate-500">({monthLabel(range.lo.month)})</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5" data-premium>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Flat against long</div>
          <div className="text-sm font-bold text-slate-900">HR coil is {Math.abs(flatPremium(last)).toFixed(1)}% {flatPremium(last) >= 0 ? "dearer" : "cheaper"} than TMT bar</div>
          <div className="text-xs text-slate-600">in {monthLabel(last.month)}; it was {flatPremium(first).toFixed(1)}% in {monthLabel(first.month)}</div>
        </div>
        {iron && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5" data-iron>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Iron ore (the raw material)</div>
            <div className="text-sm font-bold text-slate-900">{inr(iron.lumps)} per tonne</div>
            <div className="text-xs text-slate-600">NMDC lumps (6-40 mm, Fe 65.5%), {monthLabel(iron.month)}; {IRON_ORE.filter((x) => x.lumps !== null).length} months in the record</div>
          </div>
        )}
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">The figures, month by month</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm" data-prices-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-3">Month-end</th>{PRODUCTS.map((p) => <th key={p.id} className="py-1 pr-3 text-right">{p.name} {p.spec}</th>)}</tr></thead>
            <tbody>
              {[...RETAIL].reverse().map((r, i, a) => (
                <tr key={r.month} className="border-t border-slate-100">
                  <th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{monthLabel(r.month)}</th>
                  {PRODUCTS.map((p) => { const prev = a[i + 1]; const ch = prev ? pct(r[p.id], prev[p.id]) : null; return <td key={p.id} className="py-1 pr-3 text-right tabular-nums text-slate-800">{inr(r[p.id])} {ch !== null && <span className={`text-[11px] font-bold ${ch > 0 ? "text-emerald-700" : ch < 0 ? "text-rose-700" : "text-slate-500"}`}>{signed(ch)}</span>}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs leading-relaxed text-slate-500">
        Source: Ministry of Steel, <ExtLink href={MOS_SITE}>Monthly Economic Report</ExtLink> for each month ({MOS_REPORTS.length} reports, December 2025 to {monthLabel(MOS_REPORTS[MOS_REPORTS.length - 1].month)}); the month-on-month changes are worked out from two published figures.
        These are the prices at the end of the month for one market (Mumbai): other cities, and the mills&apos; own prices to large buyers, differ. In one report (July 2026) the percentage printed for HR coil does not match its own figures; the figures are shown.
      </p>
    </div>
  );
}

/* ---------- tab: DSP products ---------- */

/** I show the day's change a trade site prints beside a quote, in rupees: ▲ green, ▼ red, nothing when it prints none. */
function RupeeMove({ change }: { change: number | null }) {
  if (change === null) return null;
  const tone = change > 0 ? "bg-emerald-100 text-emerald-800" : change < 0 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tone}`} data-move>{change > 0 ? "▲" : change < 0 ? "▼" : ""} {inr(Math.abs(change))}<span className="ml-1 font-semibold opacity-70">on the day</span></span>;
}

/** Here I show what DSP produced: by year, the three units of 2024-25, the product mix of 2025-26 and the wheels and axles. Every figure is as SAIL's reports state it, and I put a dash where they do not. */
function DspProduction() {
  const years = [...DSP_YEARS].reverse();
  const split = fy25Split();
  const mix = DSP_YEARS.find((y) => y.mix)!.mix!;
  const bars: Bar[] = DSP_YEARS.map((y) => ({ tip: y.crude === null ? `${y.fy}: no figure stated` : `${y.fy}: ${f2(y.crude)} MT of crude steel`, axis: y.fy, value: y.crude }));
  const cell = (v: number | null, d = 2) => v === null ? <span className="text-slate-400" aria-label="not stated">—</span> : f2(Number(v.toFixed(d)));
  const wta = [...DSP_WTA].reverse();
  const hmBars: Bar[] = DSP_HOT_METAL.map((y) => ({ tip: y.mt === null ? `${y.fy}: not stated for DSP` : `${y.fy}: ${f2(y.mt)} MT of hot metal`, axis: y.fy, value: y.mt }));
  const hmStated = DSP_HOT_METAL.filter((y) => y.mt !== null).length;
  const hmBest = DSP_HOT_METAL.reduce((a, y) => (y.mt !== null && (a.mt === null || y.mt > a.mt) ? y : a), DSP_HOT_METAL[0]);
  const hmBest0 = DSP_HOT_METAL.find((y) => y.fy === "2018-19")!;
  return (
    <section data-dsp-production className="space-y-3" aria-label="What the plant produced">
      <Band icon={<TrendingUp size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>What the plant produced</strong>, as SAIL&apos;s own annual reports and results presentation state it (million tonnes, MT). Where a report gives no figure there is a dash: nothing is estimated. The reports do not give TMT bars, structurals,
        blooms, billets, wheels or axles in tonnes, nor any month-by-month figure, so those are not here; a figure marked <em>worked out</em> is arithmetic on two stated figures.
      </Band>
      <div className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50/80 to-white p-4 shadow-sm" data-dsp-hotmetal>
        <h4 className="text-sm font-extrabold text-slate-900">DSP hot metal, the last ten years <span className="font-semibold text-slate-500">(MT, financial years)</span></h4>
        <p className="mt-1 text-xs text-slate-600" data-dsp-hotmetal-count>{hmStated} of the {DSP_HOT_METAL.length} years have a figure that SAIL&apos;s reports state for DSP; the other {DSP_HOT_METAL.length - hmStated} are left empty, not estimated. The best was {f2(hmBest.mt!)} MT in {hmBest.fy}.</p>
        <div className="mt-2"><ColumnChart bars={hmBars} from="zero" format={(v) => String(Math.round(v * 100) / 100)} valueFormat={(v) => f2(v)} color="#ea580c" ariaLabel={`DSP hot metal by financial year, Million Tonnes, 2016-17 to 2025-26: ${DSP_HOT_METAL.filter((y) => y.mt !== null).map((y) => `${y.fy} ${f2(y.mt!)}`).join(", ")}; the other years are not stated`} showValues /></div>
        <p className="mt-1 text-[11px] text-slate-500">Capacity: {f2(DSP_CAPACITY.hotMetal)} MT in SAIL&apos;s manual, 2.45 MT in a Lok Sabha reply and the CAG&apos;s audit. For the empty years the reports say only that none beat the {f2(hmBest0.mt!)} MT of {hmBest0.fy} (the best ever until 2022-23).</p>
        <details className="mt-2 rounded-2xl border border-orange-100 bg-white/70 px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">Each year, and why a year is empty</summary>
          <table className="mt-2 w-full text-left text-sm" data-dsp-hotmetal-table>
            <tbody>
              {[...DSP_HOT_METAL].reverse().map((y) => (
                <tr key={y.fy} className="border-t border-orange-100 align-top"><th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{y.fy}</th><td className="py-1 pr-3 text-right tabular-nums">{y.mt === null ? <span className="text-slate-400" aria-label="not stated">—</span> : f2(y.mt)}</td><td className="py-1 text-xs text-slate-600">{y.why}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-3 shadow-sm">
        <h4 className="mb-2 text-sm font-extrabold text-slate-900">DSP by financial year <span className="font-semibold text-slate-500">(MT)</span></h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm" data-dsp-years>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-3">Year</th><th className="py-1 pr-3 text-right">Hot metal</th><th className="py-1 pr-3 text-right">Crude steel</th><th className="py-1 pr-3 text-right">Saleable steel</th><th className="py-1 pr-3 text-right">Finished steel</th><th className="py-1 text-right">Semi-finished</th></tr></thead>
            <tbody>
              {years.map((y, i) => {
                const prev = years[i + 1];
                const semis = y.fy === "2024-25" ? split.semis : null;
                return y.mix ? (
                  <tr key={y.fy} className="border-t border-slate-100"><th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{y.fy}</th><td colSpan={5} className="py-1 text-xs text-slate-600">Tonnes not stated for DSP. Highest ever finished steel; saleable steel was <strong className="text-orange-700">{mix.longs}% longs</strong> and <strong className="text-emerald-700">{mix.semis}% semi-finished</strong>.</td></tr>
                ) : (
                  <tr key={y.fy} className="border-t border-slate-100">
                    <th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{y.fy}</th>
                    <td className="py-1 pr-3 text-right tabular-nums">{cell(y.hotMetal)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{cell(y.crude)} {prev && yearChange(y.crude, prev.crude) !== null && <span className={`text-[11px] font-bold ${(yearChange(y.crude, prev.crude) ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{signed(yearChange(y.crude, prev.crude)!)}</span>}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{cell(y.saleable)} {prev && yearChange(y.saleable, prev.saleable) !== null && <span className={`text-[11px] font-bold ${(yearChange(y.saleable, prev.saleable) ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{signed(yearChange(y.saleable, prev.saleable)!)}</span>}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{y.finished === null ? cell(null) : f3(y.finished)}</td>
                    <td className="py-1 text-right tabular-nums">{semis === null ? cell(null) : <>{f2(semis)} <span className="text-[11px] font-semibold text-slate-500">worked out</span></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">2022-23 is the &ldquo;previous best&rdquo; that the 2023-24 report names. Semi-finished 2024-25 is saleable steel ({f2(split.saleable)}) less finished steel ({f3(split.finished)}): finished steel was {split.finishedShare}% of saleable steel, which is how SAIL&apos;s own table splits saleable steel. The change beside a figure is on the year before.</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm" data-dsp-years-chart>
        <h4 className="mb-2 text-sm font-extrabold text-slate-900">Crude steel by year <span className="font-semibold text-slate-500">(MT; 2025-26 not stated for DSP)</span></h4>
        <ColumnChart bars={bars} from="zero" format={(v) => String(Math.round(v * 100) / 100)} valueFormat={(v) => f2(v)} color="#ea580c" ariaLabel="DSP crude steel by financial year, Million Tonnes, 2022-23 to 2024-25; 2025-26 is not stated" showValues />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-dsp-units>
        {DSP_MILLS_FY25.map((m) => {
          const grad = m.id === "brc" ? "from-rose-500 to-pink-600" : m.id === "msm" ? "from-blue-600 to-indigo-600" : "from-orange-500 to-amber-600";
          return (
            <div key={m.id} data-dsp-unit={m.id} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-white shadow-md ${grad}`}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
              <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">{m.kind} · {m.name}</div>
              <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{f3(m.mt)} <span className="text-sm font-bold opacity-90">MT</span></div>
              <div className="relative text-xs font-semibold opacity-90">{m.makes} · 2024-25 · its highest ever</div>
            </div>
          );
        })}
        <div data-dsp-unit="finished" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-600 p-4 text-white shadow-md">
          <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
          <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">Finished steel, all units</div>
          <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{f3(split.finished)} <span className="text-sm font-bold opacity-90">MT</span></div>
          <div className="relative text-xs font-semibold opacity-90">2024-25 · {f3(split.otherFinished)} MT beyond the two mills (worked out; the report does not itemise it)</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">The three units&apos; output for 2024-25 is the only unit-wise output the reports state; SAIL gives it in lakh tonnes (6.26, 5.57 and 4.28), shown here divided by 10, in MT.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" data-dsp-mix>
          <h4 className="text-sm font-extrabold text-slate-900">Product mix, 2025-26 <span className="font-semibold text-slate-500">(share of saleable steel)</span></h4>
          <div className="mt-2 flex h-6 overflow-hidden rounded-full" role="img" aria-label={`DSP saleable steel 2025-26: ${mix.longs}% longs, ${mix.semis}% semi-finished`}>
            <span className="flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-extrabold text-white" style={{ width: `${mix.longs}%` }}>{mix.longs}%</span>
            <span className="flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-extrabold text-white" style={{ width: `${mix.semis}%` }}>{mix.semis}%</span>
          </div>
          <p className="mt-2 text-xs text-slate-600"><strong className="text-orange-700">Longs</strong> (finished bars and sections, wheels and axles) and <strong className="text-emerald-700">semis</strong> (blooms, billets and rounds sold or sent on): SAIL&apos;s results presentation for the year. In 2024-25 finished steel was {split.finishedShare}% of DSP&apos;s saleable steel (worked out), so the finished share has risen.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" data-dsp-wta>
          <h4 className="text-sm font-extrabold text-slate-900">Wheels, tyres and axles supplied to Indian Railways <span className="font-semibold text-slate-500">(items, SAIL)</span></h4>
          <table className="mt-2 w-full text-left text-sm">
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-2">Year</th><th className="py-1 pr-2 text-right">Items</th><th className="py-1 pr-2 text-right">Change</th><th className="py-1 text-right">Vande Bharat wheels</th></tr></thead>
            <tbody>
              {wta.map((w, i) => (
                <tr key={w.fy} className="border-t border-slate-100"><th scope="row" className="py-1 pr-2 text-sm font-semibold text-slate-800">{w.fy}</th><td className="py-1 pr-2 text-right tabular-nums">{w.items.toLocaleString("en-IN")}</td><td className="py-1 pr-2 text-right"><Delta p={wta[i + 1] ? pct(w.items, wta[i + 1].items) : null} /></td><td className="py-1 text-right tabular-nums">{w.vandeBharat === null ? <span className="text-slate-400" aria-label="not stated">—</span> : w.vandeBharat.toLocaleString("en-IN")}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">Numbers of items, not tonnes: the reports give no tonnes of wheels and axles. They are SAIL&apos;s supply; the forged wheels are made at DSP&apos;s Wheel &amp; Axle Plant. The first Vande Bharat wheels left on 20 June 2025.</p>
        </div>
      </div>
    </section>
  );
}

function DspTab() {
  const age = ageDays(QUOTES.tmt12.asOf);
  const asOf = dateLabel(QUOTES.tmt12.asOf);
  const rank = durgapurTmtRank();
  const top = TMT12_CITIES[TMT12_CITIES.length - 1].rupees;
  return (
    <div role="tabpanel" id="steel-panel-dsp" aria-labelledby="steel-tabs" className="space-y-3">
      <Band icon={<Factory size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>What the Durgapur Steel Plant makes to sell</strong>, from the plant&apos;s own manual, beside <strong>what the same kind of steel costs in the Durgapur market</strong> on {asOf} (a trade-price site&apos;s quotes, rupees per tonne, GST not included).
        These are <strong>market quotes for the kind of steel, not DSP&apos;s or SAIL&apos;s selling prices</strong>: SAIL sells at its own list and dealer rates and publishes none, and a market quote is for one size (TMT 12 mm, while DSP rolls 20 and 25 mm) and mostly the re-rollers&apos; rate.
      </Band>
      {age > QUOTE_OLD_AFTER_DAYS && (
        <Band icon={<Info size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="amber"><span data-dsp-old>These quotes are {age} days old (they were stamped {asOf}). A trade rate moves every few days: treat them as a record of that day, not of today.</span></Band>
      )}
      <div className="grid gap-3 sm:grid-cols-3" data-dsp-capacity>
        {DSP_CAPACITY_TILES.map((t) => (
          <div key={t.name} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-white shadow-md ${t.grad}`}>
            <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
            <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">{t.name}, capacity</div>
            <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{f2(t.v)} <span className="text-sm font-bold opacity-90">MT a year</span></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">The plant&apos;s capacity after its modernisation and expansion, as SAIL&apos;s own manual gives it ({DSP_CAPACITY.page}). {DSP_CAPACITY.note}</p>

      <DspProduction />

      <div className="space-y-3">
        {DSP_PRODUCTS.map((p) => {
          const a = DSP_ACCENT[p.id];
          return (
          <section key={p.id} data-dsp-product={p.id} className={`relative overflow-hidden rounded-3xl border bg-white/85 p-4 pt-5 shadow-sm ${a.border}`} aria-label={p.name}>
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${a.grad}`} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h4 className="text-base font-extrabold text-slate-900">{p.name}</h4>
              <span className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${a.chip}`}>{p.mill}</span><span className="text-xs font-semibold text-slate-500">manual {p.page}</span></span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{p.use}.</p>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-[auto,1fr]">
              <dt className={`font-extrabold uppercase tracking-widest ${a.label}`}>Sizes</dt><dd>{p.sizes}</dd>
              <dt className={`font-extrabold uppercase tracking-widest ${a.label}`}>Capacity</dt><dd>{p.capacity}</dd>
              <dt className={`font-extrabold uppercase tracking-widest ${a.label}`}>Produced</dt><dd data-dsp-produced>{p.produced}</dd>
            </dl>
            {p.quotes.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.quotes.map((qid) => { const q = QUOTES[qid]; return (
                  <div key={qid} data-dsp-quote={qid} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-white shadow-md ${a.grad}`}>
                    <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
                    <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-90">Durgapur market · {q.item}</div>
                    <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{inr(q.rupees)}</div>
                    <div className="relative text-xs font-semibold opacity-90">a tonne, GST not included · {dateLabel(q.asOf)}</div>
                    <div className="relative mt-1 text-sm font-bold">{inr(withGst(q.rupees))} <span className="text-xs font-semibold opacity-90">with 18% GST</span></div>
                    <div className="relative mt-2"><RupeeMove change={q.change} /></div>
                  </div>
                ); })}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900" data-dsp-noquote>No market quote shown.</p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{p.note}{p.id === "channel" || p.id === "angle" || p.id === "beam" ? ` ${MSM_CE_MARK}` : ""}{p.id === "billet" && ` A second trade report gave Durgapur billet at ${inr(BILLET_SECOND.rupees)} on ${BILLET_SECOND.when} (${BILLET_SECOND.name}): the two differ a little, as trade reports do.`}</p>
          </section>
          );
        })}
      </div>

      <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50/80 to-white p-4 shadow-sm" data-dsp-cities aria-label="TMT 12 mm in the cities of the same table">
        <h4 className="text-sm font-extrabold text-slate-900">TMT 12 mm: Durgapur against the other cities of the same table <span className="font-semibold text-slate-500">(₹ a tonne, GST not included, {asOf})</span></h4>
        <p className="mt-1 text-xs text-slate-600" data-dsp-rank>
          {rank.rank === 1 ? `Durgapur is the cheapest of the ${rank.of} cities this table lists` : `Durgapur is number ${rank.rank} from the cheapest of the ${rank.of} cities this table lists`}; {rank.dearest.city} is the dearest, {signed(rank.gapPct)} above it ({inr(rank.dearest.rupees - TMT12_CITIES.find((c) => c.city === "Durgapur")!.rupees)} a tonne).
        </p>
        <ul className="mt-2 space-y-1">
          {TMT12_CITIES.map((c) => (
            <li key={c.city} className={`flex items-center gap-2 text-xs ${c.city === "Durgapur" ? "font-extrabold text-slate-900" : "font-semibold text-slate-600"}`}>
              <span className="w-32 shrink-0">{c.city}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><span className={`block h-full rounded-full ${c.city === "Durgapur" ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-sky-300"}`} style={{ width: `${Math.round((c.rupees / top) * 100)}%` }} /></span>
              <span className="w-16 shrink-0 text-right tabular-nums">{inr(c.rupees)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5" data-dsp-byproducts>
        <h4 className="text-xs font-extrabold uppercase tracking-widest text-emerald-700">Also made, with no quote found</h4>
        <ul className="mt-1 space-y-1 text-xs text-slate-600">
          {DSP_BYPRODUCTS.map((b) => <li key={b.name}><strong className="text-slate-800">{b.name}</strong>: {b.detail} (manual {b.page})</li>)}
        </ul>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2" data-dsp-sources>
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">Where each figure was read</summary>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          {(Object.values(QUOTES) as Quote[]).map((q) => <li key={q.id}><strong className="text-slate-800">{q.item}</strong>: <ExtLink href={q.url}>{QUOTE_SOURCE.name}</ExtLink> — &ldquo;{q.line}&rdquo;</li>)}
          {[...DSP_YEARS.flatMap((y) => y.sources.map((src) => ({ ...src, key: `${y.fy}-${src.page}` }))), ...DSP_HOT_METAL.flatMap((y) => y.sources.map((src) => ({ ...src, key: `hm-${y.fy}-${src.page}` }))), ...DSP_WTA.map((w) => ({ ...w.source, key: `wta-${w.fy}` }))].filter((x, i, a) => a.findIndex((y) => y.url === x.url && y.quote === x.quote) === i).map((src: ProdSource & { key: string }) => (
            <li key={src.key} data-dsp-prod-source><strong className="text-slate-800">Production</strong>: <ExtLink href={src.url}>{src.name}</ExtLink> ({src.page}) — &ldquo;{src.quote}&rdquo;</li>
          ))}
          <li><strong className="text-slate-800">Billet, second report</strong>: <ExtLink href={BILLET_SECOND.url}>{BILLET_SECOND.name}</ExtLink> — &ldquo;{BILLET_SECOND.line}&rdquo;</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{TICKER_NOTE} The site publishes its rates as {QUOTE_SOURCE.basis}. The quotes were read on {dateLabel(QUOTES_READ_ON)} and are not fetched while the card is open.</p>
        <p className="mt-1 text-xs text-slate-500">Products, sizes and capacities are from {DSP_MANUAL} and SAIL&apos;s JO Manual &ldquo;Industry &amp; Company Awareness&rdquo; (2022); the page of each is given. Where the manuals differ, the card says so.</p>
      </details>
    </div>
  );
}

/* ---------- tab 2: companies ---------- */

type Metric = "production" | "sales" | "ebitdaPerTonne" | "realisation";
const METRICS: Array<{ id: Metric; text: string; unit: string; title: string; digits: number; fmt: (v: number) => string }> = [
  { id: "production", text: "Production", unit: "Million Tonnes", title: "Crude steel production", digits: 2, fmt: (v) => `${f2(v)} MT` },
  { id: "sales", text: "Sales", unit: "Million Tonnes", title: "Steel sales (deliveries)", digits: 2, fmt: (v) => `${f2(v)} MT` },
  { id: "ebitdaPerTonne", text: "EBITDA per tonne", unit: "rupees per tonne", title: "EBITDA per tonne", digits: 0, fmt: (v) => inr(v) },
  { id: "realisation", text: "Realisation", unit: "rupees per tonne", title: "Net realisation per tonne", digits: 0, fmt: (v) => inr(v) },
];
const quarterAxis = (q: string) => (q.startsWith("Q1") ? q : q.slice(0, 2));

/** Returns the latest quarter of a company that has the figure, with the same quarter a year earlier and the quarter before, when the company stated them. */
export function latestOf(c: Company, m: Metric): { q: CompanyQuarter; yoy: number | null; qoq: number | null; sameScope: boolean } | null {
  // I work out a change against the earlier quarter as the company itself restated it on today's scope (JSW without BPSL), when it did.
  const base = (cq: CompanyQuarter | undefined): { v: number | null; restated: boolean } => {
    const r = cq?.sameScope?.[m as "production" | "sales" | "ebitdaPerTonne"];
    return r !== undefined ? { v: r, restated: true } : { v: cq?.[m] ?? null, restated: false };
  };
  for (let i = c.quarters.length - 1; i >= 0; i--) {
    const q = c.quarters[i];
    if (q[m] === null) continue;
    const ago = base(c.quarters[i - 4]), prev = base(c.quarters[i - 1]);
    return { q, yoy: pct(q[m], ago.v), qoq: pct(q[m], prev.v), sameScope: ago.restated };
  }
  return null;
}

function CompaniesTab() {
  // A metric to compare needs at least two companies that state it; SAIL alone states its realisation, so that is on the SAIL tab.
  const have = METRICS.filter((m) => COMPANIES.filter((c) => c.quarters.some((q) => q[m.id] !== null)).length >= 2);
  const [metric, setMetric] = useState<Metric>("production");
  const meta = METRICS.find((m) => m.id === metric) ?? METRICS[0];
  const rows = COMPANIES.map((c) => ({ c, last: latestOf(c, meta.id) })).filter((r): r is { c: Company; last: NonNullable<ReturnType<typeof latestOf>> } => r.last !== null).sort((a, b) => (b.last.q[meta.id] as number) - (a.last.q[meta.id] as number));
  const top = Math.max(1, ...rows.map((r) => r.last.q[meta.id] as number));
  const latestQ = COMPANIES[0]?.quarters[COMPANIES[0].quarters.length - 1];
  return (
    <div role="tabpanel" id="steel-panel-companies" aria-labelledby="steel-tabs" className="space-y-3">
      <Band icon={<Factory size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>The makers compared by what each reports</strong> in its own quarterly results. A company&apos;s price per tonne is not public, but each tells how much it made and sold and what it earned on each tonne (its EBITDA per tonne).
        The bases differ a little (the notes below say how), so compare volumes with volumes, and read each EBITDA per tonne as that company&apos;s own measure.
      </Band>
      <Pills<Metric> id="steel-metric" label="Compare on" gradient={PILL} value={metric} onChange={setMetric} tabs={have.map((m) => ({ id: m.id, text: m.text }))} />
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" aria-label={`${meta.title}, latest quarter of each company`} data-league>
        <h4 className="text-sm font-extrabold text-slate-900">{meta.title} <span className="font-semibold text-slate-500">({meta.unit}), each company&apos;s latest reported quarter</span></h4>
        <ul className="mt-3 space-y-2.5">
          {rows.map(({ c, last }) => {
            const v = last.q[meta.id] as number;
            return (
              <li key={c.id} data-company-row={c.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-bold text-slate-900"><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c.color }} />{c.name} <span className="text-xs font-semibold text-slate-500">{last.q.q} · {last.q.period}{last.q.secondary ? <span title="Partly from a report of the company's earnings call, not from a company document"> †</span> : null}</span></span>
                  <span className="flex items-center gap-1.5"><span className="text-base font-extrabold tabular-nums text-slate-900">{meta.fmt(v)}</span><Delta p={last.yoy} label={last.sameScope ? "a year ago, same scope" : "a year ago"} /></span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (v / top) * 100)}%`, background: c.color }} /></div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">The change is against the same quarter a year before, worked out from the two figures the company stated (JSW's is against last year's quarter as JSW itself restated it without BPSL, so both sides are the same business); a company that did not state one shows &ldquo;no figure&rdquo;. † partly from a report of the company&apos;s earnings call, not from a company document. The quarters can differ (a company that did not state a figure for its latest quarter is shown at the latest one it did).</p>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {COMPANIES.map((c) => {
          const bars: Bar[] = c.quarters.map((q) => ({ tip: q[meta.id] === null ? `${q.q} (${q.period}): not stated` : `${q.q} (${q.period}): ${meta.fmt(q[meta.id] as number)}`, axis: quarterAxis(q.q), value: q[meta.id] }));
          if (!bars.some((b) => b.value !== null)) return null;
          return (
            <section key={c.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm" data-company-chart={c.id} aria-label={`${c.name}: ${meta.title}, by quarter`}>
              <h5 className="mb-1 text-sm font-extrabold text-slate-900"><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c.color }} />{c.name} <span className="text-xs font-semibold text-slate-500">{meta.title}, by quarter</span></h5>
              <ColumnChart bars={bars} from="zero" format={(v) => String(Math.round(v * 100) / 100)} valueFormat={(v) => (meta.digits === 0 ? `${Math.round(v / 100) / 10}k` : f1(v))} color={c.color} ariaLabel={`${c.name} ${meta.title} by quarter, ${meta.unit}`} showValues={bars.length <= 6} />
              {c.id === "jsw" && <p className="mt-1 text-[11px] leading-snug text-amber-800" data-jsw-break>From Q1 FY27 the figures leave out Bhushan Power &amp; Steel (BPSL), which JSW sold on 27 March 2026: the step down there is a change of scope, not a fall in output.</p>}
            </section>
          );
        })}
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2" open>
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">The results of the latest quarter ({latestQ?.q}, {latestQ?.period}), rupees crore</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm" data-results-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-3">Company</th><th className="py-1 pr-3 text-right">Revenue</th><th className="py-1 pr-3 text-right">EBITDA</th><th className="py-1 pr-3 text-right">Profit after tax</th></tr></thead>
            <tbody>
              {COMPANIES.map((c) => { const q = c.quarters[c.quarters.length - 1]; const n = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en-IN")); return (
                <tr key={c.id} className="border-t border-slate-100"><th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{c.name} <span className="text-[11px] font-semibold text-slate-500">{q.q}</span></th><td className="py-1 pr-3 text-right tabular-nums">{n(q.revenue)}</td><td className="py-1 pr-3 text-right tabular-nums">{n(q.ebitda)}</td><td className="py-1 pr-3 text-right tabular-nums">{n(q.pat)}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Revenue, EBITDA and profit are the figures in each company&apos;s own results, and they are not on the same footing (Tata Steel&apos;s are the whole group&apos;s, with Europe): they show how big each is, not who is ahead.</p>
      </details>
      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2" data-bases>
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">What each figure covers, and where it was read</summary>
        <ul className="mt-2 space-y-3 text-xs leading-relaxed text-slate-600">
          {COMPANIES.map((c) => (
            <li key={c.id}>
              <strong className="text-slate-800">{c.name}.</strong> {c.basis}
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                {c.quarters.map((q) => q.sources[0] ? <span key={q.q} data-source-link><ExtLink href={q.sources[0].url}>{q.q}</ExtLink>{hostNote(q.sources[0].url)}</span> : null)}
              </div>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs leading-relaxed text-slate-500">
        Source: each company&apos;s own quarterly results press release, presentation or stock-exchange filing, read on {COMPANIES_READ_ON}; nothing is estimated, and a figure a company does not state (for example the Rs per tonne realisation, which Tata Steel gives only as a change from the quarter before) is left out.
        Companies restate earlier quarters slightly; each quarter is shown as its own release gave it.
      </p>
    </div>
  );
}

/* ---------- tab 3: SAIL and the steel CPSEs ---------- */

type SailItem = "crude" | "saleable" | "sales" | "hotMetal";
const SAIL_ITEMS: Array<{ id: SailItem; text: string; title: string }> = [
  { id: "crude", text: "Crude steel", title: "Crude steel production" },
  { id: "saleable", text: "Saleable steel", title: "Saleable steel production" },
  { id: "sales", text: "Sales", title: "Sales of saleable steel" },
  { id: "hotMetal", text: "Hot metal", title: "Hot metal production" },
];
const SAIL_COLOR = "#0e7490";
const mt = (v: number) => `${f3(v)} MT`;

function SailTab() {
  const [item, setItem] = useState<SailItem>("crude");
  const meta = SAIL_ITEMS.find((i) => i.id === item)!;
  const last = latestSail();
  const pick = (r: never) => (r as { [k in SailItem]: number | null })[item];
  const yoy = yearOnYear(SAIL_MONTHLY, last.month, pick);
  // For the year to date I use the Ministry's own cumulative figure, not the months added up (revisions differ in the second decimal).
  const nowFy: number | null = last.month === SAIL_CUMULATIVE.lastMonth ? SAIL_CUMULATIVE[item].now : fyToDate(SAIL_MONTHLY, last.month, pick);
  const thenFy: number | null = last.month === SAIL_CUMULATIVE.lastMonth ? SAIL_CUMULATIVE[item].prev : fyToDate(SAIL_MONTHLY, monthShift(last.month, -12), pick);
  const bars = monthBars(SAIL_MONTHLY.map((r) => ({ month: r.month, v: r[item] })), "MT", 3);
  const cpse = [
    { name: "SAIL", color: SAIL_COLOR, rows: SAIL_MONTHLY.map((r) => ({ month: r.month, v: r.crude })) },
    { name: "RINL (Visakhapatnam)", color: "#b45309", rows: RINL_MONTHLY.map((r) => ({ month: r.month, v: r.crude })) },
    { name: "NMDC Steel (Nagarnar)", color: "#6d28d9", rows: NSL_MONTHLY.map((r) => ({ month: r.month, v: r.crude })) },
  ];
  const cpseTop = Math.max(...cpse.map((c) => c.rows.find((r) => r.month === last.month)?.v ?? 0));
  const fyLabel = last.month === SAIL_CUMULATIVE.lastMonth ? `${SAIL_CUMULATIVE.label} ${SAIL_CUMULATIVE.year.slice(0, 4)}` : `April to ${monthLabel(last.month)}`;
  const sail = COMPANIES.find((c) => c.id === "sail");
  const sailReal: Bar[] = sail ? sail.quarters.map((q) => ({ tip: q.realisation === null ? `${q.q} (${q.period}): not stated` : `${q.q} (${q.period}): ${inr(q.realisation)} per tonne`, axis: quarterAxis(q.q), value: q.realisation })).filter(() => true) : [];
  return (
    <div role="tabpanel" id="steel-panel-sail" aria-labelledby="steel-tabs" className="space-y-3">
      <Band icon={<Landmark size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>SAIL and the other steel public-sector companies, month by month</strong>, from the Ministry of Steel&apos;s monthly report, in Million Tonnes (MT; the Ministry&apos;s table is in lakh tonnes and is divided by 10 here). Each report gives its month, the month before and the same month a year
        earlier, so the record runs from December 2024; a month no report covers (October 2025) is a gap.
      </Band>
      <Pills<SailItem> id="steel-sail-item" label="SAIL figure" gradient={PILL} value={item} onChange={setItem} tabs={SAIL_ITEMS.map((i) => ({ id: i.id, text: i.text }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-gradient-to-br from-cyan-700 to-sky-700 p-4 text-white shadow-md" data-sail-tile="month">
          <div className="text-xs font-extrabold uppercase tracking-widest opacity-90">SAIL · {monthLabel(last.month)}</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">{last[item] === null ? "—" : f3(last[item] as number)}</div>
          <div className="text-xs font-semibold opacity-90">MT · {meta.title.toLowerCase()}</div>
          <div className="mt-2"><Delta p={yoy?.change ?? null} label="on the year" /></div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" data-sail-tile="fy">
          <div className="text-xs font-extrabold uppercase tracking-widest text-slate-500">{fyLabel}</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{nowFy === null ? "—" : f3(nowFy)}</div>
          <div className="text-xs font-semibold text-slate-600">MT this year; last year {thenFy === null ? "—" : f3(thenFy)}</div>
          <div className="mt-2"><Delta p={pct(nowFy, thenFy)} label="on last year" /></div>
        </div>
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" aria-label={`SAIL ${meta.title} by month`}>
        <h4 className="mb-1 text-sm font-extrabold text-slate-900">SAIL {meta.title.toLowerCase()} <span className="font-semibold text-slate-500">(MT, by month)</span></h4>
        <ColumnChart bars={bars} from="zero" format={(v) => String(Math.round(v * 100) / 100)} valueFormat={(v) => f3(v)} color={SAIL_COLOR} ariaLabel={`SAIL ${meta.title} by month, Million Tonnes`} showValues={bars.length <= 12} />
      </section>
      {sailReal.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" aria-label="SAIL net sales realisation per tonne, by quarter" data-sail-realisation>
          <h4 className="mb-1 text-sm font-extrabold text-slate-900">SAIL&apos;s average selling price <span className="font-semibold text-slate-500">(net sales realisation, rupees per tonne, as SAIL states it on its results call)</span></h4>
          <ColumnChart bars={sailReal} from="zero" format={(v) => `${Math.round(v / 1000)}k`} valueFormat={(v) => `${Math.round(v / 100) / 10}k`} color={SAIL_COLOR} ariaLabel="SAIL net sales realisation per tonne by quarter, rupees" showValues={sailReal.length <= 10} />
          <p className="mt-1 text-[11px] leading-snug text-slate-500">The only price of a steel maker that its own papers state in rupees. Tata Steel, JSW and Jindal Steel do not state a rupee figure, only the change from the quarter before. A quarter SAIL did not state is a gap. Source: SAIL&apos;s results calls and presentations (see the Companies tab).</p>
        </section>
      )}
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" aria-label="Crude steel of the steel public-sector companies, latest month" data-cpse>
        <h4 className="text-sm font-extrabold text-slate-900">Crude steel, {monthLabel(last.month)} <span className="font-semibold text-slate-500">(MT)</span></h4>
        <ul className="mt-3 space-y-2.5">
          {cpse.map((c) => {
            const v = c.rows.find((r) => r.month === last.month)?.v ?? null;
            const y = yearOnYear(c.rows, last.month, (r) => (r as { v: number | null }).v);
            return (
              <li key={c.name} data-cpse-row={c.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-bold text-slate-900"><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c.color }} />{c.name}</span><span className="flex items-center gap-1.5"><span className="text-base font-extrabold tabular-nums text-slate-900">{v === null ? "—" : mt(v)}</span><Delta p={y?.change ?? null} label="on the year" /></span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${v === null ? 0 : Math.max(2, (v / cpseTop) * 100)}%`, background: c.color }} /></div>
              </li>
            );
          })}
        </ul>
      </section>
      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">SAIL, month by month (MT)</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm" data-sail-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-3">Month</th>{SAIL_ITEMS.map((i) => <th key={i.id} className="py-1 pr-3 text-right">{i.text}</th>)}</tr></thead>
            <tbody>
              {[...SAIL_MONTHLY].reverse().map((r) => (
                <tr key={r.month} className="border-t border-slate-100"><th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{monthLabel(r.month)}</th>{SAIL_ITEMS.map((i) => <td key={i.id} className="py-1 pr-3 text-right tabular-nums text-slate-800">{r[i.id] === null ? "—" : f3(r[i.id] as number)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs leading-relaxed text-slate-500">
        Source: Ministry of Steel, <ExtLink href={MOS_SITE}>Monthly Economic Report</ExtLink>, &ldquo;Performance of Steel CPSEs&rdquo; (Annexure III). The figures are provisional and are revised in the next report; where two reports give a month, the later one is shown. SAIL&apos;s own releases
        (a crude steel figure for each quarter) are on the Companies tab.
      </p>
    </div>
  );
}

/* ---------- tab 4: India and the world ---------- */

function IndiaTab() {
  const latest = INDIA_ANNUAL.filter((y) => !y.partial);
  const fy = latest[latest.length - 1], growth = indiaGrowth();
  const half = INDIA_HALF[INDIA_HALF.length - 1];
  const indiaM = WSA_MONTHLY.India ?? [];
  const lastM = indiaM[indiaM.length - 1];
  const bars = monthBars(indiaM.map(([month, v]) => ({ month, v })), "MT");
  const world25 = WSA_ANNUAL.find((r) => r.country === "World")!;
  return (
    <div role="tabpanel" id="steel-panel-india" aria-labelledby="steel-tabs" className="space-y-3">
      <Band icon={<TrendingUp size={15} className="mt-px shrink-0" aria-hidden="true" />} tone="sky">
        <strong>India is the world&apos;s second-largest steel producer</strong>, after China. The yearly figures are the Joint Plant Committee&apos;s (financial years, April to March); the country and monthly figures are the World Steel Association&apos;s (calendar months). The two differ a little, and both are
        quoted by the Ministry of Steel.
      </Band>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: `Crude steel, ${fy.fy}`, big: `${f1(fy.crude)} MT`, sub: `${signed(growth[growth.length - 1].change ?? 0)} on ${latest[latest.length - 2].fy}`, tone: "from-sky-600 to-blue-700" },
          { t: `Consumption, ${fy.fy}`, big: `${f1(fy.consumption)} MT`, sub: `finished steel; ${f1(INDIA_FACTS.perCapitaIndiaKg)} kg for each person`, tone: "from-emerald-600 to-teal-700" },
          { t: `Crude steel, April-September ${half.fy}`, big: `${f1(half.crude)} MT`, sub: `${signed(halfYearChange() ?? 0)} on the same months last year (provisional)`, tone: "from-violet-600 to-indigo-700" },
          { t: "Capacity", big: `${f1(INDIA_FACTS.capacityMt)} MT`, sub: `crude steel capacity in ${INDIA_FACTS.capacityYear}`, tone: "from-amber-600 to-orange-700" },
        ].map((x) => (
          <div key={x.t} className={`rounded-3xl bg-gradient-to-br p-4 text-white shadow-md ${x.tone}`} data-india-tile>
            <div className="text-xs font-extrabold uppercase tracking-widest opacity-90">{x.t}</div>
            <div className="mt-1 text-3xl font-extrabold tabular-nums">{x.big}</div>
            <div className="text-xs font-semibold opacity-90">{x.sub}</div>
          </div>
        ))}
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm" aria-label="India crude steel by month">
        <h4 className="mb-1 text-sm font-extrabold text-slate-900">India&apos;s crude steel by month <span className="font-semibold text-slate-500">(MT{lastM ? `; ${monthLabel(lastM[0])}: ${f2(lastM[1])}, ${indiaShareOfWorld(lastM[0])}% of the world` : ""})</span></h4>
        <ColumnChart bars={bars} from="zero" format={(v) => String(Math.round(v * 10) / 10)} valueFormat={(v) => f1(v)} color="#2563eb" ariaLabel="India crude steel by month, Million Tonnes" showValues={bars.length <= 12} />
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm" aria-label="The biggest producers">
          <h4 className="mb-2 text-sm font-extrabold text-slate-900">The biggest producers <span className="font-semibold text-slate-500">(MT of crude steel)</span></h4>
          <table className="w-full text-left text-sm" data-wsa-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-2">Country</th><th className="py-1 pr-2 text-right">2024</th><th className="py-1 pr-2 text-right">2025</th><th className="py-1 text-right">Change</th></tr></thead>
            <tbody>
              {WSA_ANNUAL.map((r) => (
                <tr key={r.country} className={`border-t border-slate-100 ${r.country === "India" ? "bg-sky-50/70 font-bold" : ""}`}>
                  <th scope="row" className="py-1 pr-2 text-sm font-semibold text-slate-800">{r.country}{r.country !== "World" && <span className="ml-1 text-[11px] font-semibold text-slate-500">{((r.y2025 / world25.y2025) * 100).toFixed(1)}%</span>}</th>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.y2024.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.y2025.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                  <td className="py-1 text-right"><Delta p={pct(r.y2025, r.y2024)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">The share is of the world&apos;s 2025 production. 2025 is provisional.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm" aria-label="India's finished steel trade">
          <h4 className="mb-2 text-sm font-extrabold text-slate-900">Finished steel: exports and imports <span className="font-semibold text-slate-500">(thousand tonnes)</span></h4>
          <table className="w-full text-left text-sm" data-trade-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-2">Year</th><th className="py-1 pr-2 text-right">Exports</th><th className="py-1 pr-2 text-right">Imports</th><th className="py-1 text-right">Net</th></tr></thead>
            <tbody>
              {INDIA_TRADE.map((r) => { const net = r.exports - r.imports; return (
                <tr key={r.fy} className="border-t border-slate-100"><th scope="row" className="py-1 pr-2 text-sm font-semibold text-slate-800">{r.fy}</th><td className="py-1 pr-2 text-right tabular-nums">{r.exports.toLocaleString("en-IN")}</td><td className="py-1 pr-2 text-right tabular-nums">{r.imports.toLocaleString("en-IN")}</td><td className={`py-1 text-right text-sm font-bold tabular-nums ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{net >= 0 ? "net exporter " : "net importer "}{Math.abs(net).toLocaleString("en-IN")}</td></tr>
              ); })}
            </tbody>
          </table>
        </section>
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900">India by year: production and consumption (MT)</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm" data-india-table>
            <thead><tr className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500"><th className="py-1 pr-3">Year</th><th className="py-1 pr-3 text-right">Crude steel</th><th className="py-1 pr-3 text-right">Finished steel</th><th className="py-1 text-right">Consumption</th></tr></thead>
            <tbody>
              {INDIA_ANNUAL.map((r) => <tr key={r.fy} className="border-t border-slate-100"><th scope="row" className="py-1 pr-3 text-sm font-semibold text-slate-800">{r.fy}{r.partial ? " (provisional)" : ""}</th><td className="py-1 pr-3 text-right tabular-nums">{f2(r.crude)}</td><td className="py-1 pr-3 text-right tabular-nums">{f2(r.finished)}</td><td className="py-1 text-right tabular-nums">{f2(r.consumption)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs leading-relaxed text-slate-500">
        Source: Ministry of Steel, <ExtLink href={MOS_OVERVIEW}>An Overview of Steel Sector</ExtLink> (September 2026) and the <ExtLink href={MOS_SITE}>Monthly Economic Reports</ExtLink>; the underlying data are the Joint Plant Committee&apos;s and the World Steel Association&apos;s.
        The latest figures are provisional and are revised.
      </p>
    </div>
  );
}

/* ---------- the card ---------- */

/** `initialTab` is the tab the search line asked for: I open Prices for "steel prices", Companies for "steel companies" and the SAIL tab for "sail steel production". */
export function SteelCard({ initialTab = "prices" }: { initialTab?: SteelTab }) {
  const [tab, setTab] = useState<SteelTab>(initialTab);
  return (
    <div data-steel-card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills<SteelTab> id="steel-tabs" label="Steel" gradient={PILL} value={tab} onChange={setTab} tabs={TABS} />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Info size={13} aria-hidden="true" /> {tab === "dsp" ? `Quotes of ${dateLabel(QUOTES.tmt12.asOf)} · trade quotes and the plant manuals, not live` : `Latest: ${monthLabel(latestRetail().month)} · official and company figures, not live`}</p>
      </div>
      <div id="steel-tabs" className="sr-only">Steel</div>
      {tab === "prices" && <PricesTab />}
      {tab === "dsp" && <DspTab />}
      {tab === "companies" && <CompaniesTab />}
      {tab === "sail" && <SailTab />}
      {tab === "india" && <IndiaTab />}
      <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-600"><strong>Information, not advice.</strong> These are published figures, shown as published, for reading and comparing. They are not a price quotation, an offer or a recommendation to buy or sell steel or any share. Check a current rate with a dealer or the mill before you buy.</p>
    </div>
  );
}
