// src/tools/pincode/police.ts
//
// THE FOUR POLICE STATIONS THAT THE ROLL NAMES for the wards and gram panchayats of Durgapur, with what the Asansol-Durgapur Police Commissionerate's own site says about each (address, zone, its page).
// Which areas are under which station is in data.ts (the "থানা" line of each roll part); this file holds what is true of a station itself: its address, its telephone numbers as the Commissionerate and the Municipal
// Corporation publish them, whom it reports to, and the investigation centres and outposts that work under it. The name of an officer is NOT kept (they change); a telephone number can change too, so the card says where
// each was read and when (POLICE_SOURCES) and links the station's own page. Pure data, no React.
import type { Police } from "./data";

/** an investigation centre (IC) or an outpost (OP / TOP): a small post that works under a station. `src` says which publication names it and, for the station it is under, which one says so. */
export interface PoliceUnit { name: string; kind: "Investigation centre" | "Outpost"; address: string; phone: string; src: SourceId[]; /** worth saying for a reader from the Steel Plant */ note?: string }
export type SourceId = "dmc" | "state" | "wiki" | "adpc";

export interface PoliceStation {
  id: Police;
  /** "Durgapur Police Station" */
  name: string;
  /** the address on the Commissionerate's page */
  address: string;
  /** the Commissionerate's zone for it */
  zone: "East Zone" | "West Zone";
  /** the station's page on the Commissionerate's site */
  page: string;
  /** the station's landline (Durgapur Municipal Corporation's emergency page and the state police directory agree on these) and the mobile number the Commissionerate publishes for the station; "" when none is published */
  phone: string;
  mobile: string;
  /** whom it reports to, as its page on the Commissionerate's site and the Commissionerate's organisation chart say */
  reportsTo: string;
  /** the office number of its Assistant Commissioner, as its page gives it */
  acpOffice: string;
  /** the investigation centres and outposts that work under it */
  units: PoliceUnit[];
  /** colours: a solid colour, a soft background, a dark ink, a gradient for the header (Tailwind classes) */
  color: string;
  soft: string;
  ink: string;
  gradient: string;
}

const SITE = "https://asansoldurgapurpolice.wb.gov.in";
export const POLICE_SITE = SITE;
export const POLICE_FINDER = `${SITE}/PoliceStations`;

export const POLICE: Readonly<Record<Police, PoliceStation>> = {
  D: { id: "D", name: "Durgapur Police Station", address: "Arabindo Avenue, E.F. Line, Durgapur-04 (A Zone), PIN 713204", zone: "East Zone", page: `${SITE}/ps-detail/11`, phone: "0343-2564081", mobile: "9147889404", reportsTo: "CI-A Durgapur, ACP Durgapur, DCP East", acpOffice: "0343-2999200", units: [
    { name: "B-Zone Investigation Centre", kind: "Investigation centre", address: "Marconi Avenue, B-Zone", phone: "0343-2564082", src: ["wiki", "dmc", "state"] },
    { name: "City Centre Investigation Centre", kind: "Investigation centre", address: "Bengal Ambuja, City Centre", phone: "0343-2543587", src: ["wiki", "dmc"] },
    { name: "Faridpur Investigation Centre", kind: "Investigation centre", address: "Near Gandhi More", phone: "0343-2545085", src: ["wiki", "dmc", "state"] },
    { name: "Waria Investigation Centre", kind: "Investigation centre", address: "Near the DSP Main Gate, Waria", phone: "0343-2583779", src: ["wiki", "dmc", "state"], note: "the nearest post to the Steel Plant's main gate" },
    { name: "DTPS Investigation Centre", kind: "Investigation centre", address: "Old Colony, DVC-DTPS", phone: "0343-2590315", src: ["wiki", "dmc"] },
  ], color: "#2563eb", soft: "#eff6ff", ink: "#1e3a8a", gradient: "from-blue-600 via-blue-600 to-indigo-600" },
  C: { id: "C", name: "Coke Oven Police Station", address: "DPL Guest House, Durgapur-02, PIN 713202", zone: "East Zone", page: `${SITE}/ps-detail/9`, phone: "0343-2555060", mobile: "9147889405", reportsTo: "CI Budbud, ACP Kanksa, DCP East", acpOffice: "0343-2999056", units: [], color: "#ea580c", soft: "#fff7ed", ink: "#7c2d12", gradient: "from-orange-500 via-orange-600 to-amber-600" },
  N: { id: "N", name: "New Township Police Station", address: "V.K. Nagar, Durgapur", zone: "West Zone", page: `${SITE}/ps-detail/19`, phone: "0343-2502242", mobile: "9147889406", reportsTo: "CI-A Durgapur, ACP Durgapur, DCP East", acpOffice: "0343-2999200", units: [
    { name: "Bidhannagar Outpost", kind: "Outpost", address: "Bidhannagar", phone: "0343-2537053", src: ["wiki", "dmc", "state"] },
  ], color: "#e11d48", soft: "#fff1f2", ink: "#881337", gradient: "from-rose-500 via-rose-600 to-pink-600" },
  K: { id: "K", name: "Kanksa Police Station", address: "Kanksa Road, P.O. Panagarh, PIN 713148", zone: "East Zone", page: `${SITE}/ps-detail/17`, phone: "", mobile: "9147889428", reportsTo: "ACP Kanksa, DCP East", acpOffice: "0343-2999056", units: [], color: "#475569", soft: "#f1f5f9", ink: "#1e293b", gradient: "from-slate-600 via-slate-700 to-slate-800" },
};

/** the stations in the order they are shown: the one with the most roll parts (polling areas) first: Durgapur 325, Coke Oven 111, Kanksa 81, New Township 80 */
export const POLICE_ORDER: Police[] = ["D", "C", "K", "N"];

/** where the numbers and the units were read, and when: shown on the card */
export const POLICE_SOURCES: Readonly<Record<SourceId, { name: string; url: string; note: string }>> = {
  adpc: { name: "Asansol-Durgapur Police Commissionerate", url: SITE, note: "the station pages and the organisation chart, read on 15 Nov 2026" },
  dmc: { name: "Durgapur Municipal Corporation, emergency numbers", url: "https://www.durgapurmunicipalcorporation.org/emergency.php", note: "read on 15 Nov 2026" },
  state: { name: "Government of West Bengal, police telephone directory", url: "https://wb.gov.in/government-police-administration.aspx", note: "undated; it still uses the numbers of the years before the Commissionerate" },
  wiki: { name: "Wikipedia, Durgapur (police stations)", url: "https://en.wikipedia.org/wiki/Durgapur", note: "from the West Bengal District Statistical Handbook of 2014 and the police's own station finder of that time: which centre works under which station can have changed" },
};

/** units that the sources name for Durgapur but do not say which station they are under: shown apart, not put under a station by guess */
export const OTHER_UNITS: readonly PoliceUnit[] = [
  { name: "A-Zone Investigation Centre", kind: "Investigation centre", address: "A Zone", phone: "0343-2564024", src: ["dmc"], note: "the Municipal Corporation lists it; the state directory lists an A-Zone outpost (TOP) at 0343-2570924" },
  { name: "Banbahal Outpost", kind: "Outpost", address: "Banbahal", phone: "", src: ["state"], note: "named in the state directory, whose number for it is in an old form and is not shown" },
];

/** stations that serve the whole subdivision or the country round the city, and are not "under" a ward in the roll */
export const ALSO_SERVING: ReadonlyArray<{ id: string; name: string; what: string; address: string; mobile: string; page: string }> = [
  { id: "women", name: "Durgapur Women Police Station", what: "women's complaints for the whole Durgapur subdivision", address: "City Centre, near Disha Eye Hospital, Polashdiha, Durgapur - 713204", mobile: "9147889396", page: `${SITE}/ps-detail/12` },
  { id: "faridpur", name: "Faridpur Police Station", what: "the Faridpur-Durgapur block round the city (its centre inside the city is the Faridpur Investigation Centre under Durgapur PS)", address: "Loudha, P.O. Loudha - 713385", mobile: "9147889408", page: `${SITE}/ps-detail/14` },
];

export const EMERGENCY = { number: "112", note: "the national emergency number, for the police, an ambulance or the fire brigade" } as const;
