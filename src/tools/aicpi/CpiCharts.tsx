// src/tools/aicpi/CpiCharts.tsx
//
// THE CONSUMER PRICE INDEX (CPI) AND INFLATION OF MoSPI, drawn as column charts: the index of each month of all India in three tabs (Combined, Urban, Rural), the same for any State (the plant's own, West Bengal, first), and
// the year-on-year inflation rate of the last 1, 3, 5 or 10 years in four tabs. The figures are MoSPI's own, saved in the database (src/lib/live/cpi.ts says what they are and how they were checked); a month MoSPI has not
// published is not drawn, and nothing is estimated. This is the CPI of the people at large, not the CPI-IW that the dearness allowance follows: the card says so.
// A bar chart tells the truth only from a starting line it names: the inflation chart starts at zero (a rate below zero hangs under it); the index chart starts at 100, the base year's own level (2024 = 100), and says so.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Info } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { LiveGate, niceTicks, SourceLine } from "@/components/tools/live/LivePieces";
import { ToolSelect, type SelectOption } from "@/components/tools/toolKit";
import { ALL_INDIA, inflationAlert, inflationWindow, monthShort, monthText, type Cpi, type InflationSlot, type Sector, type SectorSeries } from "@/lib/live/cpi";

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
/** the round values on the left of a chart: no needless decimals (100, 105, 2.5) */
const tick = (v: number) => String(Math.round(v * 100) / 100);

/** a row of tabs (a real tab list: the arrow keys move between them); the chosen one has a pill that slides to it */
export function Pills<T extends string>({ tabs, value, onChange, label, id }: { tabs: Array<{ id: T; text: string; swatch?: string }>; value: T; onChange: (v: T) => void; label: string; id: string }) {
  const calm = useReducedMotion();
  const move = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="relative inline-flex max-w-full flex-wrap gap-0.5 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
      {tabs.map((t, i) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onKeyDown={(e) => move(e, i)} onClick={() => onChange(t.id)}
          className={`relative rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors ${value === t.id ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
          {value === t.id && <motion.span layoutId={`pill-${id}`} transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }} className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/30" />}
          <span className="relative inline-flex items-center gap-1.5">{t.swatch && <span aria-hidden="true" data-swatch={t.swatch} className="h-3 w-3 rounded-[3px] ring-1 ring-white/70" style={{ background: t.swatch }} />}{t.text}</span>
        </button>
      ))}
    </div>
  );
}

/** the width a figure on a bar needs, in pixels ("104.00" in 11-pixel bold, and a little air) */
export const VALUE_PX = 40;

export interface Bar {
  /** what the hover read-out says: "Oct 2026: 110.05" */
  tip: string;
  /** the short text under the bar ("Oct", or the year at January); empty for none */
  axis: string;
  value: number | null;
}

/** the scale of a column chart: where the bars start, the top, and the round values on the left */
export function scaleOf(values: number[], from: "zero" | number, room = 0): { lo: number; hi: number; ticks: number[]; base: number } {
  const base = from === "zero" ? 0 : from;
  const lo0 = Math.min(base, ...values), hi0 = Math.max(base, ...values);
  const t = niceTicks(lo0, hi0, 4);
  const step = t.length > 1 ? t[1] - t[0] : 1;
  const lo = Math.floor(lo0 / step + 1e-9) * step;
  const hi = Math.ceil(hi0 / step - 1e-9) * step + step * room;
  return { lo, hi, ticks: niceTicks(lo, hi, 4), base };
}

/** which bars get their text under the axis: those that have one, never closer than `gap` pixels (the first of two that would touch is kept) */
export function axisKept(bars: Bar[], width: number, gap = 34): number[] {
  const slot = width > 0 ? width / bars.length : 40;
  const out: number[] = [];
  let last = -Infinity;
  bars.forEach((b, i) => {
    if (!b.axis) return;
    if (i * slot - last >= gap) { out.push(i); last = i * slot; }
  });
  return out;
}

/**
 * A column chart: one bar for each month, round values on the left, the value on top of each bar when there are few of them (otherwise on hover or touch), the month (or the year) under it.
 * `from` is where the bars start: "zero" (the rate hangs under it when below zero), or a number (the index, from 100).
 */
export function ColumnChart({ bars, from, format, valueFormat, color, negativeColor = "#e11d48", ariaLabel, showValues }: { bars: Bar[]; from: "zero" | number; format: (v: number) => string; valueFormat?: (v: number) => string; color: string; negativeColor?: string; ariaLabel: string; showValues: boolean }) {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = bars.length;
  const sc = useMemo(() => scaleOf(bars.flatMap((b) => (b.value === null ? [] : [b.value])), from, showValues ? 0.35 : 0.12), [bars, from, showValues]);
  const pct = (v: number) => ((sc.hi - v) / (sc.hi - sc.lo)) * 100;
  const kept = useMemo(() => axisKept(bars, width), [bars, width]);
  // the figure on a bar is about 40 px wide: on a narrow screen only every second (third...) bar carries one, always the latest; the rest are read by touch
  const every = showValues && width > 0 ? Math.max(1, Math.ceil(VALUE_PX / (width / n))) : 1;
  if (!bars.some((b) => b.value !== null)) return <p className="text-sm text-slate-500">No figures to draw.</p>;
  const at = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const zeroY = pct(sc.base);
  const h = hover !== null && bars[hover].value !== null ? hover : null;
  return (
    <div className="min-w-0 max-w-full">
      <div className="flex gap-2">
        <div className="relative h-56 w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500" aria-hidden="true">
          {sc.ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${pct(t)}%` }}>{format(t)}</span>)}
        </div>
        <div ref={box} className="relative h-56 min-w-0 flex-1 touch-none select-none rounded-xl border border-slate-200 bg-white/80" onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)} role="img" aria-label={ariaLabel} data-column-chart>
          {sc.ticks.map((t) => <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300/60" style={{ top: `${pct(t)}%` }} />)}
          <span className="pointer-events-none absolute inset-x-0 border-t border-slate-400/70" style={{ top: `${zeroY}%` }} />
          {bars.map((b, i) => {
            if (b.value === null) return null;
            const up = b.value >= sc.base;
            const y = pct(b.value);
            const top = up ? y : zeroY, height = Math.max(0.4, Math.abs(zeroY - y));
            return (
              <React.Fragment key={i}>
                <motion.span
                  className={`pointer-events-none absolute rounded-t-[3px] ${up ? "" : "rounded-b-[3px] rounded-t-none"}`}
                  style={{ left: `${((i + 0.14) / n) * 100}%`, width: `${(0.72 / n) * 100}%`, top: `${top}%`, height: `${height}%`, background: up ? color : negativeColor, opacity: h === null || h === i ? 1 : 0.55, transformOrigin: up ? "bottom" : "top" }}
                  initial={calm ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: calm ? 0 : Math.min(0.5, i * 0.015) }}
                  data-bar={i}
                />
                {showValues && (n - 1 - i) % every === 0 && (
                  <span className="pointer-events-none absolute whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800" style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${up ? y : pct(b.value)}%`, transform: `translate(-50%, ${up ? "calc(-100% - 2px)" : "2px"})` }}>{(valueFormat ?? format)(b.value)}</span>
                )}
              </React.Fragment>
            );
          })}
          {h !== null && (
            <span className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white shadow-lg" style={{ left: `${((h + 0.5) / n) * 100}%`, transform: `translateX(${h / n < 0.2 ? "-10%" : h / n > 0.8 ? "-90%" : "-50%"})` }}>{bars[h].tip}</span>
          )}
        </div>
      </div>
      <div className="relative ml-[3.25rem] mt-1 h-4 text-[11px] font-semibold text-slate-500" aria-hidden="true">
        {kept.map((i) => <span key={i} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>{bars[i].axis}</span>)}
      </div>
    </div>
  );
}

/* ---------------------------------- the three views ---------------------------------- */

const SECTOR_TABS: Array<{ id: Sector; text: string }> = [
  { id: "Combined", text: "Combined" },
  { id: "Urban", text: "Urban" },
  { id: "Rural", text: "Rural" },
];
/** THE COLOUR OF THE CPI COLUMNS (the tan they have always had) in three depths tells the sectors apart: the darkest for Combined, the original tan for Urban, the lightest for Rural; the same depth for a sector whether the chart is all India or a State */
export const SECTOR_COLOR: Record<Sector, string> = { Combined: "#8a6a3e", Urban: "#c4a67f", Rural: "#e8d9bf" };
const INFLATION_COLOR = "#4f79b5";

/** the bars of one sector's index, month by month (the hover says the month, the index and the rate) */
export function indexBars(months: string[], s: SectorSeries): Bar[] {
  return months.map((m, i) => {
    const v = s.index[i], r = s.inflation[i];
    return { axis: monthShort(m), value: v, tip: v === null ? `${monthText(m)}: not published` : `${monthText(m)}: ${f2(v)}${r === null ? "" : ` · inflation ${f2(r)}%`}` };
  });
}

/** the bars of the inflation rate: a month name under each bar for a year or less, the year at its January for more */
export function inflationBars(pts: InflationSlot[]): Bar[] {
  const few = pts.length <= 13;
  return pts.map((p) => {
    const jan = p.month.endsWith("-01");
    const axis = few ? (jan ? p.month.slice(0, 4) : monthShort(p.month)) : jan ? p.month.slice(0, 4) : p.month.endsWith("-07") && pts.length <= 40 ? "Jul" : "";
    return { axis, value: p.value, tip: p.value === null ? `${monthText(p.month)}: no figure from MoSPI` : `${monthText(p.month)}: ${f2(p.value)}%` };
  });
}

function Facts({ items }: { items: Array<{ title: string; big: string; sub: string; tone: string }> }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((x) => (
        <div key={x.title} className={`rounded-2xl border px-3 py-2 ${x.tone}`}>
          <dt className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600">{x.title}</dt>
          <dd className="text-lg font-extrabold leading-tight tabular-nums text-slate-900">{x.big}</dd>
          <dd className="text-xs text-slate-600">{x.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/** the index of each month, all India, in the tab of a sector; and the same for a State */
export function IndexView({ data, initialState = "West Bengal", initialSector = "Combined" }: { data: Cpi; initialState?: string; initialSector?: Sector }) {
  const [sector, setSector] = useState<Sector>(initialSector);
  const [state, setState] = useState(data.states.some((s) => s.name === initialState) ? initialState : ALL_INDIA);
  const options: SelectOption[] = useMemo(() => [{ id: ALL_INDIA, label: ALL_INDIA }, ...data.states.map((s) => ({ id: s.name, label: s.name }))], [data.states]);
  const st = data.states.find((s) => s.name === state);
  const series = (st ? st.sectors : data.india)[sector];
  const first = data.months[0], last = data.months[data.months.length - 1];
  const li = series.index.length - 1, lv = series.index[li], lr = series.inflation[li];
  const base = 100;
  const lowest = Math.min(...(series.index.filter((x): x is number => x !== null)));
  const from = lowest < base ? Math.floor(lowest / 5) * 5 : base;
  return (
    <div data-index-view>
      <div className="flex flex-wrap items-center gap-3">
        <Pills id="cpi-sector" label="Sector" tabs={SECTOR_TABS.map((t) => ({ ...t, text: `CPI ${t.text}`, swatch: SECTOR_COLOR[t.id] }))} value={sector} onChange={setSector} />
        <div className="min-w-[12rem] max-w-xs flex-1">
          <ToolSelect value={state} options={options} onChange={setState} ariaLabel="State or all India" tone="amber" />
        </div>
      </div>
      <h4 className="mb-1 mt-3 text-sm font-extrabold text-slate-800">{state}: Consumer Price Index, {sector}, {monthText(first)} to {monthText(last)}</h4>
      <ColumnChart bars={indexBars(data.months, series)} from={from} format={tick} valueFormat={f2} color={SECTOR_COLOR[sector]} ariaLabel={`${state}, Consumer Price Index, ${sector}, ${monthText(first)} to ${monthText(last)}`} showValues={data.months.length <= 12} />
      <p className="mt-1 text-[11px] text-slate-500">Base year 2024 = 100; the bars start at {from}. Hover or touch a bar for its month and the inflation rate.</p>
      {lv !== null && (
        <Facts items={[
          { title: `Latest, ${monthText(last)}`, big: f2(lv), sub: lr === null ? "inflation not given" : `inflation ${f2(lr)}% over ${monthText(`${Number(last.slice(0, 4)) - 1}-${last.slice(5, 7)}`)}`, tone: "border-amber-200 bg-amber-50/80" },
          { title: `Since ${monthText(first)}`, big: `${lv >= (series.index[0] ?? lv) ? "+" : "−"}${f2(Math.abs(lv - (series.index[0] ?? lv)))}`, sub: `points: from ${series.index[0] === null ? "–" : f2(series.index[0] as number)} to ${f2(lv)}`, tone: "border-slate-200 bg-white/80" },
          { title: "Next month", big: data.next.month, sub: `due on ${data.next.day}`, tone: "border-slate-200 bg-white/80" },
        ]} />
      )}
    </div>
  );
}

const YEARS: Array<{ id: "1" | "3" | "5" | "10"; text: string }> = [
  { id: "1", text: "1Y" },
  { id: "3", text: "3Y" },
  { id: "5", text: "5Y" },
  { id: "10", text: "10Y" },
];

/** the inflation rate (all India, Combined), month by month, for the last 1, 3, 5 or 10 years */
export function InflationView({ data, initial = "1" }: { data: Cpi; initial?: "1" | "3" | "5" | "10" }) {
  const [years, setYears] = useState<"1" | "3" | "5" | "10">(initial);
  const pts = useMemo(() => inflationWindow(data.inflation, Number(years) as 1 | 3 | 5 | 10), [data.inflation, years]);
  if (!pts.length) return <p className="text-sm text-slate-500">No inflation figures are saved yet.</p>;
  const real = pts.filter((p): p is { month: string; value: number } => p.value !== null);
  if (!real.length) return <p className="text-sm text-slate-500">No inflation figures are saved yet.</p>;
  const hi = real.reduce((a, p) => (p.value > a.value ? p : a)), lo = real.reduce((a, p) => (p.value < a.value ? p : a));
  const now = real[real.length - 1];
  const blank = pts.filter((p) => p.value === null).map((p) => monthText(p.month));
  // the statement is about the latest month, whatever window is shown
  const band = inflationAlert(data.inflation);
  const reach = pts.length < Number(years) * 12 ? ` (the figures begin ${monthText(pts[0].month)})` : "";
  return (
    <div data-inflation-view>
      <div className="flex flex-wrap items-center gap-3">
        <Pills id="cpi-years" label="Years shown" tabs={YEARS} value={years} onChange={setYears} />
        <span className="text-xs font-semibold text-slate-500">{monthText(pts[0].month)} to {monthText(now.month)}</span>
      </div>
      <h4 className="mb-1 mt-3 text-sm font-extrabold text-slate-800">India: inflation rate (CPI, year on year, %), last {years === "1" ? "year" : `${years} years`}</h4>
      <ColumnChart bars={inflationBars(pts)} from="zero" format={tick} valueFormat={f2} color={INFLATION_COLOR} ariaLabel={`India inflation rate, ${monthText(pts[0].month)} to ${monthText(now.month)}`} showValues={pts.length <= 13} />
      {band && (
        <p role="status" data-inflation-alert={band.level} className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-snug ${band.level === "above" ? "border-rose-300 bg-rose-50 text-rose-950 shadow-sm shadow-rose-200/60" : band.level === "below" ? "border-sky-300 bg-sky-50 text-sky-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          {band.level === "above" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" /> : <Info size={18} className={`mt-0.5 shrink-0 ${band.level === "below" ? "text-sky-600" : "text-emerald-600"}`} aria-hidden="true" />}
          <span><strong className="font-extrabold">{band.lead}</strong> {band.text}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">The rate of the all-India Combined CPI over the same month a year before, as MoSPI gives it: the old series (base 2012) to December 2025, the new (base 2024) after it. {pts.length} months{reach}.{blank.length > 0 && <> MoSPI&apos;s service has no figure for {blank.join(" and ")}: left blank, not filled in.</>}</p>
      <Facts items={[
        { title: `Latest, ${monthText(now.month)}`, big: `${f2(now.value)}%`, sub: "year on year", tone: "border-sky-200 bg-sky-50/80" },
        { title: "Highest", big: `${f2(hi.value)}%`, sub: monthText(hi.month), tone: "border-rose-200 bg-rose-50/80" },
        { title: "Lowest", big: `${f2(lo.value)}%`, sub: monthText(lo.month), tone: "border-emerald-200 bg-emerald-50/80" },
      ]} />
    </div>
  );
}

/** the whole of the CPI side of the card */
export function CpiBody({ data }: { data: Cpi }) {
  return (
    <div>
      <p className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-snug text-sky-900">
        <strong>CPI</strong>, the Consumer Price Index of the Ministry of Statistics (MoSPI): the prices that people at large pay, in the country, in towns (Urban) and in villages (Rural), and in each State. It is not the CPI-IW for industrial workers on which the dearness allowance follows. The latest published is <strong>{monthText(data.latest)}</strong>; {data.next.month} is due on {data.next.day}.
      </p>
      <IndexView data={data} />
      <div className="mt-6 border-t border-slate-200 pt-4">
        <InflationView data={data} />
      </div>
    </div>
  );
}

export function CpiPanel() {
  const { state, env, error, reload } = useLive<Cpi>("/api/live/cpi", true, { refreshMs: 6 * 60 * 60 * 1000 });
  return (
    <LiveGate state={state} error={error} reload={reload} what="the consumer price index">
      {env && (
        <>
          <CpiBody data={env.data} />
          <SourceLine env={env} reload={reload} loading={state === "loading"} />
        </>
      )}
    </LiveGate>
  );
}

