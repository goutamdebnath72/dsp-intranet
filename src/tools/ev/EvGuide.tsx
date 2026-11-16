// src/tools/ev/EvGuide.tsx
//
// THE SECOND TAB OF THE ELECTRIC-CAR WINDOW: "EV specifications explained": six distinct, colour-coded sections (the two numbers, power, the battery, the Blade battery, AC and DC charging, the socket) that say what each word
// of a spec sheet means in plain words, then one worked example with the figures worked out from the same arithmetic as the charging-time tab. The text is in evGuideData.ts. Nothing is fetched, stored or sent.
"use client";

import React from "react";
import { ExternalLink, Eye, Gauge, Zap } from "lucide-react";
import { EXAMPLE, GUIDE, GUIDE_LEAD, TWO_NUMBERS, kwToBhp, kwToPs, type GuideSection } from "./evGuideData";
import { estimateCharge, hoursText, isEvProblem, EV_DEFAULTS } from "./ev";

const TONE: Record<GuideSection["tone"], { card: string; badge: string; chip: string; title: string }> = {
  emerald: { card: "border-emerald-200 bg-emerald-50/50", badge: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-900", title: "text-emerald-900" },
  sky: { card: "border-sky-200 bg-sky-50/50", badge: "bg-sky-600", chip: "bg-sky-100 text-sky-900", title: "text-sky-900" },
  violet: { card: "border-violet-200 bg-violet-50/50", badge: "bg-violet-600", chip: "bg-violet-100 text-violet-900", title: "text-violet-900" },
  amber: { card: "border-amber-200 bg-amber-50/60", badge: "bg-amber-600", chip: "bg-amber-100 text-amber-900", title: "text-amber-900" },
  rose: { card: "border-rose-200 bg-rose-50/50", badge: "bg-rose-600", chip: "bg-rose-100 text-rose-900", title: "text-rose-900" },
  teal: { card: "border-teal-200 bg-teal-50/50", badge: "bg-teal-600", chip: "bg-teal-100 text-teal-900", title: "text-teal-900" },
};

function Section({ s }: { s: GuideSection }) {
  const t = TONE[s.tone];
  return (
    <section id={`ev-guide-${s.id}`} aria-labelledby={`ev-guide-h-${s.id}`} data-guide-section={s.id} className={`scroll-mt-4 rounded-3xl border p-4 shadow-sm ${t.card}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${t.badge}`}>{s.no}</span>
        <div className="min-w-0">
          <h3 id={`ev-guide-h-${s.id}`} className={`text-base font-extrabold leading-tight ${t.title}`}>{s.title}</h3>
          <p className="text-xs font-semibold text-slate-500">{s.question}</p>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{s.intro}</p>
      <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {s.terms.map((x) => (
          <div key={x.term} className="rounded-2xl bg-white/90 px-3 py-2.5 shadow-sm" data-guide-term>
            <dt className={`inline-block rounded-lg px-2 py-0.5 text-xs font-extrabold ${t.chip}`}>{x.term}</dt>
            <dd className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{x.plain}</dd>
            {x.tip && <dd className="mt-1 text-xs font-semibold leading-snug text-slate-600"><span className="text-slate-400">Remember: </span>{x.tip}</dd>}
          </div>
        ))}
      </dl>
      {s.watch && <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold leading-snug text-slate-700" data-guide-watch><Eye size={14} className="mt-px shrink-0 text-slate-500" aria-hidden="true" />{s.watch}</p>}
      {s.sources && (
        <div className="mt-3 text-[11px] leading-relaxed text-slate-500" data-guide-sources>
          <span className="font-semibold">Where this comes from:</span>
          <ul className="mt-0.5 space-y-0.5">
            {s.sources.map((x) => (
              <li key={x.name + x.quote}>
                <a className="inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline" href={`${x.url}#:~:text=${encodeURIComponent(x.quote.split(" ").slice(0, 8).join(" ")).replace(/-/g, "%2D")}`} target="_blank" rel="noopener noreferrer">{x.name}<ExternalLink size={11} aria-hidden="true" /></a>
                <details className="mt-0.5 text-slate-600"><summary className="cursor-pointer select-none font-semibold text-slate-500 hover:text-slate-700">What it says</summary><blockquote className="mt-0.5 border-l-2 border-slate-300 pl-2 italic">&ldquo;{x.quote}&rdquo;</blockquote></details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** the worked example: every figure is computed here, from the same arithmetic as the charging-time tab and the converter */
export function Example() {
  const e = EXAMPLE;
  const ac = estimateCharge({ ...EV_DEFAULTS, capacityKwh: e.capacityKwh, fromPct: 10, toPct: 90, carAcKw: e.acKw, kmPerKwh: e.kmPerKwh }, { kind: "AC", kw: e.acKw });
  const rows: Array<[string, string, string]> = [
    ["Battery", `${e.capacityKwh} kWh`, `the tank: about ${Math.round(e.capacityKwh * e.kmPerKwh)} km on a full charge at ${e.kmPerKwh} km per kWh, which is about what you would see in daily driving`],
    ["Motor", `${e.motorKw} kW`, `the engine: ${Math.round(kwToBhp(e.motorKw))} bhp, or ${Math.round(kwToPs(e.motorKw))} PS`],
    ["Home charger (AC)", `${e.acKw} kW`, isEvProblem(ac) ? "" : `adds ${ac.addedKwh.toFixed(0)} kWh from 10% to 90% in about ${hoursText(ac.hours)}`],
  ];
  return (
    <section aria-label="A worked example" data-guide-example className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><Gauge size={17} className="text-emerald-600" aria-hidden="true" /> Putting it together: a made-up car</h3>
      <p className="mt-1 text-xs text-slate-500">An illustration with round numbers, not a real car: read your own car&apos;s figures the same way.</p>
      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {rows.map(([k, v, m]) => (
          <li key={k} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2"><span className="w-36 shrink-0 font-bold text-slate-800">{k}</span><span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-sm font-extrabold tabular-nums text-emerald-900">{v}</span><span className="min-w-0 flex-1 text-[13px] text-slate-600">{m}</span></li>
        ))}
      </ul>
    </section>
  );
}

export function EvGuide() {
  return (
    <div className="space-y-3" data-ev-guide>
      <p className="text-sm leading-relaxed text-slate-700">{GUIDE_LEAD}</p>
      <div className="grid gap-2.5 sm:grid-cols-2" data-two-numbers>
        {([TWO_NUMBERS.kwh, TWO_NUMBERS.kw]).map((n, i) => (
          <div key={n.unit} className={`rounded-3xl border p-3.5 shadow-sm ${i === 0 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50" : "border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50"}`}>
            <div className="flex items-center gap-2"><Zap size={16} className={i === 0 ? "text-emerald-600" : "text-sky-600"} aria-hidden="true" /><span className="text-2xl font-extrabold text-slate-900">{n.unit}</span><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{n.name}</span></div>
            <p className="mt-1 text-sm font-bold text-slate-800">is like {n.picture}</p>
            <p className="text-[13px] leading-snug text-slate-600">It says {n.says}.</p>
          </div>
        ))}
      </div>
      <nav aria-label="Sections of this guide" className="flex flex-wrap gap-1.5" data-guide-jump>
        {GUIDE.map((s) => <a key={s.id} href={`#ev-guide-${s.id}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE[s.tone].chip}`}>{s.no}. {s.title}</a>)}
      </nav>
      {GUIDE.map((s) => <Section key={s.id} s={s} />)}
      <Example />
    </div>
  );
}
