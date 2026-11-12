// src/components/tools/ToolForms.tsx
//
// THE CALCULATOR FORMS OF THE SEARCH BAR: loan EMI, PF maturity, gratuity, leave encashment, dates, converter. Each form keeps what is typed in the browser's memory only (React state):
// nothing is stored, logged or sent. The sums are in src/lib/tools (pure and tested); these components only collect the inputs and show the results.
"use client";

import React, { useMemo, useState } from "react";
import {
  emiCalc, pfMaturity, gratuityCalc, encashmentCalc, num, rupees, isProblem, LOAN_PRESETS, PF_DEFAULTS, GRATUITY_DEFAULTS, ENCASHMENT_DEFAULTS, RATE_DEFAULTS_AS_OF,
  type EmiMethod,
} from "@/lib/tools/finance";
import { answerDateQuestion, retirementDate, parseDate, fmtDate, ymd, ZONE } from "@/lib/tools/dateCalc";
import { UNITS, TEMPERATURES, convertWords, type UnitKind } from "@/lib/tools/units";
import { CURRENCIES, convertCurrency, currencyOf, type Rates } from "@/lib/tools/currency";
import { formatNumber } from "@/lib/tools/expression";
import { DateTime } from "luxon";
import { Field, TextInput, Stat, SplitBar, Problem, inputCls } from "./toolAtoms";
import { ToolSelect } from "./toolKit";

const yearsMonths = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
};

/** a table that shows its first rows and, on request, all of them */
function RowsTable({ head, rows, firstN = 6, label }: { head: string[]; rows: string[][]; firstN?: number; label: string }) {
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

/* ------------------------------- EMI ------------------------------- */

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

/* ------------------------------- PF maturity ------------------------------- */

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

/* ------------------------------- gratuity ------------------------------- */

export function GratuityForm() {
  const [pay, setPay] = useState("");
  const [years, setYears] = useState("");
  const [months, setMonths] = useState("0");
  const [act, setAct] = useState(true);
  const [ceiling, setCeiling] = useState(String(GRATUITY_DEFAULTS.ceiling));
  const [dd, setDd] = useState(false);
  const res = useMemo(() => gratuityCalc({ lastDrawn: num(pay), years: num(years), months: num(months), actCovered: act, ceiling: num(ceiling), deathOrDisability: dd }), [pay, years, months, act, ceiling, dd]);
  const touched = pay.trim() !== "" && years.trim() !== "";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="gr-pay" label="Last drawn basic pay + DA a month"><TextInput id="gr-pay" value={pay} onChange={setPay} placeholder="e.g. 1,00,000" suffix="₹" /></Field>
        <Field id="gr-years" label="Service: whole years"><TextInput id="gr-years" value={years} onChange={setYears} placeholder="e.g. 32" suffix="years" /></Field>
        <Field id="gr-months" label="and extra months" hint="Six months or more count as another year."><TextInput id="gr-months" value={months} onChange={setMonths} suffix="months" /></Field>
        <Field id="gr-ceiling" label="Upper limit of gratuity" hint="Change it if the limit applicable to you is different."><TextInput id="gr-ceiling" value={ceiling} onChange={setCeiling} suffix="₹" /></Field>
        <Field id="gr-act" label="Covered by the Payment of Gratuity Act?" hint={act ? "15 days' pay = pay × 15 ÷ 26 for each year." : "Not covered: pay × 15 ÷ 30 for each year."}>
          <ToolSelect id="gr-act" ariaLabel="Covered by the Payment of Gratuity Act" value={act ? "yes" : "no"} onChange={(id) => setAct(id === "yes")} options={[{ id: "yes", label: "Yes (÷ 26)" }, { id: "no", label: "No (÷ 30)" }]} />
        </Field>
        <label className="mt-5 flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={dd} onChange={(e) => setDd(e.target.checked)} className="h-4 w-4" /> Leaving by death or disability</label>
      </div>
      <div className="mt-4">
        {!touched ? <p className="text-[13px] text-slate-500">Enter the last pay and the years of service to see the gratuity.</p> : isProblem(res) ? <Problem text={res.error} /> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Gratuity" value={rupees(res.amount)} big tone="emerald" />
              <Stat label="Years counted" value={String(res.completedYears)} />
              <Stat label="Per year of service" value={rupees(res.perYear)} />
            </div>
            <p className="text-[13px] text-slate-700">{rupees(num(pay))} × 15 ÷ {act ? 26 : 30} × {res.completedYears} years = {rupees(res.uncapped)}{res.capped ? `; the upper limit of ${rupees(num(ceiling))} is applied` : ""}.</p>
            {res.message && <Problem text={res.message} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- leave encashment ------------------------------- */

export function EncashmentForm() {
  const [basic, setBasic] = useState("");
  const [da, setDa] = useState("");
  const [days, setDays] = useState("");
  const [maxDays, setMaxDays] = useState(String(ENCASHMENT_DEFAULTS.maxDays));
  const [div, setDiv] = useState(String(ENCASHMENT_DEFAULTS.divisor));
  const res = useMemo(() => encashmentCalc({ basic: num(basic), da: num(da || "0"), days: num(days), maxDays: num(maxDays), divisor: num(div) }), [basic, da, days, maxDays, div]);
  const touched = basic.trim() !== "" && days.trim() !== "";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="le-basic" label="Basic pay a month"><TextInput id="le-basic" value={basic} onChange={setBasic} placeholder="e.g. 80,000" suffix="₹" /></Field>
        <Field id="le-da" label="DA a month"><TextInput id="le-da" value={da} onChange={setDa} placeholder="0" suffix="₹" /></Field>
        <Field id="le-days" label="Days of leave to encash"><TextInput id="le-days" value={days} onChange={setDays} placeholder="e.g. 120" suffix="days" /></Field>
        <Field id="le-max" label="Most days that can be encashed" hint="Change it to the limit that applies to you."><TextInput id="le-max" value={maxDays} onChange={setMaxDays} suffix="days" /></Field>
        <Field id="le-div" label="A month's pay is divided by" hint="30 days by the usual rule."><TextInput id="le-div" value={div} onChange={setDiv} suffix="days" /></Field>
      </div>
      <div className="mt-4">
        {!touched ? <p className="text-[13px] text-slate-500">Enter the pay and the days of leave to see the amount.</p> : isProblem(res) ? <Problem text={res.error} /> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Leave encashment" value={rupees(res.amount)} big tone="emerald" />
              <Stat label="Pay for one day" value={rupees(res.perDay)} />
              <Stat label="Days paid" value={String(res.daysPaid)} />
            </div>
            {res.capped && <Problem text={`Only ${res.daysPaid} days can be encashed: the days above that limit are not paid.`} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- dates ------------------------------- */

type DateMode = "between" | "add" | "age" | "retire";
const isoToday = () => DateTime.now().setZone(ZONE).toISODate()!;

export function DatesForm() {
  const [mode, setMode] = useState<DateMode>("between");
  const [d1, setD1] = useState(isoToday());
  const [d2, setD2] = useState("");
  const [n, setN] = useState("90");
  const [unit, setUnit] = useState("days");
  const [sign, setSign] = useState("+");
  const [retAge, setRetAge] = useState("60");
  const answer = useMemo(() => {
    if (!d1) return null;
    if (mode === "between") return d2 ? answerDateQuestion(`days between ${d1} and ${d2}`) : null;
    if (mode === "add") return Number.isFinite(num(n)) && n.trim() ? answerDateQuestion(`${d1} ${sign} ${Math.round(num(n))} ${unit}`) : null;
    if (mode === "age") return answerDateQuestion(`age ${d1}`);
    return null;
  }, [mode, d1, d2, n, unit, sign]);
  const retire = useMemo(() => {
    if (mode !== "retire" || !d1) return null;
    const dob = parseDate(d1);
    const age = num(retAge);
    if (!dob || !Number.isFinite(age) || age < 18 || age > 80) return null;
    const r = retirementDate(dob, Math.round(age));
    const now = DateTime.now().setZone(ZONE).startOf("day");
    const left = r.retires >= now ? ymd(now, r.retires) : null;
    return { r, left };
  }, [mode, d1, retAge]);
  const tabs: Array<[DateMode, string]> = [["between", "Between two dates"], ["add", "Add or subtract"], ["age", "Age"], ["retire", "Retirement date"]];
  return (
    <div>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={mode === id} type="button" onClick={() => setMode(id)} className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition ${mode === id ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30" : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"}`}>{label}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="dt-1" label={mode === "age" || mode === "retire" ? "Date of birth" : mode === "between" ? "From" : "Starting date"}><input id="dt-1" type="date" value={d1} onChange={(e) => setD1(e.target.value)} className={inputCls} /></Field>
        {mode === "between" && <Field id="dt-2" label="To"><input id="dt-2" type="date" value={d2} onChange={(e) => setD2(e.target.value)} className={inputCls} /></Field>}
        {mode === "add" && (
          <>
            <Field id="dt-sign" label="Add or subtract"><ToolSelect id="dt-sign" ariaLabel="Add or subtract" value={sign} onChange={setSign} options={[{ id: "+", label: "Add" }, { id: "-", label: "Subtract" }]} /></Field>
            <Field id="dt-n" label="How many"><div className="flex gap-2"><div className="flex-1"><TextInput id="dt-n" value={n} onChange={setN} /></div><ToolSelect className="w-36 shrink-0" ariaLabel="Unit" value={unit} onChange={setUnit} options={[{ id: "days", label: "days" }, { id: "weeks", label: "weeks" }, { id: "months", label: "months" }, { id: "years", label: "years" }]} /></div></Field>
          </>
        )}
        {mode === "retire" && <Field id="dt-ra" label="Retirement age" hint="60 unless your rule is different."><TextInput id="dt-ra" value={retAge} onChange={setRetAge} suffix="years" /></Field>}
      </div>
      <div className="mt-4">
        {mode === "retire" ? (
          retire ? (
            <div className="space-y-2">
              <Stat label={`Retirement date (age ${Math.round(num(retAge))})`} value={fmtDate(retire.r.retires)} big tone="sky" />
              <p className="text-[13px] text-slate-700">Completes {Math.round(num(retAge))} on {fmtDate(retire.r.birthday)}.{retire.left ? ` Time left from today: ${retire.left.years} years, ${retire.left.months} months, ${retire.left.days} days.` : " This date has passed."}</p>
              <p className="text-xs text-slate-500">Rule used: the last day of the month in which the birthday falls (the previous month if born on the 1st). Check the rule that applies to you with HR.</p>
            </div>
          ) : <p className="text-[13px] text-slate-500">Enter the date of birth.</p>
        ) : answer ? (
          <div className="space-y-2">
            <Stat label={answer.title} value={answer.headline} big tone="sky" />
            <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">{answer.lines.map((l) => <div key={l.label} className="flex justify-between gap-3 border-b border-slate-100 py-0.5"><dt className="text-slate-500">{l.label}</dt><dd className="text-right font-medium text-slate-800">{l.value}</dd></div>)}</dl>
            {answer.notes.map((t) => <p key={t} className="text-xs text-slate-500">{t}</p>)}
          </div>
        ) : <p className="text-[13px] text-slate-500">Fill in the dates to see the answer.</p>}
      </div>
    </div>
  );
}
