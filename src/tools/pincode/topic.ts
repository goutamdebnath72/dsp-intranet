// src/tools/pincode/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the Durgapur areas card ("pin code", "dmc wards", "durgapur purba"). The data, its sources and its checks are in data.ts and
// pincode.selftest.ts; how it looks is in PincodeCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// A line is this card's when it has a key word and every word is a key word, an extra word or a filler. "purba" and "paschim" are first names in the staff directory, so they are NEVER key words on their own: only the
// phrases "durgapur purba" and "durgapur paschim" are ("purba mitra" stays a person search). Numbers 1 to 43 (a ward) and the 19 PIN codes are extra words: "ward 22" and "pin 713203" open the card with that ward or that PIN.
// `lang` says which tab to open and what to search for, as "tab|search" ("wards|ward 22", "pins|713203", "seats|", "police|ward 22").
import { defineTopic } from "@/tools/types";

const WARD_NUMBERS = [...Array(43)].map((_, i) => String(i + 1));
const PIN_NUMBERS = [...Array(19)].map((_, i) => String(713201 + i));

export const pincodeTopic = defineTopic({
  id: "pincode",
  live: {
    keys: ["pin", "pincode", "pincodes", "zip", "postal", "ward", "wards", "dmc", "constituency", "constituencies", "legislative", "vidhan", "thana", "thanas"],
    phrases: ["pin code", "pin codes", "post office", "post offices", "durgapur purba", "durgapur paschim", "vidhan sabha", "municipal corporation", "assembly constituency", "assembly constituencies", "assembly seat", "assembly seats", "legislative seat", "legislative seats", "police station", "police stations"],
    extra: ["durgapur", "dgp", "purba", "paschim", "east", "west", "area", "areas", "list", "lists", "all", "number", "numbers", "code", "codes", "seat", "seats", "assembly", "police", "station", "stations", "jurisdiction", "under", "ps", "outpost", "outposts", "investigation", "centre", "center", "phone", "telephone", "contact", "waria", "bidhannagar", "sabha", "office", "offices", "post", "municipal", "corporation", "name", "names", "wise", "dsp", "steel", "plant", "township", "mc", "which", "wards", ...WARD_NUMBERS, ...PIN_NUMBERS],
    lang: (w) => {
      const has = (...x: string[]) => w.some((t) => x.some((y) => t === y || t.includes(y)));
      const pin = w.find((t) => PIN_NUMBERS.includes(t));
      const num = w.find((t) => WARD_NUMBERS.includes(t));
      if (has("police_station", "thana")) return `police|${num ? `ward ${num}` : pin ?? ""}`;
      if (has("ward", "wards", "dmc", "municipal_corporation")) return `wards|${num ? `ward ${num}` : pin ?? ""}`;
      if (has("constituency", "constituencies", "legislative", "vidhan", "purba", "paschim", "seat", "seats")) return "seats|";
      return `pins|${pin ?? ""}`;
    },
  },
  samples: [
    { q: "durgapur pin code", note: "the card of the 19 PIN codes of Durgapur (713201 to 713219), each in its own colour, with its post offices and the wards that use it; the post offices named for the Steel Plant are marked DSP", instant: true },
    { q: "dmc wards", note: "the same card on its wards tab: the 43 wards of the Durgapur Municipal Corporation with their seat, their PIN codes and their areas, with a search ('ward 22', 'sagarbhanga', a PIN)", instant: true },
    { q: "ward 22", note: "the same card, opened on that ward: any number from 1 to 43 works", instant: true },
    { q: "durgapur purba", note: "the same card on its seats tab: the two assembly seats (Durgapur Purba and Durgapur Paschim) with the wards of each; 'durgapur paschim', 'assembly seats', 'constituency' and 'vidhan sabha' open it too", instant: true },
    { q: "durgapur police station", note: "the same card on its police stations tab: which areas are under the Durgapur, Coke Oven, Kanksa and New Township stations, with a search for an area ('thana' and 'ward 22 police station' open it too)", instant: true },
  ],
});
