// src/tools/ev/tariff.ts
//
// What a charge costs (23 Nov 2026), from the OFFICIAL rules and nothing else; every figure here was read from the document named beside it. Pure; nothing is stored or sent.
//
// A PUBLIC CHARGER'S PRICE per unit (kWh) is, by the Ministry of Power's guidelines (clause 8 lists the parts): the electricity tariff the station pays + a SERVICE CHARGE + land cost + GST. Here:
//   * the electricity tariff is West Bengal's: WBERC's order of 20 March 2025 for WBSEDCL, tariff year 2025-26, paragraph "Promotional tariff for Electric Vehicle Charging Stations": "Rs. 6.00 per unit during the
//     'peak' hours (17:00 hrs to 23:00 hrs) and Rs. 5.50 per unit during 'other than peak' hours shall continue". This is the NEWEST order the WBERC's own list shows (checked 22 Nov 2026: nothing for 2026-27);
//     a newer order changes these two numbers, and a person can type the rate they actually pay (ownRate below).
//   * the service charge is the CEILING of the Ministry of Power's Guidelines for Installation and Operation of Electric Vehicle Charging Infrastructure-2024 (17 September 2024), clause 10(1): AC (slow) Rs 3.00
//     in the solar hours (9:00 am to 4:00 pm) and Rs 4.00 in the non-solar hours (4:00 pm to 9:00 am); DC (fast) Rs 11.00 and Rs 13.00; "till 31st March, 2028"; "subject to annual review"; GST and land cost excluded.
//   So the figure I show is the HIGHEST a station may charge per unit before GST and land cost, not a price any one station promises. A station may charge less.
// At home: "Domestic electricity rates will apply to charging EVs at home" (the same guidelines, clause 15(4)). The domestic rate depends on the household's slab, so there is no single figure to show: the person types
// the rate on their own bill. The same box takes the price printed on a charger's display; whatever is typed replaces the standard figures.
// Units charged for: the energy drawn, which is the energy added to the battery divided by the efficiency of the charging (ev.ts: AC 90%, DC 95%).

import type { Charger } from "./ev";

export type Band = "day" | "evening" | "night";

export const TARIFF_YEAR = "2025-26";
export const SERVICE_VALID_TO = "31 March 2028";

/** The electricity tariff the station pays WBSEDCL, Rs per unit. */
export const SUPPLY_RATE = { peak: 6.0, other: 5.5 } as const;
/** The ceiling of the service charge, Rs per unit, excluding GST and land cost. */
export const SERVICE_CEILING = { AC: { solar: 3.0, nonSolar: 4.0 }, DC: { solar: 11.0, nonSolar: 13.0 } } as const;

export interface BandInfo {
  id: Band;
  /** the pill */
  label: string;
  /** In words, for the note. */
  hours: string;
  /** The electricity tariff of the time: the peak hours of WBSEDCL are 17:00 to 23:00. */
  supply: number;
  /** The service charge of the time: the solar hours are 9:00 to 16:00. */
  solar: boolean;
}

export const BANDS: BandInfo[] = [
  { id: "day", label: "Day · 9 am–4 pm", hours: "9 am to 4 pm (solar hours: the lower service charge)", supply: SUPPLY_RATE.other, solar: true },
  { id: "evening", label: "Evening · 5–11 pm", hours: "5 pm to 11 pm (WBSEDCL's peak hours: the higher electricity tariff)", supply: SUPPLY_RATE.peak, solar: false },
  { id: "night", label: "Night · 11 pm–9 am", hours: "11 pm to 9 am, and 4 pm to 5 pm", supply: SUPPLY_RATE.other, solar: false },
];

export interface UnitPrice { supply: number; service: number; total: number }

/** Returns the highest price per unit a public station may charge at that time, before GST and land cost. */
export function unitPrice(kind: "AC" | "DC", band: Band): UnitPrice {
  const b = BANDS.find((x) => x.id === band) ?? BANDS[0];
  const service = SERVICE_CEILING[kind][b.solar ? "solar" : "nonSolar"];
  return { supply: b.supply, service, total: b.supply + service };
}

export interface ChargeCost {
  /** Rs per unit used */
  rate: number;
  /** Rs for the whole charge */
  cost: number;
  /** "standard" is the ceiling of the rules; "own" is the rate the person typed. */
  basis: "standard" | "own";
  /** Only for the standard basis: the two parts of the rate. */
  supply?: number;
  service?: number;
}

/** A rate a person may type must be more than nothing and at most Rs 100 a unit (no charger in India asks more). Otherwise I ignore it and use the standard figures. */
export const usableOwnRate = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100 ? v : null);

/** What drawing `units` costs through a charger of this kind, at the standard ceiling of the time, or at the person's own rate. */
export function chargeCost(units: number, kind: Charger["kind"], opts: { band: Band; ownRate?: number }): ChargeCost {
  const own = usableOwnRate(opts.ownRate);
  if (own !== null) return { rate: own, cost: units * own, basis: "own" };
  const p = unitPrice(kind, opts.band);
  return { rate: p.total, cost: units * p.total, basis: "standard", supply: p.supply, service: p.service };
}

/** Gives "₹ 8.50" for a rate per unit. I always use two decimals, because 8.5 is read as 8 rupees 50 paise. */
export const ratePerUnit = (r: number): string => `₹ ${r.toFixed(2)}`;

/** The sources, in the words of the card. */
export const TARIFF_SOURCES: Array<{ what: string; source: string }> = [
  { what: "Electricity tariff for charging stations in West Bengal (WBSEDCL): ₹ 6.00 per unit in the peak hours 5 pm to 11 pm, ₹ 5.50 in the other hours", source: `West Bengal Electricity Regulatory Commission, tariff order dated 20 March 2025 (case TP-98/22-23), paragraph "Promotional tariff for Electric Vehicle Charging Stations", for ${TARIFF_YEAR}; the newest order on the Commission's list` },
  { what: "Service charge ceiling: AC (slow) ₹ 3.00 by day and ₹ 4.00 otherwise; DC (fast) ₹ 11.00 by day and ₹ 13.00 otherwise, per unit, before GST and land cost", source: `Ministry of Power, Government of India, Guidelines for Installation and Operation of Electric Vehicle Charging Infrastructure-2024, dated 17 September 2024, clause 10(1): applies till ${SERVICE_VALID_TO}, subject to annual review` },
  { what: "Charging at home: the household's domestic electricity rate applies", source: "the same guidelines, clause 15(4)" },
];
