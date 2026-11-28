// src/tools/vin/vin.ts
//
// How I read a vehicle identification number (VIN): "MALBM51BLKM000001" -> world manufacturer MAL (Hyundai Motor India), the maker's own descriptor BM51B, position 9 L (not a check digit: Indian makers use it
// for their own code), model year K (2019), plant M, serial 000001. Pure; nothing is stored or sent anywhere.
//
// The structure is ISO 3779 (the 17 characters) and ISO 3780 (the World Manufacturer Identifier, which SAE International assigns); the letters I, O and Q are never used, so that nothing is mistaken for 1 or 0.
// Positions 1-3 are the WMI, 4-9 the Vehicle Descriptor Section (VDS), 10-17 the Vehicle Indicator Section (VIS). The check digit of position 9 (a weighted sum modulo 11) is required in North America and
// is NOT used by Indian makers. What a maker puts in positions 4-8, the plant letter and the month is the maker's own business: my reader says only what the standard fixes, names the manufacturer and
// plant only where I am sure, and says plainly when a part is the maker's own code. The vehicle's papers (registration certificate, invoice) and the maker are the authority.
//
// Indian chassis plates: Hyundai stamps the VIN followed by "*" and a letter for the month of manufacture (MALBM51BLKM000001*L: L = November); I read that suffix and guess nothing else.
//
// WHOSE NUMBERS I READ (my rule of 26 Nov 2026, widened on 27 Nov): the makers whose cars are sold in India, and for each only the manufacturer code it uses in INDIA. Twenty buttons: the five Indian makers (Hyundai Motor India, Kia India,
// Maruti Suzuki, Tata Motors, Mahindra) and, at the owner's request, Honda, Toyota, Nissan, Volkswagen, Škoda, Renault and Citroën, and (28 Nov) Jeep, Mercedes-Benz, Fiat and Ford (the last two have a `remark`: their new cars are no longer sold in India, which I checked first: Ford's own statement of 9 Sep 2021 and Business Standard of 18 Mar 2025; reports of May 2026 that Fiat has announced no return). The owner also asked for Volvo, BYD, Audi and BMW, but no source I could read gives a manufacturer code for their cars made or sold in India (the compiled list has only BMW's motorcycles made by TVS, WB3, and Volvo Eicher's commercial vehicles, MC2, which are not those cars), so they were NOT here at first. The owner then decided (28 Nov): where no source gives an Indian code, give the INTERNATIONAL code with a clear declaration. So Audi (WAU, WA1), BMW (WBA, WBS, WBX, WBY), Volvo (YV1, YV4) and BYD (LGX, LC0) are here, each named in the compiled list and by NHTSA's vPIC, each marked `scope: international`: the code is the maker's anywhere in the world, the country shown is the code's, and nothing says where this car was built. A code is never guessed. A code stays in the list only when a source names it for that maker: Maruti's own customer page (MA3) and Renault
// India's own page (MEE) say it themselves; for the others a compiled manufacturer-code list names it (Wikibooks' World Manufacturer Identifier list, read on 27 Nov 2026) and, where I found one, a second source. Each entry says which (`basis`).
// BIS, the Indian coordinator of the WMI, holds the official register; SAE International assigns the codes and the register is not published, so no source I could read is "the" register. The codes of positions 4 to 8 of every maker are the maker's own
// and none of them publishes them, so for none do I pretend to decode them; dealer guides that give a month or a model at some position (for Volkswagen, Tata, Mahindra) I could not confirm from a maker, and I do not use them.

import { DateTime } from "luxon";

/** The characters of a VIN: digits and capital letters except I, O and Q. */
export const VIN_CHAR = /^[A-HJ-NPR-Z0-9]$/;
/** I list the year codes of position 10 in order: A = 1980 (and 2010), ... Y = 2000 (2030), 1 = 2001 (2031) ... 9 = 2009 (2039); I, O, Q, U, Z and 0 are never year codes. */
export const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";
/** These are the month letters Hyundai stamps after the VIN (I is skipped). */
export const MONTH_CODES: Record<string, string> = { A: "January", B: "February", C: "March", D: "April", E: "May", F: "June", G: "July", H: "August", J: "September", K: "October", L: "November", M: "December" };

const TRANSLIT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const FULL_FORMS: Array<{ abbr: string; full: string; meaning: string }> = [
  { abbr: "VIN", full: "Vehicle Identification Number", meaning: "the 17-character code that identifies one vehicle, stamped on its chassis (on a plate and on the body)" },
  { abbr: "WMI", full: "World Manufacturer Identifier", meaning: "positions 1 to 3: the country or region and the manufacturer" },
  { abbr: "VDS", full: "Vehicle Descriptor Section", meaning: "positions 4 to 9: the vehicle's type, as the maker describes it (position 9 may be a check digit)" },
  { abbr: "VIS", full: "Vehicle Indicator Section", meaning: "positions 10 to 17: the model year, the plant and the vehicle's own serial number (ISO 3779 says \"indicator\"; many guides write \"Vehicle Identifier Section\")" },
  { abbr: "ISO 3779", full: "the international standard for the structure of the VIN", meaning: "17 characters, three sections, no I, O or Q" },
  { abbr: "ISO 3780", full: "the international standard for the World Manufacturer Identifier", meaning: "the code that SAE International assigns to each manufacturer" },
  { abbr: "SAE", full: "SAE International (formerly the Society of Automotive Engineers)", meaning: "the body that assigns the WMIs for ISO" },
];

export const SECTIONS: Array<{ id: "WMI" | "VDS" | "VIS"; from: number; to: number; name: string; purpose: string }> = [
  { id: "WMI", from: 1, to: 3, name: "World Manufacturer Identifier", purpose: "the country (or region) and the manufacturer" },
  { id: "VDS", from: 4, to: 9, name: "Vehicle Descriptor Section", purpose: "the vehicle's type: model, body, engine, restraint system; position 9 may be a check digit" },
  { id: "VIS", from: 10, to: 17, name: "Vehicle Indicator Section", purpose: "the model year, the assembly plant and the serial number of this vehicle" },
];

/** The manufacturer codes (WMI) I know, each with the company it was issued to, as a source names it. A code I could not confirm from a source is NOT here, so a number with another code is said to be unknown, never guessed. `basis` says how sure I am of the code: "maker" when the maker's own page names it, "list" when a compiled manufacturer-code list does (and a second source where I found one). */
export const WMIS: Record<string, { maker: string; country: string; basis: "maker" | "list" | "list+vpic"; scope?: "international" }> = {
  MAL: { maker: "Hyundai Motor India", country: "India", basis: "list" },
  MB2: { maker: "Hyundai Motor India", country: "India", basis: "list" },
  MZB: { maker: "Kia India", country: "India", basis: "list" },
  MA3: { maker: "Maruti Suzuki", country: "India", basis: "maker" },
  MAT: { maker: "Tata Motors", country: "India", basis: "list" },
  MA1: { maker: "Mahindra & Mahindra", country: "India", basis: "list" },
  MAK: { maker: "Honda Cars India", country: "India", basis: "list" },
  MBJ: { maker: "Toyota Kirloskar Motor", country: "India", basis: "list" },
  MDH: { maker: "Nissan Motor India", country: "India", basis: "list" },
  MEE: { maker: "Renault India", country: "India", basis: "maker" },
  MEX: { maker: "Škoda Auto Volkswagen India", country: "India", basis: "list" },
  MZZ: { maker: "Citroën India (PCA Automobiles India)", country: "India", basis: "list" },
  MCA: { maker: "FCA India Automobiles (Fiat, Jeep)", country: "India", basis: "list" },
  MAH: { maker: "Fiat India Automobiles Pvt. Ltd.", country: "India", basis: "list" },
  MAJ: { maker: "Ford India", country: "India", basis: "list" },
  MBR: { maker: "Mercedes-Benz India", country: "India", basis: "list" },
  // INTERNATIONAL CODES (owner's decision of 28 Nov 2026: if no source gives an Indian code, give the international one with a clear declaration). `scope: "international"`: the code is the maker's own anywhere in the world, not issued for India, and the country is the code's, not the car's. Each is named in the compiled list AND by NHTSA's vPIC (DecodeWMI, read 28 Nov 2026).
  WAU: { maker: "Audi AG (cars)", country: "Germany", basis: "list+vpic", scope: "international" },
  WA1: { maker: "Audi AG (SUVs)", country: "Germany", basis: "list+vpic", scope: "international" },
  WBA: { maker: "BMW AG (cars)", country: "Germany", basis: "list+vpic", scope: "international" },
  WBS: { maker: "BMW M GmbH (M cars)", country: "Germany", basis: "list+vpic", scope: "international" },
  WBX: { maker: "BMW AG (SUVs)", country: "Germany", basis: "list+vpic", scope: "international" },
  WBY: { maker: "BMW AG (i cars)", country: "Germany", basis: "list+vpic", scope: "international" },
  YV1: { maker: "Volvo Car Corporation (cars)", country: "Sweden", basis: "list+vpic", scope: "international" },
  YV4: { maker: "Volvo Car Corporation (SUVs)", country: "Sweden", basis: "list+vpic", scope: "international" },
  LGX: { maker: "BYD Auto Co., Ltd.", country: "China", basis: "list+vpic", scope: "international" },
  LC0: { maker: "BYD Auto Industry Company Limited", country: "China", basis: "list+vpic", scope: "international" },
};

/** Jeep's code belongs to the company, which the list names for both its brands, so the code alone cannot tell a Jeep from a Fiat. */
const JEEP_NOTE = "Jeep's code in India is MCA, which the compiled code list (read on 28 Nov 2026) gives to FCA India Automobiles Pvt. Ltd. and names for both its brands, Fiat and Jeep, so MCA alone cannot tell the two apart. I found no Jeep or FCA document that prints it and no second source. A Jeep imported ready-built carries its foreign code, not MCA, and is said to be unknown. What follows MCA is the maker's own; this reader names the maker and explains the positions the standard fixes.";

/** The sample of a maker is made up, and says so by its look: the maker's code, five letters and digits of no meaning, a letter in position 9 (so no check digit is shown), P (2023), T and serial 000001. None is a real vehicle's. */
const sample = (wmi: string, descriptor: string) => `${wmi}${descriptor}EPT000001`;

/** One note for both brands that carry MEX: a number cannot say which of the two it is, so the reading of either shows the same words. */
const MEX_NOTE = "Volkswagen and Škoda cars built in India carry the same code, MEX, issued to Škoda Auto Volkswagen India (the lists add “2015 on”), so MEX alone cannot tell the two brands apart. What follows MEX is the maker's own; dealer guides that read a month or a year from fixed positions of these numbers I could not confirm from the maker, so I do not use them.";

/**
 * THE MAKERS, one button each under the number box: the first four are chips of their own; the rest (`more`, Mahindra first) are in the dropdown of the FIFTH chip, which shows Mahindra until another is chosen and then shows the maker chosen (one row of five, whatever the number of makers). Hyundai Motor India and Kia India are TWO: they hold different
 * manufacturer codes and are two companies, and I found no document that says their positions 4 to 8 follow one code. Volkswagen and Škoda are two buttons too (the owner asked for both), but they share ONE code, MEX, issued to one company, so the code
 * cannot tell the two brands apart and the notes say so. `note` says only what a source states; it is shown under the reading of a number of that maker. `alsoWmi` lists a further code listed for the same maker.
 */
export const MAKERS: Array<{ id: "hyundai" | "kia" | "maruti" | "tata" | "mahindra" | "honda" | "toyota" | "nissan" | "volkswagen" | "skoda" | "renault" | "citroen" | "jeep" | "mercedes" | "fiat" | "ford" | "audi" | "bmw" | "volvo" | "byd"; button: string; maker: string; wmi: string; alsoWmi?: string[]; sample: string; note: string; /** said in bold on the reading and under the name in the dropdown: a maker whose new cars are no longer sold in India */ remark?: string; more?: true }> = [
  { id: "hyundai", button: "Hyundai India", maker: "Hyundai Motor India", wmi: "MAL", alsoWmi: ["MB2"], sample: "MALBM51BLKM000001", note: "Hyundai Motor India's code is MAL, and the compiled code lists give it a second, MB2, for its SUVs (I found no Hyundai document that prints either). Its chassis plate may carry a month letter after a star (read below, as Indian car guides and owners describe it)." },
  { id: "kia", button: "Kia India", maker: "Kia India", wmi: "MZB", sample: "MZBPC81ALNN000001", note: "Kia India has a manufacturer code of its own, MZB, apart from Hyundai's MAL. I found no document saying that its positions 4 to 8 follow Hyundai's, so I do not read one by the other." },
  { id: "maruti", button: "Maruti Suzuki", maker: "Maruti Suzuki", wmi: "MA3", sample: "MA3ZC62S1NN000001", note: "Maruti Suzuki describes its own chassis number as MA3 followed by 14 letters and digits (its page for customers), which is the 17 characters of the standard." },
  { id: "tata", button: "Tata Motors", maker: "Tata Motors", wmi: "MAT", sample: "MAT6A1CZ2NP000001", note: "Tata Motors' code is MAT. What follows it is Tata's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "mahindra", button: "Mahindra", maker: "Mahindra & Mahindra", wmi: "MA1", sample: "MA1TA2GD4NM000001", more: true, note: "Mahindra & Mahindra's code is MA1. What follows it is Mahindra's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "honda", button: "Honda", maker: "Honda Cars India", wmi: "MAK", sample: sample("MAK", "AB1CD"), more: true, note: "Honda Cars India's code is MAK: the compiled code lists give it, and the Honda Accord numbers quoted in Indian consumer-court orders begin with it. What follows MAK is Honda's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "toyota", button: "Toyota", maker: "Toyota Kirloskar Motor", wmi: "MBJ", sample: sample("MBJ", "BC2DE"), more: true, note: "Toyota Kirloskar Motor's code is MBJ, as the compiled code lists give it; I found no Toyota document that prints it. What follows MBJ is Toyota's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "nissan", button: "Nissan", maker: "Nissan Motor India", wmi: "MDH", sample: sample("MDH", "CD3EF"), more: true, note: "Nissan Motor India's code is MDH (the compiled lists say it includes Datsun). Nissan India's own VIN-check page gives no layout of the number. Renault has a code of its own, MEE, not Nissan's. What follows MDH is Nissan's own." },
  { id: "volkswagen", button: "Volkswagen", maker: "Škoda Auto Volkswagen India", wmi: "MEX", sample: sample("MEX", "DE4FG"), more: true, note: MEX_NOTE },
  { id: "skoda", button: "Škoda", maker: "Škoda Auto Volkswagen India", wmi: "MEX", sample: sample("MEX", "EF5GH"), more: true, note: MEX_NOTE },
  { id: "renault", button: "Renault", maker: "Renault India", wmi: "MEE", sample: sample("MEE", "FG6HJ"), more: true, note: "Renault India says it on its own page: the VIN is 17 characters starting with MEE, written on the registration certificate or at the bottom of the windscreen. What follows MEE is Renault's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "citroen", button: "Citroën", maker: "Citroën India (PCA Automobiles India)", wmi: "MZZ", sample: sample("MZZ", "GH7JK"), more: true, note: "Citroën India's code is MZZ, issued to PCA Automobiles India Private Limited, as a compiled code list and a decoder site give it; I found no Citroën document that prints it. MZZ lies outside the MA to ME range of India, as Kia's MZB does, so the country comes from this reader's list. What follows MZZ is Citroën's own." },
  { id: "jeep", button: "Jeep", maker: "FCA India Automobiles (Fiat, Jeep)", wmi: "MCA", sample: sample("MCA", "HJ8KL"), more: true, note: JEEP_NOTE },
  { id: "mercedes", button: "Mercedes-Benz", maker: "Mercedes-Benz India", wmi: "MBR", sample: sample("MBR", "JK9LM"), more: true, note: "Mercedes-Benz India's code is MBR, as the compiled code list gives it (read on 28 Nov 2026); I found no Mercedes-Benz document that prints it and no second source. The same list gives the Daimler trucks and buses of India (BharatBenz) a code of their own, which is not read here. A car imported ready-built carries Mercedes-Benz's German code, not MBR, and is said to be unknown. What follows MBR is Mercedes-Benz's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "fiat", button: "Fiat", maker: "Fiat India Automobiles Pvt. Ltd.", wmi: "MAH", sample: sample("MAH", "PR5ST"), more: true, remark: "No new Fiat cars are sold in India now: Fiat's last cars here (Punto, Linea) went around 2019 to 2020 with the BS6 rules, and reports of May 2026 say Fiat has announced no return. Fiat cars are still on the road.", note: "Fiat India Automobiles' code is MAH, as the compiled code list gives it (read on 28 Nov 2026); I found no Fiat document that prints it and no second source. The same list gives MCA to FCA India Automobiles for Fiat and Jeep, so a Fiat of the Indian plant may carry MAH or MCA, and a number with either code may also be a Jeep: the code names the company, not the brand. What follows the code is the maker's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "ford", button: "Ford", maker: "Ford India", wmi: "MAJ", sample: sample("MAJ", "RS6TV"), more: true, remark: "No new Ford cars are sold in India now: Ford announced on 9 Sep 2021 that it would stop making vehicles in India (Sanand 2021, Chennai 2022), said it would keep service and warranty going, and in March 2025 said its Chennai plant would restart for engines for export only, with no plan to build cars.", note: "Ford India's code is MAJ, as the compiled code list gives it (read on 28 Nov 2026); I found no Ford document that prints it and no second source. A Ford imported ready-built carries Ford's foreign code, not MAJ, and is said to be unknown. What follows MAJ is Ford's own; this reader names the maker and explains the positions the standard fixes." },
  { id: "audi", button: "Audi", maker: "Audi AG (international code)", wmi: "WAU", alsoWmi: ["WA1"], sample: sample("WAU", "KL1MN"), more: true, note: "Audi's codes in the compiled code list (read on 28 Nov 2026) are WAU for cars and WA1 for SUVs, and NHTSA's vPIC names both as Audi AG. These are international codes: no source I could read gives Audi a separate code for the cars made or sold in India (NHTSA's decoder, vPIC, lists no Indian code for the brand either), so a number with one of them may be a car assembled in India, an import or a car built elsewhere, and the code cannot say which. The country shown is the country of the code, not where this car was built. The plant is position 11, the maker's own, and is not decoded; the registration certificate and the maker are the authority. Audi assembles some of its models in India." },
  { id: "bmw", button: "BMW", maker: "BMW AG (international code)", wmi: "WBA", alsoWmi: ["WBS", "WBX", "WBY"], sample: sample("WBA", "LM2NP"), more: true, note: "BMW's codes in the compiled code list (read on 28 Nov 2026) are WBA (cars), WBS (M cars), WBX (SUVs) and WBY (i cars), and NHTSA's vPIC names them as BMW AG and BMW M GmbH. These are international codes: no source I could read gives BMW a separate code for the cars made or sold in India (NHTSA's decoder, vPIC, lists no Indian code for the brand either), so a number with one of them may be a car assembled in India, an import or a car built elsewhere, and the code cannot say which. The country shown is the country of the code, not where this car was built. The plant is position 11, the maker's own, and is not decoded; the registration certificate and the maker are the authority. BMW assembles some of its cars at its plant near Chennai. The list's one Indian BMW code, WB3, is for motorcycles made in India by TVS, not for cars, and is not read here." },
  { id: "volvo", button: "Volvo", maker: "Volvo Car Corporation (international code)", wmi: "YV1", alsoWmi: ["YV4"], sample: sample("YV1", "MN3PR"), more: true, note: "Volvo's codes in the compiled code list (read on 28 Nov 2026) are YV1 for cars and YV4 for SUVs, and NHTSA's vPIC names both as Volvo Car Corporation. These are international codes: no source I could read gives Volvo a separate code for the cars made or sold in India (NHTSA's decoder, vPIC, lists no Indian code for the brand either), so a number with one of them may be a car assembled in India, an import or a car built elsewhere, and the code cannot say which. The country shown is the country of the code, not where this car was built. The plant is position 11, the maker's own, and is not decoded; the registration certificate and the maker are the authority. Volvo assembles some of its cars in India. The list's one Indian entry with Volvo's name, MC2, is Volvo Eicher Commercial Vehicles (trucks and buses), a different business, and is not read here." },
  { id: "byd", button: "BYD", maker: "BYD Auto Co., Ltd. (international code)", wmi: "LGX", alsoWmi: ["LC0"], sample: sample("LGX", "NP4RS"), more: true, note: "BYD's codes in the compiled code list (read on 28 Nov 2026) are LGX and LC0, and NHTSA's vPIC names them as BYD Auto Co., Ltd. and BYD Auto Industry Company Limited, of China. These are international codes: no source I could read gives BYD a separate code for the cars made or sold in India (NHTSA's decoder, vPIC, lists no Indian code for the brand either), so a number with one of them may be a car assembled in India, an import or a car built elsewhere, and the code cannot say which. The country shown is the country of the code, not where this car was built. The plant is position 11, the maker's own, and is not decoded; the registration certificate and the maker are the authority. I found no document on how BYD's cars sold in India are numbered, so a BYD number is read by its Chinese code." },
];

/** The plant letter of position 11 is the maker's own, so I list only this one, which is known with certainty (Hyundai Motor India had a single plant in India, at Sriperumbudur near Chennai, until recent years). */
const PLANTS: Record<string, Record<string, string>> = { MAL: { M: "Hyundai Motor India's plant at Sriperumbudur, near Chennai" } };

/** Returns the region (first character) and, where the first two characters fix it, the country. */
export function regionOf(vin: string): { region: string; country: string | null } {
  const c = vin[0] ?? "", two = vin.slice(0, 2);
  const region = /[A-H]/.test(c) ? "Africa" : /[J-R]/.test(c) ? "Asia" : /[S-Z]/.test(c) ? "Europe" : /[1-5]/.test(c) ? "North America" : /[6-7]/.test(c) ? "Oceania" : /[8-9]/.test(c) ? "South America" : "unknown";
  const between = (a: string, b: string) => two >= a && two <= b;
  let country: string | null = null;
  if (c === "1" || c === "4" || c === "5") country = "United States";
  else if (c === "2") country = "Canada";
  else if (c === "3") country = "Mexico";
  else if (c === "J") country = "Japan";
  else if (c === "L") country = "China";
  else if (c === "W") country = "Germany";
  else if (between("MA", "ME")) country = "India";
  else if (between("KL", "KR")) country = "South Korea";
  else if (between("SA", "SM")) country = "United Kingdom";
  else if (between("ZA", "ZR")) country = "Italy";
  else if (between("VF", "VR")) country = "France";
  else if (between("VS", "VW")) country = "Spain";
  else if (between("6A", "6W")) country = "Australia";
  return { region, country };
}

/** Returns the years a position-10 code may stand for: one in each 30-year cycle (null for a letter or digit that is never a year code). */
export function yearsFor(code: string): number[] | null {
  const i = YEAR_CODES.indexOf(code);
  return i < 0 ? null : [1980 + i, 2010 + i];
}

/** I take the year it most likely is to be the latest of the two that is not later than next year; `other` is the one 30 years earlier (or later). */
export function modelYear(code: string, nowYear: number): { year: number; other: number } | null {
  const y = yearsFor(code);
  if (!y) return null;
  const [a, b] = y;
  return b <= nowYear + 1 ? { year: b, other: a } : { year: a, other: b };
}

const valueOf = (ch: string): number => (/\d/.test(ch) ? Number(ch) : TRANSLIT[ch]);

export interface CheckStep {
  pos: number;
  ch: string;
  value: number;
  weight: number;
  product: number;
}
/** Works out the check-digit sum of a 17-character VIN step by step; position 9 has weight 0 because it is the digit being checked. */
export function checkSteps(vin: string): { steps: CheckStep[]; sum: number; remainder: number; digit: string } {
  const steps = Array.from(vin).map((ch, i) => ({ pos: i + 1, ch, value: valueOf(ch), weight: WEIGHTS[i], product: valueOf(ch) * WEIGHTS[i] }));
  const sum = steps.reduce((s, x) => s + x.product, 0);
  const remainder = sum % 11;
  return { steps, sum, remainder, digit: remainder === 10 ? "X" : String(remainder) };
}

export interface Typed {
  /** Set when a word such as "vin" or "chassis number" came before the number. */
  prefixed: boolean;
  /** The characters, upper case, without spaces and hyphens, up to any "*". */
  core: string;
  /** What followed a "*" (Hyundai's month letter), upper case. */
  suffix: string;
}

const PREFIX_RE = /^(?:(?:what\s+is|decode|read|check|explain|show|find)\s+)?(?:(?:the|my|this|a)\s+)?(?:(?:vin|chassis|vehicle\s+identification)(?:\s+(?:number|no\.?|num|code|decoder))*)\s*[:=#-]?\s*/i;

/** Splits what was typed into the number and its extension. */
export function splitVin(raw: string): Typed {
  let q = (raw || "").trim();
  const m = PREFIX_RE.exec(q);
  const prefixed = !!m && m[0].trim().length > 0;
  if (m) q = q.slice(m[0].length);
  const star = q.indexOf("*");
  const core = (star >= 0 ? q.slice(0, star) : q).toUpperCase().replace(/[\s.-]+/g, "");
  const suffix = star >= 0 ? q.slice(star + 1).toUpperCase().replace(/\s+/g, "") : "";
  return { prefixed, core, suffix };
}

/** Decides whether this line is a VIN that I should read as the person types. I am strict when no word like "vin" is in front: 17 valid characters, letters and digits, and a possible year code at position 10. */
export function looksLikeVin(raw: string): boolean {
  if ((raw || "").length > 60) return false;
  const t = splitVin(raw);
  if (t.prefixed) return t.core.length >= 6;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(t.core) && /[A-Z]/.test(t.core) && /\d/.test(t.core) && t.core[0] !== "0" && YEAR_CODES.includes(t.core[9]) && /^[A-Z0-9]{0,3}$/.test(t.suffix);
}

export interface VinPart {
  id: "country" | "maker" | "descriptor" | "check" | "year" | "plant" | "serial" | "month";
  /** 1-based positions */
  from: number;
  to: number;
  text: string;
  meaning: string;
  detail: string;
}

export interface VinCheck {
  /** What position 9 holds and what the sum says it would be. */
  found: string;
  calculated: string;
  matches: boolean;
  /** The state of position 9. "valid": a check digit that matches; "mismatch": a digit or X that does not match; "none": a letter, so no check digit. */
  state: "valid" | "mismatch" | "none";
}

/** One line of the answer to the question users bring to a VIN: is the manufacturing YEAR (or MONTH) in this number? `state` is said in bold on the card, YES or NO. */
export interface DateLine { state: "yes" | "no"; head: string; detail: string }

export interface VinReading {
  ok: true;
  /** Is the manufacturing year, and the month, in this number: both answered plainly, YES or NO, for every number read */
  made: { year: DateLine; month: DateLine };
  /** the maker's remark (its new cars are no longer sold in India), or null */
  remark: string | null;
  vin: string;
  parts: VinPart[];
  facts: Array<{ label: string; value: string }>;
  check: VinCheck;
  year: { year: number; other: number } | null;
  wmi: { maker: string; country: string } | null;
  notes: string[];
  /** Worries that do not stop me from reading the number (a position-10 code that is never a year). */
  warnings: string[];
}
export interface VinProblem {
  ok: false;
  typed: string;
  issues: string[];
}

/** Reads what each part of a VIN means, and what follows from it. `nowYear` fixes "next year" for the tests. */
export function readVin(raw: string, nowYear: number = DateTime.now().year): VinReading | VinProblem {
  const t = splitVin(raw);
  const typed = t.core + (t.suffix ? `*${t.suffix}` : "");
  const issues: string[] = [];
  const odd = Array.from(t.core).filter((c) => !VIN_CHAR.test(c));
  const ioq = odd.filter((c) => /[IOQ]/.test(c));
  const other = odd.filter((c) => !/[IOQ]/.test(c));
  if (t.core.length !== 17) {
    issues.push(t.core.length === 0 ? "Type the 17 characters of the VIN." : `A VIN has exactly 17 characters; ${t.core.length} were typed${t.core.length === 11 ? " (VINs before 1981 had 11 characters, and no standard)" : ""}.`);
  }
  if (ioq.length) issues.push(`${[...new Set(ioq)].join(", ")} ${new Set(ioq).size === 1 ? "is" : "are"} never used in a VIN, so that nothing is mistaken for 1 or 0: ${[...new Set(ioq)].map((c) => (c === "I" ? "I is probably the digit 1" : `${c} is probably the digit 0`)).join("; ")}.`);
  if (other.length) issues.push(`${[...new Set(other)].map((c) => `"${c}"`).join(", ")} cannot be in a VIN: only the digits 0-9 and the letters A-Z (except I, O and Q) are used.`);
  if (issues.length) return { ok: false, typed, issues };

  const vin = t.core;
  const { region, country: rangeCountry } = regionOf(vin);
  const wmiCode = vin.slice(0, 3);
  const wmi = WMIS[wmiCode] ?? null;
  // The first two characters name the country only for a range I know (MA to ME is India); Kia India's code MZB lies outside that range, so for a code that is in my list I take the country from the list.
  const country = rangeCountry ?? wmi?.country ?? null;
  const warnings: string[] = [];

  const parts: VinPart[] = [];
  parts.push({
    id: "country", from: 1, to: 1, text: vin[0], meaning: "Country or region",
    detail: wmi?.scope === "international" ? `${vin[0]}: the first character names where the manufacturer is based (${region}); ${wmiCode} is ${wmi.maker.replace(/ \(.*\)$/, "")}'s INTERNATIONAL code, so it names ${country}, the maker's country, and NOT where this car was built: a car assembled in India, an import or a car built elsewhere may carry it` : rangeCountry ? `${vin[0]}: the first character names where the manufacturer is based; with the second character (${vin.slice(0, 2)}) it is ${rangeCountry} (${region})` : country ? `${vin[0]}: the first character names where the manufacturer is based (${region}); the whole code ${wmiCode} is in this reader's list for ${wmi?.maker}, a code issued for India, so the country is ${country}` : `${vin[0]}: the first character names where the manufacturer is based: ${region}${region === "unknown" ? "" : ` (the first two characters, ${vin.slice(0, 2)}, do not name the country in this reader's list)`}`,
  });
  parts.push({
    id: "maker", from: 2, to: 3, text: vin.slice(1, 3), meaning: "Manufacturer",
    detail: wmi ? `with the first character they make the World Manufacturer Identifier ${wmiCode}: ${wmi.maker} (${wmi.country})` : `with the first character they make the World Manufacturer Identifier ${wmiCode}. This reader does not have that code in its list; SAE International assigns the codes, and the vehicle's papers name the maker`,
  });
  parts.push({
    id: "descriptor", from: 4, to: 8, text: vin.slice(3, 8), meaning: "Vehicle descriptor",
    detail: "the maker's own description of the vehicle: model line, body style, engine, restraint system. Every maker has its own code here, so only the maker (or its parts catalogue) can say what these five characters stand for",
  });

  // position 9: the check digit
  const calc = checkSteps(vin).digit;
  const c9 = vin[8];
  const isDigit = /^[0-9X]$/.test(c9);
  const check: VinCheck = { found: c9, calculated: calc, matches: isDigit && c9 === calc, state: !isDigit ? "none" : c9 === calc ? "valid" : "mismatch" };
  const northAmerica = /[1-5]/.test(vin[0]);
  parts.push({
    id: "check", from: 9, to: 9, text: c9, meaning: "Check digit",
    detail: check.state === "valid"
      ? `${c9}: a check digit, and it is right: the weighted sum of the other 16 characters, taken modulo 11, gives ${calc}. A single wrong character would make it disagree`
      : check.state === "mismatch"
        ? northAmerica
          ? `${c9}: in North America this must equal ${calc}, the result of the weighted sum of the other 16 characters modulo 11. It does not, so a character was mistyped (or the number is not genuine)`
          : `${c9}: a digit, but the weighted sum of the other 16 characters, modulo 11, gives ${calc}. Outside North America the position is optional, so this is not an error by itself`
        : `${c9}: a letter, so this is not a check digit (a check digit is 0 to 9 or X, required in North America). Makers in India and Europe use position 9 for their own code`,
  });

  // position 10: the year
  const year = modelYear(vin[9], nowYear);
  if (!year) warnings.push(`${vin[9]} is never a year code (the codes are the letters A-Y without I, O, Q, U and Z, and the digits 1-9).`);
  parts.push({
    id: "year", from: 10, to: 10, text: vin[9], meaning: "Model year",
    detail: year ? `${vin[9]} stands for ${year.year} (the code repeats every 30 years, so it could also be ${year.other}; a vehicle's look and papers settle which)` : `${vin[9]} is not a year code`,
  });

  // position 11: the plant
  const plant = PLANTS[wmiCode]?.[vin[10]];
  parts.push({
    id: "plant", from: 11, to: 11, text: vin[10], meaning: "Assembly plant",
    detail: plant ? `${vin[10]}: ${plant}` : `${vin[10]}: the plant that assembled the vehicle. Each maker has its own plant codes${wmi ? `; this reader does not have ${wmi.maker}'s code for ${vin[10]}` : ""}`,
  });

  parts.push({
    id: "serial", from: 12, to: 17, text: vin.slice(11), meaning: "Serial number",
    detail: `${vin.slice(11)}: the number of this vehicle in its maker's production, the part that tells two otherwise identical vehicles apart`,
  });

  // Here I read Hyundai's stamped extension: *L
  const notes: string[] = [];
  if (t.suffix) {
    if (wmiCode === "MAL" && /^[A-HJ-M]$/.test(t.suffix)) {
      parts.push({
        id: "month", from: 18, to: 19, text: `*${t.suffix}`, meaning: "Month (chassis plate)",
        detail: `Hyundai stamps the month of manufacture after the VIN: ${t.suffix} is ${MONTH_CODES[t.suffix]} (A January ... H August, J September, K October, L November, M December; there is no I). The full stamped chassis number is therefore 19 characters, the VIN being the first 17. This is how Indian car guides and owners describe the plate; I found no Hyundai Motor India document that publishes it, so an authorised dealer can confirm a month`,
      });
    } else {
      notes.push(`"*${t.suffix}" after the VIN is an extension some makers stamp on the chassis plate; this reader decodes it only for Hyundai (month letter), so it says nothing about it here.`);
    }
  }

  const facts = [
    { label: "Length", value: "17 characters" },
    { label: "Region", value: country ? `${country} · ${region}` : region },
    ...(wmi?.scope === "international" ? [{ label: "Code", value: "the maker's international code, not India's" }] : []),
    { label: "Model year", value: year ? `${year.year} (or ${year.other})` : "not a year code" },
    { label: "Check digit", value: check.state === "valid" ? `${c9} · correct` : check.state === "mismatch" ? `${c9} · calculated ${calc}` : "not used (a letter)" },
  ];
  const makerNote = MAKERS.find((m) => m.wmi === wmiCode || m.alsoWmi?.includes(wmiCode))?.note;
  if (makerNote) notes.unshift(makerNote);
  notes.push("A VIN identifies one vehicle: this reader explains the code and does not look the vehicle up. The registration certificate, the invoice and the manufacturer are the authority for anything the maker codes for itself.");
  if (!year) notes.unshift("The tenth character should be the model year.");
  // THE QUESTION USERS COME WITH: is the manufacturing month and year in this number? Always answered, YES or NO, in bold on the card, and only from what a source says: the standard puts the MODEL year at position 10 and has no month field; Hyundai's plate suffix is the one month this reader reads.
  const yearLine: DateLine = year
    ? { state: "yes", head: `YEAR: in the number, position 10 is ${vin[9]} = ${year.year} (or ${year.other})`, detail: "The standard puts the model year at position 10. It is the maker's own designation of the model year, so it can differ from the calendar year the vehicle was built; the code repeats every 30 years, so the vehicle's look and papers settle which. For the exact date read the manufacturer's plate and the registration certificate." }
    : { state: "no", head: `YEAR: not in this number, position 10 (${vin[9]}) is not a year code`, detail: "Position 10 should hold the model-year code; this character is never one, so no year can be read from it. The manufacturer's plate and the registration certificate give the real date." };
  const maker = wmi?.maker.replace(/ \(.*\)$/, "") ?? "this maker";
  const monthLine: DateLine = wmiCode === "MAL" && t.suffix && /^[A-HJ-M]$/.test(t.suffix)
    ? { state: "yes", head: `MONTH: on the plate, *${t.suffix} is ${MONTH_CODES[t.suffix]}`, detail: "Not in the 17 characters: Hyundai stamps the month after the VIN on the chassis plate (a star and a letter). This is how Indian car guides and owners describe the plate; I found no Hyundai document that says it. The registration certificate gives the month printed." }
    : wmiCode === "MAL"
      ? { state: "no", head: "MONTH: not in these 17 characters", detail: "Hyundai's chassis plate may carry the month after the VIN as a star and a letter (…*L); type the stamp after the VIN to read it. The registration certificate gives the month printed." }
      : { state: "no", head: "MONTH: not in this number", detail: `The standard has no month field, and I found no document of ${maker} that puts a month in its VIN (positions 4 to 8, 11 and 12 to 17 are the maker's own and are not decoded). Dealer guides that read a month at some position disagree with one another, so none is used. The manufacturer's plate and the registration certificate (which prints the month and year of manufacture) give the date.` };
  const remark = MAKERS.find((m) => m.wmi === wmiCode || m.alsoWmi?.includes(wmiCode))?.remark ?? null;
  return { ok: true, vin, made: { year: yearLine, month: monthLine }, remark, parts, facts, check, year, wmi, notes, warnings };
}

/** The samples of the buttons: one made-up number for each maker (none is a real vehicle's). */
export const VIN_SAMPLES: Array<{ vin: string; label: string }> = MAKERS.map((m) => ({ vin: m.sample, label: m.button }));
