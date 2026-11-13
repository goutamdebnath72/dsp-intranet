// src/tools/bh/bh.ts
//
// THE BHARAT (BH) SERIES: the vehicle registration mark that stays valid in every State and Union Territory. This file holds what can be computed: how to read a BH mark ("26 BH 1234 AA"),
// who is eligible, and the motor vehicle (road) tax. Pure; nothing typed is stored or sent anywhere.
//
// SOURCES (read in November 2026): the Central Motor Vehicles (Twentieth Amendment) Rules, 2021, G.S.R. 594(E) of 26 August 2021, in force from 15 September 2021 (draft: G.S.R. 276(E) of 6 April 2021),
// as reproduced with the Press Information Bureau release of 28 August 2021; the change of December 2022 that allowed an ordinary registration to be converted; and published guides of 2025-2026.
// The rules are quoted where they are exact. Where the sources differ or are silent the card says so; the Parivahan portal and the registering authority (the RTO) have the last word.
import { DateTime } from "luxon";

/** the day the BH series came into force */
export const BH_START = { year: 2021, day: "15 September 2021" };

/** the letters that may be used in the last part of the mark: A to Z without I and O (they look like 1 and 0) */
export const BH_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export interface BhPlate {
  /** the last two digits of the year, as typed ("26") */
  yy: string;
  /** the four digits ("1234") */
  number: string;
  /** one or two letters ("AA") */
  letters: string;
}

export interface BhPart {
  id: "year" | "series" | "number" | "letters";
  text: string;
  meaning: string;
  detail: string;
}

export interface BhReading {
  ok: true;
  plate: BhPlate;
  /** the mark as it is written on the plate: "26 BH 1234 AA" */
  shown: string;
  parts: BhPart[];
  facts: Array<{ label: string; value: string }>;
  warnings: string[];
  notes: string[];
}
export interface BhProblem { ok: false; typed: boolean; issues: string[] }

const PLATE_RE = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/;

/** The mark typed with spaces, hyphens or none ("26bh1234aa", "26-BH-1234-AA"), or null when it is not shaped like one. Letters I and O are let through so that they can be named. */
export function parseBhShape(raw: string): BhPlate | null {
  const q = (raw || "").toUpperCase().replace(/[\s\-.]+/g, "");
  const m = PLATE_RE.exec(q);
  return m ? { yy: m[1], number: m[2], letters: m[3] } : null;
}

/** true for a line that is a BH mark (used by the search line to open the reader at once) */
export const looksLikeBh = (raw: string): boolean => (raw || "").length <= 20 && parseBhShape(raw) !== null;

/** the place of a letter set in the order A to Z, then AA to ZZ (24 + 576 = 600 sets), or null when it uses I or O */
export function letterSetNumber(letters: string): { n: number; of: number } | null {
  const idx = (c: string) => BH_LETTERS.indexOf(c);
  if ([...letters].some((c) => idx(c) < 0)) return null;
  const k = BH_LETTERS.length;
  if (letters.length === 1) return { n: idx(letters) + 1, of: k + k * k };
  return { n: k + idx(letters[0]) * k + idx(letters[1]) + 1, of: k + k * k };
}

export const BH_SAMPLES: Array<{ label: string; text: string }> = [
  { label: "26 BH 1234 AA", text: "26 BH 1234 AA" },
  { label: "22 BH 0007 C", text: "22 BH 0007 C" },
  { label: "24 BH 9876 ZK", text: "24 BH 9876 ZK" },
];

/** Reads a BH mark part by part. `nowYear` fixes "this year" for the tests. */
export function readBh(raw: string, nowYear: number = DateTime.now().year): BhReading | BhProblem {
  const typed = (raw || "").trim() !== "";
  if (!typed) return { ok: false, typed: false, issues: [] };
  const p = parseBhShape(raw);
  if (!p) return { ok: false, typed: true, issues: ["A BH mark is two digits (the year), the letters BH, four digits and one or two letters, for example 26 BH 1234 AA."] };
  const bad = [...p.letters].filter((c) => !BH_LETTERS.includes(c));
  if (bad.length) {
    const named = [...new Set(bad)].map((c) => `${c} (it looks like the digit ${c === "I" ? "1" : "0"})`).join(" and ");
    return { ok: false, typed: true, issues: [`The letters of a BH mark never include I or O: ${named} is not allowed, so this has been mistyped. The letters used are A to Z without I and O.`] };
  }
  const year = 2000 + Number(p.yy);
  const warnings: string[] = [];
  const notes: string[] = [];
  if (year < BH_START.year) warnings.push(`The BH series began on ${BH_START.day}, so a mark with ${p.yy} for the year cannot be a BH mark.`);
  else if (year > nowYear) warnings.push(`${p.yy} would be the year ${year}, which has not come yet.`);
  if (p.number === "0000") notes.push("The rule gives the numbers as 0001 to 9999; one official note says 0000 to 9999. Check a 0000 mark against the registration certificate.");
  const set = letterSetNumber(p.letters)!;
  const parts: BhPart[] = [
    { id: "year", text: p.yy, meaning: "Year of registration", detail: `the last two digits of the year in which the mark was registered (the rule says "year of registration"): ${year}. It says when the mark was given, not the year in which the vehicle was made.` },
    { id: "series", text: "BH", meaning: "Bharat series", detail: "the code of the Bharat series. It replaces the State code (such as WB, JH or DL) and the RTO number of an ordinary mark, because the mark does not belong to one State." },
    { id: "number", text: p.number, meaning: "Number", detail: "four digits from 0001 to 9999, generated at random by the portal after the papers are checked. The owner cannot choose a number, so there are no fancy or VIP numbers in this series." },
    { id: "letters", text: p.letters, meaning: "Letters", detail: `one or two letters, taken in the order A to Z and then AA to ZZ, never using I or O. They are a counter that moves on as numbers are used up: ${p.letters} is set ${set.n} of the ${set.of} possible sets. They are not a code for the kind of vehicle, and the owner cannot choose them.` },
  ];
  const facts = [
    { label: "Registered in", value: String(year) },
    { label: "Valid in", value: "every State and UT" },
    { label: "Letter set", value: `${set.n} of ${set.of}` },
    { label: "Road tax", value: "every two years" },
  ];
  notes.push("The mark shows nothing about the owner, the State or the city. It does not show the kind of vehicle or its fuel either: those are on the registration certificate.");
  return { ok: true, plate: p, shown: `${p.yy} BH ${p.number} ${p.letters}`, parts, facts, warnings, notes };
}

/* --------------------------------- who is eligible --------------------------------- */

export interface BhGroup { id: string; label: string; eligible: boolean; proof: string; note: string }

/** The groups the Ministry named (press release of 28 August 2021). The registering authority verifies the proof. */
export const BH_GROUPS: BhGroup[] = [
  { id: "defence", label: "Defence personnel", eligible: true, proof: "the official identity card", note: "Defence personnel are named in the Ministry's list." },
  { id: "central", label: "Central Government employee", eligible: true, proof: "the official identity card", note: "Employees of the Central Government are named in the Ministry's list." },
  { id: "state", label: "State or Union Territory Government employee", eligible: true, proof: "the official identity card", note: "Employees of a State or UT Government are named in the Ministry's list." },
  { id: "cpsu", label: "Employee of a Central public sector undertaking (CPSU)", eligible: true, proof: "the official identity card", note: "Employees of Central public sector undertakings are named in the Ministry's list. A public sector steel company such as SAIL is one." },
  { id: "spsu", label: "Employee of a State public sector undertaking", eligible: true, proof: "the official identity card", note: "Employees of State public sector undertakings are named in the Ministry's list." },
  { id: "private4", label: "Private company or organisation with offices in four or more States/UTs", eligible: true, proof: "a working certificate in Form 60, signed and sealed by the employer", note: "The employer certifies that it has offices in four States/UTs or more. You need not have worked in all of them." },
  { id: "private3", label: "Private company or organisation with offices in fewer than four States/UTs", eligible: false, proof: "", note: "The condition is offices in four States/UTs or more, so a smaller organisation cannot give the certificate." },
  { id: "self", label: "Self-employed, a business owner, or a professional on their own", eligible: false, proof: "", note: "This group is not in the Ministry's list. The series is for people whose employer can move them from State to State." },
  { id: "retired", label: "Retired, or not in employment", eligible: false, proof: "", note: "This group is not in the Ministry's list; the proof is an employer's identity card or certificate." },
];

/* ------------------------------------ road tax ------------------------------------ */

export type BhFuel = "petrol" | "diesel" | "electric";
export const BH_FUELS: Array<{ id: BhFuel; label: string; adjust: number }> = [
  { id: "petrol", label: "Petrol, CNG or hybrid", adjust: 0 },
  { id: "diesel", label: "Diesel (2 points more)", adjust: 2 },
  { id: "electric", label: "Electric (2 points less)", adjust: -2 },
];

/** the three price bands of rule 51B: below Rs 10 lakh 8%, Rs 10-20 lakh 10%, above Rs 20 lakh 12% (invoice price without GST) */
export const BH_BANDS: Array<{ label: string; base: number }> = [
  { label: "below ₹10 lakh", base: 8 },
  { label: "₹10 lakh to ₹20 lakh", base: 10 },
  { label: "above ₹20 lakh", base: 12 },
];

const LAKH = 100000;

/** a number with Indian grouping (12,34,567), with up to two decimals only when it has them; no dependence on the machine's locale */
export function inGroups(n: number): string {
  const [whole, frac] = (Math.round(n * 100) / 100).toString().split(".");
  const g = whole.length > 3 ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${whole.slice(-3)}` : whole;
  return frac ? `${g}.${frac.padEnd(2, "0")}` : g;
}

export interface BhTax {
  band: number;
  /** the rate, in per cent of the invoice price, after the diesel or electric change */
  rate: number;
  /** the tax for two years, rounded up to the next rupee */
  twoYear: number;
  /** the tax for each year from the fourteenth year, half of the two-year tax, rounded up */
  annual: number;
  /** seven payments of two years make the first fourteen years */
  fourteenYears: number;
  /** the steps of the sum, in words */
  steps: string[];
}
export interface BhTaxProblem { error: string }

/** The two-year tax of rule 51B: invoice price (without GST) x rate x 1.25 x 2 / 15, rounded up to the next rupee. 1.25 x 2 / 15 is 1/6, so it is price x rate / 600.
 *  Done in whole paise so that no rounding of the computer can move the answer by a rupee. */
export function bhTax(price: number, fuel: BhFuel): BhTax | BhTaxProblem {
  if (!Number.isFinite(price) || price <= 0) return { error: "Type the invoice price of the vehicle, without GST, in rupees." };
  if (price > 1000 * LAKH * 100) return { error: "That price is more than ₹1,000 crore. Check the number." };
  const band = price < 10 * LAKH ? 0 : price <= 20 * LAKH ? 1 : 2;
  const adjust = BH_FUELS.find((f) => f.id === fuel)!.adjust;
  const rate = BH_BANDS[band].base + adjust;
  const paise = Math.round(price * 100);
  const twoYear = Math.floor((paise * rate + 60000 - 1) / 60000);
  const annual = Math.floor((paise * rate + 120000 - 1) / 120000);
  const rupee = (n: number) => `₹${inGroups(n)}`;
  const steps = [
    `Invoice price without GST: ${rupee(price)}, in the band "${BH_BANDS[band].label}", which is ${BH_BANDS[band].base}%${adjust ? `; ${adjust > 0 ? "diesel adds" : "electric takes off"} ${Math.abs(adjust)} points, so ${rate}%` : ""}.`,
    `Tax at that rate: ${rupee(price)} × ${rate}% = ${rupee(Math.round(price * rate) / 100)}.`,
    `The surcharge of 25% is added (× 1.25), and the sum is spread over 15 years and taken for 2 of them (× 2 ÷ 15): × 1.25 × 2 ÷ 15 is the same as ÷ 6.`,
    `Rounded up to the next rupee, the tax for two years is ${rupee(twoYear)}.`,
  ];
  return { band, rate, twoYear, annual, fourteenYears: twoYear * 7, steps };
}
