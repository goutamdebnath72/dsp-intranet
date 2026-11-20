// src/tools/calculator/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the full calculator, a number typed in a base (0xFF, 255 to binary), and a typed sum that is answered as you type (12*45+7, 15% of 2400, 5 lakh * 12).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { evaluateExpression } from "./expression";
import { parseBaseLine } from "./numberBase";

export const calcTopic = defineTopic({
  id: "calc",
  intent: { title: "Calculator", about: "A full basic and scientific calculator; a sum typed as you type is answered too (12*45+7, percentages, square roots, powers).", words: ["calculator", "calculate", "sum", "arithmetic", "add", "subtract", "multiply", "divide", "percentage", "percent", "square", "root", "power", "scientific", "trigonometry", "sin", "cos", "tan", "log", "math", "maths", "mathematics", "hisab"] },
  form: {
    rank: 10,
    nouns: ["calculator", "calc", "scientific", "basic", "standard", "numerical", "numeric", "full", "normal", "simple", "mac", "online", "free", "open", "the", "a", "my", "show", "need", "want"],
    // the full calculator (basic and scientific): "calculator", "scientific calculator", "calc"; the plural, "tools" and "menu" are the list of all the calculators
    wants: (c) => c.has(["calculator", "calc"]) && c.only() && !c.has(["tools", "tool", "menu", "list"]),
  },
  hits: [
    // rank 105: ahead of the sum (110); the reader is strict (a 0x/0b/0o prefix, or "to/in" and a base word), so no ordinary line is taken for a number in a base
    { rank: 105, detect: (q) => { const r = parseBaseLine(q); return r ? { kind: "calcbase" as const, value: r.value, base: r.base } : null; } },
    { rank: 110, detect: (q) => { const result = evaluateExpression(q); return result ? { kind: "expression" as const, result } : null; } },
  ],
  samples: [
    { q: "calculator", note: "the full calculator, basic and scientific, like the Mac's: keys with the mouse or the keyboard, memory, brackets, powers, roots, trig, history" },
    { q: "scientific calculator", note: "opens the same calculator (switch between Basic and Scientific at the top of it)" },
    { q: "0xFF", note: "a number in hexadecimal (0b1010 for binary, 0o17 for octal): the scientific calculator opens on it, in that base, with the value in all four bases under it", instant: true },
    { q: "255 to binary", note: "a decimal number in binary; '10 in hex', '1010 binary to decimal' and 'ff hex to octal' also work (whole numbers only)", instant: true },
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
