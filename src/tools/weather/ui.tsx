// src/tools/weather/ui.tsx
//
// How this topic looks in the panel of the search bar: the live-data card (Durgapur weather). What the search line needs to know is in topic.ts. I list it once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { CloudSun } from "lucide-react";
import { WeatherCard } from "@/tools/weather/WeatherCard";
import { type TopicUi } from "@/tools/uiTypes";

export const weatherUi: TopicUi = {
  id: "weather",
  live: { title: "Durgapur weather", subtitle: "Now, the next 24 hours and seven days", tone: "sky", icon: <CloudSun size={20} />, card: () => <WeatherCard />, notice: { estimate: true } },
};
