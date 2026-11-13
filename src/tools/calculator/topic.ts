// src/tools/calculator/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the full calculator, and a typed sum that is answered as you type (12*45+7, 15% of 2400, 5 lakh * 12).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { evaluateExpression } from "./expression";

export const calcTopic = defineTopic({
  id: "calc",
  form: {
    rank: 10,
    nouns: ["calculator", "calc", "scientific", "basic", "standard", "numerical", "numeric", "full", "normal", "simple", "mac", "online", "free", "open", "the", "a", "my", "show", "need", "want"],
    // the full calculator (basic and scientific): "calculator", "scientific calculator", "calc"; the plural, "tools" and "menu" are the list of all the calculators
    wants: (c) => c.has(["calculator", "calc"]) && c.only() && !c.has(["tools", "tool", "menu", "list"]),
  },
  hits: [{ rank: 110, detect: (q) => { const result = evaluateExpression(q); return result ? { kind: "expression" as const, result } : null; } }],
  samples: [
    { q: "calculator", note: "the full calculator, basic and scientific, like the Mac's: keys with the mouse or the keyboard, memory, brackets, powers, roots, trig, history" },
    { q: "scientific calculator", note: "opens the same calculator (switch between Basic and Scientific at the top of it)" },
    { q: "12*45+7", note: "a sum", instant: true },
    { q: "sq rt of 4^3", note: "square root of 4 to the power 3 (= 8); 'square root of 64' and '√64' also work", instant: true },
    { q: "cube root of 27", note: "cube root (= 3); 'cb rt of 27' and '∛27' also work; '5th root of 32' for any other root", instant: true },
    { q: "2*pi*8", note: "circumference of a circle of radius 8; pi and e are known ('2pi' also works, and 'value of pi' shows its digits)", instant: true },
    { q: "value of e", note: "Euler's number to 20 digits; 'value of pi' likewise", instant: true },
    { q: "golden ratio", note: "the golden ratio φ to 20 digits; it can also be used in a sum, e.g. '100 * golden ratio'", instant: true },
    { q: "12 squared", note: "a square (= 144); 'cube of 3' or '3 cubed' for a cube", instant: true },
    { q: "15% of 2400", note: "a percentage", instant: true },
    { q: "200 + 10%", note: "a pocket-calculator percentage: 220", instant: true },
    { q: "5 lakh * 12", note: "Indian number words", instant: true },
  ],
});
