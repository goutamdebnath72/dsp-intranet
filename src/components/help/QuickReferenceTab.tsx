// src/components/help/QuickReferenceTab.tsx
//
// THE "WHAT TO TYPE" PAGE OF THE USER GUIDE: each feature of the search bar's tools by name, and beside it the words that open it, the alternatives separated by a front slash. Click any alternative to put
// it in the search bar (the reader still presses Enter where a page needs it). The list is data (src/lib/help/quickReference.ts, tested against the real detector); nothing about a feature is written here.
"use client";

import React, { useMemo, useState } from "react";
import { CornerDownLeft, Search, Zap } from "lucide-react";
import { QUICK_REFERENCE, allReferenceStrings, filterReference, type RefEntry } from "@/lib/help/quickReference";

function Run({ instant }: { instant: boolean }) {
  return instant ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800" title="The result appears as you type. No Enter needed.">
      <Zap size={11} aria-hidden="true" /> as you type
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700" title="Type it, then press the Enter key.">
      <CornerDownLeft size={11} aria-hidden="true" /> press Enter
    </span>
  );
}

/** the alternatives of one feature, with a front slash between them; each is a button that puts it in the search bar */
function Strings({ strings, onTry }: { strings: string[]; onTry?: (q: string) => void }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-slate-800">
      {strings.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="mx-1.5 font-bold text-slate-400" aria-hidden="true">/</span>}
          {onTry ? (
            <button type="button" onClick={() => onTry(s)} title="Put this in the search bar" className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">{s}</button>
          ) : (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800">{s}</span>
          )}
        </React.Fragment>
      ))}
    </p>
  );
}

function Row({ e, onTry }: { e: RefEntry; onTry?: (q: string) => void }) {
  return (
    <li className="grid gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:border-sky-200 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold leading-snug text-slate-900">{e.feature}</p>
        <p className="mt-1"><Run instant={e.instant} /></p>
      </div>
      <div className="min-w-0">
        <Strings strings={e.strings} onTry={onTry} />
        <p className="mt-1 text-[12px] leading-snug text-slate-500">{e.what}</p>
      </div>
    </li>
  );
}

export function QuickReferenceTab({ onTry }: { onTry?: (q: string) => void }) {
  const [text, setText] = useState("");
  const shown = useMemo(() => filterReference(text), [text]);
  const total = useMemo(() => allReferenceStrings().length, []);
  const features = QUICK_REFERENCE.reduce((n, g) => n + g.entries.length, 0);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 p-[2px] shadow-md">
        <div className="rounded-[10px] bg-white px-4 py-3.5">
          <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-indigo-600"><Search size={15} aria-hidden="true" /> What to type</p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">Each feature, and the words that open it.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Type any <strong>one</strong> of the alternatives; they are separated by a front slash (<span className="rounded bg-sky-50 px-1 font-semibold text-sky-800">gold rate today</span> <strong className="text-slate-400">/</strong> <span className="rounded bg-sky-50 px-1 font-semibold text-sky-800">silver price</span> open the same card). Click one to put it in the search bar. Words in the sums and dates change with your own figures: <span className="rounded bg-sky-50 px-1 font-semibold text-sky-800">5 km in miles</span> works for any number and unit.
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-700">
            <span className="font-semibold">Each feature is marked:</span>
            <Run instant /> <span className="text-slate-500">the result shows under the search line</span>
            <Run instant={false} /> <span className="text-slate-500">opens a page: press the Enter key</span>
          </p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find a feature or a word: gold, emi, hindi, tyre…"
          aria-label="Find a feature or a word that opens it"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">No feature or word holds all of those letters. Try one word, such as <em>gold</em> or <em>emi</em>.</p>
      ) : (
        <div className="space-y-4">
          {shown.map((g) => (
            <section key={g.id} aria-label={g.title}>
              <h3 className="text-[14px] font-extrabold text-slate-800">{g.title}</h3>
              <p className="mb-2 text-[12.5px] leading-snug text-slate-500">{g.covers}</p>
              <ul className="space-y-1.5">
                {g.entries.map((e) => <Row key={e.feature} e={e} onTry={onTry} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!text.trim() && <p className="text-center text-[12px] text-slate-400">{features} features · {total} words and phrases, each tested against the search bar itself. Questions about people, the hospital, circulars and announcements are on the Sample questions page.</p>}
    </div>
  );
}
