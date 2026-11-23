// src/tools/converter/topic.ts
//
// What the search line needs to know about this topic (pure, no React): the words that ask for the unit and currency converter, and a typed conversion that I answer as you type (5 km in miles, 100 usd to inr, 1 bhp in kw, 1 bigha in sq ft).
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. I list it once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { parseConversion } from "./units";
import { parseEngine } from "./converterModel";
import { parseCurrency } from "./currency";
import { parseColour } from "./colour";

export const converterTopic = defineTopic({
  id: "converter",
  intent: { title: "Unit and currency converter", about: "Converts length, area, volume, temperature, energy, power (bhp, kW), pressure, speed, land units (bigha, katha) currencies (dollar, euro, pound to rupees) and colours (RGB, HEX and HSL, any to any).", words: ["convert", "converter", "converters", "conversion", "unit", "units", "currency", "exchange", "dollar", "usd", "euro", "pound", "rupee", "inr", "kilometre", "km", "miles", "meter", "metre", "feet", "inch", "kilogram", "celsius", "fahrenheit", "bhp", "kw", "hp", "bigha", "katha", "acre", "hectare", "litre", "gallon", "pressure", "rgb", "hex", "hsl", "colour", "color"] },
  form: {
    rank: 70,
    nouns: ["unit", "units", "currency", "converter", "converters", "conversion", "convert", "length", "area", "volume", "temperature", "angle", "energy", "power", "force", "pressure", "mass", "weight", "speed", "exchange", "rate", "colour", "color", "rgb", "hex", "hsl"],
    wants: (c) => c.has(["converter", "converters", "conversion", "convert"]) && c.only(),
  },
  hits: [
    { rank: 70, detect: (q) => { const request = parseCurrency(q); return request ? { kind: "currency" as const, request } : null; } },
    // Rank 45: ahead of the forms (50), so that "colour converter" and "rgb to hex converter" open the colour card and not the unit converter's form. I keep the reader strict (a "#", the word hex or rgb, or "to hex"), so nothing else is taken
    { rank: 45, detect: (q) => { const c = parseColour(q); return c ? { kind: "colour" as const, hex: c.hex } : null; } },
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
    { q: "#ff5733 to rgb", note: "a colour: HEX to RGB and HSL; '#f53' (three digits) and 'hex ff5733' also work", instant: true },
    { q: "rgb(255, 87, 51) to hex", note: "a colour: RGB to HEX and HSL; '255,87,51 to hex' and 'rgb 255 87 51' also work; type in any of the three panels of the card and the other two follow", instant: true },
    { q: "hsl(11, 100%, 60%) to rgb", note: "a colour given as HSL (hue in degrees, saturation and lightness in per cent): the card shows it as RGB and HEX too; 'hsl 11 100 60' also works", instant: true },
    { q: "rgb to hex to hsl", note: "the colour converter: RGB, HEX and HSL, each way, with the colour shown", instant: true },
    { q: "100 usd to inr", note: "currency", instant: true },
    { q: "1 pound in rupees", note: "currency by words", instant: true },
    { q: "euro rate today", note: "one euro in rupees", instant: true },
    { q: "unit converter", note: "opens a converter with every unit and currency" },
  ],
});
