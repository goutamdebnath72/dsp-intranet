// src/components/tools/live/LiveStrip.tsx
//
// THE STATUS LINE OF A SELF-REFRESHING CARD: a pulsing dot and LIVE (or PAUSED, or NOT UPDATING when the last check failed), when the figures were fetched, how long until the next check, a thin bar that
// runs down as the seconds pass, a button to pause the checking, and one to check now. The countdown is its own small component with its own clock, so that the list under it is not redrawn every second.
"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Pause, Play, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";

const ZONE = "Asia/Kolkata";

/** "3:42:10 pm" in Indian time, to the second (a live screen shows seconds) */
export function clock(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: ZONE });
  return d.isValid ? d.toFormat("h:mm:ss a").replace("AM", "am").replace("PM", "pm") : "";
}

export type StripMode = "live" | "paused" | "lagging";
export const modeOf = (paused: boolean, lagging: boolean): StripMode => (paused ? "paused" : lagging ? "lagging" : "live");

const LOOK: Record<StripMode, { dot: string; ring: string; text: string; label: string }> = {
  live: { dot: "bg-emerald-500", ring: "bg-emerald-400", text: "text-emerald-700", label: "Live" },
  paused: { dot: "bg-slate-400", ring: "bg-slate-300", text: "text-slate-600", label: "Paused" },
  lagging: { dot: "bg-amber-500", ring: "bg-amber-400", text: "text-amber-700", label: "Not updating" },
};

/** "next check in 42 s": counts down from the moment the last answer came in */
function Countdown({ arrivedAt, everyMs }: { arrivedAt: number; everyMs: number }) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((arrivedAt + everyMs - t) / 1000));
  return <span className="tabular-nums">next check in {left} s</span>;
}

export function LiveStrip({ fetchedAt, arrivedAt, everyMs, mode, refreshing, onTogglePause, onRefresh }: {
  fetchedAt: string; arrivedAt: number; everyMs: number; mode: StripMode; refreshing: boolean; onTogglePause: () => void; onRefresh: () => void;
}) {
  const calm = useReducedMotion();
  const look = LOOK[mode];
  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <span className={`inline-flex items-center gap-1.5 font-extrabold uppercase tracking-widest ${look.text}`}>
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            {mode === "live" && !calm && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${look.ring}`} />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${look.dot}`} />
          </span>
          {look.label}
        </span>
        <span>{mode === "lagging" ? "Last update" : "Updated"} <span className="font-semibold tabular-nums text-slate-800">{clock(fetchedAt)}</span> IST</span>
        {mode !== "paused" && <Countdown key={arrivedAt} arrivedAt={arrivedAt} everyMs={everyMs} />}
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onTogglePause} aria-pressed={mode === "paused"} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900">
            {mode === "paused" ? <Play size={12} /> : <Pause size={12} />}{mode === "paused" ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />Check now
          </button>
        </span>
      </div>
      {/* the bar runs down over the interval, and starts again with each answer */}
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {mode === "live" && !calm && <motion.div key={arrivedAt} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: everyMs / 1000, ease: "linear" }} style={{ originX: 0 }} className="h-full w-full rounded-full bg-emerald-400" />}
      </div>
      {mode === "lagging" && <p className="mt-1.5 text-xs text-amber-800">The last check failed. These are the stories from the last good one; it will try again by itself.</p>}
    </div>
  );
}
