// src/tools/bh/topic.ts
//
// What the search line needs to know about this topic (pure, no React): the words that ask for the Bharat (BH) series guide, and a typed BH number (26 BH 1234 AA) read as you type.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. I list it once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { looksLikeBh } from "./bh";

export const bhTopic = defineTopic({
  id: "bh",
  intent: { title: "BH series number plate", about: "The Bharat (BH) series all-India number plate: how it is built, who is eligible, how to apply.", words: ["bh", "bharat", "series", "plate", "number", "registration", "vehicle", "transfer", "state", "eligible", "eligibility", "apply"] },
  form: {
    rank: 100,
    nouns: ["bh", "bharat", "series", "plate", "plates", "number", "numbers", "no", "registration", "mark", "vehicle", "vehicles", "car", "cars", "bike", "two", "wheeler", "rule", "rules", "eligibility", "eligible", "tax", "road", "procedure", "apply", "application", "process", "documents", "guide", "meaning", "explained", "reader", "read", "decode", "india", "all", "state", "states", "valid", "cost", "fee", "fees", "full", "chart", "and", "new", "in", "on", "across", "petrol", "diesel", "electric"],
    // Matches "bh series", "bharat series number plate", "bh series road tax"; I keep a word like bharat or bh on its own as an ordinary search.
    wants: (c) => c.has(["bh", "bharat"]) && c.has(["series", "plate", "plates", "registration", "mark"]) && c.only(),
  },
  hits: [{ rank: 30, detect: (q) => (looksLikeBh(q) ? { kind: "bh" as const, text: q.toUpperCase() } : null) }],
  samples: [
    { q: "bh series", note: "opens the Bharat (BH) series guide: what the all-India number plate is, how the mark is built, who is eligible (with a check), how to apply for a new or an existing vehicle, and the road tax with an estimate" },
    { q: "26 BH 1234 AA", note: "a BH-series number is read as you type: the year, BH, the random four digits and the letters, each explained", instant: true },
  ],
});
