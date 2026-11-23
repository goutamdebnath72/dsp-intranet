// src/tools/converter/converterModel.ts
//
// The sums behind the converter card, which is laid out like Google's: a kind (Power), a value and unit on the left, the result and unit on the right, and a formula line under them.
// I keep it pure: it picks units from the tables of units.ts and currency.ts and does the arithmetic. Nothing is stored or sent anywhere.
import { UNITS, TEMPERATURES, type UnitKind } from "./units";
import { CURRENCIES, convertCurrency, currencyOf, type Rates } from "./currency";

export type ConvKind = UnitKind | "currency" | "engine" | "colour";

export const CONV_KINDS: ConvKind[] = ["length", "area", "volume", "mass", "temperature", "angle", "energy", "force", "power", "engine", "pressure", "speed", "time", "colour", "currency"];

export const KIND_NAMES: Record<ConvKind, string> = {
  length: "Length", area: "Area", volume: "Volume", mass: "Mass", temperature: "Temperature", angle: "Angle", energy: "Energy",
  force: "Force", power: "Power", engine: "Engine power (PS · bhp · kW)", pressure: "Pressure", speed: "Speed", time: "Time", colour: "Colour (RGB · HEX · HSL)", currency: "Currency",
};

export interface UnitOption {
  id: string;
  label: string;
}

const capital = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Returns the units of a kind, as the two dropdowns list them ("Mechanical horsepower", "Metric horsepower (PS)", "US dollar (USD)"). */
export function optionsFor(kind: ConvKind): UnitOption[] {
  if (kind === "colour") return []; // A colour is three numbers and a HEX, not a unit and a factor, so I gave it its own panel (ColourPanel.tsx)
  if (kind === "engine") return ENGINE_UNITS.map((e) => ({ id: e.id, label: `${e.short} · ${e.name}` }));
  if (kind === "temperature") return TEMPERATURES.map((t) => ({ id: t.id, label: t.id === "K" ? "Kelvin" : t.id === "C" ? "Celsius (°C)" : "Fahrenheit (°F)" }));
  if (kind === "currency") return CURRENCIES.map((c) => ({ id: c.code, label: `${capital(c.name)} (${c.code})` }));
  return UNITS.filter((u) => u.kind === kind).map((u) => ({ id: u.id, label: capital(u.label) }));
}

/** The pair a kind opens with: Google's is metre to foot, mine is the most useful for the plant. */
const DEFAULT_PAIRS: Partial<Record<ConvKind, [string, string]>> = { currency: ["USD", "INR"], colour: ["rgb", "hex"], power: ["hp", "kW"], engine: ["hp", "ps"], temperature: ["C", "F"] };
export function defaultPair(kind: ConvKind): [string, string] {
  const d = DEFAULT_PAIRS[kind];
  if (d) return d;
  const o = optionsFor(kind);
  return [o[0].id, (o[1] ?? o[0]).id];
}

/** I write a number for an input box with up to `sig` significant digits (Google shows six), no grouping and no trailing zeros ("1.01387", "0.621371"). */
export function plainNumber(x: number, sig = 8): string {
  if (!Number.isFinite(x)) return "";
  if (x === 0) return "0";
  const t = Number(x.toPrecision(sig));
  const a = Math.abs(t);
  if (a >= 1e-6 && a < 1e15) return t.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });
  return String(t);
}

/** The result box shows six significant digits like Google; I show money to the paisa (or four digits when below one). */
export function boxNumber(kind: ConvKind, x: number): string {
  if (kind === "currency") return Math.abs(x) >= 1 ? plainNumber(Math.round(x * 100) / 100, 15) : plainNumber(x, 4);
  return plainNumber(x, 6);
}

const four = (x: number): string => plainNumber(Number(x.toPrecision(5)));

export interface Computed {
  result: number;
  /** I put this line under the boxes: "For an approximate result, multiply the power value by 1.0139" */
  formula: string;
  /** Notes I add when a unit word has more than one meaning, or to give the rates' date */
  notes: string[];
}

/** Returns `value` of `fromId` expressed in `toId`; I return null when a unit is unknown or, for currency, the rate is missing. */
export function compute(kind: ConvKind, value: number, fromId: string, toId: string, rates: Rates | null): Computed | null {
  if (!Number.isFinite(value) || kind === "colour") return null;
  if (kind === "currency") {
    const a = currencyOf(fromId), b = currencyOf(toId);
    if (!a || !b || !rates) return null;
    const r = convertCurrency({ amount: value, from: a, to: b }, rates);
    if (!r) return null;
    return {
      result: r.result,
      formula: `1 ${a.code} = ${r.rate.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${b.code}`,
      notes: [`Reference rate of ${r.date} (${r.source}). A bank or money changer will quote differently.`],
    };
  }
  if (kind === "temperature") {
    const f = TEMPERATURES.find((t) => t.id === fromId), t = TEMPERATURES.find((x) => x.id === toId);
    if (!f || !t) return null;
    const conv = (v: number) => t.fromK(f.toK(v));
    const b = conv(0), a = conv(1) - b;
    const times = Math.abs(a - 1) < 1e-12 ? "" : `multiply the value by ${four(a)}${Math.abs(b) < 1e-12 ? "" : ", then "}`;
    const plus = Math.abs(b) < 1e-12 ? "" : b > 0 ? `add ${four(b)}` : `subtract ${four(-b)}`;
    return { result: conv(value), formula: times || plus ? `To convert, ${times}${plus}.` : "The two units are the same.", notes: [] };
  }
  const unitKind: UnitKind = kind === "engine" ? "power" : kind;
  const f = UNITS.find((u) => u.kind === unitKind && u.id === fromId), t = UNITS.find((u) => u.kind === unitKind && u.id === toId);
  if (!f || !t) return null;
  const factor = f.factor / t.factor;
  return {
    result: (value * f.factor) / t.factor,
    formula: `For an approximate result, multiply the ${unitKind} value by ${four(factor)}`,
    notes: [...new Set([f.note, t.note].filter((n): n is string => !!n))],
  };
}

/* --------------------------- engine power: PS, bhp, kW --------------------------- */

export interface EngineUnit {
  id: string;
  short: string;
  name: string;
  /** Here I say what the letters stand for, and what the unit is */
  meaning: string;
}

/** The three ways a vehicle's engine power is quoted today; I list them in the order they read from the largest number to the smallest for the same power. */
export const ENGINE_UNITS: EngineUnit[] = [
  { id: "ps", short: "PS", name: "Pferdestärke (metric horsepower)", meaning: "PS is short for the German word Pferdestärke, \"horse strength\": the metric horsepower, 1 PS = 735.5 W (the DIN unit; CV or cv in French and Italian; hp in a European brochure is usually PS)." },
  { id: "hp", short: "bhp", name: "brake horsepower (mechanical)", meaning: "bhp is brake horsepower: the power measured at the engine's crankshaft on a brake (dynamometer), before the losses of gearbox and wheels; 1 bhp = 745.7 W. An American \"hp\" is the same horsepower." },
  { id: "kW", short: "kW", name: "kilowatt (SI)", meaning: "kW is the kilowatt, the international (SI) unit, 1 kW = 1000 W. Registration papers, European law and every electric vehicle quote kW; 1 kW = 1.341 bhp = 1.360 PS." },
];

export const ENGINE_IDS = ENGINE_UNITS.map((e) => e.id);

/** Gives the value in each of the three units, from a value typed in one of them; I list PS first, then bhp, then kW. */
export function engineRows(value: number, atId: string): Array<{ id: string; short: string; value: number }> | null {
  const at = UNITS.find((u) => u.kind === "power" && u.id === atId);
  if (!at || !Number.isFinite(value) || !ENGINE_IDS.includes(atId)) return null;
  const watts = value * at.factor;
  return ENGINE_UNITS.map((e) => ({ id: e.id, short: e.short, value: watts / (UNITS.find((u) => u.kind === "power" && u.id === e.id) as { factor: number }).factor }));
}

const ENGINE_WORD: Record<string, string> = { ps: "ps", cv: "ps", bhp: "hp", hp: "hp", kw: "kW" };
const NUMBER = String.raw`([-+]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?)`;

/** "engine power", "100 bhp", "ps bhp kw", "bhp vs ps vs kw": I treat these as a question about engine power that is not a plain two-unit conversion. */
export function parseEngine(raw: string): { value: number; id: string } | null {
  const q = (raw || "").trim().toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  if (!q || q.length > 60) return null;
  if (/^(?:(?:engine|car|vehicle|motor)\s+power|power\s+of\s+(?:an?\s+)?(?:engine|car))(?:\s+(?:conversion|converter|units?|in\s+ps\s+bhp\s+kw))?$/.test(q)) return { value: 1, id: "hp" };
  const m = new RegExp(`^(?:${NUMBER}\\s*)?((?:bhp|ps|kw|hp|cv)(?:\\s*(?:,|/|vs\\.?|and|to|in|=|->)?\\s*(?:bhp|ps|kw|hp|cv)){0,2})$`).exec(q);
  if (!m) return null;
  const ids = (m[2].match(/bhp|ps|kw|hp|cv/g) ?? []).map((w) => ENGINE_WORD[w]);
  const distinct = [...new Set(ids)];
  if (distinct.length !== ids.length) return null;
  if (ids.length === 1 && m[1] === undefined) return null; // I do not take a lone "kw" or "ps" as a question
  return { value: m[1] === undefined ? 1 : Number(m[1].replace(/,/g, "")), id: ids[0] };
}
