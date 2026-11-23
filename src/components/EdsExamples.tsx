// src/components/EdsExamples.tsx
//
// THE SHELF OF PROVEN QUESTIONS, drawn in the search window while the Executive Deep Search button is chosen by an executive and nothing has been asked yet (the window decides when: src/components/OmnibarModal.tsx). I use it to teach by
// example: what a deep question looks like, and what each kind asks for. Every question is a link; pressing it puts the question in the box and runs it at once (no Enter). A question the person writes himself still needs Enter.
// The questions and their groups are in src/lib/help/edsExamples.ts (which reads the guide's own list). The window scrolls this panel when it is taller than the window.
"use client";

import React from "react";
import { ArrowRight, FileText, Info, KeyRound, Layers, PenLine } from "lucide-react";
import { KEYWORD_GROUPS, SHELF_TEMPLATES, SHELF_TEXT, edsShelf } from "@/lib/help/edsExamples";

export function EdsExamples({ onPick }: { onPick: (question: string) => void }) {
  const groups = edsShelf();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section data-eds-shelf aria-label="Executive Deep Search: questions to try" className="mx-1 mb-3 text-neutral-800">
      <header className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white px-4 py-4 shadow-sm">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-amber-950">
              {SHELF_TEXT.title} <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-800">{total} questions to try</span>
            </h2>
          </div>
        </div>
      </header>

      <div data-eds-keywords className="mt-4 rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><KeyRound className="h-4 w-4 text-amber-600" aria-hidden="true" />{SHELF_TEXT.keywordsTitle}</h3>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">{SHELF_TEXT.keywordsIntro}</p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {KEYWORD_GROUPS.map((k) => (
            <div key={k.id} data-eds-keyword-group={k.id}>
              <p className="mb-1 text-[11px] leading-snug text-neutral-500"><strong className="font-semibold text-neutral-800">{k.title}.</strong> {k.how}</p>
              <ul className="flex flex-wrap gap-1.5">
                {k.words.map((w) => (
                  <li key={w} data-eds-keyword={w} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${k.alone ? "border-amber-400 bg-amber-100 text-amber-950" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{w}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-neutral-500"><Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />{SHELF_TEXT.keywordsNote}</p>
      </div>

      <div className="mt-5 px-1">
        <h3 className="text-sm font-bold text-neutral-900">{SHELF_TEXT.examplesTitle}</h3>
        <p className="mt-0.5 text-xs text-neutral-600">{SHELF_TEXT.examplesIntro}</p>
      </div>

      <div className="mt-3 flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.id} data-eds-group={g.id}>
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <span aria-hidden="true" className="h-4 w-1 shrink-0 self-center rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
              <h3 className="text-sm font-bold text-neutral-900">{g.title}</h3>
              {g.items.length > 0 && <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] font-semibold text-neutral-500">{g.items.length}</span>}
            </div>
            <p className="mb-2 px-3 text-[11px] leading-snug text-neutral-500">{g.blurb}</p>
            {g.templates && (
              <ul data-eds-templates className="mb-2 flex flex-col gap-1.5">
                {g.templates.map((t) => (
                  <li key={t} className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-3.5 py-2.5 text-[13px] leading-snug text-neutral-700"><span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Template</span>{t}</li>
                ))}
              </ul>
            )}
            <ul className="flex flex-col gap-2">
              {g.items.map((it) => (
                <li key={it.id}>
                  <a
                    href="#eds-question"
                    data-eds-example={it.id}
                    onClick={(e) => { e.preventDefault(); onPick(it.q); }}
                    className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 shadow-sm outline-none transition hover:-translate-y-px hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-md focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug text-amber-900 underline decoration-amber-300 decoration-1 underline-offset-[3px] transition group-hover:decoration-amber-600">{it.q}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                        <span className="rounded-full bg-amber-100/80 px-2 py-0.5 font-semibold text-amber-800">{it.kind}</span>
                        <span className="inline-flex min-w-0 items-start gap-1"><FileText className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" aria-hidden="true" /><span className="min-w-0">Reads {it.needs}</span></span>
                      </span>
                      {it.note && (
                        <span className="mt-1.5 flex items-start gap-1 text-[11px] italic leading-snug text-amber-800/80"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{it.note}</span>
                      )}
                    </span>
                    <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition group-hover:bg-amber-500 group-hover:text-white">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer data-eds-own className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><PenLine className="h-4 w-4 text-amber-600" aria-hidden="true" />{SHELF_TEXT.templatesTitle}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {SHELF_TEMPLATES.map((t) => (
            <li key={t} className="rounded-lg border border-amber-100 bg-white px-2.5 py-1.5 text-[11px] leading-snug text-neutral-700">{t}</li>
          ))}
        </ul>
      </footer>
    </section>
  );
}
