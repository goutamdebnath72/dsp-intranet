// src/tools/railway/RailwayTabs.tsx
//
// THE RAILWAY CARD, IN THREE TABS: Durgapur Railway Station (DGR), the trains that stop at Durgapur; Asansol Railway Junction (ASN), the trains a person at Durgapur can only have from Asansol (those that pass
// Durgapur without stopping and those that do not go over it); and the Kolkata stations (HWH, SDAH, SRC, KOAA), the trains that start there and go over neither Durgapur nor Asansol (KolkataPanel.tsx). The Durgapur tab is the card as
// it was (RailwayCard.tsx); the other two ask for their trains only when first opened, and I keep all as they are while another is shown (a tab that has been opened is hidden, not unmounted, so its switches, the station chosen
// and the fare boxes that were opened are kept). Arrow keys move between the tabs.
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { RailwayCard, useClock } from "./RailwayCard";
import { AsansolPanel } from "./AsansolPanel";
import { KolkataPanel } from "./KolkataPanel";
import type { StartCode } from "@/lib/live/kolkataView";

export type RailwayTab = "dgr" | "asn" | "kol";
export const RAILWAY_TABS: ReadonlyArray<{ id: RailwayTab; label: string; short: string }> = [
  { id: "dgr", label: "Durgapur Railway Station (DGR)", short: "Durgapur (DGR)" },
  { id: "asn", label: "Asansol Railway Junction (ASN)", short: "Asansol (ASN)" },
  { id: "kol", label: "Kolkata: Howrah, Sealdah, Santragachi, Kolkata", short: "Kolkata" },
];

/** `startStation` is the Kolkata station the third tab opens on (Howrah unless the search line named another). */
export function RailwayTabs({ start = "dgr", startStation = "HWH" }: { start?: RailwayTab; startStation?: StartCode }) {
  const [tab, setTab] = useState<RailwayTab>(start);
  const [opened, setOpened] = useState<Record<RailwayTab, boolean>>({ dgr: true, asn: start === "asn", kol: start === "kol" });
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
      <div role="tablist" aria-label="Railway station" className="mb-3 flex w-full max-w-full flex-wrap gap-0.5 rounded-full bg-slate-100 p-1 shadow-inner" data-railway-tabs>
        {RAILWAY_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" id={`railway-tab-${t.id}`} aria-selected={on} aria-controls={`railway-panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => go(t.id)} onKeyDown={onKey} className={`relative flex-auto whitespace-nowrap rounded-full px-3 py-1.5 text-center text-xs font-bold transition sm:text-[0.83rem] ${on ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
              {on && <motion.span layoutId="railway-tab-pill" aria-hidden="true" className="absolute inset-0 rounded-full bg-white shadow ring-1 ring-slate-200" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="railway-panel-dgr" aria-labelledby="railway-tab-dgr" hidden={tab !== "dgr"}>{opened.dgr && <RailwayCard />}</div>
      <div role="tabpanel" id="railway-panel-asn" aria-labelledby="railway-tab-asn" hidden={tab !== "asn"}>{opened.asn && <AsansolPanel now={now} />}</div>
      <div role="tabpanel" id="railway-panel-kol" aria-labelledby="railway-tab-kol" hidden={tab !== "kol"}>{opened.kol && <KolkataPanel now={now} start={startStation} />}</div>
    </div>
  );
}
