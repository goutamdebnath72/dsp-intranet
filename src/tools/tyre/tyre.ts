// src/tools/tyre/tyre.ts
//
// HOW TO READ A TYRE SIZE: "205/55 R16 91V" -> width 205 mm, sidewall 55% of the width (112.75 mm), radial, 16-inch rim, load index 91 (615 kg a tyre), speed symbol V (240 km/h),
// with the overall diameter and the turns of the tyre in a kilometre. Pure; nothing is stored or sent anywhere.
//
// The load-index and speed-symbol tables are the standard ones (ETRTO / ISO 4000, as listed in the "Tire code" article of Wikipedia, checked 12 Nov 2026).
// Pictures of "speed / load capacity" circulate with garbled figures: this table is the one to rely on, and the tyre's own sidewall and the vehicle's manual overrule any chart.

/** load index -> kg a tyre may carry at its maximum speed and correct pressure */
export const LOAD_INDEX_KG: Record<number, number> = {
  60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300, 67: 307, 68: 315, 69: 325, 70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437,
  80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775,
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030, 110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180, 115: 1215, 116: 1250,
  117: 1285, 118: 1320, 119: 1360, 120: 1400, 121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700, 127: 1750, 128: 1800, 129: 1850, 130: 1900,
};

/** speed symbol -> maximum speed in km/h (Z: over 240; (W) over 270; (Y) over 300) */
export const SPEED_KMH: Record<string, { kmh: number; over?: boolean }> = {
  J: { kmh: 100 }, K: { kmh: 110 }, L: { kmh: 120 }, M: { kmh: 130 }, N: { kmh: 140 }, P: { kmh: 150 }, Q: { kmh: 160 }, R: { kmh: 170 }, S: { kmh: 180 }, T: { kmh: 190 }, U: { kmh: 200 }, H: { kmh: 210 },
  V: { kmh: 240 }, Z: { kmh: 240, over: true }, W: { kmh: 270 }, "(W)": { kmh: 270, over: true }, Y: { kmh: 300 }, "(Y)": { kmh: 300, over: true },
};

export interface TyreSize {
  /** P passenger, LT light truck, T temporary spare, C commercial; none: ETRTO (metric) */
  vehicleClass: string;
  width: number;
  aspect: number;
  /** R radial, D diagonal, B bias belt, ZR radial for high speed; "" when only a dash was written */
  construction: string;
  rim: number;
  load?: number;
  /** the second load index of a twin-fitted tyre ("121/118") */
  load2?: number;
  speed?: string;
  extras: string[];
}

const SIZE_RE = /^(?:(P|LT|T|C)\s?)?(\d{3})\s*\/\s*(\d{2})\s*(ZR|R|D|B|-)\s*-?\s*(\d{2})(?:\s*(\d{2,3})(?:\s*\/\s*(\d{2,3}))?\s*(\([WY]\)|[A-Z])?)?((?:\s+(?:XL|RF|TL|TT|M\+S|M&S|MS|EXTRALOAD|REINFORCED|TUBELESS))*)$/;

/** Reads a tyre size as printed on the sidewall ("205/55 R16 91V", "P215/65R15 95H", "tyre size 165/80 r14"). Null when the text is not one. */
export function parseTyre(raw: string): TyreSize | null {
  const q = (raw || "").trim().toUpperCase().replace(/^(?:WHAT\s+IS\s+|READ\s+|DECODE\s+|EXPLAIN\s+)?(?:THE\s+)?(?:TYRE|TIRE)S?\s+(?:SIZE|CODE|SPEC(?:IFICATION)?S?)\s+/, "").replace(/\s+/g, " ").replace(/[?.]+$/, "");
  const m = SIZE_RE.exec(q);
  if (!m) return null;
  const width = Number(m[2]), aspect = Number(m[3]), rim = Number(m[5]);
  if (width < 105 || width > 405 || aspect < 25 || aspect > 95 || rim < 10 || rim > 26) return null;
  const load = m[6] ? Number(m[6]) : undefined;
  if (load !== undefined && !LOAD_INDEX_KG[load]) return null;
  const load2 = m[7] ? Number(m[7]) : undefined;
  if (load2 !== undefined && !LOAD_INDEX_KG[load2]) return null;
  const speed = m[8] || undefined;
  if (speed && !SPEED_KMH[speed]) return null;
  if (load !== undefined && !speed) return null; // a load index is always followed by its speed symbol
  return { vehicleClass: m[1] ?? "", width, aspect, construction: m[4] === "-" ? "" : m[4], rim, load, load2, speed, extras: (m[9] ?? "").trim().split(" ").filter(Boolean) };
}

export interface TyreRow {
  part: string;
  meaning: string;
  detail: string;
}

export interface TyreReading {
  rows: TyreRow[];
  facts: Array<{ label: string; value: string }>;
  notes: string[];
}

const CLASS_TEXT: Record<string, string> = {
  P: "P: passenger-car tyre, load figures to the American (TRA) standard",
  LT: "LT: light-truck tyre",
  T: "T: temporary spare (\"space-saver\") tyre, for limited use only",
  C: "C: commercial (van / light-truck) tyre",
};
const CONSTRUCTION_TEXT: Record<string, string> = {
  R: "R: radial construction, the plies run across the tyre (every modern car tyre)",
  ZR: "ZR: radial construction made for high speed (the old marking for over 240 km/h)",
  D: "D: diagonal (cross-ply) construction",
  B: "B: bias-belted construction",
  "": "no construction letter: the dash stands for a radial tyre",
};
const EXTRA_TEXT: Record<string, string> = {
  XL: "XL (extra load): reinforced, carries more at higher pressure", EXTRALOAD: "extra load: reinforced", REINFORCED: "reinforced", RF: "RF: reinforced", TL: "TL: tubeless", TUBELESS: "tubeless", TT: "TT: needs an inner tube",
  "M+S": "M+S: mud and snow tread", "M&S": "M+S: mud and snow tread", MS: "M+S: mud and snow tread",
};

const mm = (x: number): string => `${Number(x.toFixed(2))} mm`;
const mm1 = (x: number): string => `${Number(x.toFixed(1))} mm`;
const kmhText = (s: string): string => { const e = SPEED_KMH[s]; return `${e.over ? "over " : ""}${e.kmh} km/h`; };

/** What each part of the size means, and what follows from it. */
export function readTyre(t: TyreSize): TyreReading {
  const sidewall = (t.width * t.aspect) / 100;
  const rimMm = t.rim * 25.4;
  const diameter = rimMm + 2 * sidewall;
  const circumference = Math.PI * diameter;
  const rows: TyreRow[] = [];
  if (t.vehicleClass) rows.push({ part: t.vehicleClass, meaning: "Type of tyre", detail: CLASS_TEXT[t.vehicleClass] });
  rows.push({ part: String(t.width), meaning: "Tyre width", detail: `${t.width} mm across the tread, from sidewall to sidewall (${(t.width / 25.4).toFixed(1)} inch)` });
  rows.push({ part: String(t.aspect), meaning: "Aspect ratio", detail: `the height of the sidewall as a percentage of the tyre width. Sidewall height = width × aspect ratio = ${t.width} mm × ${t.aspect}% = ${mm(sidewall)} (on an inflated tyre). A smaller number means a lower, sportier profile` });
  rows.push({ part: t.construction || "-", meaning: "Construction", detail: CONSTRUCTION_TEXT[t.construction] });
  rows.push({ part: String(t.rim), meaning: "Rim diameter", detail: `fits a ${t.rim}-inch wheel (${mm(rimMm)})` });
  if (t.load !== undefined && t.speed) {
    const kg = LOAD_INDEX_KG[t.load];
    rows.push({
      part: t.load2 !== undefined ? `${t.load}/${t.load2}` : String(t.load),
      meaning: "Load index",
      detail: t.load2 !== undefined ? `each single tyre carries up to ${kg} kg; ${LOAD_INDEX_KG[t.load2]} kg when fitted in pairs (twin)` : `each tyre can carry up to ${kg} kg (${kg * 4} kg on four tyres, an upper limit for the vehicle)`,
    });
    rows.push({ part: t.speed, meaning: "Speed symbol", detail: `rated for a top speed of ${kmhText(t.speed)} while carrying its full load` });
  }
  for (const x of t.extras) if (EXTRA_TEXT[x]) rows.push({ part: x, meaning: "Marking", detail: EXTRA_TEXT[x] });

  const facts = [
    { label: "Sidewall height", value: `${mm(sidewall)} (${t.width} × ${t.aspect}%)` },
    { label: "Overall diameter", value: `${mm1(diameter)} (${(diameter / 25.4).toFixed(1)} inch)` },
    { label: "Rolling circumference", value: `${(circumference / 1000).toFixed(3)} m` },
    { label: "Turns of the tyre per km", value: String(Math.round(1e6 / circumference)) },
  ];
  const notes = [
    `Overall diameter = rim + 2 × sidewall = ${mm1(rimMm)} + 2 × ${mm(sidewall)} = ${mm1(diameter)}.`,
    "A replacement tyre must have a load index and a speed symbol at least equal to those in the vehicle's manual or on the door-pillar label.",
    "When changing the size, keep the overall diameter within about 3% of the original, so that the speedometer and the odometer stay accurate.",
  ];
  if (t.load === undefined) notes.unshift("The load index and speed symbol (for example 91V) follow the size on the sidewall; they were not typed here.");
  return { rows, facts, notes };
}
