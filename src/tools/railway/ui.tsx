// src/tools/railway/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (the trains at Durgapur Railway Station, and in a second tab those of Asansol Junction that Durgapur does not stop; the panel title names both stations and the tabs below carry the full names). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { TrainFront } from "lucide-react";
import { RailwayTabs } from "@/tools/railway/RailwayTabs";
import { type TopicUi } from "@/tools/uiTypes";

export const railwayUi: TopicUi = {
  id: "railway",
  live: { title: "Trains at Durgapur and Asansol", subtitle: "Express, mail and local timetable: stops at Durgapur, and trains to board at Asansol", tone: "rose", icon: <TrainFront size={20} />, card: (lang) => <RailwayTabs key={lang === "asn" ? "asn" : "dgr"} start={lang === "asn" ? "asn" : "dgr"} /> },
};
