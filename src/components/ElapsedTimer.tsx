// src/components/ElapsedTimer.tsx
//
// A DIGITAL TIMER for a search that takes a while (the Executive Deep Search answer takes up to about two minutes). I put it in the top right corner of the panel (on the row the window gives it); it ticks while the answer is being looked for, and stops the moment it is drawn,
// keeping the time it took on screen. Pure display: the caller says when it started and, once it is over, when it stopped. Read by src/components/OmnibarModal.tsx.
"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/** Formats milliseconds as a digital clock: 00:47.312 (minutes, seconds, milliseconds); the leftmost unit is the millisecond, so all three digits after the point are shown */
export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  const millis = t % 1000;
  const secs = Math.floor(t / 1000) % 60;
  const mins = Math.floor(t / 60_000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** The same, in words for a screen reader: "47.312 seconds", "1 minute 5.200 seconds" */
export function spokenElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  const mins = Math.floor(t / 60_000);
  const secs = `${Math.floor(t / 1000) % 60}.${String(t % 1000).padStart(3, "0")}`;
  return mins > 0 ? `${mins} minute${mins === 1 ? "" : "s"} ${secs} seconds` : `${secs} seconds`;
}

export function ElapsedTimer({ startedAt, stoppedAt, now: nowForTest }: { startedAt: number; stoppedAt: number | null; /** For the tests only: sets the moment "now" is taken to be */ now?: number }) {
  const running = stoppedAt === null;
  const [now, setNow] = useState(() => nowForTest ?? Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    // I redraw on every frame of the screen, so the millisecond digits run smoothly (a slower tick would make them jump); the frame loop is cancelled when the timer stops or the panel goes
    let frame = 0;
    const tick = () => { setNow(Date.now()); frame = window.requestAnimationFrame(tick); };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [running]);
  const ms = (stoppedAt ?? now) - startedAt;
  return (
    // Just the chip: I let the search window give it a row of its own (src/components/OmnibarModal.tsx, data-eds-toolbar), in the normal flow, so it takes its own height, is centred on the same line as the back link beside it and can never lie over the reply's own buttons
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
