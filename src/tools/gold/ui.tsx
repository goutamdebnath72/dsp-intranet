// src/tools/gold/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Gold and silver in India). The card, its source and its self-checks stay in src/components/tools/live and src/lib/live.
// What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Coins } from "lucide-react";
import { GoldCard } from "@/components/tools/live/GoldCard";
import { type TopicUi } from "@/tools/uiTypes";

export const goldUi: TopicUi = {
  id: "gold",
  live: { title: "Gold and silver in India", subtitle: "IBJA rates, with the trend", tone: "amber", icon: <Coins size={20} />, card: () => <GoldCard /> },
};
