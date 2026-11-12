// src/components/tools/TyreCard.tsx
//
// "HOW TO READ YOUR TYRE SIZE": the size is typed (or arrives from the search line), and each part of it is explained: width, height of the sidewall, construction, rim, load index, speed symbol.
// Each part has its own colour, on the plate and in the list below it, so the eye can pair them. Computed in the browser from src/lib/tools/tyre.ts; nothing is stored or sent.
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gauge, Ruler, ScanLine, Weight } from "lucide-react";
import { parseTyre, readTyre, LOAD_INDEX_KG, SPEED_KMH, type TyreRow } from "@/lib/tools/tyre";
import { inputCls } from "./toolAtoms";

const SAMPLES = ["205/55 R16 91V", "185/65 R15 88T", "215/60 R17 96H", "165/80 R14 85T"];

/** one colour for each kind of part, on the plate and in the list */
const PART_STYLE: Record<string, { text: string; chip: string; bar: string }> = {
  "Type of tyre": { text: "text-fuchsia-300", chip: "bg-fuchsia-100 text-fuchsia-800", bar: "bg-fuchsia-400" },
  "Tyre width": { text: "text-sky-300", chip: "bg-sky-100 text-sky-800", bar: "bg-sky-400" },
  "Aspect ratio": { text: "text-violet-300", chip: "bg-violet-100 text-violet-800", bar: "bg-violet-400" },
  Construction: { text: "text-amber-300", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-400" },
  "Rim diameter": { text: "text-emerald-300", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-400" },
  "Load index": { text: "text-rose-300", chip: "bg-rose-100 text-rose-800", bar: "bg-rose-400" },
  "Speed symbol": { text: "text-cyan-300", chip: "bg-cyan-100 text-cyan-800", bar: "bg-cyan-400" },
  Marking: { text: "text-slate-300", chip: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
};
const styleOf = (r: TyreRow) => PART_STYLE[r.meaning] ?? PART_STYLE.Marking;
const SHORT: Record<string, string> = { "Aspect ratio": "Aspect %", "Tyre width": "Width", "Rim diameter": "Rim", "Type of tyre": "Type", "Speed symbol": "Speed", "Load index": "Load" };
const FACT_ICON = [<Ruler key="a" size={16} />, <ScanLine key="b" size={16} />, <Gauge key="c" size={16} />, <Weight key="d" size={16} />];

export function TyreCard({ start }: { start: string }) {
  const [text, setText] = useState(start);
  const [showTables, setShowTables] = useState(false);
  const size = parseTyre(text);
  const reading = size ? readTyre(size) : null;
  return (
    <div>
      <label htmlFor="tyre-size" className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tyre size, as printed on the sidewall</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="tyre-size" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className={`${inputCls} max-w-xs text-lg font-extrabold tracking-wide focus:border-rose-400 focus:ring-rose-100`} />
        <span className="text-xs text-slate-500">try</span>
        {SAMPLES.map((s) => <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:text-rose-700">{s}</button>)}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {size && reading ? (
          <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-800 px-5 py-5 shadow-xl ring-1 ring-white/10" aria-label="The size, part by part">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
              <div className="relative flex flex-wrap items-end justify-center gap-x-5 gap-y-4">
                {reading.rows.map((r, i) => (
                  <motion.div key={r.meaning} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, type: "spring", stiffness: 260, damping: 22 }} className="flex flex-col items-center">
                    <span className={`text-4xl font-extrabold leading-none tracking-wide ${styleOf(r).text}`}>{r.part}</span>
                    <span className={`mt-2 h-1 w-full min-w-[2.5rem] rounded-full ${styleOf(r).bar}`} />
                    <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70">{SHORT[r.meaning] ?? r.meaning}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <ul className="mt-3 grid gap-2">
              {reading.rows.map((r) => (
                <li key={r.meaning} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm">
                  <span className={`mt-0.5 inline-flex min-w-[2.75rem] justify-center rounded-lg px-2 py-1 text-sm font-extrabold ${styleOf(r).chip}`}>{r.part}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">{r.meaning}</div>
                    <div className="text-sm leading-snug text-slate-600">{r.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {reading.facts.map((f, i) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3.5 py-2.5 shadow-sm">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="text-rose-500">{FACT_ICON[i % 4]}</span>{f.label}</dt>
                  <dd className="mt-0.5 text-base font-extrabold leading-tight text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>
            {reading.notes.map((n) => <p key={n} className="mt-2 text-xs leading-snug text-slate-500">{n}</p>)}
          </motion.div>
        ) : (
          <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
            Type a size such as <code className="rounded-lg bg-slate-100 px-1.5 py-0.5 font-semibold">205/55 R16 91V</code>: width / height R rim, then the load index and speed symbol.
          </motion.p>
        )}
      </AnimatePresence>

      <button type="button" onClick={() => setShowTables((v) => !v)} className="mt-3 rounded-full border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50">{showTables ? "Hide the load and speed tables" : "Show the load-index and speed-symbol tables"}</button>
      <AnimatePresence initial={false}>
        {showTables && (
          <motion.div key="tables" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-600"><tr><th className="px-3 py-1.5">Load index</th><th className="px-3 py-1.5">kg a tyre</th></tr></thead>
                  <tbody>{Object.entries(LOAD_INDEX_KG).map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="px-3 py-1 font-semibold">{k}</td><td className="px-3 py-1">{v}</td></tr>)}</tbody></table>
              </div>
              <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-600"><tr><th className="px-3 py-1.5">Speed symbol</th><th className="px-3 py-1.5">Up to</th></tr></thead>
                  <tbody>{Object.entries(SPEED_KMH).map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="px-3 py-1 font-semibold">{k}</td><td className="px-3 py-1">{v.over ? "over " : ""}{v.kmh} km/h</td></tr>)}</tbody></table>
              </div>
              <p className="text-[11px] text-slate-500 sm:col-span-2">Standard (ETRTO / ISO) values. Charts that circulate as pictures often carry garbled figures: trust the tyre&apos;s own sidewall and the vehicle&apos;s manual.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
