// src/tools/sports/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Sports headlines). The card, its source and its self-checks stay in src/components/tools/live and src/lib/live.
// What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Trophy } from "lucide-react";
import { SportsCard } from "@/components/tools/live/SportsCard";
import { type TopicUi } from "@/tools/uiTypes";

export const sportsUi: TopicUi = {
  id: "sports",
  live: { title: "Sports headlines", subtitle: "India, and the big world events", tone: "emerald", icon: <Trophy size={20} />, card: () => <SportsCard /> },
};
