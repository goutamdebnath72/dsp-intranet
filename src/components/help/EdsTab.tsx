// src/components/help/EdsTab.tsx
//
// THE "DEEP SEARCH (EDS)" TAB OF THE USER GUIDE (text and list in src/lib/help/edsGuide.ts): what EDS covers today, what it is, what the back end does when a circular is uploaded and when an executive asks, which AI model works at each
// step, and the questions to test it with. Each question shows its measured score (the real detector, synthesisIntent.ts): 5 or more reaches EDS as typed. "Try it" puts a question in the search bar (the reader still presses Enter).
"use client";

import React, { useMemo, useState } from "react";
import { BookOpenCheck, Check, ClipboardCheck, Copy, Cpu, Database, FileSearch, Layers, Search, Sparkles, Upload, UserCheck, Zap } from "lucide-react";
import { detectSynthesisIntent } from "@/lib/search/synthesisIntent";
import { ASK_MODELS, ASK_STEPS, BEFORE_YOU_TEST, BUILD_TIPS, EDS_TITLE, NOT_DEEP, SCOPE, TEMPLATES, TEST_QUERIES, UPLOAD_MODELS, UPLOAD_STEPS, WHAT_IS, type ModelRow, type Step } from "@/lib/help/edsGuide";

function H({ icon, no, title, children }: { icon: React.ReactNode; no: number; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-700">Part {no}</p>
        <h3 className="text-[17px] font-extrabold leading-tight text-slate-900">{title}</h3>
        {children}
      </div>
    </header>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-3 space-y-2" data-eds-steps>
      {steps.map((s) => (
        <li key={s.no} className="flex gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[12px] font-bold text-white">{s.no}</span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-800">{s.title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{s.what}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Models({ rows, label }: { rows: ModelRow[]; label: string }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-violet-200 bg-violet-50/50" data-eds-models>
      <p className="flex items-center gap-1.5 px-3.5 pt-3 text-[12px] font-extrabold uppercase tracking-wide text-violet-800"><Cpu size={14} aria-hidden="true" /> {label}</p>
      <table className="mt-1 w-full min-w-[34rem] text-left text-[12.5px]">
        <thead><tr className="text-slate-500"><th className="px-3.5 py-1.5 font-semibold">Stage</th><th className="px-3.5 py-1.5 font-semibold">Model or service</th><th className="px-3.5 py-1.5 font-semibold">What it does</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stage} className="border-t border-violet-100 align-top">
              <td className="px-3.5 py-2 font-semibold text-slate-800">{r.stage}</td>
              <td className="px-3.5 py-2"><code className="rounded bg-white px-1.5 py-0.5 font-bold text-violet-800">{r.model}</code></td>
              <td className="px-3.5 py-2 text-slate-600">{r.job}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3.5 pb-3 pt-1 text-[11.5px] text-slate-500">These are the models in use today; the administrator can change them in the server settings without changing the app.</p>
    </div>
  );
}

function QueryRow({ id, q, kind, needs, also, note, onTry, badge }: { id: string; q: string; kind?: string; needs?: string; also?: string[]; note?: string; onTry?: (q: string) => void; badge: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(q); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the question can still be selected by hand */ }
  };
  return (
    <li data-eds-query={id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[11px] font-extrabold text-white">{id}</span>
        {kind && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{kind}</span>}
        {badge}
        {also && also.length > 0 && <span className="text-[11px] text-slate-400">test list: {also.join(", ")}</span>}
      </div>
      <p className="mt-1.5 select-text text-[13.5px] leading-relaxed text-slate-800">{q}</p>
      {needs && <p className="mt-1 text-[12px] leading-snug text-slate-600"><span className="font-bold text-slate-700">Needs: </span>{needs}</p>}
      {note && <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] leading-snug text-amber-900">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onTry && <button type="button" onClick={() => onTry(q)} className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-sky-700"><Zap size={12} aria-hidden="true" /> Try it</button>}
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50">{copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? "Copied" : "Copy"}</button>
      </div>
    </li>
  );
}

const scoreBadge = (q: string) => {
  const r = detectSynthesisIntent(q);
  const reaches = r.synthesis;
  return (
    <span data-eds-score={r.score} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${reaches ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
      {reaches ? `reaches EDS (score ${r.score})` : r.blockedBy ? "kept out of EDS (people data)" : `normal search (score ${r.score})`}
    </span>
  );
};

export function EdsTab({ isExecutive, onTry }: { isExecutive: boolean; onTry?: (q: string) => void }) {
  const [filter, setFilter] = useState("");
  const words = filter.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const shown = useMemo(() => TEST_QUERIES.filter((t) => words.every((w) => `${t.q} ${t.kind} ${t.needs} ${t.id}`.toLowerCase().includes(w))), [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-6" data-eds-tab>
      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-sm" data-eds-scope>
        <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-violet-700"><Sparkles size={15} aria-hidden="true" /> {EDS_TITLE}</p>
        <p className="mt-2 text-[15px] font-bold leading-snug text-slate-900">{SCOPE.now} <span className="font-semibold text-slate-700">{SCOPE.later}</span></p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{SCOPE.honest}</p>
        <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold leading-snug ${isExecutive ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`} data-eds-who>
          <UserCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{SCOPE.who} {isExecutive ? "You are signed in as an executive: you can use it." : "You are not signed in as an executive on this page."}</span>
        </p>
      </section>

      <section aria-label="What EDS is" data-eds-what>
        <H icon={<FileSearch size={18} aria-hidden="true" />} no={1} title="What EDS is" />
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700">{WHAT_IS.lead}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600">{WHAT_IS.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">Examples</p>
        <ul className="space-y-2" data-eds-examples>
          {WHAT_IS.examples.map((e) => (
            <li key={e.kind} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">{e.kind}</span>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-800">{e.question}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600"><span className="font-bold text-slate-700">You get: </span>{e.gets}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="What happens when a circular is uploaded" data-eds-upload>
        <H icon={<Upload size={18} aria-hidden="true" />} no={2} title="What happens at the back end when a circular is uploaded">
          <p className="mt-1 text-[12.5px] text-slate-500">In this order, in one request. Nothing is saved unless every step succeeds.</p>
        </H>
        <Steps steps={UPLOAD_STEPS} />
        <Models rows={UPLOAD_MODELS} label="Which AI model works at each step of an upload" />
      </section>

      <section aria-label="What happens when an executive asks" data-eds-ask>
        <H icon={<Search size={18} aria-hidden="true" />} no={3} title="What happens when an executive asks a deep question">
          <p className="mt-1 text-[12.5px] text-slate-500">From the moment the line is typed to the briefing on the screen.</p>
        </H>
        <Steps steps={ASK_STEPS} />
        <Models rows={ASK_MODELS} label="Which AI model works at each step of a question" />
      </section>

      <section aria-label="Questions to test EDS" data-eds-test>
        <H icon={<ClipboardCheck size={18} aria-hidden="true" />} no={4} title="Test EDS: the questions" />
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3" data-eds-before>
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-amber-800"><BookOpenCheck size={14} aria-hidden="true" /> Before you test: check the circulars first</p>
          <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-amber-950">{BEFORE_YOU_TEST.map((t) => <li key={t}>{t}</li>)}</ol>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-slate-800">The test questions <span className="text-[12px] font-semibold text-slate-500">({shown.length} of {TEST_QUERIES.length})</span></p>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} type="search" placeholder="Find a question: holiday, gift card, football…" aria-label="Find a test question" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-violet-400 sm:w-72" />
        </div>
        <p className="mt-1 text-[12px] text-slate-500">Every question below reaches EDS exactly as written (the badge is measured by the app's own detector, 5 or more). Type it whole and press Enter.</p>
        <ul className="mt-2 space-y-2" data-eds-queries>
          {shown.map((t) => <QueryRow key={t.id} id={t.id} q={t.q} kind={t.kind} needs={t.needs} also={t.also} note={t.note} onTry={onTry} badge={scoreBadge(t.q)} />)}
        </ul>

        <div className="mt-5" data-eds-build>
          <p className="flex items-center gap-1.5 text-[14px] font-bold text-slate-800"><Layers size={15} aria-hidden="true" /> Make a question like these</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600">{BUILD_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">Fill-in shapes (change the [blanks])</p>
          <ul className="space-y-1.5">{TEMPLATES.map((t) => <li key={t} className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700">{t}</li>)}</ul>
        </div>

        <details className="group mt-5 rounded-xl border border-slate-200 bg-white px-3.5 py-3" data-eds-notdeep>
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[14px] font-bold text-slate-800"><Database size={15} aria-hidden="true" /> Other test questions that do NOT reach EDS as typed (for contrast; open to see)</summary>
          <p className="mt-2 text-[12.5px] text-slate-500">These are also in the project's test lists. Typed as they stand they go to the normal search or another engine, which is the right place for them; they are shown so that nobody is surprised.</p>
          <ul className="mt-2 space-y-2">
            {NOT_DEEP.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md bg-slate-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white">{t.id}</span>{scoreBadge(t.q)}{t.also && t.also.length > 0 && <span className="text-[11px] text-slate-400">also: {t.also.join(", ")}</span>}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{t.q}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">{t.why}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
