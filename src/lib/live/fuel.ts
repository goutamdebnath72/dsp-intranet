// src/lib/live/fuel.ts
//
// PETROL (E20), DIESEL AND LPG IN THE FOUR METROS: Delhi, Mumbai, Chennai, Kolkata. The prices are those the oil marketing companies publish, as compiled daily on GoodReturns' pages
// (one page for petrol, one for diesel, one for LPG per city). Read from the flat text of the page (src/lib/live/text.ts), each table by its heading.
//
// SELF-CHECK, so that a changed page is a loud error and never a wrong number: every city must be found in every table, every price must be a plausible one (petrol and diesel 60 to 200 rupees a
// litre, LPG within its range per cylinder size), and the 14.2 kg cylinder must cost more than the 5 kg one. A failure throws, and the card says the figures cannot be shown.
import { amount } from "./text";

export const CITIES = ["Delhi", "Mumbai", "Chennai", "Kolkata"] as const;
export type City = (typeof CITIES)[number];

/** the name the source uses for each city in its tables, and in the address of its LPG page */
export const SOURCE_NAME: Record<City, string> = { Delhi: "New Delhi", Mumbai: "Mumbai", Chennai: "Chennai", Kolkata: "Kolkata" };
export const LPG_SLUG: Record<City, string> = { Delhi: "new-delhi", Mumbai: "mumbai", Chennai: "chennai", Kolkata: "kolkata" };

export interface Price {
  price: number;
  /** today's change, as the source gives it (0 when unchanged) */
  change: number;
}

export interface Lpg {
  /** domestic 14.2 kg: the market (unsubsidised) price every household pays */
  dom14: Price;
  dom5: Price;
  com19: Price;
  com47: Price;
}

export interface CityFuel {
  city: City;
  petrol: Price;
  diesel: Price;
  lpg: Lpg;
}

export class FuelPageError extends Error {}

/** the rows "City| ₹102.12 | 0.00 |" under a heading such as "Petrol Price in Indian Metro Cities & State Capitals| City| Price| Price Change|" */
export function parseMetroTable(text: string, kind: "Petrol" | "Diesel"): Record<City, Price> {
  const head = `${kind} Price in Indian Metro Cities`;
  const at = text.indexOf(head);
  if (at < 0) throw new FuelPageError(`The ${kind.toLowerCase()} table was not found on the page.`);
  const section = text.slice(at, at + 1600);
  const out = {} as Record<City, Price>;
  for (const city of CITIES) {
    const m = new RegExp(`\\|\\s*${SOURCE_NAME[city]}\\|\\s*([^|]*)\\|\\s*([^|]*)\\|`).exec(section);
    const price = amount(m?.[1]), change = amount(m?.[2]);
    if (!m || price === null || change === null) throw new FuelPageError(`${city} is missing from the ${kind.toLowerCase()} table.`);
    if (price < 60 || price > 200) throw new FuelPageError(`The ${kind.toLowerCase()} price of ${city} (${price}) is not a plausible figure.`);
    out[city] = { price, change };
  }
  return out;
}

const LPG_ROWS: Array<[keyof Lpg, string, [number, number]]> = [
  ["dom14", "Domestic \\(14\\.2 Kg\\)", [500, 2500]],
  ["com19", "Commercial \\(19 Kg\\)", [1000, 6000]],
  ["dom5", "Domestic \\(5 Kg\\)", [200, 900]],
  ["com47", "Commercial \\(47\\.5 Kg\\)", [3000, 15000]],
];

/** the "Today" table of a city's LPG page: "Domestic (14.2 Kg)| ₹942.00| 0.00 |" and the three other cylinders */
export function parseLpgCity(text: string, city: City): Lpg {
  const head = `LPG Price in ${SOURCE_NAME[city]} Today| Type| Price| Price Change|`;
  const at = text.indexOf(head);
  if (at < 0) throw new FuelPageError(`The LPG table of ${city} was not found on the page.`);
  const section = text.slice(at, at + 700);
  const out = {} as Lpg;
  for (const [key, label, [lo, hi]] of LPG_ROWS) {
    const m = new RegExp(`${label}\\|\\s*([^|]*)\\|\\s*([^|]*)\\|`).exec(section);
    const price = amount(m?.[1]), change = amount(m?.[2]);
    if (!m || price === null || change === null) throw new FuelPageError(`The ${label.replace(/\\/g, "")} price of ${city} is missing.`);
    if (price < lo || price > hi) throw new FuelPageError(`The LPG price of ${city} (${price}) is not a plausible figure for its size.`);
    out[key] = { price, change };
  }
  if (out.dom14.price <= out.dom5.price || out.com47.price <= out.com19.price) throw new FuelPageError(`The LPG prices of ${city} are not in the order of the cylinder sizes.`);
  return out;
}

export function assemble(petrolText: string, dieselText: string, lpgTexts: Record<City, string>): CityFuel[] {
  const petrol = parseMetroTable(petrolText, "Petrol");
  const diesel = parseMetroTable(dieselText, "Diesel");
  return CITIES.map((city) => ({ city, petrol: petrol[city], diesel: diesel[city], lpg: parseLpgCity(lpgTexts[city], city) }));
}
