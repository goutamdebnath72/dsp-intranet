// src/lib/ingestion/schedule/rosterGeometry.ts
//
// The GEOMETRY of a roster page (image analysis only, no OCR): the table frame, the merged DATE cells, the ruled line under every row, and a clean crop of each date cell's
// printed text. The geometry decides which rows belong to which date; Gemini only reads the words and the printed dates.
import { clusterLines, findHorizontalLines, loadGray, type Gray } from "./lines";
import { deskewPng, estimateTilt } from "./deskew";
import { findDateCells, findFrame, type DateCell, type Frame } from "./dateCells";

export interface RosterGeometry {
  png: Buffer; // the straightened page
  g: Gray;
  frame: Frame;
  band: { xL: number; xR: number };
  cells: DateCell[];
  /** the y of every ruled line between rows of the table (the frame's top and bottom included), top to bottom */
  rowEdges: number[];
}

/** The geometry of a roster page, or null when the page has no ruled table with a date column. */
export async function rosterPageGeometry(pngIn: Buffer): Promise<RosterGeometry | null> {
  const tilt = estimateTilt(await loadGray(pngIn));
  const { png } = await deskewPng(pngIn, tilt.k);
  const g = await loadGray(png);
  const frame = findFrame(g);
  if (!frame) return null;
  const dc = findDateCells(g, frame);
  if (!dc) return null;
  // the rows are separated by rules in the columns beside the date column (the date column itself is cut into merged cells)
  const n = frame.rules.length;
  const xL = frame.rules[n - 3], xR = frame.rules[n - 2];
  const width = xR - xL;
  const margin = Math.max(6, Math.round(0.03 * width));
  const rules = clusterLines(
    findHorizontalLines(g, { minLen: Math.round(0.85 * (width - 2 * margin)), maxGap: 4, windowFrom: Math.round(xL + margin), windowTo: Math.round(xR - margin), rowFrom: Math.max(0, Math.round(frame.top) - 12), rowTo: Math.min(g.height - 1, Math.round(frame.bottom) + 12) }),
    10,
  ).map((l) => l.pos);
  const inner = rules.filter((y) => y > frame.top + 15 && y < frame.bottom - 15);
  return { png, g, frame, band: dc.band, cells: dc.cells, rowEdges: [frame.top, ...inner, frame.bottom] };
}

/**
 * The printed text of a date cell, cut out on its own: long vertical strokes (a cell rule that wandered into the cell) are painted out first,
 * then a tight box around what is left, enlarged. `cy` is the vertical centre of the text. null = nothing printed in the cell.
 */
export async function cropCellText(g: Gray, band: { xL: number; xR: number }, cell: DateCell, binarize = false): Promise<{ png: Buffer; cy: number } | null> {
  const x0 = Math.round(band.xL + 6);
  const x1 = Math.round(band.xR - 6);
  const y0 = Math.round(cell.y0 + 8);
  const y1 = Math.round(cell.y1 - 8);
  const w = x1 - x0;
  const h = y1 - y0;
  if (h < 30 || w < 30) return null;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = g.data[(y0 + y) * g.width + (x0 + x)];
  // paint out long vertical strokes: a column that is dark over most of the cell's height is a rule, not text
  for (let x = 0; x < w; x++) {
    let dark = 0;
    for (let y = 0; y < h; y++) if (px[y * w + x] < 150) dark++;
    if (dark > 0.55 * h) for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) for (let y = 0; y < h; y++) px[y * w + xx] = 255;
  }
  // The ink as connected blobs. Specks (a few pixels of scanner dust) must not stretch the box: only the blobs on the text's own line count.
  const INK = 165;
  const label = new Int32Array(w * h).fill(-1);
  const blobs: Array<{ minX: number; maxX: number; minY: number; maxY: number; ink: number }> = [];
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (px[sy * w + sx] >= INK || label[sy * w + sx] >= 0) continue;
      const id = blobs.length;
      const blob = { minX: sx, maxX: sx, minY: sy, maxY: sy, ink: 0 };
      const stack = [sy * w + sx];
      label[sy * w + sx] = id;
      while (stack.length) {
        const cur = stack.pop()!;
        const cy = (cur / w) | 0;
        const cx = cur - cy * w;
        blob.ink++;
        if (cx < blob.minX) blob.minX = cx;
        if (cx > blob.maxX) blob.maxX = cx;
        if (cy < blob.minY) blob.minY = cy;
        if (cy > blob.maxY) blob.maxY = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (px[ni] < INK && label[ni] < 0) { label[ni] = id; stack.push(ni); }
        }
      }
      blobs.push(blob);
    }
  }
  const big = blobs.filter((b) => b.ink >= 40); // digits are big blobs; dust and the odd stray mark are not
  if (big.length < 2) return null; // blank: the date of this group is printed on the other side of the page break
  const hs = big.map((b) => b.maxY - b.minY + 1).sort((a, b2) => a - b2);
  const H = hs[Math.floor(hs.length / 2)]; // a digit's height
  const midY = big.map((b) => (b.minY + b.maxY) / 2).sort((a, b2) => a - b2)[Math.floor(big.length / 2)];
  // blobs on the text's line (the dashes and dots are small but sit on it)
  const onLine = blobs.filter((b) => b.ink >= 6 && Math.abs((b.minY + b.maxY) / 2 - midY) <= 0.9 * H);
  if (onLine.length < 2) return null;
  const minX = Math.min(...onLine.map((b) => b.minX));
  const maxX = Math.max(...onLine.map((b) => b.maxX));
  const minY = Math.min(...onLine.map((b) => b.minY));
  const maxY = Math.max(...onLine.map((b) => b.maxY));
  const pad = 14;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cw = Math.min(w - left, maxX - minX + 1 + 2 * pad);
  const ch = Math.min(h - top, maxY - minY + 1 + 2 * pad);
  if (cw < 40 || ch < 30) return null; // a few specks, not a printed date (the OCR would only complain "image too small")
  // only the line's own ink goes into the crop: everything else is painted white
  const sub = new Uint8Array(cw * ch).fill(255);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx2 = left + x, sy2 = top + y;
    const lb = label[sy2 * w + sx2];
    if (lb >= 0 && onLine.includes(blobs[lb])) sub[y * cw + x] = px[sy2 * w + sx2];
  }
  // enlarge so that a digit is ~50 px high: the OCR reads that best (thin small print needs more, bold large print less)
  const scale = Math.min(4, Math.max(1, 50 / H));
  const sharp = (await import("sharp")).default;
  let img = sharp(Buffer.from(sub), { raw: { width: cw, height: ch, channels: 1 } }).resize({ width: Math.round(cw * scale) });
  if (binarize) img = img.threshold(150);
  return { png: await img.withMetadata({ density: 300 }).png().toBuffer(), cy: y0 + (minY + maxY) / 2 };
}
