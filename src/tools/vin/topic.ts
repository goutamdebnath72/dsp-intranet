// src/tools/vin/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the VIN reader, and a typed VIN (17 characters) read as you type.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. It is listed once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";
import { looksLikeVin } from "./vin";

export const vinTopic = defineTopic({
  id: "vin",
  form: {
    rank: 90,
    nouns: ["vin", "vins", "number", "numbers", "no", "decoder", "decode", "reader", "read", "guide", "meaning", "explained", "vehicle", "identification", "chassis", "check", "full", "form", "car", "cars", "spec", "specs", "specification", "specifications", "structure", "format", "code", "codes", "and", "chart"],
    // "vin", "vin number", "chassis number", "vehicle identification number" (a name like "vin diesel" has other words and stays a search)
    wants: (c) => (c.has(["vin", "vins"]) || (c.has(["chassis"]) && c.has(["number", "no"])) || (c.has(["vehicle"]) && c.has(["identification"]))) && c.only(),
  },
  hits: [{ rank: 40, detect: (q) => (looksLikeVin(q) ? { kind: "vin" as const, text: q } : null) }],
  samples: [
    { q: "vin number", note: "opens the VIN reader: the 17 characters of a Vehicle Identification Number section by section, the full forms (WMI, VDS, VIS), the model-year codes and the check digit, with samples to try", },
    { q: "MALBM51BLKM000001", note: "a VIN is read as you type: country, manufacturer (MAL is Hyundai India), the maker's descriptor, position 9, model year (K is 2019), plant and serial; a Hyundai month letter may follow (*L)", instant: true },
  ],
});
