// src/tools/ev/topic.ts
//
// This is what the search line needs to know about this topic (pure, no React): the words that ask for the electric car charging-time estimate.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const evTopic = defineTopic({
  id: "ev",
  intent: { title: "EV charging time", about: "How long an electric vehicle takes to charge, and what it costs: battery size, AC and DC chargers, 10% to 90%, the West Bengal tariff and the national service-charge ceiling.", words: ["ev", "electric", "vehicle", "car", "battery", "charging", "charger", "charge", "kwh", "fast", "dc", "ac", "range", "specification", "specifications", "specs", "blade", "kw", "motor", "power", "guide"] },
  form: {
    rank: 110,
    nouns: ["ev", "evs", "electric", "car", "cars", "vehicle", "vehicles", "battery", "batteries", "charging", "charger", "chargers", "charge", "time", "times", "dc", "ac", "fast", "slow", "kwh", "specification", "specifications", "spec", "specs", "range", "and", "how", "long", "blade", "guide", "explained"],
    wants: (c) => c.has(["ev", "evs", "electric"]) && c.has(["charging", "charger", "chargers", "charge", "battery", "batteries", "specification", "specifications", "spec", "specs", "blade", "guide", "explained"]) && c.only(),
  },
  samples: [
    { q: "ev charging time", note: "battery size, AC and DC chargers, time and cost from 10% to 90%, and what the battery and charger words mean" },
    { q: "ev specifications", note: "the window's second tab: kWh, kW, bhp and PS, the battery, the Blade battery, AC and DC charging and the socket, in plain words" },
  ],
});
