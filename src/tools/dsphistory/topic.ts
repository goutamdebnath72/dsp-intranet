// src/tools/dsphistory/topic.ts
//
// This is what the search line needs to know about this topic (pure, no React): the words of the DSP story card ("dsp history", "heads of dsp", "queen elizabeth durgapur", "sail history"). The data, its sources and its checks are in
// history.ts and history.selftest.ts; how it looks is in DspHistoryCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// Only NAMES of more than one word are key words here (no single word like "history" or "heads" opens the card). I did that so "dsp" alone, "history" alone, "who is the head of dsp" and ordinary searches about the plant stay
// with the search they were: a line is this card's when it has one of these names and every other word is one of the card's extra words or a filler. `lang` says which tab to open.
import { defineTopic } from "@/tools/types";

export const dspHistoryTopic = defineTopic({
  id: "dsphistory",
  intent: { title: "Story of the Durgapur Steel Plant", about: "The history of DSP: how it was built, who made it, its first products, the heads of the plant, and the story of SAIL.", words: ["history", "story", "dsp", "durgapur", "steel", "plant", "founded", "foundation", "heads", "gm", "md", "ceo", "queen", "nehru", "british", "collaboration", "sail", "established", "first", "blast", "furnace", "started", "start", "begin", "began", "built", "build"] },
  live: {
    keys: [],
    phrases: [
      "about dsp", "about durgapur steel plant", "about the durgapur steel plant", "tell me about dsp", "tell me about durgapur steel plant", "dsp history", "history of dsp", "durgapur steel plant history", "history of durgapur steel plant", "dsp story", "story of dsp", "dsp foundation", "foundation of dsp", "dsp founded", "who built dsp", "who built durgapur steel plant",
      "dsp heads", "heads of dsp", "past heads of dsp", "former heads of dsp", "dsp past heads", "dsp chief executives", "dsp general managers", "dsp managing directors", "heads of durgapur steel plant",
      "queen elizabeth durgapur", "queen durgapur", "nehru durgapur", "bc roy durgapur", "bidhan chandra roy durgapur", "dsp first products", "sail history", "history of sail", "sail foundation", "foundation of sail", "sail units",
    ],
    extra: ["dsp", "durgapur", "steel", "plant", "sail", "history", "heads", "head", "queen", "elizabeth", "nehru", "roy", "bidhan", "chandra", "foundation", "founded", "first", "products", "product", "british", "britain", "iscon",
      "units", "founders", "founder", "chronological", "list", "former", "past", "present", "all", "visit", "visited", "technology", "country", "timeline", "story", "origin", "origins", "started", "start", "built", "made", "who",
      "picture", "pictures", "photo", "photos"],
    lang: (w) => {
      const j = w.join(" ");
      if (/heads|chief_executives|general_managers|managing_directors/.test(j)) return "heads|";
      if (/sail_history|history_of_sail|sail_foundation|foundation_of_sail|sail_units/.test(j)) return "sail|";
      if (/queen|nehru|roy|british|britain|iscon|founders?\b|foundation|founded|who_built|technology/.test(j)) return "makers|";
      if (/first_products|first\b/.test(j)) return "first|";
      return "story|";
    },
  },
  samples: [
    { q: "dsp history", note: "the story of the Durgapur Steel Plant: the British collaboration, the first blast furnace, the visits of the Queen, Nehru and Dr B C Roy, each with SAIL's photograph and its source", instant: true },
    { q: "heads of dsp", note: "the same card on its Heads tab: the chronological list of the plant's heads, as General Manager, Director-in-Charge, Managing Director, CEO and Director In-charge, with a picture where SAIL has one", instant: true },
    { q: "queen elizabeth durgapur", note: "the same card on its Who made it tab: the Queen's visit of February 1961 with SAIL's photographs, and Dr B C Roy, Pandit Nehru and the British consortium", instant: true },
    { q: "sail history", note: "the same card on its SAIL tab: Hindustan Steel (1954), the foundation of SAIL (January 24, 1973) and its plants, with the country each came from", instant: true },
  ],
});
