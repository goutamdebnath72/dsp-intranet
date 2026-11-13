// src/tools/emi/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the loan EMI calculator ("emi", or "loan" with a calculator word).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const emiTopic = defineTopic({
  id: "emi",
  form: {
    rank: 20,
    nouns: ["emi", "emis", "loan", "loans", "home", "car", "personal", "bank", "pf", "coop", "co-operative", "cooperative", "society", "repayment", "installment", "installments", "instalment", "instalments"],
    wants: (c) => (c.has(["emi", "emis"]) && c.only()) || (c.has(["loan", "loans"]) && c.calcWord && c.only()),
  },
  samples: [
    { q: "emi calculator", note: "opens the loan form: bank, PF or co-operative society loan" },
    { q: "pf loan emi", note: "the same form, started with a PF loan" },
    { q: "co-operative society loan emi", note: "flat or reducing balance" },
  ],
});
