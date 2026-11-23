// src/tools/railway/routeVia.ts
//
// TRAINS OF ONE NAME THAT GO DIFFERENT WAYS. The Poorva Express is two trains between Howrah and New Delhi: 12303 runs by PATNA (Mon, Tue, Fri, Sat) and 12381 by GAYA (Wed, Thu, Sun). On the card they showed as
// two lines of the same name, with only the days to tell them apart; I made each line say which way it goes ("via Patna", "via Gaya"). The same is done for every other such case found at Durgapur and Asansol
// (21 Nov 2026: the 387 trains of the two timetables, grouped by name, where the stop lists show different routes):
//   Poorva Express (Howrah to Shakurbasti)        12303 via Patna, 12381 via Gaya
//   Purvanchal Express (Kolkata to Gorakhpur)     15047 via Siwan, 15049 via Ballia, 15051 via Bettiah   (three trains, three routes after Muzaffarpur/Hajipur)
//   Khatipura special (to Khatipura)              03007 via Gaya (from Howrah), 09710 via Patna (from Kolkata)
// The evidence is routeVia.evidence.json: the stops of each train after Asansol, from RailRadar's timetable (the app's own fare-leg tables). Each entry names ONE station (`code`) that the train calls at and none of
// its `rivals` (the other trains of its name that go a different way) does; routeVia.selftest.tsx checks that against the evidence, so I list a train here only with its stops in front of me, never from memory.
// NOT listed, and why: the trains in the other direction (12304 and 12382, 15048, 15050 and 15052: their stops after Durgapur are only Barddhaman and Howrah or Kolkata, which do not show the route); the pair
// of Amrit Bharat Express 03009 and 13065 (Howrah to Anand Vihar), whose stops are the same but whose distances differ by 122 km between Pt. Deen Dayal Upadhyaya Jn and Varanasi (one of them takes a different
// line there, which the stops cannot name); special trains whose stops were not collected. I leave them as they were until their stops are checked.
// Pure.

export interface RouteVia {
  /** The place I name the route by. */
  via: string;
  /** The station code of that place: this train calls there, none of its `rivals` does (the test checks that against the evidence). */
  code: string;
  /** The other trains of this name that go a different way. */
  rivals: string[];
  /** The hover note: I give the main stops of this route and where the others go. */
  note: string;
}

export const ROUTE_VIA: Readonly<Record<string, RouteVia>> = {
  "12303": { via: "Patna", code: "PNBE", rivals: ["12381"], note: "The Patna route: Mokameh, Patna Jn, Danapur, Buxar. The Poorva Express 12381 goes by Gaya." },
  "12381": { via: "Gaya", code: "GAYA", rivals: ["12303"], note: "The Gaya route: Koderma, Gaya Jn, Dehri-on-Sone, Sasaram. The Poorva Express 12303 goes by Patna." },
  "15047": { via: "Siwan", code: "SV", rivals: ["15049", "15051"], note: "The Siwan route: Muzaffarpur, Hajipur, Sonpur, Chhapra, Siwan, Deoria. 15049 goes by Ballia and 15051 by Bettiah." },
  "15049": { via: "Ballia", code: "BUI", rivals: ["15047", "15051"], note: "The Ballia route: Hajipur, Chhapra, Ballia, Rasra, Mau. 15047 goes by Siwan and 15051 by Bettiah." },
  "15051": { via: "Bettiah", code: "BTH", rivals: ["15047", "15049"], note: "The Bettiah route: Muzaffarpur, Motihari, Sagauli, Bettiah, Narkatiaganj, Bagaha. 15047 goes by Siwan and 15049 by Ballia." },
  "03007": { via: "Gaya", code: "GAYA", rivals: ["09710"], note: "The Gaya route: Koderma, Gaya Jn, Dehri-on-Sone, Sasaram. The Khatipura special 09710 goes by Patna." },
  "09710": { via: "Patna", code: "PNBE", rivals: ["03007"], note: "The Patna route: Mokameh, Patna Jn, Danapur, Buxar. The Khatipura special 03007 goes by Gaya." },
};

/** Returns the route note of a train number, or null when none was checked. */
export const viaOf = (number: string): RouteVia | null => ROUTE_VIA[String(number).trim()] ?? null;
