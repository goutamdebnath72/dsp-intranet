// src/tools/converter/colour.ts
//
// COLOUR: RGB <-> HEX <-> HSL, the arithmetic and the reading of a typed line (pure, no React). A colour is three whole numbers from 0 to 255 (red, green, blue); its HEX form is "#" and two hexadecimal digits for each,
// "#4F46E5". A short HEX of three digits ("#f53") means each digit doubled ("#ff5533"). HSL is the same colour as a hue (the angle on the colour wheel, 0 to 360 degrees), a saturation and a lightness (each 0 to 100 per cent),
// "hsl(243, 75%, 59%)". HSL is shown in whole numbers (as a stylesheet writes it), so a colour typed in HSL comes back as the nearest RGB, which can differ by a point from the RGB it was first read from. Nothing is stored or sent; the card is in ColourPanel.tsx.

export interface Rgb { r: number; g: number; b: number }

/** the colour a bare "rgb to hex" question opens with (the intranet's own indigo) */
export const DEFAULT_HEX = "#4F46E5";

const h2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");

/** "#4F46E5": upper case, always six digits */
export function toHex({ r, g, b }: Rgb): string {
  return `#${h2(r)}${h2(g)}${h2(b)}`;
}

/** "rgb(79, 70, 229)", as a stylesheet writes it */
export function cssRgb({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** a channel typed in a box: a whole number from 0 to 255 and nothing else ("12", " 255 "); anything else is not a channel (no rounding, no clamping: a wrong number is shown as wrong) */
export function parseChannel(text: string): number | null {
  const t = (text ?? "").trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 255 ? n : null;
}

/** the three boxes as a colour; null while any of them is not a channel */
export function parseChannels(r: string, g: string, b: string): Rgb | null {
  const R = parseChannel(r), G = parseChannel(g), B = parseChannel(b);
  return R === null || G === null || B === null ? null : { r: R, g: G, b: B };
}

/** a HEX typed in a box: with or without "#", three or six digits ("#4f46e5", "4F46E5", "#f53"); null otherwise */
export function parseHex(text: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((text ?? "").trim());
  if (!m) return null;
  const d = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return { r: parseInt(d.slice(0, 2), 16), g: parseInt(d.slice(2, 4), 16), b: parseInt(d.slice(4, 6), 16) };
}

export interface Hsl { h: number; s: number; l: number }

/** the hue, saturation and lightness of a colour, in whole numbers: hue 0 to 359 degrees, saturation and lightness 0 to 100 per cent ("#FF5733" is hsl(11, 100%, 60%)) */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) h = 60 * (max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4);
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** the RGB of a hue (degrees, 360 is 0), a saturation and a lightness (per cent), each channel rounded to a whole number */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const S = s / 100, L = l / 100, H = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs((H % 2) - 1));
  const [r1, g1, b1] = H < 1 ? [c, x, 0] : H < 2 ? [x, c, 0] : H < 3 ? [0, c, x] : H < 4 ? [0, x, c] : H < 5 ? [x, 0, c] : [c, 0, x];
  const m = L - c / 2;
  const q = (v: number): number => Math.round((v + m) * 255);
  return { r: q(r1), g: q(g1), b: q(b1) };
}

/** "hsl(11, 100%, 60%)", as a stylesheet writes it */
export function cssHsl({ h, s, l }: Hsl): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** a hue, saturation or lightness typed in a box: a number from 0 up to `max` (the hue to 360, the others to 100), with or without a % or a degree sign; decimals are allowed; anything else is not one */
export function parseHslPart(text: string, max: number): number | null {
  const t = (text ?? "").trim().replace(/[%°]$/, "").trim();
  if (!/^\d{1,3}(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= max ? n : null;
}

/** the three boxes as an HSL colour; null while any of them is not valid */
export function parseHslBoxes(h: string, s: string, l: string): Hsl | null {
  const H = parseHslPart(h, 360), S = parseHslPart(s, 100), L = parseHslPart(l, 100);
  return H === null || S === null || L === null ? null : { h: H, s: S, l: L };
}

/** the box's text moved up or down by `dir` (1 or -1, or 10 with Shift), kept between `min` and `max`; text that is not a number steps from `fallback` (the colour's own value for that box) */
export function stepPart(text: string, dir: number, min: number, max: number, fallback: number): string {
  const t = (text ?? "").trim().replace(/[%°]$/, "").trim();
  const n = /^\d{1,3}(?:\.\d+)?$/.test(t) ? Number(t) : fallback;
  return String(Math.min(max, Math.max(min, Number((n + dir).toFixed(2)))));
}

/** black or white, whichever reads better on this colour (the perceived brightness, 0 to 255) */
export function inkOn({ r, g, b }: Rgb): "#0f172a" | "#ffffff" {
  return (299 * r + 587 * g + 114 * b) / 1000 > 150 ? "#0f172a" : "#ffffff";
}

export interface ColourAsk { hex: string }

const TO = String.raw`(?:to|in|as|into|->|=>|=|2)`;
const SEP = String.raw`\s*[,\s]\s*`;
const NUM = String.raw`(\d{1,3}(?:\.\d+)?)`;
const MODEL = "rgb|hex|hsl";

/**
 * THE TYPED LINE: "#ff5733 to rgb", "hex ff5733", "#f53", "#ff5733 to hsl", "rgb(255, 87, 51) to hex", "rgb 255 87 51", "255,87,51 to hex", "hsl(11, 100%, 60%)", "hsl 11 100 60 to rgb", and the bare question
 * "rgb to hex" / "hex to rgb" / "hex to hsl" / "rgb to hex to hsl" / "colour converter" (which opens with DEFAULT_HEX).
 * It is the colour's only when the line says so: a "#", the word "hex", "rgb" or "hsl", or "to hex"; so that an ordinary number or a word like "bad" or "add" (three hex digits) is never read as a colour.
 * Returns the colour as a six-digit HEX, or null.
 */
export function parseColour(raw: string): ColourAsk | null {
  const q = (raw ?? "").trim().toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  if (!q || q.length > 60) return null;
  // the question without a colour: two or three of the models, "rgb to hex", "hex and hsl", "rgb to hex to hsl", or "colour converter"
  const pair = new RegExp(String.raw`^(${MODEL})(?:\s*(?:${TO}|and|vs\.?|<->|<=>|&|,|/)\s*|\s+)(${MODEL})(?:\s*(?:${TO}|and|vs\.?|<->|<=>|&|,|/)\s*(${MODEL}))?(?:\s+(?:code|colou?r|converter|conversion|picker))?$`).exec(q);
  if (pair && pair[1] !== pair[2] && pair[3] !== pair[1] && pair[3] !== pair[2]) return { hex: DEFAULT_HEX };
  if (new RegExp(String.raw`^(?:colou?r|${MODEL})\s*(?:code\s*)?(?:converter|conversion|picker)$`).test(q)) return { hex: DEFAULT_HEX };
  // a HEX: "#ff5733", "#f53 to rgb", "hex ff5733", "css color #fff", "ff5733 hex to hsl"; without a "#" the word "hex" (before or after) must be there
  const h = new RegExp(String.raw`^(?:(hex|html|css)\s+)?(?:colou?r\s+)?(?:code\s+)?(#?[0-9a-f]{3,6})(?:\s+(hex))?(?:\s*${TO}\s*(?:rgb|hsl))?$`).exec(q);
  if (h && (h[2].startsWith("#") || h[1] || h[3])) {
    const c = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(h[2]) ? parseHex(h[2]) : null;
    return c ? { hex: toHex(c) } : null;
  }
  // an RGB: "rgb(255, 87, 51)", "rgb 255 87 51 to hex", "255,87,51 to hex", "255 87 51 to hsl"
  const three = String.raw`(\d{1,3})${SEP}(\d{1,3})${SEP}(\d{1,3})`;
  const m = new RegExp(String.raw`^rgb\s*\(?\s*${three}\s*\)?(?:\s*${TO}\s*(?:hex|hsl))?$`).exec(q) ?? new RegExp(String.raw`^\(?\s*${three}\s*\)?\s*${TO}\s*(?:hex|hsl)$`).exec(q);
  if (m) {
    const c = parseChannels(m[1], m[2], m[3]);
    return c ? { hex: toHex(c) } : null;
  }
  // an HSL: "hsl(11, 100%, 60%)", "hsl 11 100 60", "hsl(11deg 100% 60%) to hex"
  const hsl = new RegExp(String.raw`^hsl\s*\(?\s*${NUM}\s*(?:°|deg)?${SEP}${NUM}\s*%?${SEP}${NUM}\s*%?\s*\)?(?:\s*${TO}\s*(?:rgb|hex))?$`).exec(q);
  if (hsl) {
    const v = parseHslBoxes(hsl[1], hsl[2], hsl[3]);
    return v ? { hex: toHex(hslToRgb(v)) } : null;
  }
  return null;
}
