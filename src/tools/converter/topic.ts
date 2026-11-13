// src/tools/converter/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the unit and currency converter, and a typed conversion answered as you type (5 km in miles, 100 usd to inr, 1 bhp in kw, 1 bigha in sq ft).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { parseConversion } from "./units";
import { parseEngine } from "./converterModel";
import { parseCurrency } from "./currency";

export const converterTopic = defineTopic({
  id: "converter",
  form: {
    rank: 70,
    nouns: ["unit", "units", "currency", "converter", "conversion", "convert", "length", "area", "volume", "temperature", "angle", "energy", "power", "force", "pressure", "mass", "weight", "speed", "exchange", "rate"],
    wants: (c) => c.has(["converter", "conversion", "convert"]) && c.only(),
  },
  hits: [
    { rank: 70, detect: (q) => { const request = parseCurrency(q); return request ? { kind: "currency" as const, request } : null; } },
    { rank: 80, detect: (q) => { const result = parseConversion(q); return result ? { kind: "convert" as const, result } : null; } },
    { rank: 100, detect: (q) => { const e = parseEngine(q); return e ? { kind: "engine" as const, value: e.value, id: e.id } : null; } },
  ],
  samples: [
    { q: "5 km in miles", note: "length", instant: true },
    { q: "1 bhp in kw", note: "power", instant: true },
    { q: "100 bhp", note: "engine power is always shown in all three: PS (German Pferdestärke, metric horsepower), bhp and kW; 'engine power' or '1 kw in ps' work too", instant: true },
    { q: "bhp to ps", note: "no number means one unit; the card is laid out like Google's, so you can retype either box or change either unit", instant: true },
    { q: "100 kw to bhp", note: "power, the other way", instant: true },
    { q: "180 degrees to radians", note: "angle", instant: true },
    { q: "98.6 f to c", note: "temperature", instant: true },
    { q: "1 kWh in calories", note: "energy", instant: true },
    { q: "1 kgf/cm2 to bar", note: "pressure", instant: true },
    { q: "1 acre in sq ft", note: "area", instant: true },
    { q: "1 bigha in sq ft", note: "bigha as used in West Bengal and Assam: 14,400 sq ft, 20 katha; the card says which size it took, and the list offers the other states' sizes", instant: true },
    { q: "2 katha to sq m", note: "katha (also written cottah or kottah) as used in West Bengal: 720 sq ft; \"katha assam\" and \"katha bihar\" give those states' sizes", instant: true },
    { q: "bigha to decimal", note: "land units of the land records: bigha, katha, chhatak, decimal (dismil, 1/100 acre), with acre, hectare and square feet", instant: true },
    { q: "72 km/h to m/s", note: "speed", instant: true },
    { q: "100 usd to inr", note: "currency", instant: true },
    { q: "1 pound in rupees", note: "currency by words", instant: true },
    { q: "euro rate today", note: "one euro in rupees", instant: true },
    { q: "unit converter", note: "opens a converter with every unit and currency" },
  ],
});
