// src/components/tools/Pills.tsx
//
// A ROW OF TABS shared by the cards of the search bar (the AICPI card's tabs, the Durgapur areas card's tabs): a real tab list (the arrow keys, Home and End move between the tabs), and the chosen tab has a pill that slides to it.
// `gradient` is the pill's colour (Tailwind classes, written whole so that the stylesheet has them).
"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

export function Pills<T extends string>({ tabs, value, onChange, label, id, gradient = "from-amber-500 to-orange-500 shadow-amber-500/30" }: { tabs: Array<{ id: T; text: string; swatch?: string }>; value: T; onChange: (v: T) => void; label: string; id: string; gradient?: string }) {
  const calm = useReducedMotion();
  const move = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="relative inline-flex max-w-full flex-wrap gap-0.5 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
      {tabs.map((t, i) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onKeyDown={(e) => move(e, i)} onClick={() => onChange(t.id)}
          className={`relative rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors ${value === t.id ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
          {value === t.id && <motion.span layoutId={`pill-${id}`} transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }} className={`absolute inset-0 rounded-xl bg-gradient-to-r shadow-md ${gradient}`} />}
          <span className="relative inline-flex items-center gap-1.5">{t.swatch && <span aria-hidden="true" data-swatch={t.swatch} className="h-3 w-3 rounded-[3px] ring-1 ring-white/70" style={{ background: t.swatch }} />}{t.text}</span>
        </button>
      ))}
    </div>
  );
}

