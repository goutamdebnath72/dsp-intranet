// src/components/tools/UtilityServicesPage.tsx
//
// THE PAGE OF ALL THE UTILITY SERVICES (typed "utility services", "utilities", "all utilities"): every helper of the app beside its main search as a card, A to Z, in the look of the list of calculators.
// A card opens its service: a calculator or reader on its page (with a Back arrow to this page), a live card (prices, news, weather, trains, the guides) in place (also with Back). Two filters: calculators & readers,
// information & guides. The cards come from the registry (serviceCards.ts); this file names no topic. Nothing is sent anywhere by it.
"use client";

import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CornerDownLeft, Wrench } from "lucide-react";
import { TONES, ToolShell } from "./toolKit";
import { GROUP_FORMS, GROUP_INFO, buildServiceCards, type ServiceCard, type ServiceGroup } from "./serviceCards";

type Filter = "all" | ServiceGroup;

export function UtilityServicesPage({ onClose, onOpen }: { onClose: () => void; onOpen: (card: ServiceCard) => void }) {
  const cards = useMemo(() => buildServiceCards(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const calm = useReducedMotion();
  const shown = filter === "all" ? cards : cards.filter((c) => c.group === filter);
  const chips: Array<{ id: Filter; label: string; n: number }> = [
    { id: "all", label: "All", n: cards.length },
    { id: GROUP_FORMS, label: GROUP_FORMS, n: cards.filter((c) => c.group === GROUP_FORMS).length },
    { id: GROUP_INFO, label: GROUP_INFO, n: cards.filter((c) => c.group === GROUP_INFO).length },
  ];
  return (
    <ToolShell
      title="Utility Services"
      subtitle={`${cards.length} helpers beside the main search, A to Z. Open one, or type its words in the search bar`}
      tone="emerald"
      icon={<Wrench size={20} />}
      onClose={onClose}
      closeLabel="Close the utility services"
      notice={false}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Show" data-service-filters>
        {chips.map((c) => {
          const on = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              aria-pressed={on}
              data-service-filter={c.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${on ? "border-emerald-600 bg-emerald-600 text-white shadow-sm" : "border-slate-200 bg-white/80 text-slate-600 hover:border-emerald-300 hover:text-emerald-800"}`}
            >
              {c.label}
              <span className={`rounded-full px-1.5 text-[11px] font-extrabold ${on ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{c.n}</span>
            </button>
          );
        })}
        <span className="ml-auto rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-slate-400 ring-1 ring-slate-200" aria-hidden="true">A – Z</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" data-service-grid>
        {shown.map((c, i) => {
          const t = TONES[c.tone];
          return (
            <motion.button
              key={c.id}
              type="button"
              onClick={() => onOpen(c)}
              data-service-card={c.id}
              data-service-kind={c.kind}
              initial={calm ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.03 * i, 0.5), type: "spring", stiffness: 260, damping: 24 }}
              whileHover={calm ? undefined : { y: -2 }}
              whileTap={calm ? undefined : { scale: 0.98 }}
              className="group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/85 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:shadow-md"
            >
              <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 opacity-80 ${t.grad}`} />
              <span className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow [&>svg]:h-[18px] [&>svg]:w-[18px] ${t.grad}`}>{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-snug text-slate-900">{c.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-slate-500">{c.text}</span>
                </span>
                <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </span>
              <span className="mt-auto flex items-center gap-1.5 pt-0.5 text-[11px]">
                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-extrabold uppercase tracking-wide ${t.soft} ${t.text}`}>Type</span>
                <code className="min-w-0 truncate rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700" data-service-type>{c.type}</code>
                <CornerDownLeft size={11} className="shrink-0 text-slate-300" aria-hidden="true" />
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs leading-relaxed text-slate-700" data-service-tip>
        <strong className="text-slate-900">Only the calculators?</strong> Type <code className="rounded-lg border border-emerald-100 bg-white px-1.5 py-0.5 font-semibold">calculators</code> and press Enter. A card&apos;s words work from the search bar too: a gold or fuel price, the weather, a sum or a tyre size answer as you type.
      </div>
    </ToolShell>
  );
}
