// src/tools/pf/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the probable PF maturity calculator.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const pfTopic = defineTopic({
  id: "pf",
  form: {
    rank: 30,
    nouns: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf"],
    wants: (c) => c.has(["pf", "epf", "provident", "vpf"]) && c.has(["maturity", "corpus", "calculator", "calculate", "calculation", "estimate", "estimator", "estimation"]) && c.only() && !c.has(["loan", "loans"]),
  },
  samples: [
    { q: "pf maturity calculator", note: "your probable provident fund at retirement" },
  ],
});
