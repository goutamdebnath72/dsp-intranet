// src/tools/ev/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the electric car charging-time estimate.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const evTopic = defineTopic({
  id: "ev",
  form: {
    rank: 110,
    nouns: ["ev", "evs", "electric", "car", "cars", "vehicle", "vehicles", "battery", "batteries", "charging", "charger", "chargers", "charge", "time", "times", "dc", "ac", "fast", "slow", "kwh", "specification", "specifications", "spec", "specs", "range", "and", "how", "long"],
    wants: (c) => c.has(["ev", "evs", "electric"]) && c.has(["charging", "charger", "chargers", "charge", "battery", "batteries"]) && c.only(),
  },
  samples: [
    { q: "ev charging time", note: "battery size, AC and DC chargers, time from 10% to 90%, and what the battery and charger words mean" },
  ],
});
