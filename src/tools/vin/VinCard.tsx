// src/tools/vin/VinCard.tsx
//
// "HOW TO READ A VIN": the 17 characters are typed (or arrive from the search line) and each part is explained: country, manufacturer, the maker's descriptor, position 9 (a check digit where there is
// one), the model year, the plant, the serial number, and Hyundai's month letter on the chassis plate. I give each kind of part its own colour on the plate and in the list. Under the reading comes the literature
// (VinGuide.tsx). It is computed in the browser from src/tools/vin/vin.ts; nothing typed is stored or sent.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CalendarDays, Calculator, ChevronDown, Globe2, Hash, ShieldCheck } from "lucide-react";
import { MAKERS, SECTIONS, checkSteps, readVin, splitVin, type VinPart } from "./vin";
import { inputCls } from "@/components/tools/toolAtoms";
import { VinGuide } from "./VinGuide";

/** One colour for each kind of part, on the plate and in the list */
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

/** The four makers that have a chip of their own, and the rest (Mahindra first), who are in the dropdown of the fifth chip. */
const CHIPS = MAKERS.filter((m) => !m.more);
const MORE = MAKERS.filter((m) => m.more);
const CHIP_CLS = (on: boolean) => `inline-flex flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold shadow-sm transition hover:-translate-y-0.5 xl:px-4 xl:py-2 xl:text-sm ${on ? "border-amber-400 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"}`;
const WMI_CLS = (on: boolean) => `rounded-md px-1.5 py-0.5 text-[0.6875rem] font-extrabold tracking-wider xl:text-xs ${on ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-500"}`;

/**
 * The fifth chip: it is Mahindra's until another maker is chosen, and then it IS that maker's chip (name and code, marked when its number is in the box), so that the chosen maker stays in sight. It is one pill of two parts: the name puts the maker's made-up number
 * in the box, the chevron opens a dropdown of every maker that has no chip of its own. A list of my own, not the browser's: arrow keys move, Enter chooses, Escape and a click outside close it; it opens to the left when there is no room on the right.
 */
function MoreMakers({ chosen, activeSample, onPick }: { chosen: string; activeSample: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  // where the list opens: from the right edge of the chip (growing leftwards) or from its left edge (growing rightwards), whichever side has more room, and the most width it may take there
  const [place, setPlace] = useState<{ right: boolean; maxW: number }>({ right: true, maxW: 416 });
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const chev = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const maker = MORE.find((m) => m.id === chosen) ?? MORE[0];
  const on = activeSample === maker.sample;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) items.current[cursor]?.focus(); }, [open, cursor]);

  const toggle = () => {
    if (!open) {
      const r = pill.current?.getBoundingClientRect();
      if (r) {
        const roomLeft = r.right, roomRight = window.innerWidth - r.left;
        const right = roomLeft >= roomRight;
        setPlace({ right, maxW: Math.max(160, Math.min(416, (right ? roomLeft : roomRight) - 8)) });
      }
      setCursor(Math.max(0, MORE.findIndex((m) => m.id === maker.id)));
    }
    setOpen((v) => !v);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); chev.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % MORE.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + MORE.length) % MORE.length); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); setCursor(MORE.length - 1); }
  };
  const lit = on || open;
  return (
    <div ref={root} className="relative flex-auto">
      <div ref={pill} className={`flex w-full items-stretch overflow-hidden rounded-full border text-[0.8125rem] font-semibold shadow-sm transition hover:-translate-y-0.5 xl:text-sm ${lit ? "border-amber-400 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"}`}>
        <button type="button" aria-pressed={on} onClick={() => onPick(maker.id)} title={`${maker.maker}: ${maker.sample} (a made-up number, not a real vehicle's)`} className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap py-1.5 pl-3.5 pr-2.5 transition xl:py-2 xl:pl-4 ${lit ? "" : "hover:bg-amber-50"}`}>
          {maker.button}<span className={WMI_CLS(on)}>{maker.wmi}</span>
        </button>
        <button ref={chev} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Choose another maker" onClick={toggle} title="Choose another maker: Mahindra, Honda, Toyota, Nissan, Volkswagen, Škoda, Renault, Citroën, Jeep, Mercedes-Benz, Fiat, Ford, Audi, BMW, Volvo, BYD" className={`inline-flex items-center border-l px-2.5 transition xl:px-3 ${lit ? "border-amber-300 hover:bg-amber-200" : "border-slate-200 hover:bg-amber-50"}`}>
          <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul role="listbox" aria-label="More makers" onKeyDown={keys} initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }} style={{ maxWidth: place.maxW }} className={`absolute top-full z-30 mt-1.5 max-h-[min(26rem,70vh)] w-max min-w-[min(16rem,100%)] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5 ${place.right ? "right-0" : "left-0"}`}>
            {MORE.map((m, i) => (
              <li key={m.id} role="presentation">
                <button ref={(el) => { items.current[i] = el; }} type="button" role="option" aria-selected={m.id === maker.id} tabIndex={i === cursor ? 0 : -1} onClick={() => { onPick(m.id); setOpen(false); chev.current?.focus(); }} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-[0.8125rem] transition hover:bg-amber-50 focus-visible:bg-amber-50 focus-visible:outline-none ${m.id === maker.id ? "bg-amber-100 font-bold text-amber-900" : "text-slate-700"}`}>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{m.button}</span><span className="block text-[0.6875rem] leading-snug text-slate-500">{m.maker}</span>{m.remark && <span className="mt-0.5 block text-[0.6875rem] font-extrabold leading-snug text-rose-700">No new cars sold in India now</span>}</span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.625rem] font-extrabold tracking-wider text-slate-600">{m.wmi}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VinCard({ start }: { start: string }) {
  const [text, setText] = useState(start);
  const [showSteps, setShowSteps] = useState(false);
  // The maker of the fifth chip: Mahindra until another is chosen in its dropdown (a number of one of them in the box at the start chooses it).
  const [more, setMore] = useState<string>(() => MORE.find((m) => m.sample === splitVin(start).core)?.id ?? MORE[0].id);
  const r = readVin(text);
  const typed = splitVin(text);
  const steps = r.ok ? checkSteps(r.vin) : null;
  const month = r.ok ? r.parts.find((p) => p.id === "month") : undefined;

  return (
    <div>
      <label htmlFor="vin-no" className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vehicle Identification Number, as stamped on the chassis or printed on the invoice</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="vin-no" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className={`${inputCls} max-w-md text-lg font-extrabold uppercase tracking-widest focus:border-amber-400 focus:ring-amber-100`} />
      </div>
      {/* ONE ROW: a chip each for Hyundai, Kia (two companies, two manufacturer codes), Maruti Suzuki and Tata Motors, and a fifth that is Mahindra's until another maker is chosen in its dropdown (every other maker is there): each puts a made-up number of that maker in the box. The chip of the number now in the box is marked. EVERYTHING HERE IS CONTENT-SIZED AND WRAPS RATHER THAN OVERFLOWS (owner: from day 1 all sizes must adapt): each chip is as wide as its own words need and the chips share what is left of the row equally, so the fifth, which carries the name of whichever maker is chosen ("Mercedes-Benz" is wider than "Mahindra"), always ends at the right edge; when the names, the type size or the window do not fit in one row, the row wraps (never runs past the frame). Sizes are in rem, so a larger type setting scales them. The caption is left out between 1024 and 1280 px to keep the row single there. The list opens from the chip's right edge (or its left, where there is more room), is as wide as its longest line needs up to 26 rem and never wider than the room on its side. */}
      <div role="group" aria-label="Sample numbers of the makers" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 xl:gap-x-3">
        <span className="shrink-0 whitespace-nowrap text-[0.8125rem] font-semibold text-slate-500 lg:max-xl:hidden xl:text-sm">Try a number of</span>
        {CHIPS.map((m) => {
          const on = typed.core === m.sample && !typed.suffix;
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => setText(m.sample)} title={`${m.maker}: ${m.sample} (a made-up number, not a real vehicle's)`} className={CHIP_CLS(on)}>
              {m.button}<span className={WMI_CLS(on)}>{m.wmi}</span>
            </button>
          );
        })}
        <MoreMakers chosen={more} activeSample={typed.suffix ? null : typed.core} onPick={(id) => { setMore(id); setText(MAKERS.find((m) => m.id === id)?.sample ?? ""); }} />
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
                            <span className="mt-1 text-[0.5625rem] font-bold tabular-nums text-white/50">{pos}</span>
                          </div>
                        );
                      })}
                    </div>
                    <span className="mt-1 h-1 w-full rounded-full bg-white/25" />
                    <span className="mt-1.5 text-[0.625rem] font-extrabold uppercase tracking-widest text-white/80">{sec.id}</span>
                    <span className="text-[0.625rem] font-semibold text-white/50">{sec.name}</span>
                  </motion.div>
                ))}
                {month && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 22 }} className="flex flex-col items-center">
                    <div className="flex gap-1">
                      {["*", typed.suffix].map((c, k) => <span key={k} className={`flex h-10 w-7 items-center justify-center rounded-lg text-xl font-extrabold leading-none ring-1 sm:w-8 ${PART_STYLE.month.cell}`}>{c}</span>)}
                    </div>
                    <span className="mt-[1.125rem] h-1 w-full rounded-full bg-white/25" />
                    <span className="mt-1.5 text-[0.625rem] font-extrabold uppercase tracking-widest text-white/80">Plate</span>
                    <span className="text-[0.625rem] font-semibold text-white/50">Hyundai month</span>
                  </motion.div>
                )}
              </div>
            </div>

            {/* THE QUESTION USERS COME WITH: is the month and year of manufacture in this number? Answered for every number, YES or NO, in bold. */}
            <section aria-label="Month and year of manufacture" className="mt-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Month and year of manufacture: is it in this number?</h3>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {([r.made.year, r.made.month] as const).map((d) => (
                  <div key={d.head} className={`rounded-2xl border-2 px-3.5 py-2.5 shadow-sm ${d.state === "yes" ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
                    <p className={`flex items-start gap-2 text-base font-extrabold leading-snug ${d.state === "yes" ? "text-emerald-900" : "text-rose-900"}`}>
                      <span aria-hidden="true" className={`mt-0.5 inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-xs tracking-wider text-white ${d.state === "yes" ? "bg-emerald-600" : "bg-rose-600"}`}>{d.state === "yes" ? "YES" : "NO"}</span>
                      <span>{d.head}</span>
                    </p>
                    <p className="mt-1 text-xs leading-snug text-slate-700">{d.detail}</p>
                  </div>
                ))}
              </div>
            </section>
            {r.remark && <p role="note" className="mt-2 flex items-start gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm font-extrabold leading-snug text-rose-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{r.remark}</span></p>}

            <ul className="mt-3 grid gap-2">
              {r.parts.map((p) => (
                <li key={p.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 shadow-sm">
                  <span className={`mt-0.5 inline-flex w-[5.5rem] shrink-0 justify-center whitespace-nowrap rounded-lg px-2 py-1 text-sm font-extrabold tracking-wider ${PART_STYLE[p.id].chip}`}>{p.text}</span>
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
                  <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500"><span className="text-amber-500">{FACT_ICON[i % 4]}</span>{f.label}</dt>
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
                        <tr className="bg-slate-100 text-[0.6875rem] font-bold uppercase text-slate-600"><th className="px-2 py-1.5 text-left">Position</th>{steps.steps.map((s) => <td key={s.pos} className="px-1 py-1.5">{s.pos}</td>)}</tr>
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
