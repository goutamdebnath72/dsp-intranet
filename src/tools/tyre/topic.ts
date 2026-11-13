// src/tools/tyre/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the tyre and rim size reader (also by the wheel words: "wheel size", "rim specification"), and a typed tyre size (205/55 R16 91V) read as you type.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { parseTyre } from "./tyre";

export const tyreTopic = defineTopic({
  id: "tyre",
  form: {
    rank: 80,
    nouns: ["tyre", "tyres", "tire", "tires", "size", "sizes", "specification", "specifications", "spec", "specs", "meaning", "meanings", "decode", "reader", "read", "reading", "guide", "chart", "code", "explained", "load", "speed", "index", "rating", "ratings", "symbol", "symbols", "and", "car", "wheel", "wheels", "rim", "rims", "alloy", "marking", "markings", "flange", "offset"],
    // the tyre reader needs a tyre word; the wheel (rim) guide sits under it, so "wheel size", "rim specification", "alloy wheel markings" open it too (a wheel word alone stays an ordinary search)
    wants: (c) => (c.has(["tyre", "tyres", "tire", "tires"]) && c.only())
      || (c.has(["rim", "rims", "wheel", "wheels", "alloy"]) && c.has(["size", "sizes", "spec", "specs", "specification", "specifications", "marking", "markings", "meaning", "meanings", "decode", "reader", "guide", "chart", "code", "explained"]) && c.only()),
  },
  hits: [{
    rank: 10,
    detect: (q) => {
      const size = parseTyre(q);
      return size ? { kind: "tyre" as const, size, text: q.replace(/^(?:what\s+is\s+|read\s+|decode\s+|explain\s+)?(?:the\s+)?(?:tyre|tire)s?\s+(?:size|code|specs?|specifications?)\s+/i, "").trim().toUpperCase() } : null;
    },
  }],
  samples: [
    { q: "205/55 R16 91V", note: "how to read a tyre size: width, aspect ratio (55 is a percentage of the width, giving the sidewall height), rim, load index (kg) and speed symbol, each explained", instant: true },
    { q: "tyre size", note: "opens the tyre and rim size reader with sample sizes to try, the load-index and speed tables, and the wheel (rim) marking guide" },
    { q: "wheel size", note: "opens the tyre and rim size reader; the wheel (rim) marking guide is the green section under the tyre's own specification" },
  ],
});
