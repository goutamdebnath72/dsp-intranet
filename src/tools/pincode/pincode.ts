// src/tools/pincode/pincode.ts
//
// THE LOGIC OF THE DURGAPUR AREAS CARD (pure, no React): the colour of a PIN code, the facts of the two legislative seats, and the search of the wards and of the post offices. The data is in data.ts
// (with its sources); how it is drawn is in PincodeCard.tsx. Tested in pincode.selftest.ts.
import { PANCHAYATS, POST_OFFICES, WARDS, type Area, type Panchayat, type PostOffice, type Seat, type Ward } from "./data";

export type { Area, Panchayat, PostOffice, Seat, Ward };

/** the PIN codes of the 7132xx series (19 exist, 713201 to 713219), then the two Kanksa codes of the rolls */
export const DURGAPUR_PINS: string[] = Object.keys(POST_OFFICES).filter((p) => p.startsWith("7132")).sort();
export const KANKSA_PINS: string[] = Object.keys(POST_OFFICES).filter((p) => !p.startsWith("7132")).sort();

/** THE COLOUR OF A PIN CODE: one hue for each of the 21 codes, evenly spaced round the colour wheel (17 degrees apart) and dealt out so that neighbouring codes (713203, 713204) are far apart (8 steps = 137 degrees). The text of the PIN is always shown too: colour is never the only sign. */
const ALL_PINS: string[] = [...DURGAPUR_PINS, ...KANKSA_PINS].sort();
export const pinHue = (pin: string): number => {
  const i = ALL_PINS.indexOf(pin);
  return i >= 0 ? ((i * 8) % ALL_PINS.length) * (360 / ALL_PINS.length) : ((Number(pin.slice(-3)) * 137.508) % 360 + 360) % 360;
};
export interface PinStyle { dot: string; soft: string; border: string; ink: string; rail: string }
/** hues that are neighbours on the wheel (17 degrees apart) also differ in lightness, three levels in turn, so two codes of nearly the same hue still look different */
const LIGHTNESS = [40, 56, 47];
export function pinStyle(pin: string): PinStyle {
  const h = Math.round(pinHue(pin));
  const i = ALL_PINS.indexOf(pin);
  const l = LIGHTNESS[(i >= 0 ? (i * 8) % ALL_PINS.length : 0) % 3];
  return { dot: `hsl(${h} 74% ${l}%)`, soft: `hsl(${h} 85% 95%)`, border: `hsl(${h} 55% 80%)`, ink: `hsl(${h} 65% 24%)`, rail: `linear-gradient(180deg, hsl(${h} 80% ${l + 10}%), hsl(${(h + 24) % 360} 74% ${l - 4}%))` };
}

/** the two assembly seats (constituencies) of the city, with the numbers of the Delimitation Commission's order */
export interface SeatFacts { id: Seat; no: number; name: string; bn: string; color: string; soft: string; ink: string; gradient: string }
export const SEATS: Record<Seat, SeatFacts> = {
  purba: { id: "purba", no: 276, name: "Durgapur Purba", bn: "দুর্গাপুর পূর্ব", color: "#7c3aed", soft: "#f5f3ff", ink: "#4c1d95", gradient: "from-violet-600 via-indigo-600 to-blue-600" },
  paschim: { id: "paschim", no: 277, name: "Durgapur Paschim", bn: "দুর্গাপুর পশ্চিম", color: "#0d9488", soft: "#f0fdfa", ink: "#115e59", gradient: "from-teal-600 via-emerald-600 to-cyan-600" },
};
export const LOK_SABHA = { no: 39, name: "Bardhaman-Durgapur" };
/** the wards each seat covers in the order of the Delimitation Commission (and the gram panchayats of Kanksa block that Durgapur Purba adds) */
export const ORDER_WARDS: Record<Seat, number[]> = {
  purba: [...Array(10)].map((_, i) => i + 1).concat([...Array(6)].map((_, i) => i + 23)),
  paschim: [...Array(12)].map((_, i) => i + 11).concat([...Array(15)].map((_, i) => i + 29)),
};
export const ORDER_PANCHAYATS = ["Amlajora", "Gopalpur", "Molandighi"];

/** "1-10, 23-28" from a list of numbers */
export function rangesText(nums: number[]): string {
  const s = [...nums].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}–${s[j]}` : String(s[i]));
    i = j + 1;
  }
  return out.join(", ");
}

export const wardOf = (n: number): Ward | undefined => WARDS.find((w) => w.ward === n);
export const wardsOfSeat = (seat: Seat): Ward[] => WARDS.filter((w) => w.seat === seat);
/** the wards that use a PIN code, with the number of polling areas of the roll that carry it */
export function wardsOfPin(pin: string): Array<{ ward: number; seat: Seat; parts: number }> {
  return WARDS.flatMap((w) => { const p = w.pins.find((x) => x[0] === pin); return p ? [{ ward: w.ward, seat: w.seat, parts: p[1] }] : []; });
}
/** the gram panchayats of Kanksa that use a PIN code */
export const panchayatsOfPin = (pin: string): Array<{ id: string; en: string; bn: string; parts: number }> =>
  PANCHAYATS.flatMap((g) => { const p = g.pins.find((x) => x[0] === pin); return p ? [{ id: g.id, en: g.en, bn: g.bn, parts: p[1] }] : []; });

/** the post offices of a PIN code, the head office first, then sub offices, then branch offices, each by name */
export function officesOf(pin: string): PostOffice[] {
  const rank = { H: 0, S: 1, B: 2 } as const;
  return [...(POST_OFFICES[pin] ?? [])].sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
}
export const KIND_TEXT: Record<PostOffice["kind"], string> = { H: "Head office", S: "Sub office", B: "Branch office" };
/** a PIN code that has a post office named for the Steel Plant (Steel Project, Steel Town, DSP) */
export const isDspPin = (pin: string): boolean => (POST_OFFICES[pin] ?? []).some((o) => o.dsp);
export const isSailPin = (pin: string): boolean => (POST_OFFICES[pin] ?? []).some((o) => o.sail);

/** NAMES USED FOR THE SAME PLACE: the roll writes "Ambuja Residential Complex", the people of the city also say "Bengal Ambuja". A search by the second finds the first. [what people say, what the roll has] */
export const ALIASES: ReadonlyArray<readonly [string, string]> = [["bengal ambuja", "ambuja"]];
/** a typed search with the alias names turned into the names of the roll */
export function canonical(q: string): string {
  let s = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ");
  for (const [said, roll] of ALIASES) s = s.replace(new RegExp(`\\b${said}\\b`, "g"), roll);
  return s;
}
/** an area name cut into pieces so that the card can write the other name right after the word it belongs to: "Indian Oil Staff Quarters and Ambuja [also Bengal Ambuja] Residential Complex". A piece is plain text, or a word of the roll with its other name. A word that already has the other name in front of it ("Bengal Ambuja") is left alone. */
export type NamePiece = string | { word: string; alias: string };
export function withAliases(en: string): NamePiece[] {
  let pieces: NamePiece[] = [en];
  for (const [said, roll] of ALIASES) {
    const alias = said.replace(/\b\w/g, (c) => c.toUpperCase());
    const re = new RegExp(`(?<!${said.slice(0, said.indexOf(roll)).trim()}\\s)\\b${roll}\\b`, "gi");
    pieces = pieces.flatMap((p): NamePiece[] => {
      if (typeof p !== "string") return [p];
      const out: NamePiece[] = []; let last = 0;
      for (const m of p.matchAll(re)) { out.push(p.slice(last, m.index), { word: m[0], alias }); last = m.index! + m[0].length; }
      out.push(p.slice(last));
      return out.filter((x) => x !== "");
    });
  }
  return pieces;
}

/** the words of a typed search, lower case */
export const tokensOf = (q: string): string[] => canonical(q).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** which PIN codes (and which of their post offices) a search finds: every word must be in the PIN or in a post office's name */
export function searchPins(pins: string[], q: string): Array<{ pin: string; offices: PostOffice[]; all: boolean }> {
  const ts = tokensOf(q);
  if (!ts.length) return pins.map((pin) => ({ pin, offices: officesOf(pin), all: true }));
  const out: Array<{ pin: string; offices: PostOffice[]; all: boolean }> = [];
  for (const pin of pins) {
    const offs = officesOf(pin);
    const pinWords = ts.filter((t) => /^\d+$/.test(t) && pin.includes(t));
    const rest = ts.filter((t) => !pinWords.includes(t));
    if (pinWords.length < ts.filter((t) => /^\d+$/.test(t)).length) continue;
    if (!rest.length) { out.push({ pin, offices: offs, all: true }); continue; }
    const hit = offs.filter((o) => rest.every((t) => o.name.toLowerCase().includes(t)));
    if (hit.length) out.push({ pin, offices: hit, all: false });
  }
  return out;
}

/** what a search on the wards means: "ward 22" or "ward22" is one ward; "purba" or "paschim" a seat; six digits a PIN; anything else is a word looked for in the area names (English, or the Bengali of the roll) */
export interface WardQuery { wards: number[]; seats: Seat[]; pins: string[]; words: string[] }
export function parseWardQuery(q: string): WardQuery {
  const raw = canonical(q).replace(/\bward\s*(\d+)/g, " ward:$1 ");
  const out: WardQuery = { wards: [], seats: [], pins: [], words: [] };
  for (const t of raw.split(/\s+/).filter(Boolean)) {
    const w = t.match(/^ward:(\d+)$/);
    if (w) out.wards.push(Number(w[1]));
    else if (/^\d{6}$/.test(t)) out.pins.push(t);
    else if (t === "purba") out.seats.push("purba");
    else if (t === "paschim") out.seats.push("paschim");
    else if (t === "ward" || t === "wards" || t === "durgapur" || t === "dmc") continue;
    else out.words.push(t);
  }
  return out;
}
const areaHas = (a: Area, word: string): boolean => a[1].toLowerCase().includes(word) || a[0].toLowerCase().includes(word);

/** the wards a search finds and, for each, the areas that matched its words (all of its areas when the search has no word) */
export function searchWards(wards: readonly Ward[], q: string): Array<{ ward: Ward; areas: readonly Area[]; filtered: boolean }> {
  const p = parseWardQuery(q);
  const out: Array<{ ward: Ward; areas: readonly Area[]; filtered: boolean }> = [];
  for (const w of wards) {
    if (p.wards.length && !p.wards.includes(w.ward)) continue;
    if (p.seats.length && !p.seats.includes(w.seat)) continue;
    if (p.pins.length && !p.pins.every((x) => w.pins.some((y) => y[0] === x))) continue;
    if (!p.words.length) { out.push({ ward: w, areas: w.areas, filtered: false }); continue; }
    const areas = w.areas.filter((a) => p.words.every((x) => areaHas(a, x)));
    if (areas.length) out.push({ ward: w, areas, filtered: true });
  }
  return out;
}

/** the areas of a gram panchayat that match the words (all when there are none) */
export function searchAreas(areas: readonly Area[], q: string): readonly Area[] {
  const ts = tokensOf(q);
  return ts.length ? areas.filter((a) => ts.every((x) => areaHas(a, x))) : areas;
}

/** the areas of a ward or panchayat grouped by PIN, the PIN with most polling areas first */
export function groupByPin(areas: readonly Area[], pins: ReadonlyArray<readonly [string, number]>): Array<{ pin: string; areas: Area[] }> {
  const order = pins.map((p) => p[0]);
  const by = new Map<string, Area[]>();
  for (const a of areas) { if (!by.has(a[2])) by.set(a[2], []); by.get(a[2])!.push(a); }
  return [...by.entries()].sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99)).map(([pin, list]) => ({ pin, areas: list }));
}
