// src/tools/converter/ColourPanel.tsx
//
// The colour converter, RGB <-> HEX <-> HSL, laid out like the converter's other panels: RGB on the left (three boxes, red, green, blue, each 0 to 255), HEX in the middle (a dark panel), HSL on the right (three boxes,
// hue 0 to 360, saturation and lightness 0 to 100), and under them the colour itself with its three written forms. Type in any of the three and the other two follow; while what is typed is not a colour the other
// panels keep the last good one and say what is wrong. I keep HSL in whole numbers, so a colour typed in HSL comes back as the nearest RGB (the note under the panels says so). The sums are in colour.ts.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp } from "lucide-react";
import { CopyButton } from "@/components/tools/toolAtoms";
import { startHold } from "./holdRepeat";
import { DEFAULT_HEX, cssHsl, cssRgb, hslToRgb, inkOn, parseChannel, parseChannels, parseHex, parseHslBoxes, parseHslPart, rgbToHsl, stepPart, toHex, type Hsl, type Rgb } from "./colour";

type Three = [string, string, string];
type Model = "rgb" | "hex" | "hsl";

const RGB_PARTS = [
  { name: "Red", letter: "R", chip: "bg-rose-100 text-rose-700" },
  { name: "Green", letter: "G", chip: "bg-emerald-100 text-emerald-700" },
  { name: "Blue", letter: "B", chip: "bg-sky-100 text-sky-700" },
] as const;
const HSL_PARTS = [
  { name: "Hue, 0 to 360 degrees", short: "Hue", letter: "H", unit: "°", max: 360, chip: "bg-violet-100 text-violet-700" },
  { name: "Saturation, 0 to 100 per cent", short: "Saturation", letter: "S", unit: "%", max: 100, chip: "bg-amber-100 text-amber-700" },
  { name: "Lightness, 0 to 100 per cent", short: "Lightness", letter: "L", unit: "%", max: 100, chip: "bg-slate-200 text-slate-700" },
] as const;

const rgbBoxes = (c: Rgb): Three => [String(c.r), String(c.g), String(c.b)];
const hslBoxes = (c: Rgb): Three => { const h = rgbToHsl(c); return [String(h.h), String(h.s), String(h.l)]; };

const WRONG: Record<Model, string> = {
  rgb: "Red, green and blue are each a whole number from 0 to 255.",
  hex: "A HEX colour is 3 or 6 digits, 0 to 9 and A to F, for example #4F46E5.",
  hsl: "Hue is a number from 0 to 360, saturation and lightness from 0 to 100.",
};

/**
 * One number box with a spinner: a small up arrow above the number and a down arrow below it, shown while the pointer is over the box (or the box is being typed in), so I keep them from covering the digits.
 * The Up and Down keys do the same (Shift moves by 10). The arrows only write new text into the box, and I decide what that text means by the same reading as if it had been typed.
 * I let an arrow that is pressed and kept pressed go on stepping, rapidly and one step at a time, until it is let go (holdRepeat.ts).
 */
function StepBox({ label, short, value, fallback, min, max, inputMode, maxLength, invalid, onText }: {
  label: string; short: string; value: string; fallback: number; min: number; max: number; inputMode: "numeric" | "decimal"; maxLength: number; invalid: boolean; onText: (text: string) => void;
}) {
  const step = (dir: number) => onText(stepPart(value, dir, min, max, fallback));
  // My repeating timer has to step from the box's latest text, not the text it had when the press began
  const latest = useRef(step);
  latest.current = step;
  const stopHold = useRef<(() => void) | null>(null);
  const release = () => { stopHold.current?.(); stopHold.current = null; };
  useEffect(() => release, []);
  const press = (dir: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* I make sure the hold still ends on the next release */ }
      release();
      stopHold.current = startHold(() => latest.current(dir));
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    // I count a click that is not a pointer press (a screen reader's "activate") as one step
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) step(dir); },
  });
  const arrow = "pointer-events-none absolute inset-x-1.5 flex h-3.5 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100";
  return (
    <div className="group relative mt-1" data-colour-spinner>
      <button type="button" tabIndex={-1} aria-label={`Increase ${short}`} {...press(1)} className={`${arrow} top-0.5`}><ChevronUp size={13} strokeWidth={3} aria-hidden="true" /></button>
      <input
        aria-label={label} inputMode={inputMode} autoComplete="off" spellCheck={false} maxLength={maxLength} value={value} aria-invalid={invalid}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)); } }}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-3.5 text-center text-2xl font-extrabold tabular-nums text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
      />
      <button type="button" tabIndex={-1} aria-label={`Decrease ${short}`} {...press(-1)} className={`${arrow} bottom-0.5`}><ChevronDown size={13} strokeWidth={3} aria-hidden="true" /></button>
    </div>
  );
}

export function ColourPanel({ startHex = DEFAULT_HEX }: { startHex?: string }) {
  const first = parseHex(startHex) ?? (parseHex(DEFAULT_HEX) as Rgb);
  const [rgb, setRgb] = useState<Three>(rgbBoxes(first));
  const [hex, setHex] = useState(toHex(first));
  const [hsl, setHsl] = useState<Three>(hslBoxes(first));
  // The last colour that was valid, so that the swatch and the copies always show a real colour
  const [colour, setColour] = useState<Rgb>(first);
  const [bad, setBad] = useState<Model | null>(null);

  /** A good colour came from one panel: I write the other two from it and leave the one being typed in as typed. */
  const follow = (c: Rgb, from: Model) => {
    setColour(c);
    if (from !== "rgb") setRgb(rgbBoxes(c));
    if (from !== "hex") setHex(toHex(c));
    if (from !== "hsl") setHsl(hslBoxes(c));
    setBad(null);
  };
  const editRgb = (i: number, text: string) => {
    const next: Three = [rgb[0], rgb[1], rgb[2]];
    next[i] = text;
    setRgb(next);
    const c = parseChannels(next[0], next[1], next[2]);
    if (c) follow(c, "rgb"); else setBad("rgb");
  };
  const editHex = (text: string) => {
    setHex(text);
    const c = parseHex(text);
    if (c) follow(c, "hex"); else setBad("hex");
  };
  const editHsl = (i: number, text: string) => {
    const next: Three = [hsl[0], hsl[1], hsl[2]];
    next[i] = text;
    setHsl(next);
    const v = parseHslBoxes(next[0], next[1], next[2]);
    if (v) follow(hslToRgb(v as Hsl), "hsl"); else setBad("hsl");
  };

  const hslNow = rgbToHsl(colour);
  const hexText = toHex(colour), rgbText = cssRgb(colour), hslText = cssHsl(hslNow), ink = inkOn(colour);
  const arrow = (
    <div className="flex items-center justify-center">
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-4 ring-white"><ArrowLeftRight size={17} /></span>
    </div>
  );

  return (
    <div className="mt-4" data-colour-panel>
      <div className="grid grid-cols-1 items-stretch gap-3 lg:[grid-template-columns:1.2fr_auto_1fr_auto_1.2fr]">
        <div className="relative min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" data-colour-model="rgb">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">RGB</span>
            <CopyButton text={rgbText} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {RGB_PARTS.map((p, i) => (
              <label key={p.letter} className="block min-w-0">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${p.chip}`}>{p.letter}</span>
                <StepBox label={`${p.name}, 0 to 255`} short={p.name} value={rgb[i]} fallback={[colour.r, colour.g, colour.b][i]} min={0} max={255} inputMode="numeric" maxLength={3} invalid={parseChannel(rgb[i]) === null} onText={(t) => editRgb(i, t)} />
              </label>
            ))}
          </div>
        </div>

        {arrow}

        <div className="relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900 p-4 text-white shadow-xl shadow-indigo-900/20 ring-1 ring-white/10" data-colour-model="hex">
          <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-sky-400/30 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-300">HEX</span>
            <CopyButton dark text={hexText} />
          </div>
          <input aria-label="HEX colour, 3 or 6 digits" autoComplete="off" spellCheck={false} maxLength={7} value={hex} onChange={(e) => editHex(e.target.value)} aria-invalid={bad === "hex"} className="relative mt-3 w-full min-w-0 bg-transparent text-3xl font-extrabold uppercase tabular-nums tracking-wide text-white outline-none placeholder:text-white/40" />
        </div>

        {arrow}

        <div className="relative min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" data-colour-model="hsl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">HSL</span>
            <CopyButton text={hslText} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {HSL_PARTS.map((p, i) => (
              <label key={p.letter} className="block min-w-0">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${p.chip}`}>{p.letter}</span>
                <StepBox label={p.name} short={p.short} value={hsl[i]} fallback={[hslNow.h, hslNow.s, hslNow.l][i]} min={0} max={p.max} inputMode="decimal" maxLength={5} invalid={parseHslPart(hsl[i], p.max) === null} onText={(t) => editHsl(i, t)} />
              </label>
            ))}
          </div>
        </div>
      </div>

      {bad && (
        <p role="alert" className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{WRONG[bad]} The colour below is the last good one.</p>
      )}

      <div data-colour-swatch style={{ backgroundColor: hexText, color: ink }} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-5 shadow-md ring-1 ring-black/10">
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums tracking-wide">{hexText}</p>
          <p className="text-sm font-semibold tabular-nums opacity-90">{rgbText} · {hslText}</p>
        </div>
        <p className="text-xs font-semibold opacity-80">The colour, as it will look</p>
      </div>
      <p className="mt-2 text-xs text-slate-500" data-colour-note>Hue is the angle on the colour wheel in degrees, saturation and lightness are per cent. HSL is shown in whole numbers, so a colour typed in HSL gives the nearest RGB, which can differ from the one it was first read from by a point or two.</p>
    </div>
  );
}
