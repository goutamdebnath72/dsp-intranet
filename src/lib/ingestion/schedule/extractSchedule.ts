// src/lib/ingestion/schedule/extractSchedule.ts
//
// A health check-up roster (an annexure of one circular, one month) -> one record per employee: ticket, name, department as printed, and the
// CHECK-UP DATE. The date is printed once, in the middle of a merged cell, and the cell's ruled lines say which rows it covers: each row's date
// comes from that geometry, never from text order or a guess. Everything external (the OCR) is injected, so the logic is tested without it.
import { findHorizontalLines, loadGray, type Gray } from "./lines";
import { deskewPng, estimateTilt } from "./deskew";
import { findDateCells, findFrame, type DateCell, type Frame } from "./dateCells";
import { overlayColumn, rowsFromWords, wordsFromTsv } from "./rosterRows";
import { judgeDate, parsePrintedDate, parseScheduleMonth, repairPrintedDate } from "./dates";

/** Bump when the reading changes what it returns: a saved reading made by an older version is then ignored. */
export const EXTRACT_VERSION = 2; // 2: the serial, ticket and department-code columns are also read on their own, digits only

export interface ScheduleDeps {
  /** English OCR of a whole page image, as tesseract TSV (word boxes) */
  ocrPageTsv(png: Buffer): Promise<string>;
  /** OCR of a small image holding one line of digits and - . / (a printed date) */
  ocrDateText(png: Buffer): Promise<string>;
  /** optional: OCR (tesseract TSV) of a picture holding ONE column of numbers: only digits are read. Used for the serial, ticket and department-code columns. */
  ocrDigitsTsv?(png: Buffer): Promise<string>;
  /** optional: a line of detail per date cell (for the import report and for finding out why a date was not read) */
  trace?: (message: string) => void;
}

export interface ScheduleRow {
  page: number; // 1-based position in the `pages` given
  seq: number; // 1-based position in the whole roster
  serial: number | null; // the SL.NO printed on the row
  ticket: string | null; // 6 digits, as read
  name: string;
  departmentCode: string | null;
  department: string;
  datePrinted: string | null; // the printed text of the date cell this row sits in
  checkupDate: string | null; // ISO date, or null when it could not be established
  dateNote: string | null; // set when the date was corrected or is odd
  /** true when the date is printed on the other side of a page break (the cell goes on over it) */
  dateFromOtherPage: boolean;
}

export interface ExtractedSchedule {
  scheduleMonth: { month: number; year: number } | null;
  rows: ScheduleRow[];
  /** things a person should look at (a group of an odd size, dates out of order, rows without a date ...) */
  warnings: string[];
  /** pages that are not roster pages (the covering letter): normal, not a problem */
  info: string[];
  /** how many rows each date covers, in order */
  groups: Array<{ date: string | null; rows: number }>;
}

/** 6 digits, or null. A rule next to the digits is often read as a 7th character ("[333787", "1318839"): dropped when that is what it is. */
export function cleanTicket(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 6) return digits;
  if (digits.length === 7 && (/^[^0-9]/.test(t) || digits[0] === "1")) return digits.slice(1);
  return null;
}

const toInt = (s: string): number | null => {
  const d = (s || "").replace(/\D/g, "");
  return d && d.length <= 4 ? parseInt(d, 10) : null;
};

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

/**
 * The page with the table's ruled lines painted out, for reading the WORDS. A rule next to text is read as a character ("62|329551" for a
 * serial number, a rule and a ticket; "JMAHATMA" for a rule and a name), and a word that crosses a rule lands in the wrong column.
 * The date cells are cut from the untouched page (their rules are what we measure).
 */
export async function maskRules(png: Buffer, g: Gray, frame: Frame): Promise<Buffer> {
  const px = new Uint8Array(g.data); // copy
  const paintCol = (x: number, half: number) => {
    for (let xx = Math.max(0, Math.round(x) - half); xx <= Math.min(g.width - 1, Math.round(x) + half); xx++)
      for (let y = Math.max(0, Math.round(frame.top) - 4); y <= Math.min(g.height - 1, Math.round(frame.bottom) + 4); y++) px[y * g.width + xx] = 255;
  };
  for (const x of frame.rules) paintCol(x, 3);
  const width = frame.rules[frame.rules.length - 1] - frame.rules[0];
  const hl = findHorizontalLines(g, { minLen: Math.round(0.6 * width), maxGap: 6, windowFrom: Math.round(frame.rules[0]) - 6, windowTo: Math.round(frame.rules[frame.rules.length - 1]) + 6, rowFrom: Math.round(frame.top) - 6, rowTo: Math.round(frame.bottom) + 6 });
  for (const l of hl) {
    const half = Math.max(1, Math.ceil(l.thickness / 2) + 1);
    for (let y = Math.max(0, Math.round(l.pos) - half); y <= Math.min(g.height - 1, Math.round(l.pos) + half); y++)
      for (let x = Math.max(0, Math.round(l.from) - 2); x <= Math.min(g.width - 1, Math.round(l.to) + 2); x++) px[y * g.width + x] = 255;
  }
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(px), { raw: { width: g.width, height: g.height, channels: 1 } }).withMetadata({ density: 300 }).png().toBuffer();
}

interface PageCell extends DateCell {
  /** the cell(s) merged into this one by the "date is printed in the centre" rule */
  printed: string | null;
  date: string | null;
  note: string | null;
  cy: number | null;
  fromOtherPage: boolean;
}

export async function extractSchedule(pages: Buffer[], deps: ScheduleDeps, knownMonth?: { month: number; year: number } | null): Promise<ExtractedSchedule> {
  const warnings: string[] = [];
  const info: string[] = [];
  let scheduleMonth = knownMonth ?? null;

  // ---------- pass 1: per page, the rows (with their height) and the date cells
  interface RawRow { y: number; cells: string[] }
  const pageData: Array<{ pageNo: number; rows: RawRow[]; cells: PageCell[]; png: Buffer; g: Gray; band: { xL: number; xR: number } }> = [];
  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const tilt = estimateTilt(await loadGray(pages[p]));
    const { png } = await deskewPng(pages[p], tilt.k);
    const g = await loadGray(png);
    const frame = findFrame(g);
    if (!frame) { info.push(`page ${pageNo}: no table (skipped)`); continue; }
    const dc = findDateCells(g, frame);
    if (!dc) { info.push(`page ${pageNo}: a table without a DATE column (skipped)`); continue; }
    const maskedPng = await maskRules(png, g, frame);
    const words = wordsFromTsv(await deps.ocrPageTsv(maskedPng));
    const rows = rowsFromWords(words, frame.rules, frame.top, frame.bottom);
    // the narrow numeric columns are also read on their own, digits only (the page-wide reading drops them on some pages)
    if (deps.ocrDigitsTsv) {
      const sharpMod = (await import("sharp")).default;
      // [column, shape of a valid reading, strip only fills what is missing?]: the serial number is read better by the page-wide pass
      const shape: Array<[number, (t: string) => boolean, boolean]> = [[0, (t) => /^\d{1,4}$/.test(t), true], [1, (t) => /^\d{6}$/.test(t), false], [3, (t) => /^\d{3,5}$/.test(t), false]];
      for (const [col, accept, onlyFill] of shape) {
        const x0 = Math.round(frame.rules[col] + 4);
        const x1 = Math.round(frame.rules[col + 1] - 4);
        const y0 = Math.max(0, Math.round(frame.top + 4));
        const y1 = Math.min(g.height, Math.round(frame.bottom - 4));
        if (x1 - x0 < 20 || y1 - y0 < 40) continue;
        const strip = await sharpMod(maskedPng).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).withMetadata({ density: 300 }).png().toBuffer();
        const sw = wordsFromTsv(await deps.ocrDigitsTsv(strip)).map((w) => ({ text: w.text, cy: y0 + w.top + w.height / 2 }));
        const n = overlayColumn(rows, col, sw, accept, onlyFill);
        deps.trace?.(`page ${pageNo}: column ${col} read on its own: ${sw.length} words, ${n} rows updated`);
      }
    }
    if (!scheduleMonth) scheduleMonth = parseScheduleMonth(words.map((w) => w.text).join(" "));
    pageData.push({ pageNo, rows, cells: dc.cells.map((c) => ({ ...c, printed: null, date: null, note: null, cy: null, fromOtherPage: false })), png, g, band: dc.band });
  }

  // ---------- pass 2: read the date printed in each cell (the schedule month is known by now)
  for (const pd of pageData) {
    for (const cell of pd.cells) {
      if (cell.y1 - cell.y0 < 70) continue; // too small to hold a date (a heading row, a sliver)
      for (const binarize of [false, true]) {
        const crop = await cropCellText(pd.g, pd.band, cell, binarize);
        if (!crop) break;
        const text = (await deps.ocrDateText(crop.png)).replace(/\s+/g, " ").replace(/^[^\d]+|[^\d]+$/g, "").trim();
        let ok = false;
        if (parsePrintedDate(text)) {
          const j = judgeDate(text, scheduleMonth);
          cell.printed = text; cell.cy = crop.cy;
          if (j.ok) { cell.date = j.date; cell.note = j.note; ok = true; }
          else cell.note = j.note; // a date, but not one of this schedule: kept as a problem, never stored as fine
        } else if (text) {
          const r = repairPrintedDate(text, scheduleMonth);
          cell.printed = text; cell.cy = crop.cy;
          if (r) { cell.date = r.date; cell.note = r.note; ok = true; }
        } else { cell.cy = crop.cy; }
        deps.trace?.(`page ${pd.pageNo} cell ${Math.round(cell.y0)}-${Math.round(cell.y1)} (${Math.round(cell.y1 - cell.y0)} px${cell.openTop ? ", open top" : ""}${cell.openBottom ? ", open bottom" : ""}) ${binarize ? "[2nd try] " : ""}-> ${JSON.stringify(text)}${cell.date ? ` => ${cell.date}${cell.note ? " (" + cell.note + ")" : ""}` : ""}`);
        if (ok) break;
      }
    }
  }

  // ---------- pass 3: cells cut by a stray mark are one merged cell. A blank cell between two others joins the neighbour whose date is
  // printed in the CENTRE of the merged cell (that is where the date of a merged cell always is).
  for (const pd of pageData) {
    const cs = pd.cells;
    for (let i = 1; i < cs.length - 1; i++) {
      const c = cs[i];
      if (c.cy !== null) continue; // an interior cell with no ink at all can never be a date cell
      // the run of such cells starting here
      let j = i;
      while (j + 1 < cs.length && cs[j + 1].cy === null) j++;
      const above = cs[i - 1];
      const below = cs[j + 1];
      if (!below || above.cy === null || below.cy === null) { i = j; continue; }
      const errAbove = Math.abs(above.cy - (above.y0 + cs[j].y1) / 2);
      const errBelow = Math.abs(below.cy - (cs[i].y0 + below.y1) / 2);
      const into = errBelow <= errAbove ? below : above;
      if (into === below) { below.y0 = cs[i].y0; } else { above.y1 = cs[j].y1; }
      deps.trace?.(`page ${pd.pageNo}: ${j - i + 1} sliver cell(s) at ${Math.round(cs[i].y0)}-${Math.round(cs[j].y1)} joined the ${into === below ? "next" : "previous"} cell (the date is printed in its centre)`);
      cs.splice(i, j - i + 1);
      i = Math.max(0, i - 1);
    }
  }

  // ---------- pass 4: a cell cut by a page break is ONE cell: its date is printed on one side only
  for (let k = 0; k + 1 < pageData.length; k++) {
    const a = pageData[k].cells[pageData[k].cells.length - 1];
    const b = pageData[k + 1].cells[0];
    if (!a || !b || !a.openBottom || !b.openTop) continue;
    if (a.date && b.date && a.date !== b.date) warnings.push(`pages ${pageData[k].pageNo}-${pageData[k + 1].pageNo}: the group cut by the page break has two different dates (${a.date} and ${b.date})`);
    else if (a.date && !b.date) { b.date = a.date; b.printed = a.printed; b.note = a.note; b.fromOtherPage = true; }
    else if (b.date && !a.date) { a.date = b.date; a.printed = b.printed; a.note = b.note; a.fromOtherPage = true; }
  }

  // ---------- pass 5: every employee row takes the date of the cell it sits in
  const rows: ScheduleRow[] = [];
  const groups: Array<{ date: string | null; rows: number }> = [];
  const noDate: string[] = [];
  let seq = 0;
  for (const pd of pageData) {
    for (const r of pd.rows) {
      const ticket = cleanTicket(r.cells[1] ?? "");
      const serial = toInt(r.cells[0] ?? "");
      // a rule next to the first letter is read as a character ("|ATIT", "\\JAYANTA"): only letters, digits and the usual name marks are kept
      const name = (r.cells[2] ?? "").replace(/[^A-Za-z .'\-]/g, " ").replace(/^[\s.'\-]+/, "").replace(/\s+/g, " ").trim();
      const department = (r.cells[4] ?? "").replace(/^[\s|\\\[\]]+/, "").trim();
      const rawCode = (r.cells[3] ?? "").replace(/\D/g, "");
      const code = /^\d{3,5}$/.test(rawCode) ? rawCode : rawCode.length === 6 && rawCode[0] === "1" ? rawCode.slice(1) : null; // a department code has 3-5 digits
      if (!ticket && serial === null && !(name && code)) continue; // titles, headings, the signature: not employees
      if (!ticket && !name && !department) continue;
      const cell = pd.cells.find((c) => r.y >= c.y0 && r.y < c.y1) ?? pd.cells.find((c) => r.y >= c.y0 - 4 && r.y < c.y1 + 4) ?? null;
      seq++;
      rows.push({
        page: pd.pageNo, seq, serial, ticket, name, departmentCode: code, department,
        datePrinted: cell?.printed ?? null, checkupDate: cell?.date ?? null, dateNote: cell?.note ?? null, dateFromOtherPage: cell?.fromOtherPage ?? false,
      });
      const d = cell?.date ?? null;
      if (d === null) noDate.push(`${seq}`);
      const last = groups[groups.length - 1];
      if (last && last.date === d && d !== null) last.rows++;
      else groups.push({ date: d, rows: 1 });
    }
  }

  // ---------- checks a person should hear about
  if (noDate.length) warnings.push(`${noDate.length} row(s) have no check-up date (rows ${noDate.slice(0, 12).join(", ")}${noDate.length > 12 ? " ..." : ""})`);
  const sizes = groups.filter((g) => g.date).map((g) => g.rows);
  if (sizes.length >= 3) {
    const freq = new Map<number, number>();
    for (const s of sizes) freq.set(s, (freq.get(s) ?? 0) + 1);
    const modal = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    groups.forEach((g, i) => {
      if (g.date && g.rows !== modal && i !== groups.length - 1) warnings.push(`the group of ${g.date} has ${g.rows} rows; the usual group has ${modal}`);
    });
  }
  for (let i = 1; i < groups.length; i++) {
    const a = groups[i - 1].date;
    const b = groups[i].date;
    if (a && b && b <= a) warnings.push(`dates out of order: ${a} then ${b}`);
  }
  // The printed SL.NO runs 1, 2, 3 ... A single misread number is only OCR noise; a SHIFT (the number stays off by the same amount for several
  // rows) means a row was missed or doubled.
  const off = rows.map((r) => (r.serial === null ? null : r.seq - r.serial));
  let shifted = 0;
  for (let i = 0; i < off.length; i++) {
    const a = off[i];
    if (a === null || a === 0) continue;
    const next = off.slice(i + 1, i + 4).filter((x) => x !== null);
    if (next.length && next.every((x) => x === a)) shifted++;
  }
  if (shifted) warnings.push(`the printed SL.NO is off by a constant amount over ${shifted}+ row(s): a row was probably missed or doubled`);
  return { scheduleMonth, rows, warnings, info, groups };
}
