// src/components/ElapsedTimer.tsx
//
// A DIGITAL TIMER for a search that takes a while (the Executive Deep Search answer takes up to about two minutes). It sits in the top right corner of the panel (on the row the window gives it), ticks while the answer is being looked for, and stops the moment it is drawn,
// keeping the time it took on screen. Pure display: the caller says when it started and, once it is over, when it stopped. Read by src/components/OmnibarModal.tsx.
"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/** milliseconds as a digital clock: 00:47.3 (minutes, seconds, tenths) */
export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const tenths = t % 10;
  const secs = Math.floor(t / 10) % 60;
  const mins = Math.floor(t / 600);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/** the same, in words for a screen reader: "47.3 seconds", "1 minute 5.2 seconds" */
export function spokenElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const mins = Math.floor(t / 600);
  const secs = `${Math.floor(t / 10) % 60}.${t % 10}`;
  return mins > 0 ? `${mins} minute${mins === 1 ? "" : "s"} ${secs} seconds` : `${secs} seconds`;
}

export function ElapsedTimer({ startedAt, stoppedAt, now: nowForTest }: { startedAt: number; stoppedAt: number | null; /** for the tests only: the moment "now" is taken to be */ now?: number }) {
  const running = stoppedAt === null;
  const [now, setNow] = useState(() => nowForTest ?? Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);
  const ms = (stoppedAt ?? now) - startedAt;
  return (
    // just the chip: the search window gives it a row of its own (src/components/OmnibarModal.tsx, data-eds-toolbar), in the normal flow, so it takes its own height, is centred on the same line as the back link beside it and can never lie over the reply's own buttons
    <div
      role="timer"
      data-elapsed-timer={running ? "running" : "stopped"}
      aria-live="off"
      aria-label={running ? `Looking for the answer: ${spokenElapsed(ms)} so far` : `The answer took ${spokenElapsed(ms)}`}
      title={running ? "Time since the question was sent" : "Time the answer took"}
      className={`inline-flex min-h-[2rem] shrink-0 select-none items-center gap-2.5 rounded-xl border bg-[#171717] px-3 py-1.5 shadow-lg ring-1 ring-black/10 ${running ? "border-amber-400/70" : "border-emerald-400/60"}`}
    >
      {running ? (
        <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" /></span>
      ) : (
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400" />
      )}
      <span className={`text-[11px] font-semibold uppercase leading-none tracking-wider ${running ? "text-amber-200/80" : "text-emerald-200/80"}`}>{running ? "Searching" : "Answered in"}</span>
      <span
        className={`font-mono text-[15px] font-bold leading-none tabular-nums tracking-[0.12em] ${running ? "text-amber-300" : "text-emerald-300"}`}
        style={{ textShadow: running ? "0 0 8px rgba(251,191,36,0.55)" : "0 0 8px rgba(52,211,153,0.45)" }}
      >
        {formatElapsed(ms)}
      </span>
    </div>
  );
}
