// src/tools/rim/rim.ts
//
// HOW TO READ A WHEEL (RIM) MARKING: "8Jx20" -> rim 8 inches (203.2 mm) wide, flange contour J, one-piece drop-centre wheel ("x"), 20 inches across the bead seat. Optional extras read too:
// "ET35" (offset), "5x114.3" (bolt pattern), "CB67.1" (centre bore). Pure; nothing is stored or sent anywhere.
//
// The meanings are the standard ones (ISO 4000 / ETRTO / TRA wheel markings): the width is measured between the inner faces of the flanges, "x" is a one-piece drop-centre rim, "-" a multi-piece rim,
// the diameter is taken at the bead seat and is the number after the R of the tyre size.
// The tyre widths that suit a rim width are a GENERAL GUIDE (about 225-255 mm for an 8-inch rim, 20 mm more or less for each inch of rim width); the tyre maker's approved rim-width range
// for the exact tyre, and the vehicle's manual, overrule it.
import type { TyreSize } from "@/tools/tyre/tyre";

export interface RimSpec {
  /** rim width in inches */
  width: number;
  /** the flange contour letter(s), "" when none was typed */
  flange: string;
  /** "x": one-piece drop-centre; "-": multi-piece */
  build: "x" | "-";
  /** rim diameter in inches */
  diameter: number;
  /** offset ET in mm (positive, zero or negative), null when not typed */
  offset: number | null;
  /** bolt pattern: number of bolts and the diameter of their circle in mm */
  pcd: { bolts: number; circle: number } | null;
  /** centre bore in mm */
  bore: number | null;
}

const FLANGES = "JJ|JK|J|K|B|P|D|E|F|G|L|V";
const PREFIX = "(?:(?:(?:ALLOY|WHEEL|RIM)S?\\s+)+(?:(?:SIZE|SPEC|SPECS|SPECIFICATION|SPECIFICATIONS|MARKING|MARKINGS|CODE|MEANING)\\s+)?)?";
const RIM_RE = new RegExp(`^(${PREFIX})(\\d{1,2}(?:\\.\\d)?)\\s*(${FLANGES})?\\s*([X×-])\\s*(\\d{2}(?:\\.\\d)?)((?:\\s+[A-Z0-9.+×-]+)*)$`);

/** Reads a wheel marking ("8Jx20", "6.5J x 16 ET45", "alloy wheel size 7Jx17 5x114.3 CB67.1"). Null when the text is not one: a bare "8x20" (no flange letter, no word like wheel or rim) is left alone. */
export function parseRim(raw: string): RimSpec | null {
  if ((raw || "").length > 120) return null;
  // "ET 35" and "CB 67.1" are read as "ET35" and "CB67.1"
  const q = (raw || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/[?.]+$/, "").replace(/\b(ET|CB)\s+(?=[-+\d])/g, "$1");
  const m = RIM_RE.exec(q);
  if (!m) return null;
  const prefix = (m[1] ?? "").trim();
  const width = Number(m[2]), flange = m[3] ?? "", build = m[4] === "-" ? "-" : "x", diameter = Number(m[5]);
  if (width < 3 || width > 14 || diameter < 10 || diameter > 26) return null;
  const rest = (m[6] ?? "").trim();
  let offset: number | null = null, pcd: RimSpec["pcd"] = null, bore: number | null = null;
  for (const tok of rest ? rest.split(" ") : []) {
    let t: RegExpExecArray | null;
    if ((t = /^ET(-?\+?\d{1,3})$/.exec(tok))) offset = Number(t[1]);
    else if ((t = /^(\d)[X×](\d{2,3}(?:\.\d)?)$/.exec(tok))) pcd = { bolts: Number(t[1]), circle: Number(t[2]) };
    else if ((t = /^CB(\d{2,3}(?:\.\d)?)$/.exec(tok))) bore = Number(t[1]);
    else return null;
  }
  // a bare "8x20" could be anything: it needs the flange letter, a word like wheel or rim, or an offset
  if (!flange && !prefix && offset === null) return null;
  return { width, flange, build, diameter, offset, pcd, bore };
}

export interface RimRow {
  part: string;
  meaning: string;
  detail: string;
}

export interface RimReading {
  rows: RimRow[];
  facts: Array<{ label: string; value: string }>;
  /** the tyre widths (mm) that suit this rim width, and the ones that sit best */
  tyre: { min: number; max: number; bestMin: number; bestMax: number };
  notes: string[];
}

const r5 = (n: number) => Math.round(n / 5) * 5;
const mm = (inches: number): string => `${Number((inches * 25.4).toFixed(1))} mm`;
const inch = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** the tyre widths (mm) that generally suit a rim of this width: 225-255 for 8 inches, 20 mm more or less for each inch */
export function tyreWidthsFor(rimWidth: number): { min: number; max: number; bestMin: number; bestMax: number } {
  const min = r5(225 + (rimWidth - 8) * 20), max = r5(255 + (rimWidth - 8) * 20);
  return { min, max, bestMin: min + 10, bestMax: max - 10 };
}

/** the other way round: the rim widths (inches, in halves) that generally suit a tyre of this width */
export function rimWidthsFor(tyreWidth: number): { lo: number; hi: number } {
  const half = (x: number) => Math.max(4, Math.round(x * 2) / 2);
  return { lo: half((tyreWidth - 255) / 20 + 8), hi: half((tyreWidth - 225) / 20 + 8) };
}

/** What each part of the marking means, and what follows from it. */
export function readRim(r: RimSpec): RimReading {
  const rows: RimRow[] = [];
  rows.push({ part: inch(r.width), meaning: "Rim width", detail: `${inch(r.width)} inches (${mm(r.width)}) wide, measured between the inner faces of the rim flanges, across the barrel where the tyre sits, not from the outer edges of the metal` });
  if (r.flange) {
    rows.push({
      part: r.flange,
      meaning: "Flange profile",
      detail: r.flange === "J"
        ? "the shape and height of the rim lip that holds the tyre bead in place. J is the standard contour on modern passenger cars, SUVs and crossovers"
        : `the shape and height of the rim lip that holds the tyre bead in place. ${r.flange} is one of the standard contour letters; J is the one in common use on passenger cars, SUVs and crossovers, the other letters describe other lip shapes and heights`,
    });
  }
  rows.push({
    part: r.build,
    meaning: "Build",
    detail: r.build === "x"
      ? "a one-piece wheel with a drop centre: a deeper well in the middle that lets the tyre be fitted and removed without taking the wheel apart"
      : "a multi-piece wheel, made of parts that are bolted or locked together (as on some trucks and special wheels). A one-piece drop-centre wheel has an \"x\" in this place",
  });
  rows.push({ part: inch(r.diameter), meaning: "Rim diameter", detail: `${inch(r.diameter)} inches (${mm(r.diameter)}), measured across the bead seat, where the tyre sits. The tyre must have the same number after its R: a tyre ending R${inch(r.diameter)}` });
  if (r.offset !== null) {
    const n = r.offset;
    rows.push({
      part: `ET${n}`,
      meaning: "Offset",
      detail: n > 0
        ? `the mounting face is ${n} mm outside the centre line of the rim, which pulls the wheel inward, under the arch`
        : n === 0 ? "the mounting face is exactly on the centre line of the rim"
        : `the mounting face is ${-n} mm inside the centre line of the rim, which pushes the wheel outward`,
    });
  }
  if (r.pcd) rows.push({ part: `${r.pcd.bolts}×${r.pcd.circle}`, meaning: "Bolt pattern", detail: `${r.pcd.bolts} bolts on a circle ${r.pcd.circle} mm across (the pitch-circle diameter, PCD); it must be the vehicle's own pattern` });
  if (r.bore !== null) rows.push({ part: `CB${r.bore}`, meaning: "Centre bore", detail: `the hole in the middle of the wheel, ${r.bore} mm, which fits over the hub; a wheel with a larger bore needs a centring ring` });

  const t = tyreWidthsFor(r.width);
  const facts = [
    { label: "Rim width", value: `${mm(r.width)} (${inch(r.width)} in)` },
    { label: "Rim diameter", value: `${mm(r.diameter)} (${inch(r.diameter)} in)` },
    { label: "Tyre widths that suit it", value: `${t.min}–${t.max} mm` },
    { label: "Tyre size must end in", value: `R${inch(r.diameter)}` },
  ];
  const notes = [
    `The tyre widths are the general guide for a ${inch(r.width)}-inch rim (${t.bestMin}–${t.bestMax} mm sit best, the widest on taller SUV profiles); the tyre maker's approved rim width for the exact tyre decides.`,
    "The marking gives the size of the wheel, not its fit on a car: the offset, the bolt pattern and the centre bore must also match the hub, and the wheel must clear the brakes and the arches.",
  ];
  if (!r.flange) notes.unshift("No flange letter was typed; J is the one in common use on cars.");
  return { rows, facts, tyre: t, notes };
}

/** What a tyre asks of the wheel: its diameter, and the rim widths that generally suit it. */
export function rimForTyre(t: TyreSize): { diameter: number; lo: number; hi: number } {
  const { lo, hi } = rimWidthsFor(t.width);
  return { diameter: t.rim, lo, hi };
}

/** The three figures, besides the size, that decide whether a wheel fits a car */
export const FIT_TERMS: Array<{ term: string; name: string; meaning: string }> = [
  { term: "ET", name: "Offset", meaning: "how far the wheel's mounting face sits from the centre line of the rim, in mm. A higher ET tucks the wheel further in under the arch, a lower one pushes it out." },
  { term: "PCD", name: "Bolt pattern", meaning: "the number of bolts and the diameter of the circle through them, for example 5×114.3: five bolts on a circle 114.3 mm across." },
  { term: "CB", name: "Centre bore", meaning: "the hole in the middle of the wheel, which fits over the hub. It must be at least as large as the hub; a larger bore needs a centring ring." },
];
