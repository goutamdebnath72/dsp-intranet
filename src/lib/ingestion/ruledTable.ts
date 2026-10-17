// src/lib/ingestion/ruledTable.ts
//
// READING RULED TABLES FROM A SCAN, AT THE ROOT.
//
// WHAT WENT WRONG (found on 17 Oct by reading the same page in different ways): Tesseract reads a page in two steps: it first
// decides, by itself, where the blocks of text are (page segmentation), then it reads each block. On a page that holds a table
// drawn with lines, that first step is UNSTABLE: a change of a few pixels, or of the scale, moves the boundary between "text" and
// "noise". The narrow right-hand column of a wage table was dropped altogether, grid lines were read as the characters "]" and "|",
// and a different scale gave a different wrong answer. (The same engine, given the same table cell by cell, read all 33 cells
// exactly right at five different scales.) The page text stored for a scanned table was therefore sometimes damaged, in a way no
// later step could repair.
//
// A SECOND CAUSE, found on a tilted scan: a page that is a fraction of a degree off makes every table line drift sideways as it goes
// down the page, so the lines break into pieces and no grid can be built. The page is therefore straightened first (deskew).
//
// THE FIX: do not let the engine guess the layout of a table. The lines of a ruled table say exactly where the cells are, so:
//   0. straighten the page if it is tilted (estimateSkew, deskew);
//   1. find the long horizontal and vertical lines of the page and group the ones that touch into tables (detectTables);
//   2. build the grid they make, and join the cells that have no line between them (merged headers) (regionsOf);
//   3. read every cell ON ITS OWN (a small crop holding one value is what the engine does well), and for a number read it again
//      at other scales and take the majority; a number the readings cannot agree on is written as "[unclear]" (readTable);
//   4. say which rows are headings and which are data, and write every data row as "Column: value | Column: value" (tableText),
//      the form the answer step relies on to tell a daily wage from a monthly total;
//   5. blank the table out of the picture the ordinary page reading sees (readRuledTables), so no damaged copy of the table's
//      numbers ever reaches the stored text. A page with no ruled table is not touched at all.
//
// Pure image work (sharp, no OCR here): the cell reader is passed in as a function, so everything is testable without an engine.

import sharp from "sharp";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a cell reader returns: the text, or the text with the engine's own confidence (0 to 100). */
export type CellRead = string | { text: string; conf: number };

/** Reads one small crop (one cell). `meta` says which cell and which reading (0 = first); real readers ignore it. */
export type CellOcr = (png: Buffer, meta: { row: number; col: number; pass: number }) => Promise<CellRead>;

const textOf = (r: CellRead): string => (typeof r === "string" ? r : r.text);
const confOf = (r: CellRead): number => (typeof r === "string" ? 100 : r.conf);

/** A text cell read with less confidence than this is read again with the other (Hindi and Bengali) reader, if there is one. */
export const DOUBTFUL_CONF = 75;

export interface Page {
  W: number;
  H: number;
  gray: Uint8Array;
  /** Pixels at or below this value are ink. */
  thr: number;
}

export interface Region {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export interface Table {
  bbox: Box;
  xs: number[];
  ys: number[];
  regions: Region[];
}

export interface TableReading {
  bbox: Box;
  rows: number;
  cols: number;
  /** The rebuilt table, "[TABLE] ... [/TABLE]". */
  text: string;
  cells: number;
  numericCells: number;
  unclear: number;
  emptyCells: number;
  dataRows: number;
}

export interface RuledPage {
  tables: TableReading[];
  /** The text of every accepted table, one after the other ("" if none). */
  text: string;
  /** The page with every accepted table whited out (null if there was none). Kept for tests; the OCR step now cuts a table out of the page text by coordinates. */
  maskedPng: Buffer | null;
  /** Why a table that was found was not used (for the log). */
  skipped: string[];
}

// ------------------------------------------------------------------------------------------------ reading the picture
export async function loadPage(png: Buffer): Promise<Page> {
  const { data, info } = await sharp(png).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const gray = new Uint8Array(data.buffer, data.byteOffset, data.length);
  return { W: info.width, H: info.height, gray, thr: otsu(gray) };
}

/**
 * The tilt of the page in degrees (positive = clockwise), from a small copy of it: the angle at which the rows of ink line up best
 * (the sharpest horizontal projection). 0 when the page is straight, or when there is too little ink to tell.
 */
export function estimateSkew(p: Page): number {
  const step = Math.max(1, Math.floor(p.W / 800));
  const pts: number[] = [];
  for (let y = 0; y < p.H; y += step) for (let x = 0; x < p.W; x += step) if (p.gray[y * p.W + x] <= p.thr) pts.push(x / step, y / step);
  if (pts.length < 4000) return 0;
  const H = Math.ceil(p.H / step), W = Math.ceil(p.W / step);
  const score = (deg: number): number => {
    const t = (deg * Math.PI) / 180, sin = Math.sin(t), cos = Math.cos(t);
    const bins = new Float64Array(H + W + 4);
    const off = W + 2;
    for (let i = 0; i < pts.length; i += 2) bins[Math.round(pts[i + 1] * cos - pts[i] * sin + off)]++;
    let sc = 0;
    for (let i = 1; i < bins.length; i++) { const d = bins[i] - bins[i - 1]; sc += d * d; }
    return sc;
  };
  let best = 0, bestScore = score(0);
  for (let a = -3; a <= 3.0001; a += 0.1) { const sc = score(a); if (sc > bestScore) { bestScore = sc; best = a; } }
  for (let a = best - 0.1; a <= best + 0.1001; a += 0.02) { const sc = score(a); if (sc > bestScore) { bestScore = sc; best = a; } }
  return Math.round(best * 100) / 100;
}

/** Turn the page by `deg` degrees (as the estimate says) so its lines are level; white fills the corners. */
export async function deskew(png: Buffer, deg: number): Promise<Buffer> {
  return sharp(png).flatten({ background: "#ffffff" }).rotate(deg, { background: "#ffffff" }).png().toBuffer();
}

/** Skew smaller than this is left alone: turning a page resamples it, and a level page does not need it. */
export const MIN_SKEW_TO_FIX = 0.2;

/**
 * A box found in the turned picture, as a box in the picture that was turned. The picture was rotated by `deg` degrees clockwise about its
 * centre (the turned one is W1 x H1); each corner is rotated back and the box that holds all four is returned.
 */
export function boxBackToInput(b: Box, turned: { deg: number; W0: number; H0: number }, W1: number, H1: number): Box {
  const t = (turned.deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const back = (x: number, y: number) => {
    const dx = x - W1 / 2, dy = y - H1 / 2;
    return { x: turned.W0 / 2 + dx * cos + dy * sin, y: turned.H0 / 2 - dx * sin + dy * cos };
  };
  const pts = [back(b.x0, b.y0), back(b.x1, b.y0), back(b.x0, b.y1), back(b.x1, b.y1)];
  return {
    x0: Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)))),
    y0: Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)))),
    x1: Math.min(turned.W0, Math.ceil(Math.max(...pts.map((p) => p.x)))),
    y1: Math.min(turned.H0, Math.ceil(Math.max(...pts.map((p) => p.y)))),
  };
}

/** Otsu's threshold: the grey level that best separates ink from paper. */
export function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = -1, thr = 128;
  const total = gray.length;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

interface HLine { y: number; x0: number; x1: number }
interface VLine { x: number; y0: number; y1: number }

/**
 * The long straight dark runs of the page, as lines. Sizes are relative to the page, so any render scale works.
 * With `allowTilt` a line may be thicker the longer it is (a line tilted by a degree drifts about 1.7% of its length sideways, which makes it
 * look thick): used only to tell that a page HAS lines and is tilted, never to build a grid.
 */
export function findLines(p: Page, allowTilt = false): { h: HLine[]; v: VLine[] } {
  const { W, H, gray, thr } = p;
  const gapTol = Math.max(2, Math.round(0.0012 * W));
  const minH = Math.round(0.08 * W);
  const minV = Math.max(30, Math.round(0.011 * H));
  const maxThick = Math.max(8, Math.round(0.0036 * W));
  const ink = (x: number, y: number) => gray[y * W + x] <= thr;

  // horizontal: runs along each row, joined into lines across neighbouring rows
  type Grp = { y0: number; y1: number; x0: number; x1: number; last: number };
  let open: Grp[] = [];
  const hGroups: Grp[] = [];
  for (let y = 0; y < H; y++) {
    const segs: { x0: number; x1: number }[] = [];
    let s = -1, last = -1, gap = 0;
    for (let x = 0; x <= W; x++) {
      const on = x < W && ink(x, y);
      if (on) { if (s < 0) s = x; last = x; gap = 0; }
      else if (s >= 0) {
        gap++;
        if (gap > gapTol || x === W) { if (last - s + 1 >= minH) segs.push({ x0: s, x1: last }); s = -1; gap = 0; }
      }
    }
    const next: Grp[] = [];
    for (const sg of segs) {
      const g = open.find((o) => o.last === y - 1 && sg.x0 <= o.x1 && sg.x1 >= o.x0 && Math.min(sg.x1, o.x1) - Math.max(sg.x0, o.x0) >= 0.5 * Math.min(sg.x1 - sg.x0, o.x1 - o.x0));
      if (g) { g.y1 = y; g.last = y; g.x0 = Math.min(g.x0, sg.x0); g.x1 = Math.max(g.x1, sg.x1); next.push(g); }
      else { const ng = { y0: y, y1: y, x0: sg.x0, x1: sg.x1, last: y }; hGroups.push(ng); next.push(ng); }
    }
    open = next;
  }
  const h = hGroups.filter((g) => g.y1 - g.y0 + 1 <= maxThick + (allowTilt ? 0.03 * (g.x1 - g.x0) : 0)).map((g) => ({ y: Math.round((g.y0 + g.y1) / 2), x0: g.x0, x1: g.x1 }));

  // vertical: the same, along columns
  type VGrp = { x0: number; x1: number; y0: number; y1: number; last: number };
  let vopen: VGrp[] = [];
  const vGroups: VGrp[] = [];
  for (let x = 0; x < W; x++) {
    const segs: { y0: number; y1: number }[] = [];
    let s = -1, last = -1, gap = 0;
    for (let y = 0; y <= H; y++) {
      const on = y < H && ink(x, y);
      if (on) { if (s < 0) s = y; last = y; gap = 0; }
      else if (s >= 0) {
        gap++;
        if (gap > gapTol || y === H) { if (last - s + 1 >= minV) segs.push({ y0: s, y1: last }); s = -1; gap = 0; }
      }
    }
    const next: VGrp[] = [];
    for (const sg of segs) {
      const g = vopen.find((o) => o.last === x - 1 && sg.y0 <= o.y1 && sg.y1 >= o.y0 && Math.min(sg.y1, o.y1) - Math.max(sg.y0, o.y0) >= 0.5 * Math.min(sg.y1 - sg.y0, o.y1 - o.y0));
      if (g) { g.x1 = x; g.last = x; g.y0 = Math.min(g.y0, sg.y0); g.y1 = Math.max(g.y1, sg.y1); next.push(g); }
      else { const ng = { x0: x, x1: x, y0: sg.y0, y1: sg.y1, last: x }; vGroups.push(ng); next.push(ng); }
    }
    vopen = next;
  }
  const v = vGroups.filter((g) => g.x1 - g.x0 + 1 <= maxThick + (allowTilt ? 0.03 * (g.y1 - g.y0) : 0)).map((g) => ({ x: Math.round((g.x0 + g.x1) / 2), y0: g.y0, y1: g.y1 }));
  return { h, v };
}

/** Positions that are within `tol` of each other are one position. */
export function cluster(values: number[], tol: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of s) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length));
}

// ------------------------------------------------------------------------------------------------ finding tables
/** Any ink beside this edge along its length: the fraction of its points that have a dark pixel within a few pixels. */
function edgeInk(p: Page, horizontal: boolean, at: number, from: number, to: number): number {
  const { W, H, gray, thr } = p;
  const r = Math.max(2, Math.round(0.0012 * W));
  let n = 0, hit = 0;
  for (let t = from; t < to; t++) {
    n++;
    let found = false;
    for (let d = -r; d <= r && !found; d++) {
      const x = horizontal ? t : at + d;
      const y = horizontal ? at + d : t;
      if (x >= 0 && x < W && y >= 0 && y < H && gray[y * W + x] <= thr) found = true;
    }
    if (found) hit++;
  }
  return n ? hit / n : 0;
}

/**
 * A grid line must have ink along at least this share of the table's height (or width). A real line is nearly continuous (90% or more);
 * the left edges of a column of left-aligned words add up to about 45% at one x, so 60% keeps them out. A line that fills less than this
 * is dropped, which at worst joins two cells (the text stays, in one cell) and never invents a value.
 */
export const MIN_LINE_SUPPORT = 0.6;

export function detectTables(p: Page): Table[] {
  const { h, v } = findLines(p);
  const e = Math.max(6, Math.round(0.003 * p.W));
  // lines that touch belong to one table
  const lines = [...h.map((l) => ({ k: "h" as const, l })), ...v.map((l) => ({ k: "v" as const, l }))];
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].k !== "h") continue;
    const a = lines[i].l as HLine;
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].k !== "v") continue;
      const b = lines[j].l as VLine;
      if (b.x >= a.x0 - e && b.x <= a.x1 + e && a.y >= b.y0 - e && a.y <= b.y1 + e) parent[find(i)] = find(j);
    }
  }
  const comps = new Map<number, { h: HLine[]; v: VLine[] }>();
  lines.forEach((ln, i) => {
    const r = find(i);
    const c = comps.get(r) ?? { h: [], v: [] };
    if (ln.k === "h") c.h.push(ln.l as HLine); else c.v.push(ln.l as VLine);
    comps.set(r, c);
  });

  const tol = Math.max(9, Math.round(0.004 * p.W));
  const out: Table[] = [];
  for (const c of comps.values()) {
    if (c.h.length < 3 || c.v.length < 3) continue;
    let xs = cluster(c.v.map((l) => l.x), tol);
    let ys = cluster(c.h.map((l) => l.y), tol);
    if (xs.length < 3 || ys.length < 3) continue;
    // A real grid line has ink along a good part of the table. A single letter stroke that happens to be tall enough, or the underline of a
    // heading, does not: it would become a false column or row boundary and cut a word in two (found on a holiday list: "Dol | atra").
    const outer = { x0: xs[0], y0: ys[0], x1: xs[xs.length - 1], y1: ys[ys.length - 1] };
    xs = xs.filter((x) => edgeInk(p, false, x, outer.y0, outer.y1) >= MIN_LINE_SUPPORT);
    ys = ys.filter((y) => edgeInk(p, true, y, outer.x0, outer.x1) >= MIN_LINE_SUPPORT);
    if (xs.length < 3 || ys.length < 3) continue;
    const bbox = { x0: xs[0], y0: ys[0], x1: xs[xs.length - 1], y1: ys[ys.length - 1] };
    if ((bbox.x1 - bbox.x0) < 0.12 * p.W || (bbox.y1 - bbox.y0) < 0.025 * p.H) continue;
    const regions = regionsOf(p, xs, ys);
    if (regions.length >= 4) out.push({ bbox, xs, ys, regions });
  }
  return out.sort((a, b) => a.bbox.y0 - b.bbox.y0);
}

/** The cells of the grid, with the cells that have no line between them joined (a merged heading is one region). */
export function regionsOf(p: Page, xs: number[], ys: number[]): Region[] {
  const cols = xs.length - 1, rows = ys.length - 1;
  const pad = 5;
  const idx = (r: number, c: number) => r * cols + c;
  const parent = Array.from({ length: rows * cols }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // the line between this cell and the one on its right (vertical edge at xs[c+1], along the cell's height)
      if (c + 1 < cols && edgeInk(p, false, xs[c + 1], ys[r] + pad, ys[r + 1] - pad) < 0.6) join(idx(r, c), idx(r, c + 1));
      // the line between this cell and the one below (horizontal edge at ys[r+1], along the cell's width)
      if (r + 1 < rows && edgeInk(p, true, ys[r + 1], xs[c] + pad, xs[c + 1] - pad) < 0.6) join(idx(r, c), idx(r + 1, c));
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < rows * cols; i++) {
    const g = groups.get(find(i)) ?? [];
    g.push(i);
    groups.set(find(i), g);
  }
  const regions: Region[] = [];
  let rectangular = true;
  for (const g of groups.values()) {
    const rs = g.map((i) => Math.floor(i / cols)), cs = g.map((i) => i % cols);
    const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
    if ((r1 - r0 + 1) * (c1 - c0 + 1) !== g.length) { rectangular = false; break; }
    regions.push({ r0, r1, c0, c1 });
  }
  if (!rectangular) {
    // an odd shape: treat every cell as its own region rather than guess
    const all: Region[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push({ r0: r, r1: r, c0: c, c1: c });
    return all;
  }
  return regions.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
}

// ------------------------------------------------------------------------------------------------ reading cells
const NUMERIC = /^[\s\d.,:/\-\u2013()%]*\d[\s\d.,:/\-\u2013()%]*$/;
export const UNCLEAR = "[unclear]";

/** The text of a cell as read: one line, no stray grid-line characters at its ends. */
export function cleanCell(s: string): string {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s|\]\[_~`'"\u2018\u2019\u201C\u201D\u00B7\u2022*\\/!]+|[\s|\]\[_~`'"\u2018\u2019\u201C\u201D\u00B7\u2022*\\!]+$/g, "")
    .trim();
}

export function isNumericText(s: string): boolean {
  return NUMERIC.test(s);
}

/** Letters the engine confuses with digits, turned back into digits: 8O8 -> 808, l5 -> 15, S0 -> 50. */
export function lookAlike(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[lI|!]/g, "1").replace(/[Ss]/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

/**
 * A number, or something that is clearly meant to be one: mostly digits (and the letters that look like digits). A cell like "8O8" must go
 * through the vote with the numbers, and not be stored as a word.
 */
export function isNumericLike(s: string): boolean {
  if (isNumericText(s)) return true;
  const digits = (s.match(/\d/g) ?? []).length;
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  return digits >= 1 && digits >= letters && isNumericText(lookAlike(s));
}

/** The value two or three readings agree on ("" readings are ignored): null if there is no majority. */
export function vote(readings: string[]): string | null {
  const counts = new Map<string, number>();
  for (const r of readings) counts.set(r.replace(/\s+/g, ""), (counts.get(r.replace(/\s+/g, "")) ?? 0) + 1);
  let best: string | null = null, n = 0;
  for (const [k, c] of counts) if (c > n) { best = k; n = c; }
  return best !== null && n >= 2 ? readings.find((r) => r.replace(/\s+/g, "") === best) ?? best : null;
}

async function cropOf(page: Page, box: Box, scale: number): Promise<Buffer> {
  const base = sharp(Buffer.from(page.gray.buffer, page.gray.byteOffset, page.gray.length), { raw: { width: page.W, height: page.H, channels: 1 } })
    .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 });
  const scaled = scale === 1 ? base : base.resize(Math.max(8, Math.round((box.x1 - box.x0) * scale)));
  return scaled.extend({ top: 14, bottom: 14, left: 14, right: 14, background: "#ffffff" }).png().toBuffer();
}

function inkRatio(page: Page, box: Box): number {
  let n = 0, ink = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) { n++; if (page.gray[y * page.W + x] <= page.thr) ink++; }
  return n ? ink / n : 0;
}

/** How many lines of text a crop holds: stretches of rows with ink, separated by gaps of at least a third of a typical line. */
export function textLines(page: Page, box: Box): number {
  const rows: number[] = [];
  for (let y = box.y0; y < box.y1; y++) {
    let n = 0;
    for (let x = box.x0; x < box.x1; x++) if (page.gray[y * page.W + x] <= page.thr) n++;
    rows.push(n);
  }
  const minInk = Math.max(2, Math.round(0.004 * (box.x1 - box.x0)));
  const minGap = Math.max(4, Math.round(0.008 * page.H)); // about a third of a text line at 300 dpi
  let lines = 0, gap = minGap, inLine = false;
  for (const n of rows) {
    if (n >= minInk) { if (!inLine && gap >= minGap) lines++; inLine = true; gap = 0; }
    else { inLine = false; gap++; }
  }
  return lines;
}

/**
 * True if several cells of one band each hold three or more lines of the same count: the rows of that table are visible to the eye but
 * NOT separated by lines (a heading ruled, the data not). Cutting such a band into cells would glue its rows together, so the table is
 * left to the ordinary page reading, which keeps each row on its line.
 */
export function rowsAreNotRuled(page: Page, table: Table): boolean {
  const { xs, ys } = table;
  const inset = Math.max(4, Math.round(0.0025 * page.W));
  for (let r = 0; r < ys.length - 1; r++) {
    const counts: number[] = [];
    for (const rg of table.regions.filter((g) => g.r0 === r && g.r1 === r)) {
      const box = { x0: xs[rg.c0] + inset, y0: ys[rg.r0] + inset, x1: xs[rg.c1 + 1] - inset, y1: ys[rg.r1 + 1] - inset };
      if (box.x1 - box.x0 < 20 || box.y1 - box.y0 < 12) continue;
      counts.push(textLines(page, box));
    }
    const many = counts.filter((n) => n >= 3);
    if (many.length >= 2 && Math.max(...many) - Math.min(...many) <= 1) return true;
  }
  return false;
}

export interface ReadOptions {
  /** Stop starting new cells after this many milliseconds (the rest of the table is then not used). */
  budgetMs?: number;
  now?: () => number;
  /** A second cell reader (Hindi and Bengali as well as English) for text cells the first reads with doubt. */
  alt?: CellOcr;
}

/** Read every region of the table on its own. Numbers are read up to three times and voted on. */
export async function readTable(page: Page, table: Table, ocr: CellOcr, opts: ReadOptions = {}): Promise<TableReading | null> {
  const now = opts.now ?? Date.now;
  const started = now();
  const { xs, ys, regions } = table;
  const inset = Math.max(4, Math.round(0.0025 * page.W));
  const rows = ys.length - 1, cols = xs.length - 1;
  const texts = new Map<Region, string>();
  let numericCells = 0, unclear = 0, emptyCells = 0;

  for (const rg of regions) {
    if (opts.budgetMs !== undefined && now() - started > opts.budgetMs) return null;
    const box = { x0: xs[rg.c0] + inset, y0: ys[rg.r0] + inset, x1: xs[rg.c1 + 1] - inset, y1: ys[rg.r1 + 1] - inset };
    if (box.x1 - box.x0 < 20 || box.y1 - box.y0 < 12 || inkRatio(page, box) < 0.004) { texts.set(rg, ""); emptyCells++; continue; }
    const meta = { row: rg.r0, col: rg.c0 };
    const crop1 = await cropOf(page, box, 1);
    const read1 = await ocr(crop1, { ...meta, pass: 0 });
    const first = cleanCell(textOf(read1));
    if (!first) { texts.set(rg, ""); emptyCells++; continue; }
    if (!isNumericLike(first)) {
      // a text cell the reader is unsure of (Hindi or Bengali read as English gives gibberish): ask the other reader and keep the more confident
      let best = first;
      if (opts.alt && confOf(read1) < DOUBTFUL_CONF) {
        const altRead = await opts.alt(crop1, { ...meta, pass: 3 });
        const alt = cleanCell(textOf(altRead));
        if (alt && confOf(altRead) > confOf(read1)) best = alt;
      }
      texts.set(rg, best);
      continue;
    }
    // a number: read it again at other scales and take the majority (look-alike letters turned back into digits first)
    numericCells++;
    const m1 = lookAlike(first);
    const m2 = lookAlike(cleanCell(textOf(await ocr(await cropOf(page, box, 1.5), { ...meta, pass: 1 }))));
    let agreed = vote([m1, m2]);
    if (agreed === null) {
      const m3 = lookAlike(cleanCell(textOf(await ocr(await cropOf(page, box, 0.75), { ...meta, pass: 2 }))));
      agreed = vote([m1, m2, m3]);
    }
    if (agreed === null) { texts.set(rg, UNCLEAR); unclear++; } else texts.set(rg, agreed.replace(/\s+/g, ""));
  }

  // which rows are headings: the rows above the first row whose own cells are mostly numbers
  const startsAt = (r: number) => regions.filter((rg) => rg.r0 === r);
  const numericShare = (r: number) => {
    const cells = startsAt(r).map((rg) => texts.get(rg) ?? "").filter((t) => t && t !== UNCLEAR);
    const unc = startsAt(r).filter((rg) => texts.get(rg) === UNCLEAR).length;
    const nums = cells.filter(isNumericLike).length + unc;
    const all = cells.length + unc;
    return all ? nums / all : 0;
  };
  let firstData = -1;
  for (let r = 0; r < rows; r++) if (numericShare(r) >= 0.5) { firstData = r; break; }
  if (firstData < 0) firstData = rows >= 3 ? 1 : 0; // a table of words only: its first row is the heading
  const headerRows = firstData;
  const dataRows = rows - firstData;
  if (dataRows < 1) return null;

  // the label of each column: the deepest heading cell above it; a heading that spans several columns and is not the deepest is a group heading
  const labelOf = (c: number): string => {
    const cands = regions.filter((rg) => rg.r1 < firstData && rg.c0 <= c && rg.c1 >= c && (texts.get(rg) ?? "") !== "");
    cands.sort((a, b) => b.r0 - a.r0);
    return (cands[0] ? texts.get(cands[0]) ?? "" : "").slice(0, 48);
  };
  const labels = Array.from({ length: cols }, (_, c) => labelOf(c));
  const groups = Array.from(
    new Set(
      regions
        .filter((rg) => rg.r1 < firstData && rg.c1 > rg.c0 && rg.r1 - rg.r0 + 1 < headerRows && (texts.get(rg) ?? "") !== "")
        .map((rg) => texts.get(rg) as string),
    ),
  );

  const lines: string[] = ["[TABLE]"];
  if (groups.length) lines.push(`Heading: ${groups.join(" / ")}`);
  for (let r = firstData; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const rg = regions.find((x) => x.r0 <= r && x.r1 >= r && x.c0 <= c && x.c1 >= c);
      const t = rg ? texts.get(rg) ?? "" : "";
      if (!t) continue;
      if (rg && rg.c0 !== c) continue; // a cell merged across columns is written once
      cells.push(labels[c] ? `${labels[c]}: ${t}` : t);
    }
    if (cells.length) lines.push(cells.join(" | "));
  }
  lines.push("[/TABLE]");

  return { bbox: table.bbox, rows, cols, text: lines.join("\n"), cells: regions.length, numericCells, unclear, emptyCells, dataRows };
}

// ------------------------------------------------------------------------------------------------ the whole page
export interface PageOptions extends ReadOptions {
  maxTables?: number;
  maxCells?: number;
}

/**
 * Find the ruled tables of a page, read them cell by cell, and white them out of the picture the ordinary reading will see.
 * A table is used only if it is well read: most of its cells hold something and few numbers are unclear. Otherwise the page is
 * left exactly as it was (the ordinary reading, as before).
 */
export async function readRuledTables(png: Buffer, ocr: CellOcr, opts: PageOptions = {}): Promise<RuledPage> {
  const empty: RuledPage = { tables: [], text: "", maskedPng: null, skipped: [] };
  let page: Page;
  // when the page is turned, the table boxes are mapped back to the picture that was given (the page reading uses THAT one: turning a page
  // resamples it, and a resampled page read worse than the original on a real circular)
  let turned: { deg: number; W0: number; H0: number } | null = null;
  try {
    page = await loadPage(png);
  } catch {
    return empty;
  }
  // a tilted page: its table lines drift and break, so no grid can be built. If the page is tilted and has some lines on it, a straightened copy
  // is tried as well, and whichever of the two gives the better grid is used (the picture used from here on is that one).
  let skewNote = "";
  const W0 = page.W, H0 = page.H;
  let found = detectTables(page);
  const rough = findLines(page, true);
  if (rough.h.length + rough.v.length >= 4) {
    const skew = estimateSkew(page);
    if (Math.abs(skew) >= MIN_SKEW_TO_FIX) {
      try {
        const straightPng = await deskew(png, -skew);
        const straightPage = await loadPage(straightPng);
        const straightFound = detectTables(straightPage);
        const cells = (ts: Table[]) => ts.reduce((n, t) => n + t.regions.length, 0);
        if (cells(straightFound) > cells(found)) {
          page = straightPage;
          turned = { deg: -skew, W0, H0 };
          found = straightFound;
          skewNote = `the page was tilted by ${skew} degrees and was straightened`;
        }
      } catch {
        /* keep the page as it is */
      }
    }
  }
  found = found.slice(0, opts.maxTables ?? 4);
  if (!found.length) return { ...empty, skipped: skewNote ? [skewNote] : [] };
  const accepted: TableReading[] = [];
  const skipped: string[] = [];
  for (const t of found) {
    if (t.regions.length > (opts.maxCells ?? 600)) { skipped.push(`a table of ${t.regions.length} cells is too large to read cell by cell`); continue; }
    if (rowsAreNotRuled(page, t)) { skipped.push("a table whose rows are not separated by lines is left to the page reading"); continue; }
    let reading: TableReading | null = null;
    try {
      reading = await readTable(page, t, ocr, opts);
    } catch {
      reading = null;
    }
    if (!reading) { skipped.push("a table could not be read (time ran out, or it has no data rows)"); continue; }
    const withInk = reading.cells - reading.emptyCells;
    if (withInk < 4 || reading.emptyCells > 0.5 * reading.cells) { skipped.push("a table was mostly empty cells"); continue; }
    if (reading.numericCells > 0 && reading.unclear > 0.25 * reading.numericCells) { skipped.push(`a table had too many unclear numbers (${reading.unclear} of ${reading.numericCells})`); continue; }
    accepted.push(reading);
  }
  if (skewNote) skipped.unshift(skewNote);
  if (!accepted.length) return { ...empty, skipped };

  // blank the accepted tables out of the picture (their lines too), so the ordinary reading cannot produce a damaged copy of them
  const grow = Math.max(6, Math.round(0.003 * page.W));
  const masked = Buffer.from(page.gray); // a copy
  for (const t of accepted) {
    const b = { x0: Math.max(0, t.bbox.x0 - grow), y0: Math.max(0, t.bbox.y0 - grow), x1: Math.min(page.W, t.bbox.x1 + grow), y1: Math.min(page.H, t.bbox.y1 + grow) };
    for (let y = b.y0; y < b.y1; y++) masked.fill(255, y * page.W + b.x0, y * page.W + b.x1);
  }
  const maskedPng = await sharp(masked, { raw: { width: page.W, height: page.H, channels: 1 } }).png().toBuffer();
  const inInputPicture = turned ? accepted.map((t) => ({ ...t, bbox: boxBackToInput(t.bbox, turned as { deg: number; W0: number; H0: number }, page.W, page.H) })) : accepted;
  return { tables: inInputPicture, text: accepted.map((t) => t.text).join("\n\n"), maskedPng, skipped };
}

// ------------------------------------------------------------------------------------------------ checking a table against the page reading
/** One word of the ordinary page reading (Tesseract's TSV, level 5), with where it stands. */
export interface TsvWord {
  /** The position of this word's line in the TSV text (so the TSV can be rebuilt without some words). */
  lineNo: number;
  block: number;
  par: number;
  line: number;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
  text: string;
}

export function parseTsvWords(tsv: string): TsvWord[] {
  const out: TsvWord[] = [];
  const rows = String(tsv ?? "").split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const text = c.slice(11).join("\t").trim();
    if (!text) continue;
    out.push({ lineNo: i, block: +c[2], par: +c[3], line: +c[4], left: +c[6], top: +c[7], width: +c[8], height: +c[9], conf: +c[10], text });
  }
  return out;
}

function centreIn(w: TsvWord, b: Box, margin = 4): boolean {
  const cx = w.left + w.width / 2, cy = w.top + w.height / 2;
  return cx >= b.x0 - margin && cx <= b.x1 + margin && cy >= b.y0 - margin && cy <= b.y1 + margin;
}

/** A word as the table reading would have it: no punctuation around it, lower case. */
function tokenKey(t: string): string {
  return t.toLowerCase().replace(/^[^a-z0-9\u0900-\u097F\u0980-\u09FF]+|[^a-z0-9\u0900-\u097F\u0980-\u09FF]+$/g, "");
}

/** Grid-line debris stuck to a number ("3350.00]", "_13478.00", "1750.00|"): a sign of a damaged table, never part of a value. */
const DEBRIS = /\d[\]|_]|[\]|_]\d/;

/**
 * The page words WITHOUT what the table readings replace. Inside a table's box a word is cut only if the table reading contains it (each word of
 * the table reading can cancel one page word) or if it is grid-line debris; every other word inside the box STAYS, so a heading or a note that
 * the cell reading could not read is never lost. Returns the words kept and the TSV line numbers cut.
 */
export function withoutTableWords(words: TsvWord[], tables: TableReading[]): { words: TsvWord[]; removed: Set<number> } {
  const removed = new Set<number>();
  const kept: TsvWord[] = [];
  const pools = tables.map((t) => {
    const m = new Map<string, number>();
    for (const w of t.text.split(/[\s|]+/)) {
      const k = tokenKey(w.replace(/:$/, ""));
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return { box: t.bbox, m };
  });
  for (const w of words) {
    const pool = pools.find((p) => centreIn(w, p.box));
    if (!pool) { kept.push(w); continue; }
    const k = tokenKey(w.text);
    const n = k ? pool.m.get(k) ?? 0 : 0;
    if (n > 0) { pool.m.set(k, n - 1); removed.add(w.lineNo); }
    else if (DEBRIS.test(w.text)) removed.add(w.lineNo);
    else kept.push(w);
  }
  return { words: kept, removed };
}

/** The TSV text without the word lines whose numbers are given (so the old table rebuilding sees only what is left). */
export function tsvWithout(tsv: string, removed: Set<number>): string {
  return String(tsv ?? "").split(/\r?\n/).filter((_, i) => !removed.has(i)).join("\n");
}

/** The page text from the words: one line per text line, a blank line between paragraphs and blocks. */
export function textOfWords(words: TsvWord[]): string {
  const lines: string[] = [];
  let key = "", cur: string[] = [], last = "";
  const flush = () => { if (cur.length) lines.push(cur.join(" ")); cur = []; };
  for (const w of words) {
    const k = `${w.block}.${w.par}.${w.line}`;
    if (k !== key) {
      flush();
      const para = `${w.block}.${w.par}`;
      if (last && para !== last) lines.push("");
      key = k;
      last = para;
    }
    cur.push(w.text);
  }
  flush();
  return lines.join("\n") + "\n";
}

/** A table is only used if its reading keeps at least this share of the words the page reading saw confidently inside its box. */
export const MIN_RETENTION = 0.8;
/** Words the page reading must be at least this sure of, to count as words that cannot be lost. */
export const SURE_WORD_CONF = 60;

const WORD = /^[A-Za-z][A-Za-z'\u2019-]{3,}$/;

export function wordRetention(words: TsvWord[], table: TableReading): { sure: number; kept: number; share: number } {
  const mine = new Map<string, number>();
  for (const w of table.text.toLowerCase().match(/[a-z][a-z'\u2019-]{3,}/g) ?? []) mine.set(w, (mine.get(w) ?? 0) + 1);
  let sure = 0, kept = 0;
  for (const w of words) {
    if (!centreIn(w, table.bbox) || w.conf < SURE_WORD_CONF || !WORD.test(w.text)) continue;
    sure++;
    const k = w.text.toLowerCase();
    const n = mine.get(k) ?? 0;
    if (n > 0) { kept++; mine.set(k, n - 1); }
  }
  return { sure, kept, share: sure ? kept / sure : 1 };
}

/**
 * Keep only the tables whose reading loses nothing the ordinary page reading saw there. The ordinary reading is the baseline: a table reading
 * that drops its words (a table the grid cut wrongly, a heading taken for data) is worse than none, so that table is left to the page reading.
 */
export function keepWellRead(tables: TableReading[], words: TsvWord[]): { kept: TableReading[]; skipped: string[] } {
  const kept: TableReading[] = [];
  const skipped: string[] = [];
  for (const t of tables) {
    const r = wordRetention(words, t);
    if (r.sure >= 6 && r.share < MIN_RETENTION) skipped.push(`a table reading kept only ${r.kept} of the ${r.sure} words the page reading saw in it, so that table is left to the page reading`);
    else kept.push(t);
  }
  return { kept, skipped };
}
