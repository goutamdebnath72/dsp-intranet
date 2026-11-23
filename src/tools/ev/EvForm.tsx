// src/tools/ev/EvForm.tsx
//
// The electric-car window, in two tabs (the charging time now carries WHAT IT COSTS too: tariff.ts, official figures, a ceiling or the person's own rate): "Charging time" (below) and "EV specifications explained" (EvGuide.tsx). CHARGING TIME: the battery size, the charge to start and end at, what the car accepts on AC and DC; the answer is a table of how long each kind of charger takes, with what the
// words mean underneath. It all runs in the browser (src/tools/ev/ev.ts); nothing is stored or sent. The times are approximate, and the card says so.
"use client";

import React, { useMemo, useState } from "react";
import { CHARGERS, BATTERY_TERMS, CHARGER_TERMS, EV_DEFAULTS, estimateCharge, hoursText, isEvProblem, validateEv, type EvInput } from "./ev";
import { num, rupees } from "@/lib/tools/money";
import { BANDS, SERVICE_VALID_TO, TARIFF_SOURCES, TARIFF_YEAR, chargeCost, ratePerUnit, unitPrice, usableOwnRate, type Band } from "./tariff";
import { motion } from "framer-motion";
import { BatteryCharging, ChevronRight, IndianRupee, PlugZap, Zap } from "lucide-react";
import { Field, TextInput, Problem } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";
import { Pills } from "@/components/tools/Pills";
import { EvGuide } from "./EvGuide";

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

/** A short choice of one among a few. I made it a radio group, not tabs, because nothing below it is a page of its own. */
function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; text: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} data-ev-band className="inline-flex max-w-full flex-wrap gap-0.5 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${value === o.id ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30" : "text-slate-600 hover:text-slate-900"}`}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** The rate chart: the highest price per unit a public charger may charge, for each kind of charger and each time of day, with its two parts; the chosen time of day is marked. The rules fix one ceiling for every AC charger and one for every DC charger, whatever its kW. */
function RateChart({ band, own }: { band: Band; own: boolean }) {
  const kinds: Array<{ kind: "AC" | "DC"; name: string; sub: string }> = [
    { kind: "AC", name: "AC (slow)", sub: "3.3 to 22 kW" },
    { kind: "DC", name: "DC (fast)", sub: "30 kW and above" },
  ];
  return (
    <div data-ev-chart className="mt-4 rounded-2xl border border-amber-200 bg-white/90 px-4 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><IndianRupee size={16} className="text-orange-600" /> Rate chart: the highest price per unit (kWh) at a public charger in West Bengal</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5">Charger</th>
              {BANDS.map((b) => <th key={b.id} data-ev-chart-band={b.id} className={`px-2 py-1.5 ${!own && b.id === band ? "rounded-t-xl bg-amber-100 text-orange-900" : ""}`}>{b.label.replace(" · ", " ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.kind} data-ev-chart-row={k.kind} className="border-t border-slate-100">
                <th scope="row" className="border-t border-slate-100 px-2 py-2 align-top"><span className="block font-bold text-slate-900">{k.name}</span><span className="block text-[11px] font-normal text-slate-500">{k.sub}</span></th>
                {BANDS.map((b) => {
                  const p = unitPrice(k.kind, b.id);
                  return (
                    <td key={b.id} className={`border-t border-slate-100 px-2 py-2 align-top ${!own && b.id === band ? "bg-amber-50" : ""}`}>
                      <span className="block text-base font-extrabold text-orange-900">{ratePerUnit(p.total)}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{ratePerUnit(p.supply).replace("₹ ", "")} electricity + {ratePerUnit(p.service).replace("₹ ", "")} service</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr data-ev-chart-row="home">
              <th scope="row" className="border-t border-slate-100 px-2 py-2 align-top"><span className="block font-bold text-slate-900">At home</span><span className="block text-[11px] font-normal text-slate-500">your own meter</span></th>
              <td colSpan={3} className="border-t border-slate-100 px-2 py-2 text-xs leading-snug text-slate-600">The domestic electricity rate of your household applies (Ministry of Power guidelines, clause 15(4)). It depends on your slab, so type the rate on your bill in the box above.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Before GST and land cost; a station may charge less. Electricity: the WBSEDCL tariff for charging stations, tariff year {TARIFF_YEAR} (₹ 6.00 in the peak hours 5 to 11 pm, ₹ 5.50 otherwise). Service charge: the Ministry of Power&apos;s ceiling, valid till {SERVICE_VALID_TO} and reviewed every year (solar hours 9 am to 4 pm are cheaper). The hour from 4 to 5 pm is priced as night. The rules fix one ceiling for all AC chargers and one for all DC chargers, whatever their kW.
      </p>
    </div>
  );
}

/** The first tab: how long a charge takes, and what it costs. */
function ChargeTime() {
  const [capacity, setCapacity] = useState(String(EV_DEFAULTS.capacityKwh));
  const [from, setFrom] = useState(String(EV_DEFAULTS.fromPct));
  const [to, setTo] = useState(String(EV_DEFAULTS.toPct));
  const [carAc, setCarAc] = useState(String(EV_DEFAULTS.carAcKw));
  const [carDc, setCarDc] = useState(String(EV_DEFAULTS.carDcKw));
  const [kmPerKwh, setKmPerKwh] = useState(String(EV_DEFAULTS.kmPerKwh));
  const [ownKw, setOwnKw] = useState("");
  const [ownKind, setOwnKind] = useState<"AC" | "DC">("DC");
  // What it costs: I take the time of day at a public charger (the official ceilings, tariff.ts), or the person's own rate per unit.
  const [band, setBand] = useState<Band>("day");
  const [ownRate, setOwnRate] = useState("");
  const myRate = usableOwnRate(num(ownRate));

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
            <div data-ev-cost-panel className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-950"><IndianRupee size={16} className="text-orange-600" /> What it costs</p>
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                {myRate === null && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Time of day at a public charger</p>
                    <Segmented label="Time of day at a public charger" options={BANDS.map((b) => ({ id: b.id, text: b.label }))} value={band} onChange={setBand} />
                  </div>
                )}
                <div className="w-60 max-w-full">
                  <Field id="ev-rate" label="Or your own rate (₹ per unit)" hint="At home, the rate on your electricity bill; at a charger, the price on its display"><TextInput id="ev-rate" value={ownRate} onChange={setOwnRate} suffix="₹/unit" placeholder="e.g. 7" /></Field>
                </div>
              </div>
              <p data-ev-cost-note className="mt-2 text-xs leading-snug text-slate-600">
                {myRate !== null
                  ? <>Every cost below uses your rate of <strong>{ratePerUnit(myRate)}</strong> per unit.</>
                  : <>The cost of a public charger is the <strong>highest the rules allow</strong> at that time of day (West Bengal&apos;s electricity tariff + the national ceiling on the service charge), before GST and land cost; a station may charge less. At home, domestic rates apply: type the rate on your bill.</>}
              </p>
            </div>
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
                          <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                            {(() => { const c = chargeCost(r.e.fromGridKwh, r.kind, { band, ownRate: myRate ?? undefined }); return <span data-ev-chip className="rounded-lg bg-gradient-to-r from-amber-100 to-orange-100 px-2 py-1 text-sm font-extrabold text-orange-900">{c.basis === "standard" ? "up to " : ""}{rupees(c.cost)}</span>; })()}
                            <span className="text-lg font-extrabold text-emerald-800">{hoursText(r.e.hours)}</span>
                          </span>
                        </>
                      )}
                    </div>
                    {!isEvProblem(r.e) && (
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} className={`h-full rounded-full ${r.kind === "DC" ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-sky-400 to-cyan-500"}`} />
                      </div>
                    )}
                    <p className="mt-1 text-xs leading-snug text-slate-500">{r.note}</p>
                    {!isEvProblem(r.e) && (() => { const c = chargeCost(r.e.fromGridKwh, r.kind, { band, ownRate: myRate ?? undefined }); return <p data-ev-rate className="mt-0.5 text-xs leading-snug text-slate-600">{r.e.fromGridKwh.toFixed(1)} units drawn × {ratePerUnit(c.rate)}{c.basis === "standard" ? <> ({ratePerUnit(c.supply ?? 0)} electricity + {ratePerUnit(c.service ?? 0)} service charge, the ceiling)</> : <> (your rate)</>}</p>; })()}
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
        <RateChart band={band} own={myRate !== null} />
        <p className="mt-3 text-xs leading-snug text-slate-500">An idea, not a promise: AC loses about 10% as heat and DC about 5%; DC slows down as the battery fills (above 80% most of all), and cold weather, a hot or an old battery slow it further. Allow 25% either way, and use the maker&apos;s own figures where you have them.</p>
      </div>

      <Terms title={`How the cost is worked out, and where the figures come from (tariff year ${TARIFF_YEAR})`} items={[
        { term: "What a public charger may charge", meaning: `Per unit (kWh): the electricity tariff the station pays + a service charge + land cost + GST. The cost shown is the electricity tariff plus the highest service charge the Ministry of Power allows, so it is a ceiling before GST and land cost, not a promise: a station may charge less. The service-charge ceilings hold till ${SERVICE_VALID_TO} and are reviewed every year.` },
        { term: "Units charged for", meaning: "The energy drawn, which is the energy added to the battery divided by the efficiency of the charging (AC about 90%, DC about 95%): more than the kWh that reach the battery." },
        ...TARIFF_SOURCES.map((t) => ({ term: t.what, meaning: `Source: ${t.source}.` })),
        { term: "If the tariff changes", meaning: `These are the figures of the newest orders published (tariff year ${TARIFF_YEAR}). When the Commission or the Ministry changes them, or your charger shows another price, type the rate in the box: it replaces the standard figures.` },
      ]} />
      <Terms title="What the battery words mean" items={BATTERY_TERMS} />
      <Terms title="What the charger words mean (AC, DC, kW, connectors)" items={CHARGER_TERMS} />
    </div>
  );
}

export type EvTab = "time" | "guide";
const EV_TABS: Array<{ id: EvTab; text: string }> = [{ id: "time", text: "Charging time" }, { id: "guide", text: "EV specifications explained" }];

/** The electric-car window: two tabs, the charging-time estimate and the plain-words guide to the words of a spec sheet. */
export function EvForm({ initialTab = "time" }: { initialTab?: EvTab }) {
  const [tab, setTab] = useState<EvTab>(initialTab);
  return (
    <div>
      <Pills tabs={EV_TABS} value={tab} onChange={setTab} label="Electric car" id="ev" gradient="from-emerald-600 to-teal-600 shadow-emerald-600/30" />
      <div role="tabpanel" aria-label={EV_TABS.find((t) => t.id === tab)!.text} className="mt-3">
        {tab === "time" ? <ChargeTime /> : <EvGuide />}
      </div>
    </div>
  );
}
