// src/tools/dsphistory/ui.tsx
//
// This is how this topic looks in the panel of the search bar: the DSP story card (the story, who made it, the first products, the heads, SAIL and its units). What the search line needs to know is in topic.ts. It is listed once,
// in src/tools/registry.ui.tsx. The card carries its pictures, so I load it only when it is asked for.
"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Landmark } from "lucide-react";
import { type TopicUi } from "@/tools/uiTypes";
import type { DspHistoryTab } from "@/tools/dsphistory/DspHistoryCard";

const DspHistoryCard = dynamic(() => import("@/tools/dsphistory/DspHistoryCard").then((m) => m.DspHistoryCard), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" aria-busy="true" aria-label="Loading the story of the Durgapur Steel Plant" />,
});

/** "heads|" gives the tab (the part before the bar); anything else is the story tab. */
export function readLang(lang?: string): DspHistoryTab {
  const t = (lang ?? "story|").split("|")[0];
  return t === "makers" || t === "first" || t === "heads" || t === "sail" ? t : "story";
}

export const dspHistoryUi: TopicUi = {
  id: "dsphistory",
  live: {
    title: "Durgapur Steel Plant: its story and its heads",
    subtitle: "The foundation, the British collaboration, the first products, the heads of the plant, and SAIL and its units, with SAIL's photographs",
    tone: "rose",
    notice: false,
    icon: <Landmark size={20} />,
    card: (lang) => <DspHistoryCard key={lang ?? "story|"} initialTab={readLang(lang)} />,
  },
};
