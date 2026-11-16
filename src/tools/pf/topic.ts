// src/tools/pf/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the probable PF maturity calculator.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const pfTopic = defineTopic({
  id: "pf",
  intent: { title: "Provident fund (PF) at retirement", about: "Your probable provident fund (PF) corpus on the retirement day, worked from the DSP PF page: the monthly contributions, VPF and the interest.", words: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf", "retirement", "retire", "superannuation", "pension", "accumulate", "savings"] },
  form: {
    rank: 30,
    nouns: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf"],
    wants: (c) => c.has(["pf", "epf", "provident", "vpf"]) && c.has(["maturity", "corpus", "calculator", "calculate", "calculation", "estimate", "estimator", "estimation"]) && c.only() && !c.has(["loan", "loans"]),
  },
  samples: [
    { q: "pf maturity calculator", note: "your probable provident fund on the retirement day, worked from the figures of your DSP PF page and payslip" },
  ],
});
