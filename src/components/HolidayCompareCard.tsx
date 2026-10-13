"use client";

// src/components/HolidayCompareCard.tsx
//
// Draws a year comparison ("holidays 2024 vs 2025") as a small card instead of one long sentence:
//   - one tile per year with the total as the big number,
//   - a coloured pill between them saying what changed in words ("2 fewer in 2025"),
//   - for an all-types comparison, one row per type with a bar per year and the change,
//   - a one-line footnote only when the types add up to more than the totals.
// The data comes ready-made from buildHolidayCompareView (src/lib/holidays/compareView.ts); this file only draws it.

import React from "react";
import { ArrowDown, ArrowUp, Equal, Info } from "lucide-react";
import type { CompareDirection, HolidayCompareView, HolidayCompareYear } from "@/lib/holidays/compareView";

const YEAR_A = "bg-blue-600";
const YEAR_B = "bg-sky-400";

const TYPE_DOT: Record<string, string> = {
  FH: "bg-emerald-500",
  RH: "bg-amber-500",
  CH: "bg-slate-400",
};

const CHANGE_STYLE: Record<CompareDirection, string> = {
  more: "border-emerald-200 bg-emerald-50 text-emerald-800",
  fewer: "border-amber-200 bg-amber-50 text-amber-800",
  same: "border-slate-200 bg-slate-100 text-slate-600",
};

function ChangeIcon({ direction, size }: { direction: CompareDirection; size: number }) {
  if (direction === "more") return <ArrowUp size={size} aria-hidden />;
  if (direction === "fewer") return <ArrowDown size={size} aria-hidden />;
  return <Equal size={size} aria-hidden />;
}

function ChangePill({ direction, text, large }: { direction: CompareDirection; text: string; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold ${CHANGE_STYLE[direction]} ${
        large ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
      }`}
    >
      <ChangeIcon direction={direction} size={large ? 15 : 12} />
      {text}
    </span>
  );
}

function YearTile({ year, unit, swatch }: { year: HolidayCompareYear; unit: string; swatch: string }) {
  return (
    <div className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center shadow-sm">
      <div className="flex items-center justify-center gap-1.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
        <span className="text-sm font-semibold text-neutral-700">{year.year}</span>
        {year.caption && <span className="text-[11px] text-neutral-400">{year.caption}</span>}
      </div>
      <div className="mt-1 text-4xl font-bold leading-none text-blue-900">{year.total.toLocaleString()}</div>
      <div className="mt-1 text-xs text-neutral-500">{unit}</div>
    </div>
  );
}

function Bar({ year, value, max, color }: { year: number; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 flex-shrink-0 text-[11px] text-neutral-400">{year}</span>
      <div className="h-2 flex-1 rounded-full bg-neutral-100" aria-hidden>
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(value > 0 ? 3 : 0, (value / max) * 100)}%` }} />
      </div>
      <span className="w-7 flex-shrink-0 text-right text-xs font-medium tabular-nums text-neutral-700">{value}</span>
    </div>
  );
}

export function HolidayCompareCard({ view }: { view: HolidayCompareView }) {
  const [a, b] = view.years;
  const rows = view.rows ?? [];
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));

  return (
    <div className="rounded-lg border border-blue-100 bg-white/80 p-4">
      <h4 className="text-[15px] font-semibold text-neutral-900">{view.title}</h4>

      <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <YearTile year={a} unit={view.unit} swatch={YEAR_A} />
        <div className="flex justify-center">
          <ChangePill direction={view.direction} text={view.change} large />
        </div>
        <YearTile year={b} unit={view.unit} swatch={YEAR_B} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">By type</div>
          <ul className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <li key={r.type} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 py-2 sm:grid-cols-[7.5rem_1fr_10rem]">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${TYPE_DOT[r.type] ?? TYPE_DOT.CH}`} aria-hidden />
                  {r.label}
                </div>
                <div className="space-y-1">
                  <Bar year={a.year} value={r.a} max={max} color={YEAR_A} />
                  <Bar year={b.year} value={r.b} max={max} color={YEAR_B} />
                </div>
                <div className="sm:text-right">
                  <ChangePill direction={r.direction} text={r.change} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.footnote && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-neutral-500">
          <Info size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{view.footnote}</span>
        </p>
      )}
    </div>
  );
}
