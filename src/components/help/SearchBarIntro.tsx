// src/components/help/SearchBarIntro.tsx
//
// THE INTRODUCTION TO THE SEARCH BAR at the top of the user guide (text in src/lib/help/searchBarIntro.ts): what the bar is, how to start, what it covers, what it cannot do yet.
"use client";

import React from "react";
import { Calculator, CircleAlert, Search, Sparkles } from "lucide-react";
import { AREAS, CALCULATORS_LINE, INTRO_LEAD, INTRO_TITLE, LIMITS, START } from "@/lib/help/searchBarIntro";

export function SearchBarIntro() {
  return (
    <section aria-label={INTRO_TITLE} className="overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 shadow-sm">
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-sky-700"><Search size={15} aria-hidden="true" /> {INTRO_TITLE}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{INTRO_LEAD}</p>
        <ol className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-slate-700">
          {START.map((s, i) => (
            <li key={s} className="flex items-start gap-1.5"><span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
        <p data-calculators-line className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[13px] leading-snug text-slate-700">
          <Calculator size={15} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
          <span>
            {CALCULATORS_LINE.before}{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-bold text-sky-800">{CALCULATORS_LINE.command}</code>{" "}
            {CALCULATORS_LINE.after}{" "}
            <strong className="text-slate-900">{CALCULATORS_LINE.tools.join("; ")}</strong>.
          </span>
        </p>
        <p className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500"><Sparkles size={13} aria-hidden="true" /> What you can ask</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {AREAS.map((a) => (
            <li key={a.label} className="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1.5 text-[12.5px] leading-snug text-slate-600"><strong className="text-slate-800">{a.label}</strong>: {a.detail}</li>
          ))}
        </ul>
        <p className="mb-1 mt-3.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-amber-700"><CircleAlert size={13} aria-hidden="true" /> Good to know</p>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </section>
  );
}
