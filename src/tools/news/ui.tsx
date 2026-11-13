// src/tools/news/ui.tsx
//
// HOW THIS TOPIC LOOKS IN THE PANEL OF THE SEARCH BAR: the live-data card (Today's top headlines). The card, its source and its self-checks stay in src/components/tools/live and src/lib/live.
// What the search line needs to know is in topic.ts. It is listed once, in src/tools/registry.ui.tsx.
"use client";

import React from "react";
import { Newspaper } from "lucide-react";
import { NewsCard } from "@/components/tools/live/NewsCard";
import { isTab, type NewsTab } from "@/lib/live/news";
import { type TopicUi } from "@/tools/uiTypes";

export const newsUi: TopicUi = {
  id: "news",
  live: { title: "Today's top headlines", subtitle: "Business first, then English, हिन्दी and বাংলা, from the publishers' own feeds", tone: "sky", icon: <Newspaper size={20} />, card: (lang) => <NewsCard key={lang ?? "biz"} start={isTab(lang ?? null) ? (lang as NewsTab) : "biz"} /> },
};
