// src/tools/fuel/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the petrol, diesel and LPG card. The data cards and their sources stay in src/lib/live and src/components/tools/live.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const fuelTopic = defineTopic({
  id: "fuel",
  live: {
    keys: ["petrol", "diesel", "lpg", "fuel", "fuels", "cylinder", "cylinders", "e20", "cng"],
    extra: ["metro", "metros", "city", "cities", "delhi", "mumbai", "chennai", "kolkata", "subsidised", "subsidized", "unsubsidised", "unsubsidized", "domestic", "commercial", "cooking", "gas", "ujjwala", "litre", "liter", "e20", "blend", "kg", "5", "14.2", "19", "47.5", "trend", "chart", "graph", "history", "year"],
  },
  samples: [
    { q: "petrol diesel lpg price", note: "petrol (E20), diesel and every LPG cylinder in Delhi, Mumbai, Chennai and Kolkata, subsidised and unsubsidised, in one table", instant: true },
    { q: "petrol price trend", note: "the same fuel card; under its table, three tabs (petrol, diesel, LPG) chart Kolkata's price over the last year: the price a year ago, the highest, the lowest and today's. Petrol and diesel are PPAC's official price of every day; LPG is the monthly record GoodReturns keeps (ten months)", instant: true },
  ],
});
