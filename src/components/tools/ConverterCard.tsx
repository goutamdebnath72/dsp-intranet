// src/components/tools/ConverterCard.tsx
//
// THE CONVERTER, LAID OUT LIKE GOOGLE'S but dressed like the management windows: a kind on top; under it a value with its unit on the left, the result with its unit on the right (a dark glowing panel),
// (no formula line, by the owner's wish). Both boxes can be typed in (the other follows), both units can be changed (or swapped with the round button), and so can the kind.
// ELASTIC: a long unit name wraps and its box inflates with a spring, a short one lets it deflate; the two panels trade width by the length of what they show; a long number shrinks to stay whole.
// Engine power (PS, bhp, kW) is three panels at once. Everything is computed in the browser from the tables in src/lib/tools; the only download is the public exchange-rate table, passed in.
"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, Info } from "lucide-react";
import type { Rates } from "@/lib/tools/currency";
import { CONV_KINDS, ENGINE_UNITS, KIND_NAMES, boxNumber, compute, defaultPair, engineRows, optionsFor, plainNumber, type ConvKind } from "@/lib/tools/converterModel";
import { num } from "@/lib/tools/finance";
import { CopyButton } from "./toolAtoms";
import { ToolSelect, fitSize, type Tone } from "./toolKit";

export interface ConverterStart {
  kind: ConvKind;
  from: string;
  to: string;
  value: number;
}

export const DEFAULT_START: ConverterStart = { kind: "length", ...(() => { const [from, to] = defaultPair("length"); return { from, to }; })(), value: 1 };

const KIND_OPTIONS = CONV_KINDS.map((k) => ({ id: k, label: KIND_NAMES[k] }));

/** how much of the row a panel asks for: more for a long number or a long unit name, never less than a share of one */
export function panelWeight(text: string, label: string): number {
  return Math.round(Math.min(2.4, Math.max(1, Math.max(text.length * 0.9, label.length * 0.5) / 13)) * 100) / 100;
}

/** the big number of a panel: an input that shrinks as the number grows, so it is always seen whole */
function BigInput({ label, value, onChange, dark }: { label: string; value: string; onChange: (v: string) => void; dark?: boolean }) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full min-w-0 bg-transparent font-extrabold tabular-nums leading-tight outline-none transition-[font-size] duration-300 ${fitSize(value)} ${dark ? "text-white placeholder:text-white/40" : "text-slate-900 placeholder:text-slate-300"}`}
    />
  );
}

export function ConverterCard({ start, rates, ratesState, tone = "sky" }: { start: ConverterStart; rates: Rates | null; ratesState: "idle" | "loading" | "ok" | "error"; tone?: Tone }) {
  const calm = useReducedMotion();
  const [kind, setKind] = useState<ConvKind>(start.kind);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [typed, setTyped] = useState(plainNumber(start.value));
  const [side, setSide] = useState<"left" | "right">("left");
  const [turns, setTurns] = useState(0);
  // engine power: the unit (PS, bhp or kW) the value was typed in
  const [engId, setEngId] = useState(start.kind === "engine" ? start.from : "hp");

  const options = optionsFor(kind);
  const v = num(typed);
  const forward = side === "left";
  // the box that was not typed in follows the one that was
  const other = Number.isFinite(v) ? compute(kind, v, forward ? from : to, forward ? to : from, rates) : null;
  const otherText = other ? boxNumber(kind, other.result) : "";
  const leftText = forward ? typed : otherText;
  const rightText = forward ? otherText : typed;
  const info = compute(kind, 1, from, to, rates);
  const waiting = kind === "currency" && !rates;
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? "";

  const engineText = (id: string): string => { const r = engineRows(v, engId)?.find((x) => x.id === id); return id === engId ? typed : r ? boxNumber("power", r.value) : ""; };

  const freeze = () => { setTyped(leftText); setSide("left"); };
  const pickKind = (k: ConvKind) => {
    const [f, t] = defaultPair(k);
    setKind(k); setFrom(f); setTo(t); setTyped(kind === "engine" ? engineText("hp") || "1" : leftText || "1"); setSide("left"); setEngId("hp");
  };
  const swap = () => { setTyped(leftText); setSide("left"); setFrom(to); setTo(from); setTurns((n) => n + 1); };

  const wl = panelWeight(leftText, labelOf(from)), wr = panelWeight(waiting ? "" : rightText, labelOf(to));
  const engineCols = ENGINE_UNITS.map((e) => panelWeight(engineText(e.id), e.name));

  return (
    <div>
      <ToolSelect variant="kind" tone={tone} value={kind} options={KIND_OPTIONS} onChange={(k) => pickKind(k as ConvKind)} ariaLabel="What to convert" className="w-full sm:w-96" />

      {kind === "engine" ? (
        <div className="mt-4">
          <div
            className="grid grid-cols-1 items-stretch gap-3 transition-[grid-template-columns] duration-500 ease-out sm:[grid-template-columns:var(--cols)]"
            style={{ "--cols": `${engineCols[0]}fr auto ${engineCols[1]}fr auto ${engineCols[2]}fr` } as React.CSSProperties}
          >
            {ENGINE_UNITS.map((e, i) => {
              const grad = e.id === "ps" ? "from-amber-500 via-orange-500 to-rose-500" : e.id === "hp" ? "from-sky-500 via-cyan-500 to-indigo-600" : "from-emerald-500 via-teal-500 to-cyan-600";
              return (
                <React.Fragment key={e.id}>
                  {i > 0 && <span className="flex items-center justify-center text-2xl font-extrabold text-slate-400" aria-hidden="true">=</span>}
                  <div className={`relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-white shadow-lg ring-2 transition ${grad} ${e.id === engId ? "ring-slate-900/30" : "ring-white/60"}`}>
                    <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
                    <div className="relative flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-widest text-white/90">{e.short}</span>
                      <CopyButton dark text={engineText(e.id)} />
                    </div>
                    <div className="relative mt-1">
                      <BigInput dark label={`Engine power in ${e.short}`} value={engineText(e.id)} onChange={(x) => { setTyped(x); setEngId(e.id); }} />
                    </div>
                    <p className="relative mt-1 break-words text-xs font-medium leading-snug text-white/85">{e.name}</p>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">The same power gives the largest number in PS, then bhp, then kW.</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {ENGINE_UNITS.map((e) => (
              <div key={e.id} className={`rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm ${e.id === "ps" ? "border-t-4 border-t-orange-400" : e.id === "hp" ? "border-t-4 border-t-sky-500" : "border-t-4 border-t-emerald-500"}`}>
                <dt className="text-sm font-bold leading-snug text-slate-900">{e.short} <span className="font-semibold text-slate-600">— {e.name}</span></dt>
                <dd className="mt-1 text-xs leading-relaxed text-slate-600">{e.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <>
          <div
            className="mt-4 grid grid-cols-1 items-stretch gap-3 transition-[grid-template-columns] duration-500 ease-out sm:[grid-template-columns:var(--cols)]"
            style={{ "--cols": `${wl}fr auto ${wr}fr` } as React.CSSProperties}
          >
            <div className="relative min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 pt-3 pb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">From</span>
                <BigInput label="Value to convert" value={leftText} onChange={(x) => { setTyped(x); setSide("left"); }} />
              </div>
              <div className="border-t border-slate-100">
                <ToolSelect variant="unit" tone={tone} value={from} options={options} onChange={(id) => { freeze(); setFrom(id); }} ariaLabel="Convert from" />
              </div>
            </div>

            <div className="flex items-center justify-center">
              <button type="button" onClick={swap} aria-label="Swap the two units" title="Swap the two units" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-4 ring-white transition hover:scale-110 active:scale-95">
                <motion.span animate={{ rotate: turns * 180 }} transition={calm ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 18 }} className="flex"><ArrowLeftRight size={17} /></motion.span>
              </button>
            </div>

            <div className="relative min-w-0 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900 text-white shadow-xl shadow-indigo-900/20 ring-1 ring-white/10">
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <span className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-sky-400/30 blur-3xl" />
                <span className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-indigo-400/30 blur-3xl" />
                {rightText && !waiting && <motion.span key={rightText} initial={calm ? false : { opacity: 0.45 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} className="absolute inset-0 bg-white" />}
              </span>
              <div className="relative px-4 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-300">Result</span>
                  {rightText && !waiting && <CopyButton dark text={rightText} />}
                </div>
                {waiting ? (
                  <div className="py-1 text-3xl font-extrabold leading-tight text-white/50" aria-live="polite">{ratesState === "error" ? "—" : <span className="inline-block animate-pulse">…</span>}</div>
                ) : (
                  <BigInput dark label="Result" value={rightText} onChange={(x) => { setTyped(x); setSide("right"); }} />
                )}
              </div>
              <div className="relative border-t border-white/10">
                <ToolSelect variant="unit" dark alignRight tone={tone} value={to} options={options} onChange={(id) => { freeze(); setTo(id); }} ariaLabel="Convert to" />
              </div>
            </div>
          </div>

          {!info && kind === "currency" && <p className="mt-3 text-sm text-slate-600">{ratesState === "error" ? "Exchange rates cannot be fetched right now. Please try again in a little while." : "Fetching today's exchange rates…"}</p>}
          {info?.notes.map((n) => (
            <p key={n} className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 text-xs leading-snug text-amber-900"><Info size={14} className="mt-0.5 shrink-0" />{kind === "currency" ? `${info.formula}. ` : "Note: "}{n}{n.endsWith(".") ? "" : "."}</p>
          ))}
        </>
      )}
    </div>
  );
}
