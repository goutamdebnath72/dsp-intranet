// src/components/help/UtilityServicesTab.tsx
//
// This is the "Utility Services" tab of the user guide (text and data in src/lib/help/utilityServices.ts): what the services are, how to get any of them, each service by its bold name with the words that open it
// (click them to put them in the search bar), the calculators menu, the sample questions of the services (I pass them in as children, because that block belongs to the guide's own file), and what they cannot do yet.
"use client";

import React, { useMemo } from "react";
import { Calculator, CircleAlert, CornerDownLeft, LayoutGrid, Wrench, Zap } from "lucide-react";
import { allReferenceStrings } from "@/lib/help/quickReference";
import { CALCULATORS_LINE, SERVICES_LINE, UTILITY_HOW, UTILITY_LEAD, UTILITY_LIMITS, UTILITY_SERVICES, UTILITY_TITLE } from "@/lib/help/utilityServices";

/** Says whether the words show their answer as you type (true) or need the Enter key, as the "What to type" list says of the same words. */
function useInstant(): (q: string) => boolean {
  const map = useMemo(() => new Map(allReferenceStrings().map((x) => [x.q.toLowerCase(), x.instant])), []);
  return (q) => map.get(q.toLowerCase()) === true;
}

/** The words that open a service, each a button that puts them in the search bar. */
function TypeChips({ words, onTry, instantOf }: { words: string[]; onTry?: (q: string) => void; instantOf: (q: string) => boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-type-chips>
      <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">Type</span>
      {words.map((w) => {
        const inst = instantOf(w);
        const label = <><span className="font-semibold">{w}</span><span className="ml-1.5 inline-flex items-center gap-0.5 text-[10.5px] font-bold text-slate-500">{inst ? <><Zap size={10} aria-hidden="true" /> as you type</> : <><CornerDownLeft size={10} aria-hidden="true" /> Enter</>}</span></>;
        return onTry ? (
          <button key={w} type="button" onClick={() => onTry(w)} title="Put this in the search bar" data-type-word={w} className="rounded-md bg-emerald-50 px-2 py-0.5 text-left text-[13px] text-emerald-900 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">{label}</button>
        ) : (
          <span key={w} data-type-word={w} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[13px] text-emerald-900">{label}</span>
        );
      })}
    </div>
  );
}

export function UtilityServicesTab({ onTry, children }: { onTry?: (q: string) => void; children?: React.ReactNode }) {
  const instantOf = useInstant();
  return (
    <div className="space-y-4" data-utility-services>
      <section aria-label={UTILITY_TITLE} className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-emerald-700"><Wrench size={15} aria-hidden="true" /> {UTILITY_TITLE}</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{UTILITY_LEAD}</p>
          <ol className="mt-2.5 space-y-1 text-[13px] text-slate-700">
            {UTILITY_HOW.map((s, i) => (
              <li key={s} className="flex items-start gap-1.5"><span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{i + 1}</span><span>{s}</span></li>
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
          <p data-services-line className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[13px] leading-snug text-slate-700">
            <LayoutGrid size={15} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              {SERVICES_LINE.before}{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-bold text-emerald-800">{SERVICES_LINE.command}</code>{" "}
              {SERVICES_LINE.after}
            </span>
          </p>
        </div>
      </section>

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="The Utility Services">
        {UTILITY_SERVICES.map((s) => (
          <li key={s.label} data-service={s.label} className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] leading-snug text-slate-600${s.parts ? " sm:col-span-2" : ""}`}>
            <strong className="text-[14px] text-slate-900">{s.label}</strong>
            {s.type && <TypeChips words={s.type} onTry={onTry} instantOf={instantOf} />}
            <p className="mt-1.5">{s.detail}</p>
            {s.parts && (
              <ol className="mt-1.5 space-y-1.5" data-service-parts>
                {s.parts.map((p, i) => (
                  <li key={p.title} className="rounded-md bg-slate-50 px-2 py-1.5">
                    <span className="flex items-start gap-1.5"><span aria-hidden="true" className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{i + 1}</span><strong className="text-slate-900">{p.title}</strong></span>
                    <TypeChips words={p.type} onTry={onTry} instantOf={instantOf} />
                    <p className="mt-1">{p.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {children}

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-amber-700"><CircleAlert size={13} aria-hidden="true" /> Good to know</p>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
          {UTILITY_LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
}
