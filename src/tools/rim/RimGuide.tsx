// src/tools/rim/RimGuide.tsx
//
// "HOW TO READ A WHEEL (RIM) MARKING": 8Jx20 and its like, part by part, then why the numbers matter (which tyres fit, what else must match the car).
// It sits UNDER the tyre reader (after the tyre's own specification) as a section of its own, in emerald and teal so that it cannot be mistaken for the tyre's rose; when a tyre has been read,
// a strip tells which wheel it asks for. The same panel opens by itself when a wheel marking is typed in the search line. Computed in the browser from src/tools/rim/rim.ts; nothing is stored or sent.
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircleDot, Ruler, ShieldCheck, Wrench } from "lucide-react";
import type { TyreSize } from "@/tools/tyre/tyre";
import { FIT_TERMS, parseRim, readRim, rimForTyre, type RimRow } from "./rim";
import { inputCls } from "@/components/tools/toolAtoms";

const SAMPLES = ["8Jx20", "6.5Jx16", "7Jx17 ET45", "9.5Jx21"];

/** one colour for each kind of part, on the plate and in the list */
const PART_STYLE: Record<string, { text: string; chip: string; bar: string }> = {
  "Rim width": { text: "text-sky-300", chip: "bg-sky-100 text-sky-800", bar: "bg-sky-400" },
  "Flange profile": { text: "text-amber-300", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-400" },
  Build: { text: "text-fuchsia-300", chip: "bg-fuchsia-100 text-fuchsia-800", bar: "bg-fuchsia-400" },
  "Rim diameter": { text: "text-emerald-300", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-400" },
  Offset: { text: "text-rose-300", chip: "bg-rose-100 text-rose-800", bar: "bg-rose-400" },
  "Bolt pattern": { text: "text-violet-300", chip: "bg-violet-100 text-violet-800", bar: "bg-violet-400" },
  "Centre bore": { text: "text-cyan-300", chip: "bg-cyan-100 text-cyan-800", bar: "bg-cyan-400" },
};
const styleOf = (r: RimRow) => PART_STYLE[r.meaning] ?? PART_STYLE["Rim width"];
const SHORT: Record<string, string> = { "Rim width": "Width in", "Flange profile": "Flange", Build: "Build", "Rim diameter": "Diameter in", Offset: "Offset", "Bolt pattern": "Bolts", "Centre bore": "Bore" };
const FACT_ICON = [<Ruler key="a" size={16} />, <CircleDot key="b" size={16} />, <ShieldCheck key="c" size={16} />, <Wrench key="d" size={16} />];
const inch = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function RimGuide({ start, tyre, standalone }: { start: string; tyre?: TyreSize | null; standalone?: boolean }) {
  const [text, setText] = useState(start);
  const spec = parseRim(text);
  const reading = spec ? readRim(spec) : null;
  const want = tyre ? rimForTyre(tyre) : null;
  const widths = want ? Array.from(new Set([want.lo, want.hi])) : [];

  return (
    <section
      aria-label="Wheel (rim) markings"
      className={`relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-lg ring-1 ring-white/70 sm:p-5 ${standalone ? "" : "mt-8"}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-14 h-44 w-44 rounded-full bg-emerald-300/25 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-teal-300/25 blur-3xl" />

      {!standalone && (
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-white/70"><CircleDot size={22} /></span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold leading-tight text-slate-900">The wheel it sits on: reading a rim marking</h3>
            <p className="text-xs text-slate-600">The tyre is half of the story: the wheel is stamped with its own size, such as 8Jx20.</p>
          </div>
        </div>
      )}

      <div className="relative mt-4">
        <label htmlFor="rim-size" className="text-xs font-semibold uppercase tracking-wide text-slate-600">Wheel marking, as stamped on the wheel</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input id="rim-size" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className={`${inputCls} max-w-xs text-lg font-extrabold tracking-wide focus:border-emerald-400 focus:ring-emerald-100`} />
          <span className="text-xs text-slate-500">try</span>
          {SAMPLES.map((s) => (
            <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-800">{s}</button>
          ))}
        </div>
      </div>

      {want && (
        <div className="relative mt-3 rounded-2xl border border-emerald-200 bg-white/80 px-3.5 py-2.5 text-sm leading-snug text-slate-700 shadow-sm">
          <span className="font-bold text-emerald-800">For the tyre above</span> ({tyre!.width}/{tyre!.aspect} R{tyre!.rim}): it needs a <b>{want.diameter}-inch</b> wheel, usually <b>{inch(want.lo)}{want.hi !== want.lo ? ` to ${inch(want.hi)}` : ""} inches</b> wide. Try{" "}
          {widths.map((w, i) => (
            <React.Fragment key={w}>
              {i > 0 && " or "}
              <button type="button" onClick={() => setText(`${inch(w)}Jx${want.diameter}`)} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-extrabold text-emerald-900 transition hover:bg-emerald-200">{inch(w)}Jx{want.diameter}</button>
            </React.Fragment>
          ))}
          .
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {spec && reading ? (
          <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="relative">
            <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 px-5 py-5 shadow-xl ring-1 ring-white/10" aria-label="The marking, part by part">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-teal-400/20 blur-3xl" />
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
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="text-emerald-600">{FACT_ICON[i % 4]}</span>{f.label}</dt>
                  <dd className="mt-0.5 text-base font-extrabold leading-tight text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-white/90 p-3.5 shadow-sm">
                <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-900"><ShieldCheck size={16} />Tyre fitment</h4>
                <p className="mt-1 text-sm leading-snug text-slate-700">A {inch(spec.width)}-inch wide rim generally works best with tyre widths of <b>{reading.tyre.bestMin} to {reading.tyre.bestMax} mm</b>, and the range stretches from {reading.tyre.min} mm up to {reading.tyre.max} mm on taller SUV profiles. A tyre that is too narrow or too wide for the rim can compromise handling and safety.</p>
              </div>
              <div className="rounded-2xl border border-teal-200 bg-white/90 p-3.5 shadow-sm">
                <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-teal-900"><Wrench size={16} />Vehicle clearance</h4>
                <p className="mt-1 text-sm leading-snug text-slate-700">The size alone does not say that a wheel will fit a car. Check also the <b>offset (ET)</b>, the <b>bolt pattern (PCD)</b> and the <b>centre bore</b>, so that the wheel bolts onto the hub and clears the brakes and the arches.</p>
              </div>
            </div>
            {reading.notes.map((n) => <p key={n} className="mt-2 text-xs leading-snug text-slate-500">{n}</p>)}
          </motion.div>
        ) : (
          <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
            Type a marking such as <code className="rounded-lg bg-slate-100 px-1.5 py-0.5 font-semibold">8Jx20</code>: the width in inches, the flange letter, an x, then the diameter in inches. An offset (ET35), a bolt pattern (5x114.3) and a centre bore (CB67.1) may follow.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="relative mt-4 rounded-2xl border border-slate-200 bg-white/80 p-3.5 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900">Three more figures decide whether a wheel fits a car</h4>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3">
          {FIT_TERMS.map((t) => (
            <div key={t.term} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-sm font-extrabold text-slate-900"><span className="mr-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">{t.term}</span>{t.name}</dt>
              <dd className="mt-1 text-xs leading-snug text-slate-600">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
