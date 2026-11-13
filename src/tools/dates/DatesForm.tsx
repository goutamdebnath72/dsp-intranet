// src/tools/dates/DatesForm.tsx
//
// THE DATE CALCULATORS (between two dates, add or subtract, age, retirement date). Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The sums are in the pure file beside it; this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { answerDateQuestion, retirementDate, parseDate, fmtDate, ymd, ZONE } from "./dateCalc";
import { num } from "@/lib/tools/money";
import { Field, TextInput, Stat, inputCls } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";

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
