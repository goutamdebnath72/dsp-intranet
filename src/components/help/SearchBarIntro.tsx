// src/components/help/SearchBarIntro.tsx
//
// THE INTRODUCTION TO THE SEARCH BAR at the top of the user guide (text in src/lib/help/searchBarIntro.ts): what the bar is, how to start, what it covers, what it cannot do yet.
"use client";

import React from "react";
import { CircleAlert, Layers, MousePointerClick, Search, ShieldCheck, Wrench } from "lucide-react";
import { ADMIN_POINTER, AREAS, CHOICE_RULES, EDS_POINTER, INTRO_LEAD, INTRO_TITLE, LIMITS, ROW_TITLES, START, UTILITY_POINTER } from "@/lib/help/searchBarIntro";
import { ADMIN_CHOICE, DOMAINS, EDS_CHOICE } from "@/records/domains";

/** THE BAR AS IT IS DRAWN, in small: the two rows of buttons under the box, from the same lists the bar reads (so the picture cannot differ from the bar). Nothing here is pressable. */
function BarPicture() {
  const chip = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold";
  const rows: Array<{ title: string; chips: string[]; first?: boolean }> = [
    { title: ROW_TITLES.searchIn, chips: ["Everything", ...DOMAINS.map((d) => d.label)], first: true },
    { title: ROW_TITLES.moreTools, chips: [UTILITY_POINTER.term, EDS_CHOICE.label, ADMIN_CHOICE.label] },
  ];
  return (
    <div data-bar-picture aria-label="The buttons under the box, in small" className="mt-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-400"><Search size={14} aria-hidden="true" /> Type here and press Enter…</div>
      <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-3">
        {rows.map((r) => (
          <div key={r.title} className="contents">
            <span className="self-start whitespace-nowrap pt-[0.3em] text-[11px] font-bold uppercase tracking-wider text-slate-400">{r.title}</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {r.chips.map((c, i) => (
                <span key={c} data-bar-chip={c} className={`${chip} ${r.first && i === 0 ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** `onOpenUtility` and `onOpenEds` take the reader to the Utility Services and Deep search (EDS) tabs (the pointers under More tools are buttons when they are given). */
export function SearchBarIntro({ onOpenUtility, onOpenEds }: { onOpenUtility?: () => void; onOpenEds?: () => void } = {}) {
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
        <BarPicture />
        <p className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500"><MousePointerClick size={13} aria-hidden="true" /> What each button searches: <span data-search-in-mark className="font-extrabold text-orange-600">{ROW_TITLES.searchIn}</span></p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {AREAS.map((a, i) => (
            <li key={a.label} className={`rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1.5 text-[12.5px] leading-snug text-slate-600${a.parts || i === 0 || i === AREAS.length - 1 ? " sm:col-span-2" : ""}`}><strong className="text-slate-800">{a.label}</strong>: {a.detail}
              {a.parts && (
                <ol className="mt-1.5 space-y-1" data-area-parts>
                  {a.parts.map((p, i) => (
                    <li key={p.title} className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2 py-1"><span aria-hidden="true" className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">{i + 1}</span><span><strong className="text-slate-800">{p.title}</strong>: {p.detail}</span></li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
        <ul data-choice-rules className="mt-3 list-disc space-y-1 rounded-lg border border-sky-200 bg-sky-50/70 py-2 pl-7 pr-3 text-[13px] leading-snug text-slate-700">
          {CHOICE_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500"><Layers size={13} aria-hidden="true" /> The second row: <span data-more-tools-mark className="font-extrabold text-orange-600">{ROW_TITLES.moreTools}</span></p>
        <p data-eds-pointer className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 text-[13px] leading-snug text-slate-700">
          <Layers size={15} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
          <span>
            {EDS_POINTER.before}{" "}
            {onOpenEds ? (
              <button type="button" onClick={onOpenEds} className="font-bold text-violet-800 underline decoration-violet-400 underline-offset-2 hover:text-violet-900">{EDS_POINTER.term}</button>
            ) : (
              <strong className="text-violet-800">{EDS_POINTER.term}</strong>
            )}{" "}
            {EDS_POINTER.after}
          </span>
        </p>
        <p data-admin-pointer className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] leading-snug text-slate-700">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{ADMIN_POINTER.before} <strong className="text-amber-800">{ADMIN_POINTER.term}</strong> {ADMIN_POINTER.after}</span>
        </p>
        <p data-utility-pointer className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[13px] leading-snug text-slate-700">
          <Wrench size={15} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>
            {UTILITY_POINTER.before}{" "}
            {onOpenUtility ? (
              <button type="button" onClick={onOpenUtility} className="font-bold text-emerald-800 underline decoration-emerald-400 underline-offset-2 hover:text-emerald-900">{UTILITY_POINTER.term}</button>
            ) : (
              <strong className="text-emerald-800">{UTILITY_POINTER.term}</strong>
            )}{" "}
            {UTILITY_POINTER.after}
          </span>
        </p>
        <p className="mb-1 mt-3.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-amber-700"><CircleAlert size={13} aria-hidden="true" /> Good to know</p>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </section>
  );
}
