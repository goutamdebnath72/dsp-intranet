// src/tools/weather/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Durgapur weather). What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { CloudSun } from "lucide-react";
import { WeatherCard } from "@/tools/weather/WeatherCard";
import { type TopicUi } from "@/tools/uiTypes";

export const weatherUi: TopicUi = {
  id: "weather",
  live: { title: "Durgapur weather", subtitle: "Now, the next 24 hours and seven days", tone: "sky", icon: <CloudSun size={20} />, card: () => <WeatherCard /> },
};
