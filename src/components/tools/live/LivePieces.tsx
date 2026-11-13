// src/components/tools/live/LivePieces.tsx
//
// THE PARTS EVERY LIVE CARD SHARES: the line that says where the numbers came from and when (never a number without its source and its time), a calm loading state, a plain failure with a retry,
// the up/down chip of a change, and a trend chart drawn as SVG with a hover read-out. Sizes are the ones of the modal's scale sheet. Nothing is stored or sent.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

/** where the figures came from and when; the Refresh button only when a way to refresh is given (a self-refreshing card has its own, in its status line) */
export function SourceLine({ env, reload, loading = false }: { env: LiveEnvelope<unknown>; reload?: () => void; loading?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {env.sources && env.sources.length > 0 ? (
        <span>{env.sources.length > 1 ? "Sources" : "Source"}: {env.sources.map((s, i) => (
          <React.Fragment key={s.name}>{i > 0 && <span aria-hidden="true"> · </span>}<a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:underline">{s.name}<ExternalLink size={11} /></a></React.Fragment>
        ))}</span>
      ) : (
        <span>Source: <a href={env.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:underline">{env.source}<ExternalLink size={11} /></a></span>
      )}
      <span>Fetched {stamp(env.fetchedAt)} IST</span>
      {env.stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">The source is not answering now: these are the last figures received</span>}
      {reload && (
        <button type="button" onClick={reload} disabled={loading} className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 shadow-sm transition hover:border-slate-300 disabled:opacity-60">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      )}
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
  /** the short date under the axis, e.g. "13 Jul" */
  label: string;
  value: number;
  /** the whole date for the read-outs, e.g. "13 Jul 2026" (the label when absent) */
  full?: string;
  /** YYYY-MM-DD, used to say how long ago the chart begins */
  iso?: string;
  /** an estimate (drawn dashed, marked "est."), not a published rate */
  est?: boolean;
  /** said under the figure of the first day: when no figure was published for that exact day, which day's figure is shown instead */
  note?: string;
}

/** "4 months" / "1 year" / "3 weeks" for the span between two ISO dates (empty when either is missing) */
export function spanText(fromIso?: string, toIso?: string): string {
  if (!fromIso || !toIso) return "";
  const a = DateTime.fromISO(fromIso, { zone: ZONE }), b = DateTime.fromISO(toIso, { zone: ZONE });
  if (!a.isValid || !b.isValid) return "";
  const days = Math.round(b.diff(a, "days").days);
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} months`;
  const years = Math.round((months / 12) * 10) / 10;
  return years === 1 ? "1 year" : `${years} years`;
}

/** round axis values: about `want` of them, on 1/2/5 steps, all inside lo..hi */
export function niceTicks(lo: number, hi: number, want = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / want, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** which points get a date under the axis: the first, the last and evenly spaced ones between (never crowded) */
export function dateTicks(n: number, want = 6): number[] {
  if (n <= 1) return [0];
  const k = Math.min(want, n);
  const set = new Set<number>();
  for (let i = 0; i < k; i++) set.add(Math.round((i / (k - 1)) * (n - 1)));
  return Array.from(set).sort((x, y) => x - y);
}

/** how many dates a chart of this width (in pixels) can carry under its axis without them touching: a date is about 70 px wide; 0 means not measured yet */
export function datesThatFit(width: number): number {
  if (!(width > 0)) return 6;
  return Math.max(2, Math.min(6, Math.floor(width / 100)));
}

/** a callout that stays inside the chart: left-aligned near the left edge, right-aligned near the right edge, centred between */
const edgeShift = (pct: number) => (pct < 16 ? "0%" : pct > 84 ? "-100%" : "-50%");

/**
 * A line chart with an area under it that draws itself in, grid lines with round values on the left, dates along the bottom,
 * the highest and the lowest day marked on the line with their date and value, and a read-out on hover (or touch).
 * For a price that stays as it is until the day it is changed (fuel), `step` draws it as a staircase (a sloping line would say the price drifted), `ties: "first"` names the DAY a high or a low was
 * first reached (not the latest day on which it still held), and the high and the low say how long they held.
 */
export function TrendChart({ points, color = "#0ea5e9", format, ariaLabel, step = false, ties = "last", latestLabel = "Latest", pointsText, todayIso }: {
  points: TrendPoint[]; color?: string; format: (v: number) => string; ariaLabel: string;
  step?: boolean; ties?: "first" | "last"; latestLabel?: string; pointsText?: string;
  /** today (YYYY-MM-DD, Indian date): when the last point is an earlier day, the chart says that today's figure is not published yet */
  todayIso?: string;
}) {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // how many dates fit under the axis depends on how wide the chart is on this screen (unknown, so six, until it is measured)
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dateWant = datesThatFit(width);
  const W = 600, H = 220, PAD = 10;
  const geo = useMemo(() => {
    const vs = points.map((p) => p.value);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || 1;
    const lo2 = lo - span * 0.14, hi2 = hi + span * 0.14;
    const yOf = (v: number) => PAD + (1 - (v - lo2) / (hi2 - lo2)) * (H - 2 * PAD);
    const xOf = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD);
    const xy = points.map((p, i) => ({ x: xOf(i), y: yOf(p.value) }));
    // a staircase holds each value until the next point, then steps to the new one
    const path = (a: number, b: number) => xy.slice(a, b + 1).map((q, i) => (i === 0 ? `M${q.x.toFixed(1)},${q.y.toFixed(1)}` : step ? `H${q.x.toFixed(1)} V${q.y.toFixed(1)}` : `L${q.x.toFixed(1)},${q.y.toFixed(1)}`)).join(" ");
    const line = path(0, xy.length - 1);
    // of equal extremes, the latest is the one named (gold: the newest high is the one that matters), or the first (fuel: the day the price reached it)
    let iHi = 0, iLo = 0;
    vs.forEach((v, i) => { if (ties === "last" ? v >= vs[iHi] : v > vs[iHi]) iHi = i; if (ties === "last" ? v <= vs[iLo] : v < vs[iLo]) iLo = i; });
    // how long a value lasted from the point where it began: the last point that still has it
    const heldTo = (i: number) => { let j = i; while (j + 1 < vs.length && vs[j + 1] === vs[i]) j++; return j; };
    // the estimated days are drawn dashed up to the first official day, the official days solid from it
    const k = points.findIndex((p) => !p.est);
    const cut = k > 0 ? k : 0;
    return {
      cut, estLine: cut > 0 ? path(0, cut) : "", offLine: path(cut, points.length - 1),
      xy, line, area: `${line} L${xy[xy.length - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`, lo, hi, iHi, iLo, heldHi: heldTo(iHi), heldLo: heldTo(iLo),
      grid: niceTicks(lo2 + (hi2 - lo2) * 0.04, hi2 - (hi2 - lo2) * 0.04, 4).map((v) => ({ v, y: yOf(v) })),
      dates: dateTicks(points.length, dateWant),
    };
  }, [points, step, ties, dateWant]);
  if (points.length < 2) return <p className="text-sm text-slate-500">Not enough history to draw a trend.</p>;
  const idx = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return null;
    return Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))));
  };
  const full = (p: TrendPoint) => `${p.full ?? p.label}${p.est ? " (est.)" : ""}`;
  const h = hover !== null ? { p: points[hover], q: geo.xy[hover] } : null;
  const last = points.length - 1;
  const gid = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  const pctX = (i: number) => (geo.xy[i].x / W) * 100;
  const pctY = (y: number) => (y / H) * 100;
  const hi = points[geo.iHi], lo = points[geo.iLo], now = points[last], first = points[0];
  const fromFirst = first.value ? ((now.value - first.value) / first.value) * 100 : 0;
  const ago = spanText(first.iso, now.iso);
  const fromHigh = hi.value ? ((now.value - hi.value) / hi.value) * 100 : 0;
  const fromLow = lo.value ? ((now.value - lo.value) / lo.value) * 100 : 0;
  const heldText = (i: number, j: number) => (j === i ? "for that day only" : `held from ${full(points[i])} to ${j === last ? "the latest day" : full(points[j])}`);
  const marks = [
    { i: geo.iHi, kind: "High", tone: "bg-emerald-600", above: true },
    { i: geo.iLo, kind: "Low", tone: "bg-rose-600", above: false },
  ];
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-16 shrink-0 text-right text-[11px] font-semibold text-slate-500" aria-hidden="true">
          {geo.grid.map((g) => <span key={g.v} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${pctY(g.y)}%` }}>{format(g.v)}</span>)}
        </div>
        <div ref={box} className="relative h-56 flex-1 touch-none select-none rounded-2xl border border-slate-200 bg-white/80 shadow-inner" onPointerMove={(e) => setHover(idx(e))} onPointerLeave={() => setHover(null)} role="img" aria-label={`${ariaLabel}. Highest ${format(hi.value)} on ${full(hi)}, lowest ${format(lo.value)} on ${full(lo)}, latest ${format(now.value)} on ${full(now)}.`}>
          {/* the line is revealed left to right by a clip (not by pathLength: with a non-scaling stroke that stops the line short of its end) */}
          <motion.div className="absolute inset-0" initial={calm ? false : { clipPath: "inset(-10% 100% -10% 0)" }} animate={{ clipPath: "inset(-10% -2% -10% 0)" }} transition={{ duration: 1.1, ease: "easeOut" }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            {geo.grid.map((g) => <line key={`h${g.v}`} x1={0} x2={W} y1={g.y} y2={g.y} stroke="#cbd5e1" strokeOpacity="0.55" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />)}
            {geo.dates.map((i) => <line key={`v${i}`} x1={geo.xy[i].x} x2={geo.xy[i].x} y1={0} y2={H} stroke="#cbd5e1" strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />)}
            <path d={geo.area} fill={`url(#${gid})`} />
            {geo.cut > 0 && <line x1={geo.xy[geo.cut].x} x2={geo.xy[geo.cut].x} y1={0} y2={H} stroke={color} strokeOpacity="0.55" strokeWidth={1.5} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
            {geo.estLine && <path d={geo.estLine} fill="none" stroke={color} strokeOpacity="0.8" strokeWidth={2.25} strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            <path d={geo.offLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          </motion.div>
          {marks.map((m) => (
            <React.Fragment key={m.kind}>
              <span className={`pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${m.tone}`} style={{ left: `${pctX(m.i)}%`, top: `${pctY(geo.xy[m.i].y)}%` }} />
              <span
                className={`pointer-events-none absolute whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold leading-tight text-white shadow-md ${m.tone}`}
                style={{ left: `${pctX(m.i)}%`, top: `${pctY(geo.xy[m.i].y)}%`, transform: `translate(${edgeShift(pctX(m.i))}, ${m.above ? "calc(-100% - 12px)" : "12px"})` }}
              >
                {m.kind} {format(points[m.i].value)} · {full(points[m.i])}
              </span>
            </React.Fragment>
          ))}
          {h && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px bg-slate-400/60" style={{ left: `${(h.q.x / W) * 100}%` }} />
              <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(h.q.x / W) * 100}%`, top: `${(h.q.y / H) * 100}%`, background: color }} />
              <span className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white shadow-lg" style={{ left: `${(h.q.x / W) * 100}%`, transform: `translateX(${edgeShift((h.q.x / W) * 100)})` }}>{full(h.p)}: {format(h.p.value)}</span>
            </>
          )}
        </div>
      </div>
      <div className="relative ml-[4.5rem] mt-1 h-4 text-[11px] font-semibold text-slate-500" aria-hidden="true">
        {geo.dates.map((i) => {
          const pc = pctX(i);
          return <span key={i} className="absolute top-0 whitespace-nowrap" style={{ left: `${pc}%`, transform: `translateX(${edgeShift(pc)})` }}>{points[i].label}</span>;
        })}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Start{ago ? ` · ${ago} ago` : ""}</dt>
          <dd className="text-sm font-bold leading-snug text-slate-900">{format(first.value)} <span className="font-semibold text-slate-600">on {full(first)}</span></dd>
          <dd className="text-xs text-slate-600">{`the latest is ${Math.abs(fromFirst).toFixed(1)}% ${fromFirst < 0 ? "below" : "above"} it`}</dd>
          {first.note && <dd className="text-xs text-slate-600">{first.note}</dd>}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">Highest</dt>
          <dd className="text-sm font-bold leading-snug text-slate-900">{format(hi.value)} <span className="font-semibold text-slate-600">on {full(hi)}</span></dd>
          <dd className="text-xs text-slate-600">{geo.iHi === last || hi.value === now.value ? "that is the latest rate" : `the latest is ${Math.abs(fromHigh).toFixed(1)}% ${fromHigh < 0 ? "below" : "above"} it`}</dd>
          {step && <dd className="text-xs text-slate-600">{heldText(geo.iHi, geo.heldHi)}</dd>}
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-widest text-rose-700">Lowest</dt>
          <dd className="text-sm font-bold leading-snug text-slate-900">{format(lo.value)} <span className="font-semibold text-slate-600">on {full(lo)}</span></dd>
          <dd className="text-xs text-slate-600">{geo.iLo === last || lo.value === now.value ? "that is the latest rate" : `the latest is ${Math.abs(fromLow).toFixed(1)}% ${fromLow < 0 ? "below" : "above"} it`}</dd>
          {step && <dd className="text-xs text-slate-600">{heldText(geo.iLo, geo.heldLo)}</dd>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{latestLabel}</dt>
          <dd className="text-sm font-bold leading-snug text-slate-900">{format(now.value)} <span className="font-semibold text-slate-600">on {full(now)}</span></dd>
          <dd className="text-xs text-slate-600">{pointsText ?? `${points.length} trading days shown`}</dd>
          {todayIso && now.iso && now.iso < todayIso && <dd className="text-xs text-slate-600">None is published for today yet (nor on weekends and holidays), so this is the latest published.</dd>}
        </div>
      </dl>
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
