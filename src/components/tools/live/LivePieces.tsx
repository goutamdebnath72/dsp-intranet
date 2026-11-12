// src/components/tools/live/LivePieces.tsx
//
// THE PARTS EVERY LIVE CARD SHARES: the line that says where the numbers came from and when (never a number without its source and its time), a calm loading state, a plain failure with a retry,
// the up/down chip of a change, and a trend chart drawn as SVG with a hover read-out. Sizes are the ones of the modal's scale sheet. Nothing is stored or sent.
"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, Minus, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";
import type { LiveEnvelope } from "@/lib/live/envelope";
import type { LiveState } from "@/hooks/useLive";

const ZONE = "Asia/Kolkata";

/** "3:42 pm, 12 Nov" in Indian time */
export function stamp(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: ZONE });
  return d.isValid ? d.toFormat("h:mm a, d LLL").replace("AM", "am").replace("PM", "pm") : "";
}

export function SourceLine({ env, reload, loading }: { env: LiveEnvelope<unknown>; reload: () => void; loading: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span>Source: <a href={env.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:underline">{env.source}<ExternalLink size={11} /></a></span>
      <span>Fetched {stamp(env.fetchedAt)} IST</span>
      {env.stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">The source is not answering now: these are the last figures received</span>}
      <button type="button" onClick={reload} disabled={loading} className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 shadow-sm transition hover:border-slate-300 disabled:opacity-60">
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
      </button>
    </div>
  );
}

export function LiveGate({ state, error, reload, what, children }: { state: LiveState; error: string; reload: () => void; what: string; children: React.ReactNode }) {
  if (state === "loading") {
    return (
      <div className="grid gap-3 sm:grid-cols-3" aria-busy="true" aria-label={`Fetching ${what}`}>
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" />)}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold">{what} cannot be shown just now</p>
          <p className="text-xs">{error || "The source did not answer."} Nothing is shown rather than a wrong figure.</p>
          <button type="button" onClick={reload} className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-50"><RefreshCw size={12} /> Try again</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** an up or a down arrow with the change, green or red (zero: grey) */
export function ChangeChip({ abs, pct, money = false }: { abs: number; pct: number; money?: boolean }) {
  const up = abs > 0, flat = abs === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const fmt = (n: number) => Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${flat ? "bg-slate-100 text-slate-600" : up ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
      <Icon size={13} strokeWidth={3} />
      {money ? "₹" : ""}{fmt(abs)} ({fmt(pct)}%)
    </span>
  );
}

export interface TrendPoint {
  label: string;
  value: number;
}

/** A line chart with an area under it that draws itself in, and a read-out on hover (or touch). The axis values are written in HTML beside it, the dates under it. */
export function TrendChart({ points, color = "#0ea5e9", format, ariaLabel }: { points: TrendPoint[]; color?: string; format: (v: number) => string; ariaLabel: string }) {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 200, PAD = 8;
  const geo = useMemo(() => {
    const vs = points.map((p) => p.value);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || 1;
    const lo2 = lo - span * 0.08, hi2 = hi + span * 0.08;
    const xy = points.map((p, i) => ({ x: PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD), y: PAD + (1 - (p.value - lo2) / (hi2 - lo2)) * (H - 2 * PAD) }));
    const line = xy.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
    return { xy, line, area: `${line} L${xy[xy.length - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`, lo, hi };
  }, [points]);
  if (points.length < 2) return <p className="text-sm text-slate-500">Not enough history to draw a trend.</p>;
  const idx = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return null;
    return Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))));
  };
  const h = hover !== null ? { p: points[hover], q: geo.xy[hover] } : null;
  const first = points[0], last = points[points.length - 1];
  const gid = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-16 shrink-0 flex-col justify-between py-1 text-right text-[11px] font-semibold text-slate-500" aria-hidden="true"><span>{format(geo.hi)}</span><span>{format(geo.lo)}</span></div>
        <div ref={box} className="relative h-44 flex-1 touch-none select-none rounded-2xl border border-slate-200 bg-white/80 shadow-inner" onPointerMove={(e) => setHover(idx(e))} onPointerLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <motion.path d={geo.area} fill={`url(#${gid})`} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.2 }} />
            <motion.path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
          </svg>
          {h && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px bg-slate-400/60" style={{ left: `${(h.q.x / W) * 100}%` }} />
              <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(h.q.x / W) * 100}%`, top: `${(h.q.y / H) * 100}%`, background: color }} />
              <span className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white shadow-lg" style={{ left: `${Math.min(88, Math.max(12, (h.q.x / W) * 100))}%` }}>{h.p.label}: {format(h.p.value)}</span>
            </>
          )}
        </div>
      </div>
      <div className="ml-[4.5rem] mt-1 flex justify-between text-[11px] font-semibold text-slate-500"><span>{first.label}</span><span>{last.label}</span></div>
    </div>
  );
}

/** A small line for a day's prices, drawn in one colour (no axes, no numbers: the figure beside it says them). */
export function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const W = 120;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
