// src/lib/ingestion/schedule/deskew.ts
//
// Scanned pages are tilted by a fraction of a degree (up to 0.4 degrees on the roster pages): a long vertical rule drifts ~25 px across the
// page, which breaks any straight-line search and puts a row's text at a different height from the ruled line beside it. So every page
// is straightened first. The tilt is MEASURED from the page itself: the angle at which the long rules (vertical) line up best.
import type { Gray } from "./lines";

export interface Tilt {
  /** horizontal drift per vertical pixel of a vertical rule (dx/dy); 0 = perfectly upright */
  k: number;
  /** how dark the best vertical path is, as a share of the page height (a low value = no rules to measure from) */
  strength: number;
}

/** Score a candidate tilt: the sharper the column profile along tilted vertical paths, the better the rules line up. */
function score(g: Gray, k: number, step: number): { sharp: number; peak: number } {
  const { width: W, height: H, data } = g;
  const col = new Float64Array(W);
  const y0 = Math.round(H * 0.08);
  const y1 = Math.round(H * 0.92);
  for (let y = y0; y < y1; y += step) {
    const shift = Math.round(k * (y - H / 2));
    const base = y * W;
    for (let x = 0; x < W; x++) {
      if (data[base + x] < 200) {
        const xx = x - shift;
        if (xx >= 0 && xx < W) col[xx]++;
      }
    }
  }
  let sharp = 0;
  let peak = 0;
  for (let x = 12; x < W - 12; x++) {
    sharp += col[x] * col[x];
    if (col[x] > peak) peak = col[x];
  }
  return { sharp, peak };
}

/** Measure the tilt of a page from its vertical rules: coarse search, then a finer one around the best. */
export function estimateTilt(g: Gray, maxTilt = 0.02): Tilt {
  const step = 3;
  let best = { k: 0, s: -1, peak: 0 };
  for (let k = -maxTilt; k <= maxTilt + 1e-9; k += 0.001) {
    const r = score(g, k, step);
    if (r.sharp > best.s) best = { k, s: r.sharp, peak: r.peak };
  }
  const centre = best.k;
  for (let k = centre - 0.001; k <= centre + 0.001 + 1e-9; k += 0.00025) {
    const r = score(g, k, step);
    if (r.sharp > best.s) best = { k, s: r.sharp, peak: r.peak };
  }
  const rows = Math.floor((g.height * 0.84) / step);
  return { k: best.k, strength: best.peak / rows };
}

/** Rotate the picture so that the rules become vertical/horizontal. Returns the straightened PNG and the angle used (degrees, clockwise). */
export async function deskewPng(png: Buffer, k: number): Promise<{ png: Buffer; angleDeg: number }> {
  const angleDeg = (Math.atan(k) * 180) / Math.PI;
  if (Math.abs(angleDeg) < 0.02) return { png, angleDeg: 0 };
  const sharp = (await import("sharp")).default;
  const out = await sharp(png).rotate(angleDeg, { background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
  return { png: out, angleDeg };
}
