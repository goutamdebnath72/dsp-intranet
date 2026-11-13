// src/tools/converter/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the unit and currency converter (its tile and page) and the cards for a typed conversion, a currency question and engine power.
// Its logic is in the files beside this one, what the search line needs to know in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { ArrowLeftRight, Zap } from "lucide-react";
import { ConverterCard, DEFAULT_START } from "./ConverterCard";
import { ENGINE_IDS } from "./converterModel";
import { ToolShell } from "@/components/tools/toolKit";
import { onHit, type TopicUi } from "@/tools/uiTypes";

const engineShell = (children: React.ReactNode) => (
  <ToolShell title="Engine power: PS, bhp and kW" subtitle="Appears as you type" tone="amber" icon={<Zap size={20} />} instant>{children}</ToolShell>
);

export const converterUi: TopicUi = {
  id: "converter",
  // the public exchange-rate table is downloaded only for a currency question or the converter's own page
  needsRates: (hit, form) => hit?.kind === "currency" || form === "converter",
  form: {
    title: "Unit and currency converter",
    tone: "sky",
    icon: <ArrowLeftRight size={18} />,
    menu: { title: "Converters", text: "Length, area, energy, power, USD/GBP/EUR…" },
    rates: true,
    render: (c) => <ConverterCard start={DEFAULT_START} rates={c.rates} ratesState={c.ratesState} />,
  },
  hits: [
    onHit("convert", (hit) => {
      const r = hit.result;
      // engine power (bhp, PS, kW) is always shown as all three
      if (r.kind === "convert" && r.category === "power" && ENGINE_IDS.includes(r.fromId) && ENGINE_IDS.includes(r.toId)) {
        return engineShell(<ConverterCard tone="amber" key={`engine|${r.fromId}|${r.value}`} start={{ kind: "engine", from: r.fromId, to: r.toId, value: r.value }} rates={null} ratesState="idle" />);
      }
      if (r.kind === "mismatch") return <ToolShell title="Unit converter" tone="sky" icon={<ArrowLeftRight size={20} />} instant><p className="text-sm text-slate-700">{r.message}</p></ToolShell>;
      // keyed by what was asked, so the card starts afresh when the question changes and keeps the reader's own edits until then
      return (
        <ToolShell title="Unit converter" subtitle="Appears as you type" tone="sky" icon={<ArrowLeftRight size={20} />} instant>
          <ConverterCard key={`${r.category}|${r.fromId}|${r.toId}|${r.value}`} start={{ kind: r.category, from: r.fromId, to: r.toId, value: r.value }} rates={null} ratesState="idle" />
        </ToolShell>
      );
    }),
    onHit("currency", (hit, c) => {
      const req = hit.request;
      return (
        <ToolShell title="Currency converter" subtitle="Reference rates, appears as you type" tone="emerald" icon={<ArrowLeftRight size={20} />} instant rates>
          <ConverterCard tone="emerald" key={`currency|${req.from.code}|${req.to.code}|${req.amount}|${c.rates ? "r" : "w"}`} start={{ kind: "currency", from: req.from.code, to: req.to.code, value: req.amount }} rates={c.rates} ratesState={c.ratesState} />
        </ToolShell>
      );
    }),
    onHit("engine", (hit) => engineShell(<ConverterCard tone="amber" key={`engine|${hit.id}|${hit.value}`} start={{ kind: "engine", from: hit.id, to: hit.id, value: hit.value }} rates={null} ratesState="idle" />)),
  ],
};
