// src/tools/markets/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the Sensex, Nifty and shares card. The data cards and their sources stay in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const marketsTopic = defineTopic({
  id: "markets",
  live: {
    keys: ["sensex", "nifty", "stock", "stocks", "share", "shares", "bse", "nse", "banknifty", "trending", "sail"],
    extra: ["market", "markets", "index", "indices", "bank", "50", "price", "prices", "trending", "stocks", "gainers", "losers", "movers", "top", "today", "live", "watch", "list", "sensex", "nifty", "share", "sail", "bhav"],
  },
  samples: [
    { q: "sensex nifty", note: "Sensex, Nifty and the biggest movers of a watch list with SAIL (market data, not advice); 'sail share price' and 'trending stocks' also work", instant: true },
  ],
});
