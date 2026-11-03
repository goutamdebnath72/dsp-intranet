"use client";

// src/components/facility/NonExecutive.tsx
//
// THE TWO SMALL PARTS of "authorising a NON-EXECUTIVE", one for every tool (owner, 2 Nov 2026): the red question with a tick and a cross, and the amber chip that marks him in the list of authorised people.
// The HOD can give a tool to a non-executive, but only after this confirmation; the server refuses it without (src/lib/facility/authority.ts).

import React from "react";
import { Check, X } from "lucide-react";

export function NonExecutiveAsk({ name, ticket, busy, onYes, onNo }: { name: string; ticket: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div role="alert" data-nonexec-ask="true" className="mt-2 w-full space-y-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
      <p className="text-sm font-bold text-rose-800">Non-executive: {name} ({ticket}).</p>
      <p className="text-sm text-rose-700">Are you sure you want to authorise a non-executive?</p>
      <div className="flex gap-2">
        <button type="button" data-nonexec-yes="true" disabled={busy} onClick={onYes} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" />Yes, authorise</button>
        <button type="button" data-nonexec-no="true" disabled={busy} onClick={onNo} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" />No</button>
      </div>
    </div>
  );
}

/** Marks a non-executive in the list of authorised people. */
export function NonExecutiveChip() {
  return <span data-nonexec-chip="true" className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Non-executive</span>;
}

/** The look of the row of a non-executive in a list (amber instead of white). */
export const NONEXEC_ROW = "border-amber-200 bg-amber-50/80";
