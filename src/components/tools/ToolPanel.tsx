// src/components/tools/ToolPanel.tsx
//
// THE TOOLS PANEL OF THE SEARCH BAR. It sits above the search results and shows:
//   - AS YOU TYPE, with no Enter: what a topic answers at once (a sum, a conversion, a date answer, a tyre size, a VIN, a BH number, a gold rate...);
//   - after ENTER: a calculator or reader with a page of its own, or the list of them.
// THIS FILE NAMES NO TOPIC. Every topic (src/tools/<topic>/) says in its ui.tsx how it looks, and the list is src/tools/registry.ui.tsx; what a typed line means is decided by src/lib/tools/detect.ts from the
// topics' own topic.ts. All of it runs in the browser. Nothing typed here is stored or sent; the only thing downloaded is the public exchange-rate table, and only when a topic asks for it.
"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calculator } from "lucide-react";
import { detectTool, type FormKind } from "@/lib/tools/detect";
import { useRates } from "@/tools/converter/useRates";
import { TOPIC_UIS } from "@/tools/registry.ui";
import type { LiveUi, FormUi, RatesState, UiCtx } from "@/tools/uiTypes";
import { ToolShell, type Tone } from "./toolKit";

export type { RatesState };

/** the calculators and readers with a page of their own, in the order of the list; and the live cards, by name */
const FORMS: Array<{ id: FormKind; ui: FormUi }> = TOPIC_UIS.flatMap((t) => (t.form ? [{ id: t.id as FormKind, ui: t.form }] : []));
const FORM_BY_ID = Object.fromEntries(FORMS.map((f) => [f.id, f.ui])) as Record<FormKind, FormUi>;
const LIVE_BY_ID = Object.fromEntries(TOPIC_UIS.flatMap((t) => (t.live ? [[t.id, t.live]] : []))) as Record<string, LiveUi>;
const HIT_UIS = TOPIC_UIS.flatMap((t) => t.hits ?? []);

const TILE: Record<Tone, string> = {
  sky: "bg-gradient-to-br from-sky-500 via-cyan-500 to-indigo-500", amber: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500", emerald: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
  violet: "bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500", rose: "bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500",
};

export function ToolPanel({ query, form, onForm }: { query: string; form: FormKind | "menu" | null; onForm: (f: FormKind | "menu" | null) => void }) {
  const hit = useMemo(() => detectTool(query), [query]);
  const wantsRates = TOPIC_UIS.some((t) => t.needsRates?.(hit, form));
  const { rates, state } = useRates(wantsRates);
  const ctx: UiCtx = { rates, ratesState: state, openForm: onForm };

  // the form opened with Enter
  if (form) {
    if (form === "menu") {
      return (
        <ToolShell title="Calculators" subtitle="Open one, or type a sum, a conversion or a date question: the answer appears as you type" tone="sky" icon={<Calculator size={20} />} onClose={() => onForm(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORMS.map((m, i) => (
              <motion.button
                key={m.id}
                type="button"
                onClick={() => onForm(m.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, type: "spring", stiffness: 260, damping: 24 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:shadow-md"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow ${TILE[m.ui.tone]}`}>{m.ui.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{m.ui.menu.title}</span><span className="block text-xs leading-snug text-slate-500">{m.ui.menu.text}</span></span>
                <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </motion.button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">Type these and see the answer at once:</strong>{" "}
            {["12*45+7", "15% of 2400", "5 km in miles", "1 bhp in kw", "100 usd to inr", "205/55 R16 91V", "days between 1 jan 2026 and 15 mar 2026"].map((x) => <code key={x} className="mr-1 inline-block rounded-lg border border-sky-100 bg-white px-1.5 py-0.5 font-semibold text-sky-800">{x}</code>)}
          </div>
        </ToolShell>
      );
    }
    const f = FORM_BY_ID[form];
    return (
      <ToolShell title={f.title} tone={f.tone} icon={f.icon} onBack={() => onForm("menu")} rates={f.rates}>
        {f.render(ctx)}
      </ToolShell>
    );
  }

  if (!hit) return null;

  // a form or the menu typed but not yet sent: a hint, so the reader knows Enter opens it
  if (hit.kind === "form" || hit.kind === "menu") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white"><Calculator size={16} /></span>
        <span>
          Press <kbd className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-xs font-bold shadow-sm">Enter</kbd> to open the {hit.kind === "menu" ? "calculators" : FORM_BY_ID[hit.form].title.toLowerCase()}.
        </span>
      </motion.div>
    );
  }

  // a live-data card
  if (hit.kind === "live") {
    const m = LIVE_BY_ID[hit.topic];
    return (
      <ToolShell title={m.title} subtitle={m.subtitle} tone={m.tone} icon={m.icon} instant rates="only public figures from the source named below are downloaded; what you typed is not sent">
        {m.card(hit.lang)}
      </ToolShell>
    );
  }

  // the card of the topic that answered
  return <>{HIT_UIS.find((h) => h.kind === hit.kind)?.render(hit, ctx) ?? null}</>;
}
