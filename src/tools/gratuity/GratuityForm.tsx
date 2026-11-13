// src/tools/gratuity/GratuityForm.tsx
//
// THE GRATUITY FORM. Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The sums are in the pure file beside it; this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { gratuityCalc, GRATUITY_DEFAULTS } from "./gratuity";
import { num, rupees, isProblem } from "@/lib/tools/money";
import { Field, TextInput, Stat, Problem } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";

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
