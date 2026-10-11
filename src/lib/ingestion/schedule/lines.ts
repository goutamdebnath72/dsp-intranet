// src/lib/ingestion/schedule/lines.ts
//
// Ruled lines of a scanned table, found from the PIXELS (a "line" is a long thin run of dark pixels, with small gaps allowed).
// The roster circulars print each check-up date ONCE, in a merged cell that spans a whole group of rows; the text alone can not say which rows
// the date covers, the ruled lines around that cell can. Pure functions on a grey-scale array, so they are tested without any image file.

export interface Gray {
  data: Uint8Array; // one byte per pixel, 0 = black, 255 = white
  width: number;
  height: number;
}

export interface Line {
  /** centre of the line across its thickness (y for a horizontal line, x for a vertical one) */
  pos: number;
  /** extent along the line */
  from: number;
  to: number;
  thickness: number;
}

export const DARK = 170; // a pixel darker than this belongs to a line (thin scanned lines are grey, not black)

export async function loadGray(png: Buffer): Promise<Gray> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

function transpose(g: Gray): Gray {
  const out = new Uint8Array(g.data.length);
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) out[x * g.height + y] = g.data[y * g.width + x];
  return { data: out, width: g.height, height: g.width };
}

interface Opts {
  minLen: number; // shortest line
  maxGap?: number; // gap of white pixels that does not break a line
  maxThickness?: number; // thicker than this is a block, not a line
  thr?: number;
  /** only look between these positions along the line (default: the whole width) */
  windowFrom?: number;
  windowTo?: number;
  /** only look between these rows (default: all) */
  rowFrom?: number;
  rowTo?: number;
}

/** Horizontal lines of a picture. */
export function findHorizontalLines(g: Gray, o: Opts): Line[] {
  const thr = o.thr ?? DARK;
  const maxGap = o.maxGap ?? 4;
  const maxT = o.maxThickness ?? 14;
  const xa = Math.max(0, o.windowFrom ?? 0);
  const xb = Math.min(g.width - 1, o.windowTo ?? g.width - 1);
  const ya = Math.max(0, o.rowFrom ?? 0);
  const yb = Math.min(g.height - 1, o.rowTo ?? g.height - 1);
  type Active = { x0: number; x1: number; y0: number; y1: number };
  let active: Active[] = [];
  const done: Active[] = [];
  for (let y = ya; y <= yb; y++) {
    const runs: Array<[number, number]> = [];
    let start = -1;
    let last = -1;
    const base = y * g.width;
    for (let x = xa; x <= xb; x++) {
      if (g.data[base + x] < thr) {
        if (start < 0) start = x;
        last = x;
      } else if (start >= 0 && x - last > maxGap) {
        if (last - start + 1 >= o.minLen) runs.push([start, last]);
        start = -1;
      }
    }
    if (start >= 0 && last - start + 1 >= o.minLen) runs.push([start, last]);

    const next: Active[] = [];
    const used = new Set<number>();
    for (const [r0, r1] of runs) {
      let hit = -1;
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        if (used.has(i) || a.y1 !== y - 1) continue;
        const ov = Math.min(r1, a.x1) - Math.max(r0, a.x0);
        if (ov >= 0.5 * Math.min(r1 - r0, a.x1 - a.x0)) {
          hit = i;
          break;
        }
      }
      if (hit >= 0) {
        used.add(hit);
        const a = active[hit];
        a.x0 = Math.min(a.x0, r0);
        a.x1 = Math.max(a.x1, r1);
        a.y1 = y;
        next.push(a);
      } else next.push({ x0: r0, x1: r1, y0: y, y1: y });
    }
    for (let i = 0; i < active.length; i++) if (!used.has(i)) done.push(active[i]);
    active = next;
  }
  done.push(...active);
  return done
    .filter((a) => a.y1 - a.y0 + 1 <= maxT)
    .map((a) => ({ pos: (a.y0 + a.y1) / 2, from: a.x0, to: a.x1, thickness: a.y1 - a.y0 + 1 }))
    .sort((p, q) => p.pos - q.pos);
}

/** Vertical lines of a picture (same method on the transposed picture). */
export function findVerticalLines(g: Gray, o: Opts): Line[] {
  const t = transpose(g);
  return findHorizontalLines(t, {
    ...o,
    windowFrom: o.rowFrom,
    windowTo: o.rowTo,
    rowFrom: o.windowFrom,
    rowTo: o.windowTo,
  });
}

/** Lines at nearly the same position are one line (a double-drawn or smeared rule). */
export function clusterLines(lines: Line[], tol: number): Line[] {
  const out: Line[] = [];
  for (const l of [...lines].sort((a, b) => a.pos - b.pos)) {
    const last = out[out.length - 1];
    if (last && l.pos - last.pos <= tol) {
      last.from = Math.min(last.from, l.from);
      last.to = Math.max(last.to, l.to);
      last.pos = (last.pos + l.pos) / 2;
      last.thickness = Math.max(last.thickness, l.thickness);
    } else out.push({ ...l });
  }
  return out;
}
