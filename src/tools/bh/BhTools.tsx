// src/tools/bh/BhTools.tsx
//
// THE TWO LITTLE TOOLS INSIDE THE BH GUIDE: "Am I eligible?" (pick your employer, see the proof you need) and the two-year road tax estimate (invoice price and fuel, see the tax and the working).
// Computed in the browser from src/tools/bh/bh.ts. Nothing typed or picked here is stored or sent.
"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Info, Lock, XCircle } from "lucide-react";
import { BH_BANDS, BH_FUELS, BH_GROUPS, bhTax, type BhFuel } from "./bh";
import { num, rupees } from "@/lib/tools/money";
import { Field, Stat, TextInput } from "@/components/tools/toolAtoms";
import { ToolSelect } from "@/components/tools/toolKit";

export function BhEligibility() {
  const [id, setId] = useState(BH_GROUPS[3].id);
  const g = BH_GROUPS.find((x) => x.id === id) ?? BH_GROUPS[0];
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5">
      <Field id="bh-group" label="Where do you work?">
        <ToolSelect id="bh-group" ariaLabel="Where do you work" tone="emerald" value={id} onChange={setId} options={BH_GROUPS.map((x) => ({ id: x.id, label: x.label }))} />
      </Field>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={g.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={`mt-3 flex items-start gap-3 rounded-2xl border px-3.5 py-3 ${g.eligible ? "border-emerald-300 bg-white" : "border-rose-200 bg-rose-50/70"}`}>
          {g.eligible ? <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={22} className="mt-0.5 shrink-0 text-rose-500" />}
          <div className="min-w-0 text-sm leading-snug text-slate-700">
            <div className="text-base font-extrabold text-slate-900">{g.eligible ? "In the Ministry's list" : "Not in the Ministry's list"}</div>
            <p className="mt-0.5">{g.note}</p>
            {g.eligible && <p className="mt-1.5"><b>Proof to show:</b> {g.proof}, checked by the registering authority.</p>}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function BhTaxEstimate() {
  const [price, setPrice] = useState("8,00,000");
  const [fuel, setFuel] = useState<BhFuel>("petrol");
  const r = useMemo(() => bhTax(num(price), fuel), [price, fuel]);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bh-price" label="Invoice price, without GST" hint="The price on the dealer's invoice before GST, not the on-road price. The figure shown is an example."><TextInput id="bh-price" value={price} onChange={setPrice} suffix="₹" /></Field>
        <Field id="bh-fuel" label="Fuel">
          <ToolSelect id="bh-fuel" ariaLabel="Fuel" tone="emerald" value={fuel} onChange={(v) => setFuel(v as BhFuel)} options={BH_FUELS.map((f) => ({ id: f.id, label: f.label }))} />
        </Field>
      </div>
      {"error" in r ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><Info size={14} className="mt-0.5 shrink-0" />{r.error}</p>
      ) : (
        <div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Stat label="Tax for two years" value={rupees(r.twoYear)} big tone="emerald" />
            <Stat label={`Rate (${BH_BANDS[r.band].label})`} value={`${r.rate}%`} tone="sky" />
            <Stat label="From the 14th year, each year" value={rupees(r.annual)} tone="amber" />
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-600">Paid every two years, the first fourteen years (seven payments) come to <b>{rupees(r.fourteenYears)}</b>, if the rules do not change. This is the road tax only: the registration charges are extra.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-snug text-slate-700">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-snug text-emerald-900"><Lock size={12} className="mt-0.5 shrink-0" />Nothing you type here is saved anywhere. Results are approximations: please double-check them, and the exact amount, on the Parivahan portal or with the RTO. A price of exactly ₹10 lakh or ₹20 lakh is placed in the middle band, as the words of the rule read.</p>
    </div>
  );
}
