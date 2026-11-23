// src/tools/calculator/CalculatorCard.tsx
//
// The full calculator, laid out like the Mac's: BASIC (four columns) and SCIENTIFIC (ten columns: brackets, memory, powers, roots, logs, trig, hyperbolic, 2nd, Rad/Deg, EE), no converters in it.
// I made the function keys grey, the number keys darker and the operators orange (the pending one lights up white). It works with the mouse, the touch and the keyboard (digits, + - * /, Enter, Backspace, Delete).
// In the scientific calculator a second switch, DEC · BIN · OCT · HEX, writes the number in that base (whole numbers; the keys the base does not have are greyed, and in HEX the six trig keys of the left block become A-F, so the
// panel keeps its size). In another base the line under the number shows it in the other bases.
// All the arithmetic is in src/tools/calculator/calcEngine.ts (a pure state machine, tested). Nothing is stored or sent: the memory and the history are only in this window.
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, History, Trash2 } from "lucide-react";
import { BASES, displayNumber, enabled, historyResult, inAllBases, initialState, keyFor, pendingText, press, recall, setBase, setMode, startAt, valueIn, valueOf, type Base, type BinOp, type CalcState, type Key, type Mode } from "./calcEngine";
import { indianWords } from "./expression";
import { CopyButton } from "@/components/tools/toolAtoms";

type Kind = "top" | "num" | "fn" | "op" | "eq";
interface Btn {
  key: Key;
  label: React.ReactNode;
  aria: string;
  kind: Kind;
  /** Set to light the key while this operator is the pending one (or 2nd is on). */
  lit?: boolean;
}

const sup = (t: string) => <sup style={{ fontSize: "0.6em", lineHeight: 0 }}>{t}</sup>;
const sub = (t: string) => <sub style={{ fontSize: "0.6em", lineHeight: 0 }}>{t}</sub>;

// I took the Mac's colours: light grey for AC ⌫ %, mid grey for the numbers, dark grey for the scientific functions, amber orange (#ff9f0a) for the operators.
const KIND: Record<Kind, string> = {
  top: "bg-[#8b8b90] text-white hover:bg-[#9a9aa0]",
  num: "bg-[#59595d] text-white hover:bg-[#6a6a6f]",
  fn: "bg-[#45454a] text-white hover:bg-[#56565b]",
  op: "bg-[#ff9f0a] text-white hover:bg-[#ffb340]",
  eq: "bg-[#ff9f0a] text-white hover:bg-[#ffb340]",
};

/** These are the four columns on the right, the same in both modes. */
function right(s: CalcState): Btn[][] {
  const pending: BinOp | null = s.awaiting && s.stack.length && s.stack[s.stack.length - 1].t === "o" ? (s.stack[s.stack.length - 1] as { v: BinOp }).v : null;
  const n = (d: string): Btn => ({ key: d as Key, label: d, aria: d, kind: "num" });
  const op = (key: BinOp, label: string, aria: string): Btn => ({ key, label, aria, kind: "op", lit: pending === key });
  const clearable = !s.fresh && s.entry !== "0";
  return [
    [{ key: "back", label: <Delete size="1.15em" />, aria: "Delete the last digit", kind: "top" }, { key: "ac", label: clearable ? "C" : "AC", aria: clearable ? "Clear the number" : "Clear everything", kind: "top" }, { key: "pct", label: "%", aria: "Percent", kind: "top" }, op("div", "÷", "Divide")],
    [n("7"), n("8"), n("9"), op("mul", "×", "Multiply")],
    [n("4"), n("5"), n("6"), op("sub", "−", "Subtract")],
    [n("1"), n("2"), n("3"), op("add", "+", "Add")],
    [{ key: "neg", label: "+/−", aria: "Change the sign", kind: "num" }, n("0"), { key: ".", label: ".", aria: "Decimal point", kind: "num" }, { key: "eq", label: "=", aria: "Equals", kind: "eq" }],
  ];
}

/** These are the six columns on the left of the scientific layout; "2nd" swaps the keys that have an inverse or an alternate. */
function left(s: CalcState): Btn[][] {
  const two = s.second;
  const f = (key: Key, label: React.ReactNode, aria: string): Btn => ({ key, label, aria, kind: "fn" });
  const rows = leftRows(s, two, f);
  // In HEX the six trig keys (sin cos tan / sinh cosh tanh) become the digits A-F, in the same six places.
  if (s.base === 16) {
    const hex = (c: string): Btn => ({ key: `h${c}` as Key, label: c, aria: `Digit ${c}`, kind: "num" });
    rows[3] = [rows[3][0], hex("A"), hex("B"), hex("C"), rows[3][4], rows[3][5]];
    rows[4] = [rows[4][0], hex("D"), hex("E"), hex("F"), rows[4][4], rows[4][5]];
  }
  return rows;
}

function leftRows(s: CalcState, two: boolean, f: (key: Key, label: React.ReactNode, aria: string) => Btn): Btn[][] {
  return [
    [f("lp", "(", "Open bracket"), f("rp", ")", "Close bracket"), f("mc", "mc", "Memory clear"), f("mplus", "m+", "Add to memory"), f("mminus", "m-", "Take from memory"), f("mr", "mr", "Memory recall")],
    [{ key: "second", label: "2nd", aria: "Second functions", kind: "fn", lit: two }, f("sq", <>x{sup("2")}</>, "Square"), f("cube", <>x{sup("3")}</>, "Cube"), f("pow", <>x{sup("y")}</>, "x to the power y"), two ? f("pow", <>y{sup("x")}</>, "y to the power x") : f("exp", <>e{sup("x")}</>, "e to the power x"), two ? f("twox", <>2{sup("x")}</>, "2 to the power x") : f("tenx", <>10{sup("x")}</>, "10 to the power x")],
    [f("inv", <>1/x</>, "Reciprocal"), f("sqrt", <>{sup("2")}√x</>, "Square root"), f("cbrt", <>{sup("3")}√x</>, "Cube root"), f("root", <>{sup("y")}√x</>, "y-th root of x"), two ? f("logy", <>log{sub("y")}</>, "Logarithm to the base y") : f("ln", "ln", "Natural logarithm"), two ? f("log2", <>log{sub("2")}</>, "Logarithm to the base 2") : f("log10", <>log{sub("10")}</>, "Logarithm to the base 10")],
    [f("fact", "x!", "Factorial"), two ? f("asin", <>sin{sup("-1")}</>, "Inverse sine") : f("sin", "sin", "Sine"), two ? f("acos", <>cos{sup("-1")}</>, "Inverse cosine") : f("cos", "cos", "Cosine"), two ? f("atan", <>tan{sup("-1")}</>, "Inverse tangent") : f("tan", "tan", "Tangent"), f("e", <em>e</em>, "Euler's number"), f("ee", "EE", "Enter an exponent")],
    [f("rand", "Rand", "Random number"), two ? f("asinh", <>sinh{sup("-1")}</>, "Inverse hyperbolic sine") : f("sinh", "sinh", "Hyperbolic sine"), two ? f("acosh", <>cosh{sup("-1")}</>, "Inverse hyperbolic cosine") : f("cosh", "cosh", "Hyperbolic cosine"), two ? f("atanh", <>tanh{sup("-1")}</>, "Inverse hyperbolic tangent") : f("tanh", "tanh", "Hyperbolic tangent"), f("pi", "π", "Pi"), f("degrad", s.deg ? "Rad" : "Deg", s.deg ? "Switch to radians" : "Switch to degrees")],
  ];
}

/**
 * I size everything in the calculator from one height, --calc-h (the same for the basic and the scientific calculator, so that they are equally tall). From it come the key height --calc-d
 * (a twelfth-part of it, as in the Mac's), the padding, the gaps, the display, the width of each calculator, the radius, and every size of text below, as a share of --calc-d.
 * The basic keys are circles (width = height = d); the scientific keys are 1.24 d wide, the Mac's 62 : 50.
 */
export const KEY_RATIO = 1.24;

/** I give the size of a key's text as a share of the key height: the arithmetic signs are the largest, the scientific words the smallest. */
export function labelScale(b: { kind: Kind; key: Key }): number {
  if (b.kind === "op" || b.kind === "eq") return 0.62;
  if (b.key === "pct") return 0.46;
  if (b.key === "back") return 0.4;
  if (b.key === "ac" || b.key === "neg") return 0.34;
  if (b.key === ".") return 0.5;
  if (b.kind === "num") return 0.44;
  return 0.31;
}

function KeyButton({ b, onPress, off }: { b: Btn; onPress: (k: Key) => void; off?: boolean }) {
  const lit = b.lit && (b.kind === "op" || b.key === "second");
  return (
    <button
      type="button"
      disabled={off}
      aria-label={b.aria}
      aria-pressed={b.lit ? true : undefined}
      onClick={() => onPress(b.key)}
      style={{ fontSize: `calc(var(--calc-d) * ${labelScale(b)})` }}
      className={`flex h-full w-full select-none items-center justify-center rounded-full font-medium leading-none outline-none ring-white/60 transition duration-100 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 disabled:active:brightness-100 active:scale-95 active:brightness-125 ${lit ? "bg-white !text-[#ff9f0a] hover:bg-white" : KIND[b.kind]}`}
    >
      {b.label}
    </button>
  );
}

/** I give the size of the number on the display as a share of the key height: large, and smaller as the number gets longer (the scientific display is wider, so it keeps the size for longer). */
export function displayScale(text: string, sci: boolean, base: Base = 10): number {
  // I let BIN hold 24 digits where decimal holds 15; the others keep 15. A binary number of 53 digits is 66 characters with its spaces, but its digits (0 and 1) are narrow: measured in a browser, 62 characters of binary take about 0.43 of the text size each.
  const room = base === 2 ? 24 : sci ? 15 : 7;
  return Math.max(base === 10 ? 0.34 : 0.22, 0.95 * Math.min(1, room / Math.max(1, text.length)));
}

const MODES: Array<[Mode, string]> = [["basic", "Basic"], ["sci", "Scientific"]];

/** `startBase` and `startValue` open the scientific calculator on a value in a base (a typed "0xFF"); pass `autoFocus` false when it is drawn while the user is still typing in the search line. */
export function CalculatorCard({ start = "basic", startBase, startValue, autoFocus = true }: { start?: Mode; startBase?: Base; startValue?: number; autoFocus?: boolean }) {
  const [s, setS] = useState<CalcState>(() => (startBase !== undefined && startValue !== undefined ? startAt(startBase, startValue) : initialState(start)));
  const [showHistory, setShowHistory] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const sci = s.mode === "sci";

  const hit = useCallback((k: Key) => setS((prev) => press(prev, k, Math.random())), []);
  // I make the calculator take the keyboard when it opens, as the Mac's does (the search line closes this form when it is typed in).
  useEffect(() => { if (autoFocus) panel.current?.focus({ preventScroll: true }); }, [autoFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = keyFor(e.key, e.ctrlKey || e.metaKey, s.base);
    if (!k) return;
    e.preventDefault(); // I stop it here: Enter on a focused key would press that key again
    e.stopPropagation();
    hit(k);
  };

  const text = s.error ?? displayNumber(s.entry, s.base);
  const words = !s.error && s.fresh && s.base === 10 ? indianWords(valueOf(s.entry)) : null;
  // In BIN, OCT or HEX I show the same number in the other bases in the line under the number (the longest, binary, last: it is cut with "…" when it does not fit, and the whole is in the line's title).
  const others = !s.error && s.base !== 10 ? (inAllBases(valueIn(s)) ?? []).filter((x) => x.base !== s.base) : [];
  const othersText = others.map((x) => `${x.label} ${x.text}`).join("  ·  ");
  const pending = pendingText(s);
  const list = right(s);
  const lefts = sci ? left(s) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Calculator type" className="relative flex rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm">
          {MODES.map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={s.mode === m} onClick={() => setS((p) => setMode(p, m))} className={`relative rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${s.mode === m ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
              {s.mode === m && <motion.span layoutId="calc-mode-pill" transition={{ type: "spring", stiffness: 320, damping: 28 }} className="absolute inset-0 -z-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/30" />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        {sci && (
          <div role="tablist" aria-label="Number base" data-calc-base className="relative flex rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm">
            {BASES.map(([b, label, name]) => (
              <button key={b} type="button" role="tab" aria-selected={s.base === b} aria-label={`${name[0].toUpperCase()}${name.slice(1)}`} title={`Write the number in ${name}`} onClick={() => { setS((p) => setBase(p, b)); panel.current?.focus({ preventScroll: true }); }} className={`relative rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${s.base === b ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
                {s.base === b && <motion.span layoutId="calc-base-pill" transition={{ type: "spring", stiffness: 320, damping: 28 }} className="absolute inset-0 -z-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/30" />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setShowHistory((v) => !v)} aria-pressed={showHistory} className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm transition ${showHistory ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
          <History size={14} /> History{s.history.length ? ` (${s.history.length})` : ""}
        </button>
      </div>

      <div className="[container-type:inline-size]">
        {/* The calculator takes the keyboard like a desktop calculator does: one focusable panel handles the keys of its own buttons, and I keep the buttons real buttons, tabbable and labelled. */}
        {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <div
          ref={panel}
          tabIndex={0}
          role="group"
          aria-label={sci ? "Scientific calculator" : "Basic calculator"}
          onKeyDown={onKeyDown}
          style={
            {
              "--calc-pad": "calc(var(--calc-h) * 0.026)",
              "--calc-gap": "calc(var(--calc-h) * 0.0103)",
              "--calc-disp": "calc(var(--calc-h) * 0.302)",
              "--calc-d": "calc(var(--calc-h) * 0.1209)",
              "--calc-bw": sci ? `calc(var(--calc-d) * ${KEY_RATIO})` : "var(--calc-d)",
              width: `calc(${sci ? 10 : 4} * var(--calc-bw) + ${sci ? 9 : 3} * var(--calc-gap) + 2 * var(--calc-pad))`,
              height: "var(--calc-h)",
              padding: "var(--calc-pad)",
              borderRadius: "calc(var(--calc-h) * 0.045)",
            } as React.CSSProperties
          }
          // overflow-hidden: while the panel widens (basic to scientific) or narrows, no key may show outside its edge. I hold the grid to the RIGHT edge (self-end below), so the four basic columns stay where they are and the scientific columns are uncovered from the left as the panel grows.
          className="mx-auto flex flex-col overflow-hidden bg-gradient-to-b from-[#2d2d30] to-[#1f1f21] shadow-2xl shadow-black/30 outline-none ring-1 ring-white/10 transition-[width] duration-500 ease-out [--calc-h:29rem] [max-width:100%] focus-visible:ring-2 focus-visible:ring-violet-400/60 supports-[width:1cqw]:[--calc-h:min(29rem,60cqw)]"
        >
          <div className="relative flex flex-col justify-end px-2 pb-2 pt-1" style={{ height: "var(--calc-disp)" }}>
            <div className="flex min-h-[1.25rem] items-center justify-between gap-2">
              <span className="flex gap-1.5">
                {s.memory !== 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-orange-300">M</span>}
                {sci && s.base !== 10 && <span data-calc-base-badge className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{BASES.find((x) => x[0] === s.base)?.[1]}</span>}
                {sci && !s.deg && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">Rad</span>}
              </span>
              <span className="min-w-0 truncate text-xs text-zinc-400" aria-live="off">{pending}</span>
            </div>
            <div className="flex items-end justify-end gap-2 pt-1">
              {!s.error && <span className="mb-1"><CopyButton dark text={text.replace(/[,\s]/g, "")} /></span>}
              <motion.div key={text} initial={{ opacity: 0.55, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} aria-live="polite" aria-label="Display" style={{ fontSize: `calc(var(--calc-d) * ${displayScale(text, sci, s.base)})` }} className="min-w-0 flex-1 text-right font-light tabular-nums leading-tight text-white transition-[font-size] duration-300 [overflow-wrap:anywhere]">{text}</motion.div>
            </div>
            <div className="h-4 truncate text-right text-xs text-violet-300" data-calc-bases={others.length ? "" : undefined} title={othersText || undefined}>{others.length ? othersText : words ? `≈ ${words}` : ""}</div>
          </div>

          <div className="grid self-end" data-calc-grid style={{ gridTemplateColumns: `repeat(${sci ? 10 : 4}, var(--calc-bw))`, gridTemplateRows: "repeat(5, var(--calc-d))", gap: "var(--calc-gap)" }}>
            {list.map((row, i) => (
              <React.Fragment key={i}>
                {lefts && lefts[i].map((b) => <KeyButton key={`${b.key}-${String(b.aria)}`} b={b} onPress={hit} off={!enabled(s, b.key)} />)}
                {row.map((b) => <KeyButton key={`${b.key}-${b.aria}`} b={b} onPress={hit} off={!enabled(s, b.key)} />)}
              </React.Fragment>
            ))}
          </div>
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      </div>

      <AnimatePresence initial={false}>
        {showHistory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="mx-auto mt-3 max-w-3xl rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">History (this window only)</span>
                {s.history.length > 0 && <button type="button" onClick={() => setS((p) => ({ ...p, history: [] }))} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"><Trash2 size={12} /> Clear</button>}
              </div>
              {s.history.length === 0 ? <p className="text-sm text-slate-500">Nothing calculated yet.</p> : (
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {[...s.history].reverse().map((h, i) => (
                    <li key={`${h.expr}-${i}`}>
                      <button type="button" onClick={() => { setS((p) => recall(p, h.result)); panel.current?.focus(); }} className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-sm hover:bg-violet-50">
                        <span className="min-w-0 truncate text-slate-600">{h.expr} =</span>
                        <span className="font-bold tabular-nums text-slate-900">{historyResult(h)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
