// src/tools/aicpi/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (AICPI and dearness allowance). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { AicpiCard } from "@/tools/aicpi/AicpiCard";
import { type TopicUi } from "@/tools/uiTypes";

export const aicpiUi: TopicUi = {
  id: "aicpi",
  live: { title: "AICPI and SAIL dearness allowance", subtitle: "The index, and the quarterly DA of SAIL employees from it", tone: "amber", icon: <TrendingUp size={20} />, card: () => <AicpiCard /> },
};
