// src/tools/vin/vin.ts
//
// HOW TO READ A VEHICLE IDENTIFICATION NUMBER (VIN): "MALBM51BLKM000001" -> world manufacturer MAL (Hyundai Motor India), the maker's own descriptor BM51B, position 9 L (not a check digit: Indian makers use it
// for their own code), model year K (2019), plant M, serial 000001. Pure; nothing is stored or sent anywhere.
//
// The structure is ISO 3779 (the 17 characters) and ISO 3780 (the World Manufacturer Identifier, which SAE International assigns); the letters I, O and Q are never used, so that nothing is mistaken for 1 or 0.
// Positions 1-3 are the WMI, 4-9 the Vehicle Descriptor Section (VDS), 10-17 the Vehicle Indicator Section (VIS). The check digit of position 9 (a weighted sum modulo 11) is required in North America and
// is NOT used by Indian makers. What a maker puts in positions 4-8, the plant letter and the month is the maker's own business: this reader says what the standard fixes, names the manufacturer and
// plant only where it is sure, and says plainly when a part is the maker's own code. The vehicle's papers (registration certificate, invoice) and the maker are the authority.
//
// Indian chassis plates: Hyundai stamps the VIN followed by "*" and a letter for the month of manufacture (MALBM51BLKM000001*L: L = November); that suffix is read here and nothing else is guessed.

import { DateTime } from "luxon";

/** the characters of a VIN: digits and capital letters except I, O and Q */
export const VIN_CHAR = /^[A-HJ-NPR-Z0-9]$/;
/** the year codes of position 10 in order: A = 1980 (and 2010), ... Y = 2000 (2030), 1 = 2001 (2031) ... 9 = 2009 (2039); I, O, Q, U, Z and 0 are never year codes */
export const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";
/** the month letters Hyundai stamps after the VIN (I is skipped) */
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

/** Manufacturers by WMI. Indian ones (MA-ME) first. Only codes that are well established are listed; anything else is said to be unknown, never guessed. */
export const WMIS: Record<string, { maker: string; country: string }> = {
  MAL: { maker: "Hyundai Motor India", country: "India" },
  MA3: { maker: "Maruti Suzuki", country: "India" },
  MBH: { maker: "Maruti Suzuki", country: "India" },
  MAT: { maker: "Tata Motors", country: "India" },
  MA1: { maker: "Mahindra & Mahindra", country: "India" },
  MAB: { maker: "Mahindra & Mahindra", country: "India" },
  MAC: { maker: "Mahindra & Mahindra", country: "India" },
  MAJ: { maker: "Ford India", country: "India" },
  MAK: { maker: "Honda Cars India", country: "India" },
  MA6: { maker: "General Motors India (Chevrolet)", country: "India" },
  MCB: { maker: "General Motors India (Chevrolet)", country: "India" },
  MBJ: { maker: "Toyota Kirloskar Motor", country: "India" },
  MBR: { maker: "Mercedes-Benz India", country: "India" },
  MB1: { maker: "Ashok Leyland", country: "India" },
  MCA: { maker: "Fiat India", country: "India" },
  MC2: { maker: "Volvo Eicher Commercial Vehicles", country: "India" },
  MDH: { maker: "Nissan Motor India", country: "India" },
  MD2: { maker: "Bajaj Auto", country: "India" },
  MEE: { maker: "Renault India", country: "India" },
  KMH: { maker: "Hyundai Motor Company", country: "South Korea" },
  KNA: { maker: "Kia", country: "South Korea" },
  JHM: { maker: "Honda", country: "Japan" },
  "1HG": { maker: "Honda", country: "United States" },
  "5YJ": { maker: "Tesla", country: "United States" },
  WVW: { maker: "Volkswagen", country: "Germany" },
  WBA: { maker: "BMW", country: "Germany" },
  WDD: { maker: "Mercedes-Benz", country: "Germany" },
  TMB: { maker: "Škoda", country: "Czech Republic" },
};

/** the plant letter of position 11 is the maker's own; only this one is known with certainty (Hyundai Motor India had a single plant in India, at Sriperumbudur near Chennai, until recent years) */
const PLANTS: Record<string, Record<string, string>> = { MAL: { M: "Hyundai Motor India's plant at Sriperumbudur, near Chennai" } };

/** the region (first character) and, where the first two characters fix it, the country */
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

/** the years a position-10 code may stand for: one in each 30-year cycle (null for a letter or digit that is never a year code) */
export function yearsFor(code: string): number[] | null {
  const i = YEAR_CODES.indexOf(code);
  return i < 0 ? null : [1980 + i, 2010 + i];
}

/** the year it most likely is: the latest of the two that is not later than next year; `other` is the one 30 years earlier (or later) */
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
/** the check-digit sum of a 17-character VIN step by step (position 9 has weight 0: it is the digit being checked) */
export function checkSteps(vin: string): { steps: CheckStep[]; sum: number; remainder: number; digit: string } {
  const steps = Array.from(vin).map((ch, i) => ({ pos: i + 1, ch, value: valueOf(ch), weight: WEIGHTS[i], product: valueOf(ch) * WEIGHTS[i] }));
  const sum = steps.reduce((s, x) => s + x.product, 0);
  const remainder = sum % 11;
  return { steps, sum, remainder, digit: remainder === 10 ? "X" : String(remainder) };
}

export interface Typed {
  /** a word such as "vin" or "chassis number" came before the number */
  prefixed: boolean;
  /** the characters, upper case, without spaces and hyphens, up to any "*" */
  core: string;
  /** what followed a "*" (Hyundai's month letter), upper case */
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

/** Is this line a VIN, so that it should be read as the person types? Strict without a word like "vin" in front (17 valid characters, letters and digits, a possible year code at position 10). */
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
  /** what position 9 holds and what the sum says it would be */
  found: string;
  calculated: string;
  matches: boolean;
  /** "valid": a check digit that matches; "mismatch": a digit or X that does not match; "none": a letter, so no check digit */
  state: "valid" | "mismatch" | "none";
}

export interface VinReading {
  ok: true;
  vin: string;
  parts: VinPart[];
  facts: Array<{ label: string; value: string }>;
  check: VinCheck;
  year: { year: number; other: number } | null;
  wmi: { maker: string; country: string } | null;
  notes: string[];
  /** worries that do not stop the reading (a position-10 code that is never a year) */
  warnings: string[];
}
export interface VinProblem {
  ok: false;
  typed: string;
  issues: string[];
}

/** What each part of a VIN means, and what follows from it. `nowYear` fixes "next year" for the tests. */
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
  const { region, country } = regionOf(vin);
  const wmiCode = vin.slice(0, 3);
  const wmi = WMIS[wmiCode] ?? null;
  const warnings: string[] = [];

  const parts: VinPart[] = [];
  parts.push({
    id: "country", from: 1, to: 1, text: vin[0], meaning: "Country or region",
    detail: country ? `${vin[0]}: the first character names where the manufacturer is based; with the second character (${vin.slice(0, 2)}) it is ${country} (${region})` : `${vin[0]}: the first character names where the manufacturer is based: ${region}${region === "unknown" ? "" : ` (the first two characters, ${vin.slice(0, 2)}, do not name the country in this reader's list)`}`,
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

  // Hyundai's stamped extension: *L
  const notes: string[] = [];
  if (t.suffix) {
    if (wmiCode === "MAL" && /^[A-HJ-M]$/.test(t.suffix)) {
      parts.push({
        id: "month", from: 18, to: 19, text: `*${t.suffix}`, meaning: "Month (chassis plate)",
        detail: `Hyundai stamps the month of manufacture after the VIN: ${t.suffix} is ${MONTH_CODES[t.suffix]} (A January ... H August, J September, K October, L November, M December; there is no I). The full stamped chassis number is therefore 19 characters, the VIN being the first 17`,
      });
    } else {
      notes.push(`"*${t.suffix}" after the VIN is an extension some makers stamp on the chassis plate; this reader decodes it only for Hyundai (month letter), so it says nothing about it here.`);
    }
  }

  const facts = [
    { label: "Length", value: "17 characters" },
    { label: "Region", value: country ? `${country} · ${region}` : region },
    { label: "Model year", value: year ? `${year.year} (or ${year.other})` : "not a year code" },
    { label: "Check digit", value: check.state === "valid" ? `${c9} · correct` : check.state === "mismatch" ? `${c9} · calculated ${calc}` : "not used (a letter)" },
  ];
  notes.push("A VIN identifies one vehicle: this reader explains the code and does not look the vehicle up. The registration certificate, the invoice and the manufacturer are the authority for anything the maker codes for itself.");
  if (!year) notes.unshift("The tenth character should be the model year.");
  return { ok: true, vin, parts, facts, check, year, wmi, notes, warnings };
}

/** made-up numbers that show the readings; none is a real vehicle's */
export const VIN_SAMPLES: Array<{ vin: string; label: string }> = [
  { vin: "MALBM51BLKM000001", label: "Hyundai, India" },
  { vin: "1HGBH41JXMN109186", label: "Honda, USA" },
  { vin: "5YJSA1DG9DFP14705", label: "Tesla, USA" },
  { vin: "1M8GDM9AXKP042788", label: "check digit X" },
];
