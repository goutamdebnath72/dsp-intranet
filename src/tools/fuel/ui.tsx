// src/tools/fuel/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Petrol, diesel and LPG). The card, its source and its self-checks stay in src/components/tools/live and src/lib/live.
// What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Fuel } from "lucide-react";
import { FuelCard } from "@/components/tools/live/FuelCard";
import { type TopicUi } from "@/tools/uiTypes";

export const fuelUi: TopicUi = {
  id: "fuel",
  live: { title: "Petrol, diesel and LPG", subtitle: "Delhi, Mumbai, Chennai and Kolkata", tone: "rose", icon: <Fuel size={20} />, card: () => <FuelCard /> },
};
