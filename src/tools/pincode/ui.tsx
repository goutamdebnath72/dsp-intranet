// src/tools/pincode/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the Durgapur areas card (PIN codes, DMC wards, assembly seats). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
// The card carries about 120 KB of data, so it is loaded only when it is first drawn (the search bar itself opens at once).
"use client";

import React from "react";
import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { type TopicUi } from "@/tools/uiTypes";
import type { PincodeTab } from "@/tools/pincode/PincodeCard";

const PincodeCard = dynamic(() => import("@/tools/pincode/PincodeCard").then((m) => m.PincodeCard), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" aria-busy="true" aria-label="Loading the Durgapur areas" />,
});

/** "wards|ward 22" -> the tab and what to look for */
export function readLang(lang?: string): { tab: PincodeTab; query: string } {
  const [t, ...rest] = (lang ?? "pins|").split("|");
  return { tab: t === "wards" || t === "seats" || t === "police" ? t : "pins", query: rest.join("|") };
}

export const pincodeUi: TopicUi = {
  id: "pincode",
  live: {
    title: "PIN codes, Wards, Assembly seats and Police stations of Durgapur",
    subtitle: "Through the lens of the Steel Plant: the PIN codes, the 43 DMC wards, the two assembly seats and the four police stations",
    tone: "violet",
    icon: <MapPinned size={20} />,
    card: (lang) => { const r = readLang(lang); return <PincodeCard key={lang ?? "pins|"} initialTab={r.tab} initialQuery={r.query} />; },
  },
};
