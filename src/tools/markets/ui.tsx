// src/tools/markets/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Sensex, Nifty and shares). The card, its source and its self-checks stay in src/components/tools/live and src/lib/live.
// What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { MarketsCard } from "@/components/tools/live/MarketsCard";
import { type TopicUi } from "@/tools/uiTypes";

export const marketsUi: TopicUi = {
  id: "markets",
  live: { title: "Sensex, Nifty and shares", subtitle: "Market data, not advice", tone: "emerald", icon: <TrendingUp size={20} />, card: () => <MarketsCard /> },
};
