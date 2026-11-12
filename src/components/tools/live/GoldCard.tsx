// src/components/tools/live/GoldCard.tsx
//
// GOLD AND SILVER IN INDIA: today's IBJA rates (24 carat, 22 carat, silver) with the change since the last close, and the trend over the months IBJA publishes, one metal at a time.
// The numbers come from our /api/live/gold route (src/lib/live/gold.ts); each is shown with its source and the time it was fetched. Nothing typed is sent anywhere.
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useLive } from "@/hooks/useLive";
import type { MetalRates } from "@/lib/live/gold";
import { ChangeChip, LiveGate, SourceLine, TrendChart } from "./LivePieces";

type Metal = "gold24" | "gold22" | "silver";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const META: Record<Metal, { name: string; unit: string; tile: string; chip: string; color: string }> = {
  gold24: { name: "Gold 24 carat", unit: "per 10 g", tile: "from-amber-400 via-yellow-400 to-amber-500 text-amber-950", chip: "bg-amber-100 text-amber-900", color: "#d97706" },
  gold22: { name: "Gold 22 carat", unit: "per 10 g", tile: "from-orange-400 via-amber-400 to-yellow-500 text-orange-950", chip: "bg-orange-100 text-orange-900", color: "#ea580c" },
  silver: { name: "Silver", unit: "per kg", tile: "from-slate-300 via-zinc-200 to-slate-400 text-slate-900", chip: "bg-slate-200 text-slate-800", color: "#64748b" },
};

export function GoldBody({ rates }: { rates: MetalRates }) {
  const [metal, setMetal] = useState<Metal>("gold24");
  const value = (m: Metal) => (m === "gold24" ? rates.gold24Per10g : m === "gold22" ? rates.gold22Per10g : rates.silverPerKg);
  const perGram = (m: Metal) => (m === "gold24" ? rates.gold24PerGram : m === "gold22" ? rates.gold22PerGram : rates.silverPerGram);
  const points = rates.history.map((p) => ({ label: p.date.slice(8) + "/" + p.date.slice(5, 7), value: metal === "gold24" ? p.gold24 : metal === "gold22" ? p.gold22 : p.silver }));
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["gold24", "gold22", "silver"] as Metal[]).map((m, i) => {
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
      <p className="mt-2 text-xs text-slate-500">Today&apos;s {rates.session === "AM" ? "opening (AM)" : "closing (PM)"} IBJA rates. The change is against the last closing (PM) rate. Click a metal to see its trend.</p>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-slate-900">Trend: {META[metal].name}</h4>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">IBJA closing rate, {rates.rangeText}</span>
        </div>
        <TrendChart points={points} color={META[metal].color} format={(v) => inr(v)} ariaLabel={`${META[metal].name} closing rate, ${rates.rangeText}`} />
      </div>
      <p className="mt-2 text-xs leading-snug text-slate-500">IBJA rates are before GST (3%) and making charges, so a jeweller&apos;s price will be higher. 24 carat is 999 purity, 22 carat is 916. The trend is the official record IBJA publishes, which reaches back about four months.</p>
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
