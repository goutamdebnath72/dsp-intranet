// src/tools/railway/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (the trains at Durgapur Railway Station). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { TrainFront } from "lucide-react";
import { RailwayCard } from "@/tools/railway/RailwayCard";
import { type TopicUi } from "@/tools/uiTypes";

export const railwayUi: TopicUi = {
  id: "railway",
  live: { title: "Durgapur Railway Station", subtitle: "Express and local trains (DGR)", tone: "rose", icon: <TrainFront size={20} />, card: () => <RailwayCard /> },
};
