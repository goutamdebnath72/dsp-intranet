// src/tools/vin/VinCard.tsx
//
// "HOW TO READ A VIN": the 17 characters are typed (or arrive from the search line) and each part is explained: country, manufacturer, the maker's descriptor, position 9 (a check digit where there is
// one), the model year, the plant, the serial number, and Hyundai's month letter on the chassis plate. Each kind of part has its own colour on the plate and in the list. Under the reading, the literature
// (VinGuide.tsx). Computed in the browser from src/tools/vin/vin.ts; nothing typed is stored or sent.
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CalendarDays, Calculator, Globe2, Hash, ShieldCheck } from "lucide-react";
import { SECTIONS, VIN_SAMPLES, checkSteps, readVin, splitVin, type VinPart } from "./vin";
import { inputCls } from "@/components/tools/toolAtoms";
import { VinGuide } from "./VinGuide";

/** one colour for each kind of part, on the plate and in the list */
const PART_STYLE: Record<VinPart["id"], { cell: string; chip: string; bar: string }> = {
  country: { cell: "bg-sky-400/20 text-sky-200 ring-sky-400/50", chip: "bg-sky-100 text-sky-800", bar: "bg-sky-400" },
  maker: { cell: "bg-teal-400/20 text-teal-200 ring-teal-400/50", chip: "bg-teal-100 text-teal-800", bar: "bg-teal-400" },
  descriptor: { cell: "bg-amber-400/20 text-amber-200 ring-amber-400/50", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-400" },
  check: { cell: "bg-rose-400/20 text-rose-200 ring-rose-400/50", chip: "bg-rose-100 text-rose-800", bar: "bg-rose-400" },
  year: { cell: "bg-emerald-400/20 text-emerald-200 ring-emerald-400/50", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-400" },
  plant: { cell: "bg-fuchsia-400/20 text-fuchsia-200 ring-fuchsia-400/50", chip: "bg-fuchsia-100 text-fuchsia-800", bar: "bg-fuchsia-400" },
  serial: { cell: "bg-violet-400/20 text-violet-200 ring-violet-400/50", chip: "bg-violet-100 text-violet-800", bar: "bg-violet-400" },
  month: { cell: "bg-cyan-400/20 text-cyan-200 ring-cyan-400/50", chip: "bg-cyan-100 text-cyan-800", bar: "bg-cyan-400" },
};
const FACT_ICON = [<Hash key="a" size={16} />, <Globe2 key="b" size={16} />, <CalendarDays key="c" size={16} />, <ShieldCheck key="d" size={16} />];

const partAt = (parts: VinPart[], pos: number): VinPart | undefined => parts.find((p) => p.from <= pos && pos <= p.to);

export function VinCard({ start }: { start: string }) {
  const [text, setText] = useState(start);
  const [showSteps, setShowSteps] = useState(false);
  const r = readVin(text);
  const typed = splitVin(text);
  const steps = r.ok ? checkSteps(r.vin) : null;
  const month = r.ok ? r.parts.find((p) => p.id === "month") : undefined;

  return (
    <div>
      <label htmlFor="vin-no" className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vehicle Identification Number, as stamped on the chassis or printed on the invoice</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="vin-no" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className={`${inputCls} max-w-md text-lg font-extrabold uppercase tracking-widest focus:border-amber-400 focus:ring-amber-100`} />
        <span className="text-xs text-slate-500">try</span>
        {VIN_SAMPLES.map((s) => (
          <button key={s.vin} type="button" onClick={() => setText(s.vin)} title={s.vin} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:text-amber-800">{s.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {r.ok ? (
          <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-800 px-4 py-5 shadow-xl ring-1 ring-white/10" aria-label="The number, section by section">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-center gap-x-4 gap-y-5">
                {SECTIONS.map((sec, si) => (
                  <motion.div key={sec.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * si, type: "spring", stiffness: 260, damping: 22 }} className="flex flex-col items-center">
                    <div className="flex gap-1">
                      {Array.from({ length: sec.to - sec.from + 1 }, (_, k) => sec.from + k).map((pos) => {
                        const part = partAt(r.parts, pos)!;
                        return (
                          <div key={pos} className="flex flex-col items-center">
                            <span className={`flex h-10 w-7 items-center justify-center rounded-lg text-xl font-extrabold leading-none ring-1 sm:w-8 ${PART_STYLE[part.id].cell}`}>{r.vin[pos - 1]}</span>
                            <span className="mt-1 text-[9px] font-bold tabular-nums text-white/50">{pos}</span>
                          </div>
                        );
                      })}
                    </div>
                    <span className="mt-1 h-1 w-full rounded-full bg-white/25" />
                    <span className="mt-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white/80">{sec.id}</span>
                    <span className="text-[10px] font-semibold text-white/50">{sec.name}</span>
                  </motion.div>
                ))}
                {month && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 22 }} className="flex flex-col items-center">
                    <div className="flex gap-1">
                      {["*", typed.suffix].map((c, k) => <span key={k} className={`flex h-10 w-7 items-center justify-center rounded-lg text-xl font-extrabold leading-none ring-1 sm:w-8 ${PART_STYLE.month.cell}`}>{c}</span>)}
                    </div>
                    <span className="mt-[1.125rem] h-1 w-full rounded-full bg-white/25" />
                    <span className="mt-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white/80">Plate</span>
                    <span className="text-[10px] font-semibold text-white/50">Hyundai month</span>
                  </motion.div>
                )}
              </div>
            </div>

            <ul className="mt-3 grid gap-2">
              {r.parts.map((p) => (
                <li key={p.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm">
                  <span className={`mt-0.5 inline-flex min-w-[3.25rem] justify-center rounded-lg px-2 py-1 text-sm font-extrabold tracking-wider ${PART_STYLE[p.id].chip}`}>{p.text}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">{p.meaning} <span className="text-xs font-semibold text-slate-400">· {p.id === "month" ? "after the VIN" : p.from === p.to ? `position ${p.from}` : `positions ${p.from}–${p.to}`}</span></div>
                    <div className="text-sm leading-snug text-slate-600">{p.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {r.facts.map((f, i) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3.5 py-2.5 shadow-sm">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="text-amber-500">{FACT_ICON[i % 4]}</span>{f.label}</dt>
                  <dd className="mt-0.5 text-base font-extrabold leading-tight text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>
            {r.warnings.map((w) => <p key={w} className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>)}
            {r.notes.map((n) => <p key={n} className="mt-2 text-xs leading-snug text-slate-500">{n}</p>)}

            <button type="button" onClick={() => setShowSteps((v) => !v)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-amber-50"><Calculator size={14} />{showSteps ? "Hide the check-digit working" : "Show how the check digit is worked out for this number"}</button>
            <AnimatePresence initial={false}>
              {showSteps && steps && (
                <motion.div key="steps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                  <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full min-w-[34rem] text-center text-xs">
                      <tbody>
                        <tr className="bg-slate-100 text-[11px] font-bold uppercase text-slate-600"><th className="px-2 py-1.5 text-left">Position</th>{steps.steps.map((s) => <td key={s.pos} className="px-1 py-1.5">{s.pos}</td>)}</tr>
                        <tr><th className="px-2 py-1 text-left text-slate-600">Character</th>{steps.steps.map((s) => <td key={s.pos} className={`px-1 py-1 text-sm font-extrabold ${s.pos === 9 ? "bg-rose-50 text-rose-700" : "text-slate-900"}`}>{s.ch}</td>)}</tr>
                        <tr className="border-t border-slate-100"><th className="px-2 py-1 text-left text-slate-600">Value</th>{steps.steps.map((s) => <td key={s.pos} className="px-1 py-1">{s.value}</td>)}</tr>
                        <tr className="border-t border-slate-100"><th className="px-2 py-1 text-left text-slate-600">Weight</th>{steps.steps.map((s) => <td key={s.pos} className="px-1 py-1">{s.weight}</td>)}</tr>
                        <tr className="border-t border-slate-100 font-bold"><th className="px-2 py-1 text-left text-slate-600">Value × weight</th>{steps.steps.map((s) => <td key={s.pos} className="px-1 py-1">{s.product}</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-sm leading-snug text-slate-700">
                    Sum = <b>{steps.sum}</b>. {steps.sum} ÷ 11 leaves <b>{steps.remainder}</b>{steps.remainder === 10 ? ", written X" : ""}, so the check digit would be <b>{steps.digit}</b>; position 9 holds <b>{r.vin[8]}</b>
                    {r.check.state === "valid" ? ": it agrees." : r.check.state === "mismatch" ? ": it does not agree." : ", a letter, so there is no check digit to agree."}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-slate-500">Letters count as numbers (A 1, B 2 ... H 8; J 1 ... N 5; P 7; R 9; S 2 ... Z 9, with no I, O or Q); position 9 has weight 0 because it is the digit being checked.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
            {r.typed ? r.issues.map((i) => <p key={i} className="flex items-start gap-2 text-rose-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{i}</p>) : null}
            {!r.typed && <p>Type the 17 characters of a VIN, for example <code className="rounded-lg bg-slate-100 px-1.5 py-0.5 font-semibold">MALBM51BLKM000001</code>. On an Indian chassis plate Hyundai adds <code className="rounded-lg bg-slate-100 px-1.5 py-0.5 font-semibold">*L</code>, a month letter, after it.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <VinGuide yearCode={r.ok ? r.vin[9] : null} />
    </div>
  );
}
