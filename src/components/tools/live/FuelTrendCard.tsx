// src/components/tools/live/FuelTrendCard.tsx
//
// THE KOLKATA PRICE OF PETROL, DIESEL AND LPG OVER THE LAST YEAR: three tabs, one chart each, drawn like the gold and silver chart: dates along the bottom, the highest and the lowest day marked with
// their date, and four figures under it (the price at the start of the year, the highest, the lowest and today's). Petrol and diesel are PPAC's official price for every day; LPG is GoodReturns'
// monthly record, which is shorter, and the card says so. The data come from /api/live/fuel-trend (src/lib/live/fuelTrend.ts), each with its source and time. Nothing typed is sent anywhere.
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import type { FuelId, FuelSeries, FuelTrend } from "@/lib/live/fuelTrend";
import { LiveGate, SourceLine, TrendChart, type TrendPoint } from "./LivePieces";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const FUEL_META: Record<FuelId, { name: string; unit: string; color: string }> = {
  petrol: { name: "Petrol", unit: "per litre", color: "#059669" },
  diesel: { name: "Diesel", unit: "per litre", color: "#d97706" },
  lpg: { name: "LPG 14.2 kg", unit: "per cylinder", color: "#0284c7" },
};
const IDS: FuelId[] = ["petrol", "diesel", "lpg"];

/** ₹113.51, or ₹106 for a round figure (the axis shows round values) */
export const rs = (v: number) => `₹${Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(2)}`;

const dmy = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;

/** the points of a series for the chart: a day is "12 Nov 2025"; a month is "Jan 2026" (its price is shown from its first day), and the last point of the LPG record, today's price, is its day */
export function toPoints(s: FuelSeries): TrendPoint[] {
  return s.points.map((p, i) => {
    const last = i === s.points.length - 1;
    const text = s.grain === "month" && !last ? `${MONTHS[Number(p.date.slice(5, 7)) - 1] ?? ""} ${p.date.slice(0, 4)}` : dmy(p.date);
    return { iso: p.date, label: text, full: text, value: p.value };
  });
}

export function FuelTrendBody({ trend }: { trend: FuelTrend }) {
  const have = IDS.filter((id) => trend[id]);
  const [id, setId] = useState<FuelId>(have[0] ?? "petrol");
  const on: FuelId = have.includes(id) ? id : have[0];
  const series = trend[on] as FuelSeries;
  const first = series.points[0], last = series.points[series.points.length - 1];
  // arrow keys move between the tabs, as in any tab list
  const onTabKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = have[(have.indexOf(on) + step + have.length) % have.length];
    setId(next);
    requestAnimationFrame(() => document.getElementById(`fuel-tab-${next}`)?.focus());
  };
  const meta = FUEL_META[on];
  const labels = toPoints(series);
  const range = `${labels[0].full} to ${labels[labels.length - 1].full}`;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="tablist" aria-label="Fuel for the trend" className="inline-flex rounded-full bg-slate-100 p-1 shadow-inner">
          {have.map((f) => {
            const sel = on === f;
            const now = (trend[f] as FuelSeries).points.slice(-1)[0].value;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                id={`fuel-tab-${f}`}
                aria-selected={sel}
                aria-controls="fuel-trend-panel"
                tabIndex={sel ? 0 : -1}
                onClick={() => setId(f)}
                onKeyDown={onTabKey}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${sel ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
              >
                {sel && <motion.span layoutId="fuel-tab-pill" aria-hidden="true" className="absolute inset-0 rounded-full bg-white shadow ring-1 ring-slate-200" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: FUEL_META[f].color }} aria-hidden="true" />
                <span className="relative">{FUEL_META[f].name}</span>
                <span className="relative font-semibold text-slate-500">{rs(now)}</span>
              </button>
            );
          })}
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Kolkata · {meta.unit} · {series.grain === "day" ? "price of each day" : "price of each month"}, {range}</span>
      </div>
      <div id="fuel-trend-panel" role="tabpanel" aria-labelledby={`fuel-tab-${on}`}>
        <TrendChart
          key={on}
          points={labels}
          color={meta.color}
          format={rs}
          step
          ties="first"
          latestLabel="Today's price"
          pointsText={series.grain === "day" ? `${series.points.length} days, from the same date a year ago to today` : `${series.points.length} points: ${series.points.length - 1} months and today`}
          ariaLabel={`${meta.name} price in Kolkata, ${meta.unit}, ${range}`}
        />
      </div>
      {trend.notes.map((n) => (
        <p key={n} className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"><Info size={14} className="mt-0.5 shrink-0" />{n}</p>
      ))}
      <p className="mt-2 text-xs leading-snug text-slate-500">
        {on === "lpg"
          ? `Domestic 14.2 kg cylinder, the market (unsubsidised) price, Kolkata. The oil ministry's PPAC publishes no LPG table, and the only free record found is GoodReturns' monthly table for Kolkata, which holds ten months: so this chart begins in ${MONTHS[Number(first.date.slice(5, 7)) - 1]} ${first.date.slice(0, 4)} and not a full year back. No free source read gives Kolkata's price for the months before it, and none is guessed. A month's price is drawn from the first day of that month, even if it was revised during the month; the last figure is the day's published price. Delivery charges are extra.`
          : `${meta.name}, Kolkata: the official retail selling price of each day, from the Petroleum Planning & Analysis Cell (PPAC) of the Ministry of Petroleum and Natural Gas. The line is a staircase because a price stays the same until the day it is changed. PPAC publishes each day's table in the morning, so "today's price" is the latest day it has published. A pump may charge a little more or less.`}
      </p>
    </div>
  );
}

export function FuelTrendCard() {
  const { state, env, error, reload } = useLive<FuelTrend>("/api/live/fuel-trend");
  return (
    <section aria-label="Kolkata fuel prices over the last year" className="mt-5 rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900">Kolkata: the price over the last year</h3>
      <p className="mb-3 text-xs text-slate-500">Petrol, diesel and LPG: the price a year ago, the highest, the lowest, and today&apos;s.</p>
      <LiveGate state={state} error={error} reload={reload} what="The fuel price history">
        {env && (
          <>
            <FuelTrendBody trend={env.data} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </section>
  );
}
