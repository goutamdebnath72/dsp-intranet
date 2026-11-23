// src/tools/pf/PfPage.tsx
//
// THE PROVIDENT FUND PAGE: one page, two tabs: "PF maturity" (the probable PF on the retirement day, PfForm) and "PF loan EMI" (the refundable PF loan, PfLoanForm). I keep both tabs in memory while the page is open, so what was typed
// in one is still there when the other has been looked at.
"use client";

import React, { useId, useState } from "react";
import { PfForm } from "./PfForm";
import { PfLoanForm } from "./PfLoanForm";
import type { YMD } from "./pfLoan";

export type PfTab = "maturity" | "loan";
const TABS: Array<{ id: PfTab; label: string }> = [{ id: "maturity", label: "PF maturity" }, { id: "loan", label: "PF loan EMI" }];

/** A line typed in the search bar that is about the loan (emi, loan, instalment, repayment) opens the page on the loan tab; anything else opens the maturity tab. */
export const startTabFor = (query: string | undefined): PfTab => (/\b(?:loans?|emis?|instal+ments?|repay\w*)\b/i.test(query ?? "") ? "loan" : "maturity");

export function PfPage({ start = "maturity", today }: { start?: PfTab; today?: YMD }) {
  const [tab, setTab] = useState<PfTab>(start);
  const uid = useId();
  return (
    <div data-pf-page>
      <div role="tablist" aria-label="Provident fund calculators" className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${tab === t.id ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-panel-maturity`} aria-labelledby={`${uid}-tab-maturity`} hidden={tab !== "maturity"}><PfForm /></div>
      <div role="tabpanel" id={`${uid}-panel-loan`} aria-labelledby={`${uid}-tab-loan`} hidden={tab !== "loan"}><PfLoanForm today={today} /></div>
    </div>
  );
}
