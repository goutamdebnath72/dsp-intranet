// src/tools/encashment/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the leave encashment calculator.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const encashmentTopic = defineTopic({
  id: "encashment",
  form: {
    rank: 50,
    nouns: ["leave", "encashment", "el", "hpl"],
    wants: (c) => c.has(["encashment"]) && c.has(["leave", "el", "hpl"]) && (c.calcWord || c.has(["amount"])) && c.only(),
  },
  samples: [
    { q: "leave encashment calculator", note: "EL / HPL encashment" },
  ],
});
