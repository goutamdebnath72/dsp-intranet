// src/tools/railway/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (the trains at Durgapur Railway Station; in a second tab those of Asansol Junction that Durgapur does not stop; in a third those that start at Howrah, Sealdah, Santragachi and Kolkata and go over neither; I name the places in the panel title and the tabs below carry the full names). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { TrainFront } from "lucide-react";
import { RailwayTabs } from "@/tools/railway/RailwayTabs";
import { type TopicUi } from "@/tools/uiTypes";
import { isStartCode } from "@/lib/live/kolkataView";

export const railwayUi: TopicUi = {
  id: "railway",
  // the search line decides the tab: "asn" opens Asansol, a Kolkata station's code (hwh, sdah, src, koaa) opens the Kolkata tab on that station, anything else Durgapur
  live: { title: "Trains at Durgapur, Asansol and Kolkata", subtitle: "Express, mail and local timetable: stops at Durgapur, trains to board at Asansol, and trains from Howrah, Sealdah, Santragachi and Kolkata", tone: "rose", icon: <TrainFront size={20} />, card: (lang) => { const code = (lang ?? "").toUpperCase(); const tab = lang === "asn" ? "asn" : isStartCode(code) ? "kol" : "dgr"; return <RailwayTabs key={tab === "kol" ? code : tab} start={tab} startStation={isStartCode(code) ? code : "HWH"} />; }, notice: { estimate: true } },
};
