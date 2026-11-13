// src/tools/flights/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Andal Airport flights). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Plane } from "lucide-react";
import { FlightsCard } from "@/tools/flights/FlightsCard";
import { type TopicUi } from "@/tools/uiTypes";

export const flightsUi: TopicUi = {
  id: "flights",
  live: { title: "Andal Airport flights", subtitle: "To and from Durgapur (RDP)", tone: "violet", icon: <Plane size={20} />, card: () => <FlightsCard /> },
};
