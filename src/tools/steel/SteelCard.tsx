// src/tools/steel/SteelCard.tsx
//
// THE STEEL CARD: what steel costs, who makes how much, and how India and the world are doing. Four tabs.
//  1 "Prices": the retail prices of TMT bar, HR coil and CR coil in Mumbai, month by month, from the Ministry of Steel's monthly reports (the official benchmark), with the iron ore price beside them.
//  2 "Companies": SAIL, Tata Steel, JSW Steel and Jindal Steel & Power quarter by quarter, from their own results: production, sales, EBITDA per tonne, and the results.
//  3 "SAIL & CPSEs": SAIL, RINL and NMDC Steel month by month (the Ministry's tables), SAIL against the same month a year earlier.
//  4 "India & world": India's crude steel, consumption and trade by year, and the biggest producers.
// There is NO price list of SAIL, Tata Steel or JSW to show: the mills sell at their own dealer rates, which differ by city, size and day, and none publishes them. The card says so, and compares the companies by
// what they themselves report (the Companies tab). Nothing here is fetched: the figures are reviewed files with their sources and dates (mos.ts, companies.ts); a figure that is not published is a dash.
"use client";

import React, { useMemo, useState } from "react";
import { ExternalLink, Factory, Info, Landmark, Scale, TrendingUp } from "lucide-react";
import { Pills } from "@/components/tools/Pills";
import { ColumnChart, type Bar } from "@/components/tools/ColumnChart";
import { TrendChart } from "@/components/tools/live/LivePieces";
import { COMPANIES, COMPANIES_READ_ON, type Company, type CompanyQuarter } from "./companies";
import { IRON_ORE, MOS_OVERVIEW, MOS_REPORTS, MOS_SITE, NSL_MONTHLY, RETAIL, RINL_MONTHLY, SAIL_MONTHLY, WSA_MONTHLY } from "./mos";
import { INDIA_ANNUAL, INDIA_FACTS, INDIA_HALF, INDIA_TRADE, SAIL_CUMULATIVE, WSA_ANNUAL } from "./mosAnnual";
import {
  PRODUCTS, f1, f2, f3, flatPremium, fyToDate, halfYearChange, indiaGrowth, indiaShareOfWorld, inr, ironOreLatest, latestRetail, latestSail, monthLabel, monthShift, monthShort, pct, retailChange, retailPoints, retailRange, signed, yearOnYear,
  type Product,
} from "./steel";

export type SteelTab = "prices" | "companies" | "sail" | "india";
const TABS: Array<{ id: SteelTab; text: string }> = [
  { id: "prices", text: "Prices" },
  { id: "companies", text: "Companies" },
  { id: "sail", text: "SAIL & CPSEs" },
  { id: "india", text: "India & world" },
];
const PILL = "from-sky-600 to-blue-700 shadow-sky-600/30";

/* ---------- small pieces ---------- */

/** a percentage change as a chip: green for up, red for down, grey for none; "no figure" when it cannot be worked out */
function Delta({ p, label }: { p: number | null; label?: string }) {
  if (p === null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">no figure</span>;
  const tone = p > 0 ? "bg-emerald-100 text-emerald-800" : p < 0 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tone}`} data-delta>{signed(p)}{label && <span className="font-semibold opacity-70">{label}</span>}</span>;
}

function Band({ icon, tone, children }: { icon: React.ReactNode; tone: "sky" | "amber"; children: React.ReactNode }) {
  const c = tone === "sky" ? "border-sky-100 bg-sky-50/70 text-slate-700 [&>svg]:text-sky-700" : "border-amber-200 bg-amber-50 text-amber-900";
  return <p className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed ${c}`}>{icon}<span>{children}</span></p>;
}

/** a few of the documents are read from a copy of the company's filing (on a data site or an exchange's mirror): say so beside the link */
function hostNote(url: string): React.ReactNode {
  const host = (/^https?:\/\/([^/]+)/.exec(url)?.[1] ?? "").replace(/^www\./, "");
  const copy = /tijorifinance|links\.sgx/.test(host);
  return copy ? <span className="text-[11px] font-normal text-slate-500"> (a copy of the filing, {host})</span> : null;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={11} aria-hidden="true" /></a>;
}

/** bars for every month from the first to the last of a series, a month with no figure left as a gap */
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

/* ---------- tab 2: companies ---------- */

type Metric = "production" | "sales" | "ebitdaPerTonne" | "realisation";
const METRICS: Array<{ id: Metric; text: string; unit: string; title: string; digits: number; fmt: (v: number) => string }> = [
  { id: "production", text: "Production", unit: "Million Tonnes", title: "Crude steel production", digits: 2, fmt: (v) => `${f2(v)} MT` },
  { id: "sales", text: "Sales", unit: "Million Tonnes", title: "Steel sales (deliveries)", digits: 2, fmt: (v) => `${f2(v)} MT` },
  { id: "ebitdaPerTonne", text: "EBITDA per tonne", unit: "rupees per tonne", title: "EBITDA per tonne", digits: 0, fmt: (v) => inr(v) },
  { id: "realisation", text: "Realisation", unit: "rupees per tonne", title: "Net realisation per tonne", digits: 0, fmt: (v) => inr(v) },
];
const quarterAxis = (q: string) => (q.startsWith("Q1") ? q : q.slice(0, 2));

/** the latest quarter of a company that has the figure, with the same quarter a year earlier and the quarter before, when the company stated them */
export function latestOf(c: Company, m: Metric): { q: CompanyQuarter; yoy: number | null; qoq: number | null; sameScope: boolean } | null {
  // a change is worked out against the earlier quarter as the company itself restated it on today's scope (JSW without BPSL), when it did
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
  // a metric to compare needs at least two companies that state it (SAIL alone states its realisation: that is on the SAIL tab)
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
  // the year to date is the Ministry's own cumulative figure, not the months added up (revisions differ in the second decimal)
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

/** `initialTab` is the tab the search line asked for ("steel prices" opens Prices, "steel companies" Companies, "sail steel production" the SAIL tab) */
export function SteelCard({ initialTab = "prices" }: { initialTab?: SteelTab }) {
  const [tab, setTab] = useState<SteelTab>(initialTab);
  return (
    <div data-steel-card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills<SteelTab> id="steel-tabs" label="Steel" gradient={PILL} value={tab} onChange={setTab} tabs={TABS} />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Info size={13} aria-hidden="true" /> Latest: {monthLabel(latestRetail().month)} · official and company figures, not live</p>
      </div>
      <div id="steel-tabs" className="sr-only">Steel</div>
      {tab === "prices" && <PricesTab />}
      {tab === "companies" && <CompaniesTab />}
      {tab === "sail" && <SailTab />}
      {tab === "india" && <IndiaTab />}
      <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-600"><strong>Information, not advice.</strong> These are published figures, shown as published, for reading and comparing. They are not a price quotation, an offer or a recommendation to buy or sell steel or any share. Check a current rate with a dealer or the mill before you buy.</p>
    </div>
  );
}
