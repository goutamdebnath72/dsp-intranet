// src/components/tools/live/FuelCard.tsx
//
// PETROL (E20), DIESEL AND LPG IN THE FOUR METROS, in one table: a column for each city, a row for each fuel and cylinder, the day's change beside each price, the cheapest city of each row in green
// and the dearest in red. Ujjwala beneficiaries get a subsidy on the 14.2 kg cylinder: the amount is an editable figure (it is the government's to change), shown as one more row.
// Numbers come from /api/live/fuel (src/lib/live/fuel.ts), with the source and the time. Nothing typed is sent anywhere.
"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLive } from "@/hooks/useLive";
import type { CityFuel, Price } from "@/lib/live/fuel";
import { LiveGate, SourceLine } from "./LivePieces";

const DEFAULT_SUBSIDY = 300;

interface Row {
  key: string;
  label: string;
  unit: string;
  note?: string;
  values: Array<Price | null>;
  accent?: boolean;
}

const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildRows(cities: CityFuel[], subsidy: number): Array<{ title: string; rows: Row[] }> {
  const sub = Number.isFinite(subsidy) && subsidy > 0 ? subsidy : 0;
  const get = (f: (c: CityFuel) => Price) => cities.map(f);
  return [
    {
      title: "Petrol and diesel",
      rows: [
        { key: "petrol", label: "Petrol (E20 blend)", unit: "per litre", values: get((c) => c.petrol) },
        { key: "diesel", label: "Diesel", unit: "per litre", values: get((c) => c.diesel) },
      ],
    },
    {
      title: "LPG cylinders",
      rows: [
        { key: "dom14", label: "Domestic 14.2 kg", unit: "per cylinder", note: "the market (unsubsidised) price every household pays", values: get((c) => c.lpg.dom14) },
        { key: "dom14s", label: "Domestic 14.2 kg, Ujjwala beneficiary", unit: "per cylinder", note: `after the subsidy of ₹${sub}`, accent: true, values: get((c) => ({ price: Math.max(0, Math.round((c.lpg.dom14.price - sub) * 100) / 100), change: c.lpg.dom14.change })) },
        { key: "dom5", label: "Domestic 5 kg", unit: "per cylinder", values: get((c) => c.lpg.dom5) },
        { key: "com19", label: "Commercial 19 kg", unit: "per cylinder", values: get((c) => c.lpg.com19) },
        { key: "com47", label: "Commercial 47.5 kg", unit: "per cylinder", values: get((c) => c.lpg.com47) },
      ],
    },
  ];
}

function Delta({ change }: { change: number }) {
  if (!change) return <span className="text-[11px] font-semibold text-slate-400">no change</span>;
  return <span className={`text-[11px] font-bold ${change > 0 ? "text-rose-600" : "text-emerald-600"}`}>{change > 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>;
}

export function FuelBody({ cities }: { cities: CityFuel[] }) {
  const [subsidyText, setSubsidyText] = useState(String(DEFAULT_SUBSIDY));
  const sections = useMemo(() => buildRows(cities, Number(subsidyText.replace(/,/g, ""))), [cities, subsidyText]);
  let n = 0;
  return (
    <div>
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white/80 shadow-sm">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
              <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-widest text-slate-300">Fuel</th>
              {cities.map((c) => <th key={c.city} className="px-3 py-3 text-right text-sm font-extrabold">{c.city}</th>)}
            </tr>
          </thead>
          {sections.map((sec) => (
            <tbody key={sec.title}>
              <tr><th colSpan={cities.length + 1} className="bg-amber-50 px-4 py-1.5 text-left text-xs font-extrabold uppercase tracking-widest text-amber-800">{sec.title}</th></tr>
              {sec.rows.map((r) => {
                const prices = r.values.map((v) => v?.price ?? NaN);
                const lo = Math.min(...prices), hi = Math.max(...prices);
                const i = n++;
                return (
                  <motion.tr key={r.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, type: "spring", stiffness: 260, damping: 24 }} className={`border-t border-slate-100 ${r.accent ? "bg-emerald-50/60" : ""}`}>
                    <th scope="row" className="px-4 py-2.5 text-left align-top">
                      <div className="text-sm font-bold text-slate-900">{r.label}</div>
                      <div className="text-xs font-normal text-slate-500">{r.unit}{r.note ? ` · ${r.note}` : ""}</div>
                    </th>
                    {r.values.map((v, k) => (
                      <td key={cities[k].city} className="px-3 py-2.5 text-right align-top">
                        {v ? (
                          <>
                            <div className={`text-base font-extrabold tabular-nums ${v.price === lo && lo !== hi ? "text-emerald-700" : v.price === hi && lo !== hi ? "text-rose-700" : "text-slate-900"}`}>{rs(v.price)}</div>
                            <Delta change={v.change} />
                          </>
                        ) : <span className="text-xs text-slate-400">not published</span>}
                      </td>
                    ))}
                  </motion.tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 text-sm text-emerald-950">
        <label htmlFor="lpg-subsidy" className="font-bold">Ujjwala subsidy on the 14.2 kg cylinder</label>
        <span className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
          <input id="lpg-subsidy" inputMode="decimal" autoComplete="off" value={subsidyText} onChange={(e) => setSubsidyText(e.target.value)} className="h-9 w-24 rounded-xl border border-emerald-300 bg-white pl-7 pr-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-100" />
        </span>
        <span className="text-xs text-emerald-900/80">Editable: the government sets it and may change it (₹300 was the amount for 2025-26); confirm the current figure with your distributor. General households get no subsidy and pay the listed price.</span>
      </div>
      <p className="mt-2 text-xs leading-snug text-slate-500">Cheapest city of each row in green, dearest in red. ▲ ▼ is today&apos;s change. Prices are the daily published ones for each city (petrol sold in India is now E20, a blend of up to 20% ethanol, at one price per city); a pump or distributor may charge a little more for delivery. Check at the pump or with your distributor before you rely on a figure.</p>
    </div>
  );
}

export function FuelCard() {
  const { state, env, error, reload } = useLive<CityFuel[]>("/api/live/fuel");
  return (
    <LiveGate state={state} error={error} reload={reload} what="Fuel prices">
      {env && (
        <>
          <FuelBody cities={env.data} />
          <SourceLine env={env} reload={reload} loading={state === "loading"} />
        </>
      )}
    </LiveGate>
  );
}
