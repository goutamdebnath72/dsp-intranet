// src/components/tools/live/GoldCard.tsx
//
// GOLD AND SILVER IN INDIA: today's IBJA rates (24 carat, 22 carat, silver) with the change since the last close, and the trend over the months IBJA publishes, one metal at a time.
// The numbers come from our /api/live/gold route (src/lib/live/gold.ts); each is shown with its source and the time it was fetched. Nothing typed is sent anywhere.
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import type { MetalRates } from "@/lib/live/gold";
import { ChangeChip, LiveGate, SourceLine, TrendChart } from "./LivePieces";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Metal = "gold24" | "gold22" | "silver";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const META: Record<Metal, { name: string; unit: string; tile: string; chip: string; color: string }> = {
  gold24: { name: "Gold 24 carat", unit: "per 10 g", tile: "from-amber-400 via-yellow-400 to-amber-500 text-amber-950", chip: "bg-amber-100 text-amber-900", color: "#d97706" },
  gold22: { name: "Gold 22 carat", unit: "per 10 g", tile: "from-orange-400 via-amber-400 to-yellow-500 text-orange-950", chip: "bg-orange-100 text-orange-900", color: "#ea580c" },
  silver: { name: "Silver", unit: "per kg", tile: "from-slate-300 via-zinc-200 to-slate-400 text-slate-900", chip: "bg-slate-200 text-slate-800", color: "#64748b" },
};

const longDate = (iso: string) => `${String(Number(iso.slice(8, 10)))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;

const METALS: Metal[] = ["gold24", "gold22", "silver"];

export function GoldBody({ rates }: { rates: MetalRates }) {
  const [metal, setMetal] = useState<Metal>("gold24");
  // arrow keys move between the tabs, as in any tab list
  const onTabKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = METALS[(METALS.indexOf(metal) + step + METALS.length) % METALS.length];
    setMetal(next);
    requestAnimationFrame(() => document.getElementById(`gold-tab-${next}`)?.focus());
  };
  const est = rates.estimate;
  const stat = metal === "silver" ? est?.silver : est?.gold;
  const value = (m: Metal) => (m === "gold24" ? rates.gold24Per10g : m === "gold22" ? rates.gold22Per10g : rates.silverPerKg);
  const perGram = (m: Metal) => (m === "gold24" ? rates.gold24PerGram : m === "gold22" ? rates.gold22PerGram : rates.silverPerGram);
  const longSpan = rates.history.length > 0 && rates.history[0].date.slice(0, 4) !== rates.history[rates.history.length - 1].date.slice(0, 4);
  const points = rates.history.map((p) => {
    const mon = MONTHS[Number(p.date.slice(5, 7)) - 1] ?? "";
    const day = String(Number(p.date.slice(8, 10)));
    const dmy = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;
    const note = p.carried ? `${p.est ? "No fund price" : "No IBJA rate"} was published for ${dmy(p.date)} (a weekend or a holiday), so the ${p.est ? "estimate for" : "rate of"} ${dmy(p.carried)}, the last day before it, is shown.` : undefined;
    return { iso: p.date, est: p.est, ...(note ? { note } : {}), label: longSpan ? `${day} ${mon} ${p.date.slice(0, 4)}` : `${day} ${mon}`, full: `${day} ${mon} ${p.date.slice(0, 4)}`, value: metal === "gold24" ? p.gold24 : metal === "gold22" ? p.gold22 : p.silver };
  });
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {METALS.map((m, i) => {
          const c = rates.change[m];
          return (
            <motion.button
              key={m}
              type="button"
              onClick={() => setMetal(m)}
              aria-pressed={metal === m}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 260, damping: 24 }}
              className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-left shadow-lg ring-2 transition ${META[m].tile} ${metal === m ? "ring-slate-900/40" : "ring-white/70"}`}
            >
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/30 blur-2xl" />
              <div className="relative text-xs font-extrabold uppercase tracking-widest opacity-80">{META[m].name}</div>
              <div className="relative mt-1 text-3xl font-extrabold leading-tight tabular-nums">{inr(value(m))}</div>
              <div className="relative text-xs font-semibold opacity-80">{META[m].unit} · {inr2(perGram(m))} per gram</div>
              <div className="relative mt-2 min-h-[1.5rem]">{c && <ChangeChip abs={c.abs} pct={c.pct} money />}</div>
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Today&apos;s {rates.session === "AM" ? "opening (AM)" : "closing (PM)"} IBJA rates. The change is against the last closing (PM) rate. Click a metal, or use the tabs over the chart, to see its trend.</p>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="tablist" aria-label="Metal for the trend" className="inline-flex rounded-full bg-slate-100 p-1 shadow-inner">
            {METALS.map((m) => {
              const on = metal === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  id={`gold-tab-${m}`}
                  aria-selected={on}
                  aria-controls="gold-trend-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setMetal(m)}
                  onKeyDown={onTabKey}
                  className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {on && <motion.span layoutId="gold-tab-pill" aria-hidden="true" className="absolute inset-0 rounded-full bg-white shadow ring-1 ring-slate-200" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                  <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: META[m].color }} aria-hidden="true" />
                  <span className="relative">{META[m].name}</span>
                </button>
              );
            })}
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Closing rate, {rates.rangeText}</span>
          {est && (
            <span className="inline-flex items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={META[metal].color} strokeWidth="2.5" /></svg>IBJA official from {longDate(est.officialFrom)}</span>
              <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={META[metal].color} strokeWidth="2.25" strokeDasharray="5 3" strokeOpacity="0.8" /></svg>estimated before</span>
            </span>
          )}
        </div>
        <div id="gold-trend-panel" role="tabpanel" aria-labelledby={`gold-tab-${metal}`}>
          <TrendChart key={metal} todayIso={DateTime.now().setZone("Asia/Kolkata").toISODate() ?? undefined} points={points} color={META[metal].color} format={(v) => inr(v)} ariaLabel={`${META[metal].name} closing rate, ${rates.rangeText}`} />
        </div>
      </div>
      <p className="mt-2 text-xs leading-snug text-slate-500">IBJA rates are before GST (3%) and making charges, so a jeweller&apos;s price will be higher. 24 carat is 999 purity, 22 carat is 916.{" "}
        {est && stat
          ? `IBJA publishes only about four months, so from ${longDate(est.officialFrom)} the trend is IBJA's own record and the days before it (the dashed part, marked est.) are estimates: the closing price of the ${metal === "silver" ? "Silver BeES" : "Gold BeES"} fund traded on the NSE (as published by Yahoo Finance), which follows the Indian price, scaled to IBJA's rate. On the ${est.checkedDays} days where both exist, the estimate differed from IBJA by ${stat.avgPct}% on average and by ${stat.maxPct}% at most; the older days may be a little less exact.${est.savedThrough ? ` The fund prices used are a copy saved on ${longDate(est.savedThrough)}, because the live source did not answer just now.` : ""}`
          : `The trend is the official record IBJA publishes, which reaches back about four months.${rates.estimateUnavailable ? " The earlier months could not be added just now; please try Refresh in a little while." : ""}`}
      </p>
    </div>
  );
}

export function GoldCard() {
  const { state, env, error, reload } = useLive<MetalRates>("/api/live/gold");
  return (
    <LiveGate state={state} error={error} reload={reload} what="Gold and silver rates">
      {env && (
        <>
          <GoldBody rates={env.data} />
          <SourceLine env={env} reload={reload} loading={state === "loading"} />
        </>
      )}
    </LiveGate>
  );
}
