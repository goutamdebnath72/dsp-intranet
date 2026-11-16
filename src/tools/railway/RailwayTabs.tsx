// src/tools/railway/RailwayTabs.tsx
//
// THE RAILWAY CARD, IN TWO TABS: Durgapur Railway Station (DGR), the trains that stop at Durgapur, and Asansol Railway Junction (ASN), the trains a person at Durgapur can only have from Asansol (those that pass
// Durgapur without stopping and those that do not go over it). The Durgapur tab is the card as it was (RailwayCard.tsx); the Asansol tab asks for its trains only when it is first opened (AsansolPanel.tsx), and both
// stay as they are while the other is shown (a tab that has been opened is hidden, not unmounted, so its switches and the fare boxes that were opened are kept). Arrow keys move between the tabs.
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { RailwayCard, useClock } from "./RailwayCard";
import { AsansolPanel } from "./AsansolPanel";

export type RailwayTab = "dgr" | "asn";
export const RAILWAY_TABS: ReadonlyArray<{ id: RailwayTab; label: string; short: string }> = [
  { id: "dgr", label: "Durgapur Railway Station (DGR)", short: "Durgapur (DGR)" },
  { id: "asn", label: "Asansol Railway Junction (ASN)", short: "Asansol (ASN)" },
];

export function RailwayTabs({ start = "dgr" }: { start?: RailwayTab }) {
  const [tab, setTab] = useState<RailwayTab>(start);
  const [opened, setOpened] = useState<Record<RailwayTab, boolean>>({ dgr: true, asn: start === "asn" });
  const now = useClock();
  const go = (id: RailwayTab) => { setTab(id); setOpened((o) => (o[id] ? o : { ...o, [id]: true })); };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = RAILWAY_TABS[(RAILWAY_TABS.findIndex((t) => t.id === tab) + step + RAILWAY_TABS.length) % RAILWAY_TABS.length].id;
    go(next);
    requestAnimationFrame(() => document.getElementById(`railway-tab-${next}`)?.focus());
  };
  return (
    <div>
      <div role="tablist" aria-label="Railway station" className="mb-3 inline-flex max-w-full flex-wrap rounded-full bg-slate-100 p-1 shadow-inner" data-railway-tabs>
        {RAILWAY_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" id={`railway-tab-${t.id}`} aria-selected={on} aria-controls={`railway-panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => go(t.id)} onKeyDown={onKey} className={`relative rounded-full px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${on ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
              {on && <motion.span layoutId="railway-tab-pill" aria-hidden="true" className="absolute inset-0 rounded-full bg-white shadow ring-1 ring-slate-200" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="railway-panel-dgr" aria-labelledby="railway-tab-dgr" hidden={tab !== "dgr"}>{opened.dgr && <RailwayCard />}</div>
      <div role="tabpanel" id="railway-panel-asn" aria-labelledby="railway-tab-asn" hidden={tab !== "asn"}>{opened.asn && <AsansolPanel now={now} />}</div>
    </div>
  );
}
