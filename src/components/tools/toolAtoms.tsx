// src/components/tools/toolAtoms.tsx
//
// The small pieces the calculator forms share: the privacy and approximation notice, a labelled field, a stat card, a bar of two parts. Plain, accessible, no state of their own.
"use client";

import React, { useState } from "react";
import { Lock, Info, Copy, Check } from "lucide-react";

/** Said on every calculator: nothing typed is kept, and the result is an approximation. */
export function ToolNotice({ rates }: { rates?: boolean | string }) {
  return (
    <div className="mt-4 flex flex-col gap-1.5 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50/70 px-3.5 py-2.5 text-xs leading-snug text-emerald-900 shadow-sm sm:flex-row sm:items-center sm:gap-5">
      <span className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Lock size={12} /></span>
        <span>Nothing you type here is saved anywhere. It stays in this window{rates ? ` (${typeof rates === "string" ? rates : "only the public exchange-rate table is downloaded"})` : ""}.</span>
      </span>
      <span className="flex items-center gap-2 text-emerald-800">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white"><Info size={12} /></span>
        <span>Results are approximations: please double-check them before you rely on them.</span>
      </span>
    </div>
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] leading-snug text-slate-500">{hint}</span>}
    </div>
  );
}

/** the box of a typed value: the management windows' input (rounded, inner shadow, a coloured focus ring) */
export const inputCls = "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100";

export function TextInput({ id, value, onChange, placeholder, suffix }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} ${suffix ? "pr-14" : ""}`} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{suffix}</span>}
    </div>
  );
}

export function Stat({ label, value, big, tone = "slate" }: { label: string; value: string; big?: boolean; tone?: "slate" | "sky" | "amber" | "emerald" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    sky: "border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 text-sky-900",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900",
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${tones[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className={`${big ? "text-2xl" : "text-base"} mt-0.5 break-words font-extrabold leading-tight`}>{value}</div>
    </div>
  );
}

/** A bar of two parts (principal and interest): the shares are drawn as widths, and grow into place. */
export function SplitBar({ aLabel, a, bLabel, b }: { aLabel: string; a: number; bLabel: string; b: number }) {
  const total = a + b;
  const pa = total > 0 ? (a / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-200 shadow-inner" role="img" aria-label={`${aLabel} ${pa.toFixed(0)} percent, ${bLabel} ${(100 - pa).toFixed(0)} percent`}>
        <div className="bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-700 ease-out" style={{ width: `${pa}%` }} />
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 transition-[width] duration-700 ease-out" style={{ width: `${100 - pa}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />{aLabel} {pa.toFixed(0)}%</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />{bLabel} {(100 - pa).toFixed(0)}%</span>
      </div>
    </div>
  );
}

/** A shown problem with the inputs: calm, not an alarm. */
export function Problem({ text }: { text: string }) {
  return <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-2.5 text-[13px] text-amber-900"><Info size={15} className="mt-0.5 shrink-0" />{text}</p>;
}

/** A small copy-to-clipboard button for a result. */
export function CopyButton({ text, dark }: { text: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy the result"
      title={done ? "Copied" : "Copy"}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard unavailable */ }
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition active:scale-90 ${dark ? "border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}
    >
      {done ? <Check size={15} className={dark ? "text-emerald-300" : "text-emerald-600"} /> : <Copy size={15} />}
    </button>
  );
}

export function RowsTable({ head, rows, firstN = 6, label }: { head: string[]; rows: string[][]; firstN?: number; label: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, firstN);
  return (
    <div className="mt-3">
      {shown.length > 0 && <div className={`overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${all ? "max-h-72" : ""}`}>
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>{head.map((h) => <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className={`px-2.5 py-1 ${j === 0 ? "font-medium text-slate-800" : "text-slate-700"}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>}
      {rows.length > firstN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 text-xs font-semibold text-sky-700 hover:underline">
          {all ? "Show fewer rows" : `${label} (${rows.length} rows)`}
        </button>
      )}
    </div>
  );
}
