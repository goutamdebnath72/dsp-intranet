// src/tools/gratuity/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the gratuity calculator.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const gratuityTopic = defineTopic({
  id: "gratuity",
  form: {
    rank: 40,
    nouns: ["gratuity"],
    wants: (c) => c.has(["gratuity"]) && c.calcWord && c.only(),
  },
  samples: [
    { q: "gratuity calculator", note: "from last pay and years of service" },
  ],
});
