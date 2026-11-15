// src/tools/steel/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the steel card (prices, companies, SAIL and the CPSEs, India and the world). What the search line needs to know is in topic.ts. It is listed once, in
// src/tools/registry.ui.tsx. The card is loaded when it is asked for.
"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Factory } from "lucide-react";
import { type TopicUi } from "@/tools/uiTypes";
import type { SteelTab } from "@/tools/steel/SteelCard";

const SteelCard = dynamic(() => import("@/tools/steel/SteelCard").then((m) => m.SteelCard), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" aria-busy="true" aria-label="Loading the steel card" />,
});

/** "companies|" -> the tab (the part before the bar); anything else is the prices tab */
export function readLang(lang?: string): SteelTab {
  const t = (lang ?? "prices|").split("|")[0];
  return t === "companies" || t === "sail" || t === "india" ? t : "prices";
}

export const steelUi: TopicUi = {
  id: "steel",
  live: {
    title: "Steel: prices, production and companies",
    subtitle: "Retail prices, SAIL, Tata Steel, JSW and Jindal Steel, and India's steel",
    tone: "sky",
    icon: <Factory size={20} />,
    card: (lang) => <SteelCard key={lang ?? "prices|"} initialTab={readLang(lang)} />,
  },
};
