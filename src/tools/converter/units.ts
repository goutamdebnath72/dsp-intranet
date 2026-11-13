// src/tools/converter/units.ts
//
// UNIT CONVERSION FOR THE SEARCH BAR: "5 km in miles", "98.6 f to c", "1 bhp in kw", "180 degrees to radians", "2 kgf/cm2 to bar".
// Pure: a table of units with their factor to the base unit of their kind, and a strict parser. Nothing is stored or sent anywhere.
//
// Where a word has more than one meaning, the table says which meaning it took and the answer SAYS SO (a note): "ton" (metric tonne), "bhp"/"hp" (mechanical, 745.7 W)
// against "PS" (metric, 735.5 W), "calorie" (the small calorie; a food Calorie is the kilocalorie), "gallon" (US; the imperial gallon is separate).

export type UnitKind = "length" | "area" | "volume" | "mass" | "temperature" | "angle" | "energy" | "force" | "power" | "pressure" | "speed" | "time";

export interface UnitDef {
  id: string;
  /** how the unit is written in an answer */
  label: string;
  kind: UnitKind;
  /** how many base units one of this unit is (temperature has its own rules) */
  factor: number;
  aliases: string[];
  /** said in the answer when the word has more than one meaning */
  note?: string;
}

const U = (id: string, label: string, kind: UnitKind, factor: number, aliases: string[], note?: string): UnitDef => ({ id, label, kind, factor, aliases, ...(note ? { note } : {}) });

const PI = Math.PI;

export const UNITS: UnitDef[] = [
  // length (base: metre)
  U("m", "metre", "length", 1, ["m", "meter", "metre", "meters", "metres"]),
  U("km", "kilometre", "length", 1000, ["km", "kms", "kilometer", "kilometre", "kilometers", "kilometres"]),
  U("cm", "centimetre", "length", 0.01, ["cm", "centimeter", "centimetre", "centimeters", "centimetres"]),
  U("mm", "millimetre", "length", 0.001, ["mm", "millimeter", "millimetre", "millimeters", "millimetres"]),
  U("um", "micrometre (micron)", "length", 1e-6, ["um", "µm", "micron", "microns", "micrometre", "micrometer"]),
  U("in", "inch", "length", 0.0254, ["in", "inch", "inches", "\""]),
  U("ft", "foot", "length", 0.3048, ["ft", "foot", "feet", "'"]),
  U("yd", "yard", "length", 0.9144, ["yd", "yds", "yard", "yards"]),
  U("mi", "mile", "length", 1609.344, ["mi", "mile", "miles"]),
  U("nmi", "nautical mile", "length", 1852, ["nmi", "nautical mile", "nautical miles"]),
  // area (base: square metre)
  U("m2", "square metre", "area", 1, ["sq m", "sqm", "m2", "sq meter", "sq metre", "sq meters", "sq metres", "square meter", "square metre"]),
  U("km2", "square kilometre", "area", 1e6, ["sq km", "sqkm", "km2", "sq kilometer", "sq kilometre"]),
  U("cm2", "square centimetre", "area", 1e-4, ["sq cm", "sqcm", "cm2"]),
  U("mm2", "square millimetre", "area", 1e-6, ["sq mm", "sqmm", "mm2"]),
  U("ft2", "square foot", "area", 0.09290304, ["sq ft", "sqft", "ft2", "sq feet", "sq foot", "square feet", "square foot"]),
  U("in2", "square inch", "area", 0.00064516, ["sq in", "sqin", "in2", "sq inch", "sq inches"]),
  U("yd2", "square yard", "area", 0.83612736, ["sq yd", "sqyd", "yd2", "sq yard", "sq yards", "gaj"]),
  U("acre", "acre", "area", 4046.8564224, ["acre", "acres"]),
  U("ha", "hectare", "area", 10000, ["ha", "hectare", "hectares"]),
  U("mi2", "square mile", "area", 2589988.110336, ["sq mi", "sqmi", "mi2", "sq mile", "sq miles"]),
  // Indian land units. The katha and the bigha are NOT the same size in every state, so each size is a unit of its own (the label names the place) and a bare word is read as the West Bengal one, with a note.
  // West Bengal: 1 bigha = 20 katha (cottah) = 14,400 sq ft, 1 katha = 16 chhatak = 720 sq ft; Assam: 1 bigha = 5 katha = 14,400 sq ft (so the Assam bigha is the same size); Bihar (Patna): 1 bigha = 20 katha = 27,225 sq ft.
  U("decimal", "decimal (1/100 acre)", "area", 4046.8564224 / 100, ["decimal", "decimals", "dismil", "dismils", "shatak", "shatok"], "decimal (dismil) = 1/100 of an acre = 435.6 sq ft, as in land records"),
  U("katha", "katha / cottah (West Bengal)", "area", 720 * 0.09290304, ["katha", "kattha", "kottah", "cottah", "cotta", "kotha", "katha wb", "katha west bengal", "west bengal katha", "wb katha", "katha bengal", "cottah wb", "kottah wb"], "katha (cottah, kottah) read as the West Bengal size, 720 sq ft; other states use other sizes (Assam 2,880 sq ft, Patna 1,361.25 sq ft): choose the state's own unit from the list, and rely on the land record for an exact area"),
  U("bigha", "bigha (West Bengal, Assam)", "area", 14400 * 0.09290304, ["bigha", "bighas", "beegha", "bigah", "bigha wb", "bigha west bengal", "west bengal bigha", "wb bigha", "bigha bengal", "bigha assam", "assam bigha"], "bigha read as the West Bengal and Assam size, 14,400 sq ft (20 katha of 720 sq ft); in other states it is a different size (27,225 sq ft in Patna): choose the state's own unit from the list"),
  U("chhatak", "chhatak (West Bengal)", "area", 45 * 0.09290304, ["chhatak", "chatak", "chittak", "chhatack"], "chhatak = 45 sq ft (West Bengal): 16 chhatak make one katha"),
  U("kathaas", "katha (Assam)", "area", 2880 * 0.09290304, ["katha assam", "assam katha", "kattha assam", "katha as"], "Assam katha = 2,880 sq ft (5 katha make one bigha of 14,400 sq ft)"),
  U("kathabr", "katha (Bihar, Patna)", "area", 1361.25 * 0.09290304, ["katha bihar", "bihar katha", "katha patna", "patna katha", "kattha bihar", "katha br"], "the katha of Bihar differs from district to district; this is the Patna one, 1,361.25 sq ft (20 katha make one bigha). Rely on the land record for an exact area"),
  U("bighabr", "bigha (Bihar, Patna)", "area", 27225 * 0.09290304, ["bigha bihar", "bihar bigha", "bigha patna", "patna bigha", "bigha br"], "the bigha of Bihar differs from district to district; this is the Patna one, 20 katha of 1,361.25 sq ft = 27,225 sq ft. Rely on the land record for an exact area"),
  // volume (base: cubic metre)
  U("m3", "cubic metre", "volume", 1, ["m3", "cu m", "cum", "cubic meter", "cubic metre", "cubic meters", "cubic metres", "kl", "kilolitre", "kiloliter", "kilolitres", "kiloliters"]),
  U("l", "litre", "volume", 0.001, ["l", "lt", "ltr", "ltrs", "liter", "litre", "liters", "litres"]),
  U("ml", "millilitre", "volume", 1e-6, ["ml", "milliliter", "millilitre", "milliliters", "millilitres", "cc", "cm3", "cu cm"]),
  U("ft3", "cubic foot", "volume", 0.028316846592, ["cu ft", "cuft", "cft", "ft3", "cubic feet", "cubic foot"]),
  U("in3", "cubic inch", "volume", 1.6387064e-5, ["cu in", "cuin", "in3", "cubic inch", "cubic inches"]),
  U("yd3", "cubic yard", "volume", 0.764554857984, ["cu yd", "cuyd", "yd3", "cubic yard", "cubic yards"]),
  U("gal", "US gallon", "volume", 0.003785411784, ["gal", "gallon", "gallons", "us gallon", "us gallons", "us gal"], "US gallon (the imperial gallon is 4.546 litres)"),
  U("galuk", "imperial gallon", "volume", 0.00454609, ["imperial gallon", "imperial gallons", "uk gallon", "uk gallons", "imp gal"]),
  U("bbl", "oil barrel", "volume", 0.158987294928, ["bbl", "barrel", "barrels", "oil barrel", "oil barrels"], "oil barrel (42 US gallons)"),
  U("floz", "US fluid ounce", "volume", 2.95735295625e-5, ["fl oz", "floz", "fluid ounce", "fluid ounces"]),
  // mass (base: kilogram)
  U("kg", "kilogram", "mass", 1, ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"]),
  U("g", "gram", "mass", 0.001, ["g", "gm", "gms", "gram", "grams"]),
  U("mg", "milligram", "mass", 1e-6, ["mg", "milligram", "milligrams"]),
  U("t", "tonne (metric ton)", "mass", 1000, ["t", "tonne", "tonnes", "mt", "metric ton", "metric tons", "metric tonne", "ton", "tons"], "ton read as the metric tonne (1,000 kg); a US short ton is 907 kg"),
  U("q", "quintal", "mass", 100, ["quintal", "quintals", "qtl"]),
  U("lb", "pound", "mass", 0.45359237, ["lb", "lbs", "pound", "pounds"]),
  U("oz", "ounce", "mass", 0.028349523125, ["oz", "ounce", "ounces"]),
  U("shortton", "US short ton", "mass", 907.18474, ["short ton", "short tons", "us ton", "us tons"]),
  U("longton", "UK long ton", "mass", 1016.0469088, ["long ton", "long tons", "uk ton", "uk tons"]),
  U("tola", "tola", "mass", 0.011663804, ["tola", "tolas"], "tola = 11.6638 g"),
  U("ct", "carat", "mass", 0.0002, ["carat", "carats", "ct"]),
  // angle (base: radian)
  U("rad", "radian", "angle", 1, ["rad", "rads", "radian", "radians"]),
  U("deg", "degree", "angle", PI / 180, ["deg", "degs", "degree", "degrees", "°"]),
  U("grad", "gradian", "angle", PI / 200, ["grad", "gon", "gradian", "gradians"]),
  U("arcmin", "arcminute", "angle", PI / 10800, ["arcmin", "arcminute", "arcminutes", "arc minute", "arc minutes"]),
  U("arcsec", "arcsecond", "angle", PI / 648000, ["arcsec", "arcsecond", "arcseconds", "arc second", "arc seconds"]),
  U("turn", "turn (revolution)", "angle", 2 * PI, ["turn", "turns", "rev", "revs", "revolution", "revolutions", "rotation", "rotations"]),
  // energy (base: joule)
  U("J", "joule", "energy", 1, ["j", "joule", "joules"]),
  U("kJ", "kilojoule", "energy", 1e3, ["kj", "kilojoule", "kilojoules"]),
  U("MJ", "megajoule", "energy", 1e6, ["mj", "megajoule", "megajoules"]),
  U("GJ", "gigajoule", "energy", 1e9, ["gj", "gigajoule", "gigajoules"]),
  U("cal", "calorie", "energy", 4.184, ["cal", "cals", "calorie", "calories"], "calorie = the small calorie (4.184 J); the Calories on a food label are kilocalories (kcal)"),
  U("kcal", "kilocalorie", "energy", 4184, ["kcal", "kcals", "kilocalorie", "kilocalories", "kilo calorie", "kilo calories", "food calorie", "food calories"]),
  U("Wh", "watt-hour", "energy", 3600, ["wh", "watt hour", "watt hours", "watt-hour"]),
  U("kWh", "kilowatt-hour", "energy", 3.6e6, ["kwh", "kw h", "kilowatt hour", "kilowatt hours", "kilowatt-hour", "unit", "units of electricity"], "an electricity \"unit\" is one kWh"),
  U("MWh", "megawatt-hour", "energy", 3.6e9, ["mwh", "megawatt hour", "megawatt hours"]),
  U("BTU", "British thermal unit", "energy", 1055.05585262, ["btu", "btus", "british thermal unit", "british thermal units"]),
  U("ftlbf", "foot-pound force", "energy", 1.3558179483314, ["ft lbf", "ftlbf", "ft lb", "foot pound", "foot pounds"]),
  U("erg", "erg", "energy", 1e-7, ["erg", "ergs"]),
  // force (base: newton)
  U("N", "newton", "force", 1, ["n", "newton", "newtons"]),
  U("kN", "kilonewton", "force", 1e3, ["kn", "kilonewton", "kilonewtons"]),
  U("MN", "meganewton", "force", 1e6, ["mn", "meganewton", "meganewtons"]),
  U("kgf", "kilogram-force", "force", 9.80665, ["kgf", "kg f", "kg force", "kilogram force", "kilogram-force", "kilograms force"]),
  U("tf", "tonne-force", "force", 9806.65, ["tf", "tonne force", "tonnes force", "ton force", "tonne-force"]),
  U("lbf", "pound-force", "force", 4.4482216152605, ["lbf", "pound force", "pounds force", "pound-force"]),
  U("dyn", "dyne", "force", 1e-5, ["dyn", "dyne", "dynes"]),
  // power (base: watt)
  U("W", "watt", "power", 1, ["w", "watt", "watts"]),
  U("kW", "kilowatt", "power", 1e3, ["kw", "kilowatt", "kilowatts"]),
  U("MW", "megawatt", "power", 1e6, ["mw", "megawatt", "megawatts"]),
  U("GW", "gigawatt", "power", 1e9, ["gw", "gigawatt", "gigawatts"]),
  U("hp", "mechanical horsepower (bhp)", "power", 745.6998715823, ["hp", "bhp", "horsepower", "horse power", "mechanical hp"], "bhp and hp read as mechanical horsepower (745.7 W); the metric PS is 735.5 W"),
  U("ps", "metric horsepower (PS)", "power", 735.49875, ["ps", "cv", "metric hp", "metric horsepower", "metric horse power"]),
  U("TR", "ton of refrigeration", "power", 3516.8528421, ["tr", "ton of refrigeration", "tons of refrigeration"]),
  U("btuh", "BTU per hour", "power", 0.29307107, ["btu/h", "btu/hr", "btuh", "btu per hour"]),
  U("kcalh", "kilocalorie per hour", "power", 1.163, ["kcal/h", "kcal/hr", "kcal per hour"]),
  // pressure (base: pascal)
  U("Pa", "pascal", "pressure", 1, ["pa", "pascal", "pascals"]),
  U("kPa", "kilopascal", "pressure", 1e3, ["kpa", "kilopascal", "kilopascals"]),
  U("MPa", "megapascal", "pressure", 1e6, ["mpa", "megapascal", "megapascals"]),
  U("bar", "bar", "pressure", 1e5, ["bar", "bars"]),
  U("mbar", "millibar", "pressure", 100, ["mbar", "millibar", "millibars"]),
  U("atm", "atmosphere", "pressure", 101325, ["atm", "atmosphere", "atmospheres"]),
  U("psi", "pound per square inch", "pressure", 6894.757293168, ["psi", "lb/in2", "lbf/in2"]),
  U("kgfcm2", "kgf per square centimetre", "pressure", 98066.5, ["kgf/cm2", "kg/cm2", "ksc", "kgf/sq cm", "kg/sq cm", "kgf per cm2"]),
  U("mmHg", "millimetre of mercury", "pressure", 133.322387415, ["mmhg", "mm hg", "torr"]),
  U("mmwc", "millimetre of water column", "pressure", 9.80665, ["mmwc", "mm wc", "mmh2o", "mm of water"]),
  // speed (base: metre per second)
  U("mps", "metre per second", "speed", 1, ["m/s", "mps", "metre per second", "meter per second", "metres per second", "meters per second"]),
  U("kmh", "kilometre per hour", "speed", 1000 / 3600, ["km/h", "kmh", "kmph", "kph", "km/hr", "kilometre per hour", "kilometer per hour", "kilometres per hour", "kilometers per hour"]),
  U("mph", "mile per hour", "speed", 0.44704, ["mph", "mi/h", "mile per hour", "miles per hour"]),
  U("kn", "knot", "speed", 1852 / 3600, ["knot", "knots", "kt", "kts"]),
  U("fps", "foot per second", "speed", 0.3048, ["ft/s", "fps", "foot per second", "feet per second"]),
  // time (base: second)
  U("s", "second", "time", 1, ["s", "sec", "secs", "second", "seconds"]),
  U("min", "minute", "time", 60, ["min", "mins", "minute", "minutes"]),
  U("h", "hour", "time", 3600, ["h", "hr", "hrs", "hour", "hours"]),
  U("d", "day", "time", 86400, ["day", "days"]),
  U("wk", "week", "time", 604800, ["week", "weeks", "wk", "wks"]),
];

/** temperature is not a ratio: Celsius, Fahrenheit and Kelvin convert through kelvin */
export const TEMPERATURES: Array<{ id: string; label: string; aliases: string[]; toK: (v: number) => number; fromK: (k: number) => number }> = [
  { id: "C", label: "°C", aliases: ["c", "°c", "celsius", "centigrade", "deg c", "degc", "degree celsius", "degrees celsius", "degree c", "degrees c"], toK: (v) => v + 273.15, fromK: (k) => k - 273.15 },
  { id: "F", label: "°F", aliases: ["f", "°f", "fahrenheit", "deg f", "degf", "degree fahrenheit", "degrees fahrenheit", "degree f", "degrees f"], toK: (v) => ((v - 32) * 5) / 9 + 273.15, fromK: (k) => ((k - 273.15) * 9) / 5 + 32 },
  { id: "K", label: "K", aliases: ["k", "kelvin", "kelvins"], toK: (v) => v, fromK: (k) => k },
];

const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/\bsquare\s+/g, "sq ")
    .replace(/\bcubic\s+/g, "cu ")
    .replace(/\./g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

const BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) for (const a of u.aliases) if (!BY_ALIAS.has(norm(a))) BY_ALIAS.set(norm(a), u);
const TEMP_BY_ALIAS = new Map<string, (typeof TEMPERATURES)[number]>();
for (const t of TEMPERATURES) for (const a of t.aliases) TEMP_BY_ALIAS.set(norm(a), t);

export function findUnit(word: string): UnitDef | null {
  const w = norm(word);
  if (!w) return null;
  if (BY_ALIAS.has(w)) return BY_ALIAS.get(w)!;
  // a plural the table does not list ("kilometres per hour" is listed; "yards" is listed; "tolas" is listed): drop one "s"
  if (w.endsWith("s") && BY_ALIAS.has(w.slice(0, -1))) return BY_ALIAS.get(w.slice(0, -1))!;
  return null;
}
export function findTemperature(word: string) {
  return TEMP_BY_ALIAS.get(norm(word)) ?? null;
}

export interface Conversion {
  kind: "convert";
  category: UnitKind;
  value: number;
  from: string;
  to: string;
  /** the ids of the two units in the table (what the converter card selects) */
  fromId: string;
  toId: string;
  /** the two units as the person wrote them ("km", "miles"): what the answer shows */
  fromText: string;
  toText: string;
  result: number;
  /** one unit of "from" in "to": "1 km = 0.621371 mile" */
  oneUnit: number;
  notes: string[];
}
const tidyWord = (w: string): string => (w || "").trim().replace(/\s+/g, " ");

export interface Mismatch {
  kind: "mismatch";
  from: string;
  to: string;
  message: string;
}

/** Converts `value` between two units written as words; null when either is not a known unit. */
export function convertWords(value: number, fromWord: string, toWord: string): Conversion | Mismatch | null {
  const ft = findTemperature(fromWord), tt = findTemperature(toWord);
  if (ft && tt) {
    const conv = (v: number) => tt.fromK(ft.toK(v));
    return { kind: "convert", category: "temperature", value, from: ft.label, to: tt.label, fromId: ft.id, toId: tt.id, fromText: tidyWord(fromWord), toText: tidyWord(toWord), result: conv(value), oneUnit: conv(1), notes: [] };
  }
  const f = findUnit(fromWord), t = findUnit(toWord);
  if (!f && !ft) return null;
  if (!t && !tt) return null;
  if ((ft && t) || (f && tt)) {
    const a = ft ? "a temperature" : `a ${f!.kind}`, b = tt ? "a temperature" : `a ${t!.kind}`;
    return { kind: "mismatch", from: ft?.label ?? f!.label, to: tt?.label ?? t!.label, message: `${ft?.label ?? f!.label} is ${a} unit and ${tt?.label ?? t!.label} is ${b} unit: they cannot be converted into each other.` };
  }
  if (!f || !t) return null;
  if (f.kind !== t.kind) {
    return { kind: "mismatch", from: f.label, to: t.label, message: `${f.label} is a unit of ${f.kind} and ${t.label} is a unit of ${t.kind}: they cannot be converted into each other.` };
  }
  const result = (value * f.factor) / t.factor;
  const notes = [...new Set([f.note, t.note].filter((n): n is string => !!n))];
  return { kind: "convert", category: f.kind, value, from: f.label, to: t.label, fromId: f.id, toId: t.id, fromText: tidyWord(fromWord), toText: tidyWord(toWord), result, oneUnit: f.factor / t.factor, notes };
}

const VALUE = String.raw`([-+]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?|[-+]?\.\d+)`;
const JOIN = String.raw`(?:in|to|into|as|=|->|→|equals?)`;
const CONVERT_RE = new RegExp(`^(?:convert\\s+)?(?:${VALUE}\\s*)?([^\\d\\s].*?)\\s+${JOIN}\\s+(.+?)\\s*\\??$`, "i");

/** Reads "5 km in miles", "convert 98.6 f to c", "1 bhp to kw". Returns null unless BOTH sides are known units. */
export function parseConversion(raw: string): Conversion | Mismatch | null {
  const q = (raw || "").trim().replace(/^(?:what\s+is|what's|how\s+much\s+is)\s+/i, "");
  if (!q || q.length > 80) return null;
  const m = CONVERT_RE.exec(q);
  if (!m) return null;
  const value = m[1] === undefined ? 1 : Number(m[1].replace(/,/g, "")); // "bhp to ps" is one bhp, as Google reads it
  if (!Number.isFinite(value)) return null;
  return convertWords(value, m[2], m[3]);
}
