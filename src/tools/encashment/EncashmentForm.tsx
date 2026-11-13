// src/tools/encashment/EncashmentForm.tsx
//
// THE LEAVE ENCASHMENT FORM. Keeps what is typed in the browser's memory only (React state): nothing is stored, logged or sent. The sums are in the pure file beside it; this component collects the inputs and shows the results.
"use client";

import React, { useMemo, useState } from "react";
import { encashmentCalc, ENCASHMENT_DEFAULTS } from "./encashment";
import { num, rupees, isProblem } from "@/lib/tools/money";
import { Field, TextInput, Stat, Problem } from "@/components/tools/toolAtoms";

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
