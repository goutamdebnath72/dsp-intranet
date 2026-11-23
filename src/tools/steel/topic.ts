// src/tools/steel/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the steel card ("steel prices", "tmt price", "steel companies", "sail steel production"). The figures, their sources and their
// checks are in mos.ts, companies.ts and steel.selftest.ts; how it looks is in SteelCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// I treat a line as this card's when it has a key word and every word is a key word, an extra word or a filler ("steel price today" opens it; "steel plant" and "steel almirah" do not, because "plant" and "almirah" are not words of the
// card). I keep the names of the makers as extra words, never key words alone, so "tata steel share price" stays with the markets card and "sail" alone is not this card. `lang` says which tab to open.
import { defineTopic } from "@/tools/types";

export const steelTopic = defineTopic({
  id: "steel",
  intent: { title: "Steel prices, production and companies", about: "Steel: what DSP makes, retail prices of TMT, HR and CR coil, the steel companies' results, and SAIL's, India's and the world's production.", words: ["steel", "tmt", "hrc", "crc", "rebar", "billet", "joist", "iron", "ore", "production", "price", "sail", "tata", "jsw", "jindal", "mill", "bar", "bars", "results", "result", "quarter", "quarterly", "earnings", "profit", "coil", "coils", "hot", "rolled", "cold"] },
  live: {
    keys: ["steel", "tmt", "hrc", "crc", "rebar", "rebars", "billet", "billets", "joist", "joists"],
    phrases: ["steel price", "steel prices", "steel rate", "steel rates", "steel production", "steel output", "steel companies", "steel makers", "steel comparison", "crude steel", "tata steel", "jsw steel", "jindal steel", "sail steel", "retail steel", "dsp products", "dsp product", "dsp steel", "durgapur steel", "dsp price", "dsp prices", "wheel and axle"],
    extra: ["sail", "tata", "jsw", "jindal", "jspl", "rinl", "nmdc", "companies", "company", "comparison", "compare", "production", "producers", "producer", "output", "world", "mill", "mills", "makers", "maker", "iron", "ore", "industry", "sector",
      "monthly", "quarterly", "quarter", "realisation", "realization", "ebitda", "vs", "versus", "top", "largest", "biggest", "consumption", "exports", "imports", "export", "import", "bar", "bars", "coil", "coils", "hot", "cold", "rolled",
      "mumbai", "retail", "benchmark", "tonne", "tonnes", "ton", "tons", "market", "stats", "statistics", "data", "cpse", "cpses", "government", "public", "price", "prices",
      "dsp", "durgapur", "products", "product", "structural", "structurals", "channel", "channels", "angle", "angles", "beam", "beams", "bloom", "blooms", "wheel", "wheels", "axle", "axles", "pig", "merchant", "section"],
    lang: (w) => {
      const has = (...x: string[]) => w.some((t) => x.some((y) => t.includes(y)));
      if (has("dsp", "durgapur", "billet", "joist", "structural", "channel", "angle", "beam", "bloom", "wheel", "axle", "pig", "merchant", "section")) return "dsp|";
      if (has("sail", "rinl", "nmdc", "cpse")) return "sail|";
      if (has("tata", "jsw", "jindal", "jspl", "compan", "compar", "versus", "vs", "maker", "realis", "ebitda", "quarter", "mill")) return "companies|";
      if (has("production", "output", "world", "producer", "consumption", "export", "import", "largest", "biggest", "top", "crude_steel", "industry", "sector")) return "india|";
      return "prices|";
    },
  },
  samples: [
    { q: "dsp products", note: "the same card on its DSP products tab: what the Durgapur Steel Plant makes to sell (TMT bars, channels, angles, joists and beams, billets and blooms, wheels and axles, pig iron) with its sizes and capacity, beside the Durgapur market's quotes for the same kind of steel, dated and without GST (market quotes, not DSP's own prices); 'durgapur steel' and 'billet price' open it too", instant: true },
    { q: "steel prices", note: "the Ministry of Steel's retail prices of TMT bar, HR coil and CR coil in Mumbai, month by month, with the iron ore price (there is no price list of SAIL, Tata Steel or JSW to show: the card says why)", instant: true },
    { q: "steel companies", note: "the same card on its Companies tab: SAIL, Tata Steel, JSW Steel and Jindal Steel quarter by quarter from their own results (production, sales, EBITDA per tonne); 'tata steel', 'jsw steel' and 'steel comparison' open it too", instant: true },
    { q: "sail steel production", note: "the same card on its SAIL tab: SAIL, RINL and NMDC Steel month by month, with SAIL against the same month a year earlier", instant: true },
    { q: "india steel production", note: "the same card on its India and world tab: India's crude steel, consumption and trade by year, and the biggest producers", instant: true },
  ],
});
