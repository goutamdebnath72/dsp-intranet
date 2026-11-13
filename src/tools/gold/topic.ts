// src/tools/gold/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the gold and silver card ("gold rate today", "22k gold", "silver price"). The data cards and their sources stay in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const goldTopic = defineTopic({
  id: "gold",
  live: {
    keys: ["gold", "silver", "bullion", "24k", "22k", "24", "22", "carat", "karat", "sona", "chandi"],
    extra: ["24k", "22k", "carat", "karat", "gold", "silver", "metal", "metals", "ibja", "trend", "chart"],
  },
  samples: [
    { q: "gold rate today", note: "IBJA rates for 24 carat, 22 carat and silver, with the change and the trend of the last months; 'silver price' or '22k gold' also work", instant: true },
  ],
});
