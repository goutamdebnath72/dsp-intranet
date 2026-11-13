// src/tools/bh/BhCard.tsx
//
// "HOW TO READ A BH MARK": the mark is typed (or arrives from the search line) and each part is explained: the year, BH, the number and the letters. Under the reading, the literature
// (BhGuide.tsx). Computed in the browser from src/tools/bh/bh.ts; nothing typed is stored or sent.
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CalendarDays, Globe2, Hash, Receipt } from "lucide-react";
import { BH_SAMPLES, readBh, type BhPart } from "./bh";
import { inputCls } from "@/components/tools/toolAtoms";
import { BhGuide } from "./BhGuide";

/** one colour for each part, on the plate and in the list */
const PART_STYLE: Record<BhPart["id"], { bar: string; chip: string }> = {
  year: { bar: "bg-sky-500", chip: "bg-sky-100 text-sky-800" },
  series: { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800" },
  number: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800" },
  letters: { bar: "bg-violet-500", chip: "bg-violet-100 text-violet-800" },
};
const PART_LABEL: Record<BhPart["id"], string> = { year: "Year", series: "Bharat", number: "Number", letters: "Letters" };
const FACT_ICON = [<CalendarDays key="a" size={16} />, <Globe2 key="b" size={16} />, <Hash key="c" size={16} />, <Receipt key="d" size={16} />];

export function BhCard({ start }: { start: string }) {
  const [text, setText] = useState(start);
  const r = readBh(text);
  return (
    <div>
      <label htmlFor="bh-no" className="text-xs font-semibold uppercase tracking-wide text-slate-600">A BH-series number, as on the plate or the registration certificate</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="bh-no" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className={`${inputCls} max-w-xs text-lg font-extrabold uppercase tracking-widest focus:border-emerald-400 focus:ring-emerald-100`} />
        <span className="text-xs text-slate-500">try</span>
        {BH_SAMPLES.map((s) => (
          <button key={s.text} type="button" onClick={() => setText(s.text)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-800">{s.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {r.ok ? (
          <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="mt-4 flex justify-center rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 px-3 py-6 shadow-inner" aria-label="The number, part by part">
              <div className="rounded-xl border-[3px] border-slate-900 bg-white px-4 pb-2 pt-3 shadow-xl">
                {/* each part is one column: its characters, its bar and its label, so the label is always centred under its own bar, whatever the width of the characters */}
                <div className="flex items-start justify-center gap-3 sm:gap-5">
                  {r.parts.map((p) => (
                    <div key={p.id} className="flex flex-col items-stretch">
                      <span className="text-center text-4xl font-extrabold leading-none tracking-wider text-slate-900">{p.text}</span>
                      <span className={`mt-1.5 h-1.5 rounded-full ${PART_STYLE[p.id].bar}`} />
                      <span className="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{PART_LABEL[p.id]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ul className="mt-3 grid gap-2">
              {r.parts.map((p) => (
                <li key={p.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm">
                  <span className={`mt-0.5 inline-flex min-w-[3.25rem] justify-center rounded-lg px-2 py-1 text-sm font-extrabold tracking-wider ${PART_STYLE[p.id].chip}`}>{p.text}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">{p.meaning}</div>
                    <div className="text-sm leading-snug text-slate-600">{p.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {r.facts.map((f, i) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3.5 py-2.5 shadow-sm">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="text-emerald-500">{FACT_ICON[i % 4]}</span>{f.label}</dt>
                  <dd className="mt-0.5 text-base font-extrabold leading-tight text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>
            {r.warnings.map((w) => <p key={w} className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>)}
            {r.notes.map((n) => <p key={n} className="mt-2 text-xs leading-snug text-slate-500">{n}</p>)}
          </motion.div>
        ) : (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
            {r.typed ? r.issues.map((i) => <p key={i} className="flex items-start gap-2 text-rose-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{i}</p>)
              : <p>Type a BH-series number, for example <code className="rounded-lg bg-slate-100 px-1.5 py-0.5 font-semibold">26 BH 1234 AA</code>. The guide below is for everyone: who can have the series, how to apply, and the road tax.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <BhGuide />
    </div>
  );
}
