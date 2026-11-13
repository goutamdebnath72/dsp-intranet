// src/tools/pf/PfForm.tsx
//
// THE PROBABLE PF MATURITY FORM. Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The sums are in the pure file beside it; this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { pfMaturity, PF_DEFAULTS } from "./pf";
import { num, rupees, isProblem, RATE_DEFAULTS_AS_OF } from "@/lib/tools/money";
import { Field, TextInput, Stat, Problem, RowsTable } from "@/components/tools/toolAtoms";

export function PfForm() {
  const [age, setAge] = useState("");
  const [retire, setRetire] = useState(String(PF_DEFAULTS.retirementAge));
  const [wage, setWage] = useState("");
  const [inc, setInc] = useState(String(PF_DEFAULTS.incrementPct));
  const [emp, setEmp] = useState(String(PF_DEFAULTS.employeePct));
  const [er, setEr] = useState(String(PF_DEFAULTS.employerPct));
  const [vpf, setVpf] = useState(String(PF_DEFAULTS.vpfPct));
  const [bal, setBal] = useState("0");
  const [rate, setRate] = useState(String(PF_DEFAULTS.interestPct));
  const res = useMemo(() => pfMaturity({ currentAge: num(age), retirementAge: num(retire), monthlyWage: num(wage), incrementPct: num(inc), employeePct: num(emp), employerPct: num(er), vpfPct: num(vpf), currentBalance: num(bal), interestPct: num(rate) }), [age, retire, wage, inc, emp, er, vpf, bal, rate]);
  const touched = age.trim() !== "" && wage.trim() !== "";
  const maxClose = !isProblem(res) ? Math.max(...res.years.map((y) => y.closing)) : 1;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="pf-age" label="Your age today"><TextInput id="pf-age" value={age} onChange={setAge} placeholder="e.g. 35" suffix="years" /></Field>
        <Field id="pf-ret" label="Retirement age"><TextInput id="pf-ret" value={retire} onChange={setRetire} suffix="years" /></Field>
        <Field id="pf-wage" label="Monthly basic pay + DA" hint="The pay your PF is a percentage of."><TextInput id="pf-wage" value={wage} onChange={setWage} placeholder="e.g. 80,000" suffix="₹" /></Field>
        <Field id="pf-bal" label="PF balance today" hint="0 if you do not know."><TextInput id="pf-bal" value={bal} onChange={setBal} suffix="₹" /></Field>
        <Field id="pf-inc" label="Yearly rise in pay" hint="Increments and DA together, on average."><TextInput id="pf-inc" value={inc} onChange={setInc} suffix="%" /></Field>
        <Field id="pf-rate" label="Interest rate a year" hint={`Set to the latest rate declared for PF (the starting figure is as of ${RATE_DEFAULTS_AS_OF}).`}><TextInput id="pf-rate" value={rate} onChange={setRate} suffix="%" /></Field>
        <Field id="pf-emp" label="Your contribution"><TextInput id="pf-emp" value={emp} onChange={setEmp} suffix="%" /></Field>
        <Field id="pf-er" label="Employer's share into PF" hint="Usually 3.67%: the rest of the employer's 12% goes to the pension."><TextInput id="pf-er" value={er} onChange={setEr} suffix="%" /></Field>
        <Field id="pf-vpf" label="Voluntary extra (VPF)"><TextInput id="pf-vpf" value={vpf} onChange={setVpf} suffix="%" /></Field>
      </div>
      <div className="mt-4">
        {!touched ? <p className="text-[13px] text-slate-500">Enter your age and monthly pay to see the probable maturity amount.</p> : isProblem(res) ? <Problem text={res.error} /> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label={`Probable PF at age ${num(retire)}`} value={rupees(res.maturity)} big tone="emerald" />
              <Stat label="Interest earned in all" value={rupees(res.interestTotal)} tone="amber" />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Stat label="Balance today" value={rupees(res.opening)} />
              <Stat label="Your contributions" value={rupees(res.employeeTotal)} />
              <Stat label="Employer's" value={rupees(res.employerTotal)} />
              <Stat label="Voluntary" value={rupees(res.vpfTotal)} />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">PF balance at the end of each year</div>
              <div className="flex h-24 items-end gap-0.5" role="img" aria-label="PF balance by year, growing">
                {res.years.map((y) => <div key={y.year} title={`Age ${y.age}: ${rupees(y.closing)}`} className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${Math.max(3, (y.closing / maxClose) * 100)}%` }} />)}
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] text-slate-500"><span>Age {num(age) + 1}</span><span>Age {num(retire)}</span></div>
            </div>
            <p className="text-xs leading-snug text-slate-600">Method: interest is worked out each month on the balance and added at the end of the year; each month&apos;s contribution is added at the month&apos;s end; pay rises once a year. Real PF may differ with the rate declared each year.</p>
            <RowsTable head={["Year", "Age", "Monthly pay", "Contributed", "Interest", "Balance"]} rows={res.years.map((y) => [String(y.year), String(y.age), rupees(y.monthlyWage), rupees(y.contribution), rupees(y.interest), rupees(y.closing)])} label="Show every year" />
          </div>
        )}
      </div>
    </div>
  );
}
