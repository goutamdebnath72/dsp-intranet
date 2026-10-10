"use client";

// src/components/HolidayAnswerCard.tsx
//
// Lays out a "when is X" / "is this date a holiday" answer as a small card instead of one long sentence:
// name, then the date once with a coloured chip per type (and the categories it applies to), then the
// reason in its own box. The maintainer's remark about the source document is folded away.

import React from "react";
import type { HolidayDetail, HolidayDetailEntry } from "@/lib/holidays/format";

const TYPE_STYLE: Record<string, string> = {
  FH: "border-emerald-200 bg-emerald-100 text-emerald-800",
  RH: "border-amber-200 bg-amber-100 text-amber-800",
  CH: "border-slate-200 bg-slate-100 text-slate-700",
};

function groupByDate(entries: HolidayDetailEntry[]): HolidayDetailEntry[][] {
  const map = new Map<string, HolidayDetailEntry[]>();
  for (const e of entries) {
    const g = map.get(e.date);
    if (g) g.push(e);
    else map.set(e.date, [e]);
  }
  return Array.from(map.values());
}

export function HolidayAnswerCard({ details }: { details: HolidayDetail[] }) {
  return (
    <div className="space-y-3">
      {details.map((d) => (
        <div key={d.name} className="rounded-lg border border-blue-100 bg-white/70 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h4 className="text-[15px] font-semibold text-neutral-900">{d.name}</h4>
            {d.aliases.length > 0 && (
              <span className="text-xs text-neutral-400">also called {d.aliases.slice(0, 3).join(", ")}</span>
            )}
          </div>

          <ul className="mt-2 space-y-1.5">
            {groupByDate(d.entries).map((es) => (
              <li key={es[0].date} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-700">
                  {es[0].weekday}, {es[0].dateLabel}
                </span>
                {es.map((e) => (
                  <span
                    key={`${e.date}-${e.type}`}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      TYPE_STYLE[e.type] ?? TYPE_STYLE.CH
                    }`}
                  >
                    {e.typeLabel}
                    {e.audience ? ` · ${e.audience}` : ""}
                  </span>
                ))}
              </li>
            ))}
          </ul>

          {d.explanation && (
            <div className="mt-3 border-l-2 border-blue-200 pl-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Why</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-700">{d.explanation}</p>
            </div>
          )}

          {d.sourceNote && (
            <details className="mt-2 text-xs text-neutral-500">
              <summary className="cursor-pointer select-none text-neutral-400 hover:text-neutral-600">
                Note on the source document
              </summary>
              <p className="mt-1 leading-relaxed">{d.sourceNote}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
