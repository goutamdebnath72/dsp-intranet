// src/tools/rim/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): a typed wheel (rim) marking (8Jx20) read as you type. The words that open the reader ("wheel size") are in the tyre topic, because the rim guide sits under the tyre reader.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { parseRim } from "./rim";

export const rimTopic = defineTopic({
  id: "rim",
  hits: [{
    rank: 20,
    detect: (q) => {
      const spec = parseRim(q);
      return spec ? { kind: "rim" as const, spec, text: q.replace(/^(?:(?:alloy|wheel|rim)s?\s+)+(?:(?:size|spec|specs|specification|specifications|marking|markings|code|meaning)\s+)?/i, "").trim().toUpperCase() } : null;
    },
  }],
  samples: [
    { q: "8Jx20", note: "how to read a wheel (rim) marking: width in inches, flange letter, x for a one-piece drop-centre wheel, diameter in inches, the tyre widths that suit it, and what else must match the car (offset, bolt pattern, centre bore); an offset such as ET35 may follow", instant: true },
  ],
});
