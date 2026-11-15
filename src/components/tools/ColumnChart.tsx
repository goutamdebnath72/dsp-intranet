// src/components/tools/ColumnChart.tsx
//
// A COLUMN CHART, shared by the cards that draw one (the CPI and inflation card, the steel card): one bar for each point, round values on the left, the value on top of each bar when there are few of them (otherwise
// on hover or touch), a short text under it. It knows no topic: the card hands it the bars, the starting line and how to write a value. Moved here, unchanged, from the CPI card's own file (which still exports it).
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { niceTicks } from "@/components/tools/live/LivePieces";

/** the width a figure on a bar needs, in pixels ("104.00" in 11-pixel bold, and a little air) */
export const VALUE_PX = 40;

export interface Bar {
  /** what the hover read-out says: "Oct 2026: 110.05" */
  tip: string;
  /** the short text under the bar ("Oct", or the year at January); empty for none */
  axis: string;
  value: number | null;
}

/** the scale of a column chart: where the bars start, the top, and the round values on the left */
export function scaleOf(values: number[], from: "zero" | number, room = 0): { lo: number; hi: number; ticks: number[]; base: number } {
  const base = from === "zero" ? 0 : from;
  const lo0 = Math.min(base, ...values), hi0 = Math.max(base, ...values);
  const t = niceTicks(lo0, hi0, 4);
  const step = t.length > 1 ? t[1] - t[0] : 1;
  const lo = Math.floor(lo0 / step + 1e-9) * step;
  const hi = Math.ceil(hi0 / step - 1e-9) * step + step * room;
  return { lo, hi, ticks: niceTicks(lo, hi, 4), base };
}

/** which bars get their text under the axis: those that have one, never closer than `gap` pixels (the first of two that would touch is kept) */
export function axisKept(bars: Bar[], width: number, gap = 34): number[] {
  const slot = width > 0 ? width / bars.length : 40;
  const out: number[] = [];
  let last = -Infinity;
  bars.forEach((b, i) => {
    if (!b.axis) return;
    if (i * slot - last >= gap) { out.push(i); last = i * slot; }
  });
  return out;
}

/**
 * A column chart: one bar for each month, round values on the left, the value on top of each bar when there are few of them (otherwise on hover or touch), the month (or the year) under it.
 * `from` is where the bars start: "zero" (the rate hangs under it when below zero), or a number (the index, from 100).
 */
export function ColumnChart({ bars, from, format, valueFormat, color, negativeColor = "#e11d48", ariaLabel, showValues }: { bars: Bar[]; from: "zero" | number; format: (v: number) => string; valueFormat?: (v: number) => string; color: string; negativeColor?: string; ariaLabel: string; showValues: boolean }) {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = bars.length;
  const sc = useMemo(() => scaleOf(bars.flatMap((b) => (b.value === null ? [] : [b.value])), from, showValues ? 0.35 : 0.12), [bars, from, showValues]);
  const pct = (v: number) => ((sc.hi - v) / (sc.hi - sc.lo)) * 100;
  const kept = useMemo(() => axisKept(bars, width), [bars, width]);
  // the figure on a bar is about 40 px wide: on a narrow screen only every second (third...) bar carries one, always the latest; the rest are read by touch
  const every = showValues && width > 0 ? Math.max(1, Math.ceil(VALUE_PX / (width / n))) : 1;
  if (!bars.some((b) => b.value !== null)) return <p className="text-sm text-slate-500">No figures to draw.</p>;
  const at = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const zeroY = pct(sc.base);
  const h = hover !== null && bars[hover].value !== null ? hover : null;
  return (
    <div className="min-w-0 max-w-full">
      <div className="flex gap-2">
        <div className="relative h-56 w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500" aria-hidden="true">
          {sc.ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${pct(t)}%` }}>{format(t)}</span>)}
        </div>
        <div ref={box} className="relative h-56 min-w-0 flex-1 touch-none select-none rounded-xl border border-slate-200 bg-white/80" onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)} role="img" aria-label={ariaLabel} data-column-chart>
          {sc.ticks.map((t) => <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300/60" style={{ top: `${pct(t)}%` }} />)}
          <span className="pointer-events-none absolute inset-x-0 border-t border-slate-400/70" style={{ top: `${zeroY}%` }} />
          {bars.map((b, i) => {
            if (b.value === null) return null;
            const up = b.value >= sc.base;
            const y = pct(b.value);
            const top = up ? y : zeroY, height = Math.max(0.4, Math.abs(zeroY - y));
            return (
              <React.Fragment key={i}>
                <motion.span
                  className={`pointer-events-none absolute rounded-t-[3px] ${up ? "" : "rounded-b-[3px] rounded-t-none"}`}
                  style={{ left: `${((i + 0.14) / n) * 100}%`, width: `${(0.72 / n) * 100}%`, top: `${top}%`, height: `${height}%`, background: up ? color : negativeColor, opacity: h === null || h === i ? 1 : 0.55, transformOrigin: up ? "bottom" : "top" }}
                  initial={calm ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: calm ? 0 : Math.min(0.5, i * 0.015) }}
                  data-bar={i}
                />
                {showValues && (n - 1 - i) % every === 0 && (
                  <span className="pointer-events-none absolute whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800" style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${up ? y : pct(b.value)}%`, transform: `translate(-50%, ${up ? "calc(-100% - 2px)" : "2px"})` }}>{(valueFormat ?? format)(b.value)}</span>
                )}
              </React.Fragment>
            );
          })}
          {h !== null && (
            <span className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white shadow-lg" style={{ left: `${((h + 0.5) / n) * 100}%`, transform: `translateX(${h / n < 0.2 ? "-10%" : h / n > 0.8 ? "-90%" : "-50%"})` }}>{bars[h].tip}</span>
          )}
        </div>
      </div>
      <div className="relative ml-[3.25rem] mt-1 h-4 text-[11px] font-semibold text-slate-500" aria-hidden="true">
        {kept.map((i) => <span key={i} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>{bars[i].axis}</span>)}
      </div>
    </div>
  );
}
