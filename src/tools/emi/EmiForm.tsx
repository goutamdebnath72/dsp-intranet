// src/tools/emi/EmiForm.tsx
//
// THE LOAN EMI FORM. Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The sums are in the pure file beside it; this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { emiCalc, LOAN_PRESETS, type EmiMethod } from "./emi";
import { num, rupees, isProblem } from "@/lib/tools/money";
import { Field, TextInput, Stat, SplitBar, Problem, RowsTable } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";

const yearsMonths = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
};

/** a table that shows its first rows and, on request, all of them */

export function EmiForm() {
  const [preset, setPreset] = useState(LOAN_PRESETS[0].id);
  const p = LOAN_PRESETS.find((x) => x.id === preset) ?? LOAN_PRESETS[0];
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(String(LOAN_PRESETS[0].rate));
  const [period, setPeriod] = useState(String(LOAN_PRESETS[0].months / 12));
  const [unit, setUnit] = useState<"years" | "months">("years");
  const [method, setMethod] = useState<EmiMethod>(LOAN_PRESETS[0].method);
  const choose = (id: string) => {
    const x = LOAN_PRESETS.find((y) => y.id === id)!;
    setPreset(id);
    setRate(String(x.rate));
    setMethod(x.method);
    if (unit === "years") setPeriod(String(x.months / 12)); else setPeriod(String(x.months));
  };
  const months = unit === "years" ? Math.round(num(period) * 12) : num(period);
  const res = useMemo(() => emiCalc({ principal: num(amount), annualRatePct: num(rate), months, method }), [amount, rate, months, method]);
  const touched = amount.trim() !== "";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="emi-kind" label="Kind of loan" hint={p.hint}>
          <ToolSelect id="emi-kind" ariaLabel="Kind of loan" value={preset} onChange={choose} options={LOAN_PRESETS.map((x) => ({ id: x.id, label: x.label }))} />
        </Field>
        <Field id="emi-amount" label="Loan amount"><TextInput id="emi-amount" value={amount} onChange={setAmount} placeholder="e.g. 10,00,000" suffix="₹" /></Field>
        <Field id="emi-rate" label="Interest rate a year" hint="Use the rate of your loan."><TextInput id="emi-rate" value={rate} onChange={setRate} suffix="%" /></Field>
        <Field id="emi-period" label="Period">
          <div className="flex gap-2">
            <div className="flex-1"><TextInput id="emi-period" value={period} onChange={setPeriod} /></div>
            <ToolSelect className="w-36 shrink-0" ariaLabel="Period unit" value={unit} onChange={(id) => { const u = id as "years" | "months"; if (u !== unit) { const n = num(period); if (Number.isFinite(n)) setPeriod(String(u === "months" ? Math.round(n * 12) : +(n / 12).toFixed(2))); } setUnit(u); }} options={[{ id: "years", label: "years" }, { id: "months", label: "months" }]} />
          </div>
        </Field>
        <Field id="emi-method" label="How interest is charged" hint={method === "reducing" ? "On the balance still owed: the usual way." : "On the whole amount for the whole period: costs more."}>
          <ToolSelect id="emi-method" ariaLabel="How interest is charged" value={method} onChange={(id) => setMethod(id as EmiMethod)} options={[{ id: "reducing", label: "Reducing balance" }, { id: "flat", label: "Flat rate" }]} />
        </Field>
      </div>
      <div className="mt-4">
        {!touched ? <p className="text-[13px] text-slate-500">Enter the loan amount to see the monthly instalment.</p> : isProblem(res) ? <Problem text={res.error} /> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Monthly EMI" value={rupees(res.emi)} big tone="sky" />
              <Stat label="Total interest" value={rupees(res.totalInterest)} tone="amber" />
              <Stat label="Total payment" value={rupees(res.totalPayment)} />
            </div>
            <SplitBar aLabel="Principal" a={num(amount)} bLabel="Interest" b={res.totalInterest} />
            <p className="text-xs text-slate-600">{yearsMonths(months)} · {months} instalments · interest is {res.interestSharePct.toFixed(1)}% of everything you pay.</p>
            <RowsTable head={["Year", "Principal paid", "Interest paid", "Balance at year end"]} rows={res.yearly.map((y) => [String(y.year), rupees(y.principal), rupees(y.interest), rupees(y.closing)])} label="Show every year" />
            <RowsTable head={["Month", "Opening balance", "Interest", "Principal", "Closing balance"]} rows={res.schedule.map((r) => [String(r.month), rupees(r.opening), rupees(r.interest), rupees(r.principal), rupees(r.closing)])} firstN={0} label="Show the month-by-month schedule" />
          </div>
        )}
      </div>
    </div>
  );
}
