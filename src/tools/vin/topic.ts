// src/tools/vin/topic.ts
//
// What the search line needs to know about this topic (pure, no React): the words that ask for the VIN reader, and a typed VIN (17 characters) that I read as you type.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. I list it once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { looksLikeVin } from "./vin";

export const vinTopic = defineTopic({
  id: "vin",
  intent: { title: "VIN reader", about: "Reads a 17-character Vehicle Identification Number (chassis number): maker, country, model year, plant and serial.", words: ["vin", "chassis", "vehicle", "identification", "decoder", "wmi", "model", "year", "manufacturer", "maker", "meaning", "number", "numbers"] },
  form: {
    rank: 90,
    nouns: ["vin", "vins", "number", "numbers", "no", "decoder", "decode", "reader", "read", "guide", "meaning", "explained", "vehicle", "identification", "chassis", "check", "full", "form", "car", "cars", "spec", "specs", "specification", "specifications", "structure", "format", "code", "codes", "and", "chart"],
    // I open the reader for "vin", "vin number", "chassis number", "vehicle identification number"; a name like "vin diesel" has other words and stays a search.
    wants: (c) => (c.has(["vin", "vins"]) || (c.has(["chassis"]) && c.has(["number", "no"])) || (c.has(["vehicle"]) && c.has(["identification"]))) && c.only(),
  },
  hits: [{ rank: 40, detect: (q) => (looksLikeVin(q) ? { kind: "vin" as const, text: q } : null) }],
  samples: [
    { q: "vin number", note: "opens the VIN reader: the 17 characters of a Vehicle Identification Number section by section, the full forms (WMI, VDS, VIS), the model-year codes and the check digit, with samples to try", },
    { q: "MALBM51BLKM000001", note: "a VIN is read as you type: country, manufacturer (MAL is Hyundai India), the maker's descriptor, position 9, model year (K is 2019), plant and serial; a Hyundai month letter may follow (*L)", instant: true },
  ],
});
