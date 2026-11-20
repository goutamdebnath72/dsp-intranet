// src/tools/pf/PfLoanForm.tsx
//
// THE REFUNDABLE PF LOAN EMI FORM of DSP. Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The rules and the sums are in the pure file beside it (pfLoan.ts):
// the loan's interest is always 1 point more than the PF deposit's, the period is at most 10 years and never beyond the service left, and the interest is on the balance still owed, month by month.
"use client";

import React, { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { parseDate } from "./pf";
import { PF_LOAN, loanRatePct, pfLoanEmi, tenureLimit, type PfLoanResult, type YMD } from "./pfLoan";
import { num, rupees, isProblem } from "@/lib/tools/money";
import { Field, TextInput, Stat, SplitBar, Problem } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";

const yearsMonths = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ") || "0 months";
};

export type LoanView = "year" | "month";
const VIEWS: Array<{ id: LoanView; label: string }> = [{ id: "year", label: "Year-wise" }, { id: "month", label: "Month-wise" }];

/**
 * THE REPAYMENT TABLE, in two views of the same loan: YEAR-WISE (for each year the total paid, the principal, the interest and the balance at its end) and MONTH-WISE (from the first month to the last: each month's
 * instalment, and what part of it is principal and what part interest, and the balance after it). Every row is shown (the month-wise view scrolls inside its box, its header stays in sight).
 */
export function LoanTable({ res, initialView = "year" }: { res: PfLoanResult; initialView?: LoanView }) {
  const [view, setView] = useState<LoanView>(initialView);
  const head = view === "year" ? ["Year", "Total paid", "Principal paid", "Interest paid", "Balance at year end"] : ["Month", "EMI", "Principal", "Interest", "Balance"];
  const rows = view === "year"
    ? res.yearly.map((y) => [String(y.year), rupees(y.principal + y.interest), rupees(y.principal), rupees(y.interest), rupees(y.closing)])
    : res.schedule.map((r) => [String(r.month), rupees(r.principal + r.interest), rupees(r.principal), rupees(r.interest), rupees(r.closing)]);
  return (
    <div data-loan-table={view} className="mt-3">
      <div role="group" aria-label="View of the repayment table" className="mb-2 inline-flex rounded-full border border-slate-200 bg-white/80 p-0.5 shadow-sm">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`rounded-full px-3.5 py-1 text-xs font-bold transition-colors ${view === v.id ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow" : "text-slate-600 hover:text-slate-900"}`}>{v.label}</button>
        ))}
      </div>
      <div className={`overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${view === "month" ? "max-h-80" : ""}`}>
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>{head.map((h) => <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className={`px-2.5 py-1 ${j === 0 ? "font-medium text-slate-800" : "text-slate-700"}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{view === "year" ? `${res.yearly.length} year${res.yearly.length === 1 ? "" : "s"}` : `${res.schedule.length} months, from the first instalment to the last`}; each instalment is the principal plus the interest of that month.</p>
    </div>
  );
}

/** today in India as day, month, year (the service left is counted from the current month) */
export const todayIndia = (): YMD => { const d = DateTime.now().setZone("Asia/Kolkata"); return { day: d.day, month: d.month, year: d.year }; };

export function PfLoanForm({ today }: { today?: YMD }) {
  const now = useMemo(() => today ?? todayIndia(), [today]);
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState(String(PF_LOAN.defaultDepositPct));
  const [retire, setRetire] = useState("");
  const [period, setPeriod] = useState("");
  const [unit, setUnit] = useState<"years" | "months">("years");
  const rd = parseDate(retire);
  const dep = num(deposit);
  const loanPct = Number.isFinite(dep) && dep >= 0 && dep <= 30 ? loanRatePct(dep) : null;
  const months = unit === "years" ? Math.round(num(period) * 12) : num(period);
  const limit = useMemo(() => tenureLimit(rd ? { day: rd.day, month: rd.month, year: rd.year } : null, now), [rd, now]);
  const res = useMemo(() => pfLoanEmi({ principal: num(amount), depositPct: dep, months, retire: rd ? { day: rd.day, month: rd.month, year: rd.year } : null, today: now }), [amount, dep, months, rd, now]);
  const ready = amount.trim() !== "" && period.trim() !== "" && retire.trim() !== "";
  return (
    <div data-pf-loan>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
        For the <strong>refundable</strong> PF loan of DSP. Its interest is always <strong>1% more than the interest your PF deposit earns</strong>, the period is <strong>at most 10 years</strong> and not beyond your service left, and the interest is worked on the balance still owed, month by month.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="pfl-amount" label="Loan amount" hint="How much you may borrow is decided by the PF rules, not checked here."><TextInput id="pfl-amount" value={amount} onChange={setAmount} placeholder="e.g. 5,00,000" suffix="₹" /></Field>
        <Field id="pfl-deposit" label="Interest the PF deposit earns a year" hint="The rate on your PF page (8.25% now); it is declared each year."><TextInput id="pfl-deposit" value={deposit} onChange={setDeposit} suffix="%" /></Field>
        <Field id="pfl-retire" label="Date of retirement" hint="The loan has to be paid back before you retire."><TextInput id="pfl-retire" value={retire} onChange={setRetire} placeholder="e.g. 30/03/2032" suffix="DD/MM/YYYY" /></Field>
        <Field id="pfl-period" label="Period of the loan" hint={limit && !isProblem(limit) ? `Longest for you: ${yearsMonths(limit.maxMonths)} (${limit.bound === "service" ? `your ${limit.monthsLeft} months of service left` : "the 10 years of the rule"}).` : "At most 10 years."}>
          <div className="flex gap-2">
            <div className="flex-1"><TextInput id="pfl-period" value={period} onChange={setPeriod} placeholder={unit === "years" ? "e.g. 5" : "e.g. 60"} /></div>
            <ToolSelect className="w-36 shrink-0" ariaLabel="Period unit" value={unit} onChange={(id) => { const u = id as "years" | "months"; if (u !== unit) { const n = num(period); if (Number.isFinite(n) && period.trim() !== "") setPeriod(String(u === "months" ? Math.round(n * 12) : +(n / 12).toFixed(2))); } setUnit(u); }} options={[{ id: "years", label: "Years" }, { id: "months", label: "Months" }]} />
          </div>
        </Field>
      </div>
      <div data-pf-loan-rate className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-[13px] text-emerald-900">
        {loanPct === null ? "Enter the deposit interest to see the loan's interest." : <>Interest on the loan: <strong>{loanPct}% a year</strong> = the deposit&apos;s {dep}% + 1%.</>}
      </div>
      <div className="mt-4">
        {!ready ? <p className="text-[13px] text-slate-500">Enter the loan amount, your retirement date and the period to see the monthly instalment.</p>
          : retire.trim() !== "" && !rd ? <Problem text="Type the retirement date as day/month/year, for example 30/03/2032." />
          : isProblem(res) ? <Problem text={res.error} /> : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Stat label="Monthly EMI" value={rupees(res.emi)} big tone="emerald" />
                <Stat label="Total interest" value={rupees(res.totalInterest)} tone="amber" />
                <Stat label="Total payment" value={rupees(res.totalPayment)} />
              </div>
              <SplitBar aLabel="Principal" a={num(amount)} bLabel="Interest" b={res.totalInterest} />
              <p className="text-xs text-slate-600">{yearsMonths(months)} · {months} instalments at {res.loanPct}% · interest is {res.interestSharePct.toFixed(1)}% of everything you pay.</p>
              <LoanTable res={res} />
            </div>
          )}
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600" data-pf-loan-notes>
        <li>The three rules used: the loan&apos;s interest is the PF deposit&apos;s interest + 1%; the period is at most 10 years and at most the service you have left; the interest is on the balance still owed, month by month, in equal monthly instalments.</li>
        <li>A <strong>non-refundable</strong> (NRL) loan is not paid back, so it has no instalment: your PF page shows it as &ldquo;Less N.R.Loan&rdquo;. This calculator is for the refundable loan only.</li>
        <li>The figures are an estimate to plan with; the PF office&apos;s own sanction is the one that counts. What you type here is not saved or sent anywhere.</li>
      </ul>
    </div>
  );
}
