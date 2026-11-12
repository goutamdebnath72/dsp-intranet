// src/components/tools/EvForm.tsx
//
// ELECTRIC-CAR CHARGING: the battery size, the charge to start and end at, what the car accepts on AC and DC; the answer is a table of how long each kind of charger takes, with what the
// words mean underneath. All in the browser (src/lib/tools/ev.ts); nothing is stored or sent. The times are approximate, and the card says so.
"use client";

import React, { useMemo, useState } from "react";
import { CHARGERS, BATTERY_TERMS, CHARGER_TERMS, EV_DEFAULTS, estimateCharge, hoursText, isEvProblem, validateEv, type EvInput } from "@/lib/tools/ev";
import { num } from "@/lib/tools/finance";
import { motion } from "framer-motion";
import { BatteryCharging, ChevronRight, PlugZap, Zap } from "lucide-react";
import { Field, TextInput, Problem } from "./toolAtoms";
import { ToolSelect } from "./toolKit";

const BATTERY_PRESETS = [
  { kwh: 15, label: "15 kWh — small city car" },
  { kwh: 25, label: "25 kWh — compact hatchback" },
  { kwh: 40, label: "40 kWh — compact SUV" },
  { kwh: 60, label: "60 kWh — mid-size SUV" },
  { kwh: 80, label: "80 kWh — large SUV / long range" },
  { kwh: 100, label: "100 kWh — premium long range" },
];

function Terms({ title, items }: { title: string; items: Array<{ term: string; meaning: string }> }) {
  return (
    <details className="group mt-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-900">
        <ChevronRight size={16} className="text-emerald-600 transition-transform duration-300 group-open:rotate-90" />{title}
      </summary>
      <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {items.map((t) => <div key={t.term} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-sm font-bold text-slate-900">{t.term}</dt><dd className="mt-0.5 text-xs leading-relaxed text-slate-600">{t.meaning}</dd></div>)}
      </dl>
    </details>
  );
}

export function EvForm() {
  const [capacity, setCapacity] = useState(String(EV_DEFAULTS.capacityKwh));
  const [from, setFrom] = useState(String(EV_DEFAULTS.fromPct));
  const [to, setTo] = useState(String(EV_DEFAULTS.toPct));
  const [carAc, setCarAc] = useState(String(EV_DEFAULTS.carAcKw));
  const [carDc, setCarDc] = useState(String(EV_DEFAULTS.carDcKw));
  const [kmPerKwh, setKmPerKwh] = useState(String(EV_DEFAULTS.kmPerKwh));
  const [ownKw, setOwnKw] = useState("");
  const [ownKind, setOwnKind] = useState<"AC" | "DC">("DC");

  const input: EvInput = { capacityKwh: num(capacity), fromPct: num(from), toPct: num(to), carAcKw: num(carAc), carDcKw: num(carDc), kmPerKwh: num(kmPerKwh) || 0 };
  const problem = validateEv(input);
  const rows = useMemo(() => {
    if (problem) return [];
    const list = CHARGERS.map((c) => ({ ...c, e: estimateCharge(input, c) }));
    const own = num(ownKw);
    if (Number.isFinite(own) && own > 0) list.push({ id: "own", kind: ownKind, kw: own, label: `Your charger: ${ownKind} ${own} kW`, note: "the rating you typed", e: estimateCharge(input, { kind: ownKind, kw: own }) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity, from, to, carAc, carDc, kmPerKwh, ownKw, ownKind, problem]);
  const longest = Math.max(0, ...rows.map((r) => (isEvProblem(r.e) ? 0 : r.e.hours)));
  const first = rows.find((r) => !isEvProblem(r.e));
  const added = first && !isEvProblem(first.e) ? first.e : null;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="ev-cap" label="Battery size (kWh)" hint="Usable capacity if you know it">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1"><TextInput id="ev-cap" value={capacity} onChange={setCapacity} suffix="kWh" /></div>
            <ToolSelect className="w-44 shrink-0" tone="emerald" ariaLabel="Typical battery sizes" value="" placeholder="Typical…" onChange={setCapacity} options={BATTERY_PRESETS.map((p) => ({ id: String(p.kwh), label: p.label }))} />
          </div>
        </Field>
        <Field id="ev-from" label="Charge now (%)"><TextInput id="ev-from" value={from} onChange={setFrom} suffix="%" /></Field>
        <Field id="ev-to" label="Charge wanted (%)"><TextInput id="ev-to" value={to} onChange={setTo} suffix="%" /></Field>
        <Field id="ev-ac" label="Car's AC limit (kW)" hint="On-board charger: 3.3, 7.4 or 11 kW in most cars"><TextInput id="ev-ac" value={carAc} onChange={setCarAc} suffix="kW" /></Field>
        <Field id="ev-dc" label="Car's DC peak (kW)" hint="The most it takes at a fast charger (see the manual)"><TextInput id="ev-dc" value={carDc} onChange={setCarDc} suffix="kW" /></Field>
        <Field id="ev-km" label="Distance per kWh (km)" hint="About 6 for a small car, 4-5 for a large SUV"><TextInput id="ev-km" value={kmPerKwh} onChange={setKmPerKwh} suffix="km" /></Field>
      </div>

      <div className="mt-4">
        {problem ? <Problem text={problem.error} /> : (
          <>
            {added && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 text-sm text-emerald-950 shadow-sm">
                <BatteryCharging size={18} className="text-emerald-600" />
                <span>Going from <strong>{input.fromPct}%</strong> to <strong>{input.toPct}%</strong> adds about <strong>{added.addedKwh.toFixed(1)} kWh</strong>{added.addedKm > 0 ? <> (roughly <strong>{Math.round(added.addedKm)} km</strong> of driving)</> : null}.</span>
              </div>
            )}
            <ul className="grid gap-2">
              {rows.map((r, i) => {
                const hours = isEvProblem(r.e) ? 0 : r.e.hours;
                const pct = longest > 0 ? Math.max(4, (hours / longest) * 100) : 0;
                return (
                  <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, type: "spring", stiffness: 260, damping: 24 }} className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold ${r.kind === "DC" ? "bg-gradient-to-r from-amber-100 to-orange-100 text-orange-900" : "bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-900"}`}>{r.kind === "DC" ? <Zap size={12} /> : <PlugZap size={12} />}{r.kind}</span>
                      <span className="text-sm font-bold text-slate-900">{r.label.replace(/^(AC|DC) /, "")}</span>
                      {isEvProblem(r.e) ? <span className="text-sm text-rose-700">{r.e.error}</span> : (
                        <>
                          <span className="text-xs text-slate-500">car takes {Number(r.e.pace.toFixed(1))} kW{r.e.limitedBy === "car" ? <span className="ml-1 font-semibold text-amber-700">(car&apos;s limit)</span> : null}</span>
                          <span className="ml-auto whitespace-nowrap text-lg font-extrabold text-emerald-800">{hoursText(r.e.hours)}</span>
                        </>
                      )}
                    </div>
                    {!isEvProblem(r.e) && (
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} className={`h-full rounded-full ${r.kind === "DC" ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-sky-400 to-cyan-500"}`} />
                      </div>
                    )}
                    <p className="mt-1 text-xs leading-snug text-slate-500">{r.note}</p>
                  </motion.li>
                );
              })}
            </ul>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field id="ev-own" label="Your own charger (optional)"><TextInput id="ev-own" value={ownKw} onChange={setOwnKw} suffix="kW" placeholder="e.g. 50" /></Field>
          <ToolSelect className="w-40 shrink-0" tone="emerald" ariaLabel="Kind of your charger" value={ownKind} onChange={(id) => setOwnKind(id as "AC" | "DC")} options={[{ id: "DC", label: "DC (fast)" }, { id: "AC", label: "AC (slow)" }]} />
        </div>
        <p className="mt-3 text-xs leading-snug text-slate-500">An idea, not a promise: AC loses about 10% as heat and DC about 5%; DC slows down as the battery fills (above 80% most of all), and cold weather, a hot or an old battery slow it further. Allow 25% either way, and use the maker&apos;s own figures where you have them.</p>
      </div>

      <Terms title="What the battery words mean" items={BATTERY_TERMS} />
      <Terms title="What the charger words mean (AC, DC, kW, connectors)" items={CHARGER_TERMS} />
    </div>
  );
}
