// src/lib/ingestion/schedule/geminiSchedule.ts
//
// READING A HEALTH CHECK-UP ROSTER WITH GEMINI. The work is split the way each part is done best:
//   * the WORDS of the rows (serial, ticket, name, department code, department) are read by two Gemini models (a primary and a checker) from the whole page image, as JSON;
//   * the DATES are read by Gemini from a clean crop of each merged date cell (a few digits, so a cheap model reads them; a stronger one is asked when the first reading is not a
//     date of the schedule's month);
//   * the GEOMETRY decides which rows sit under which date: the ruled lines of the table (rosterGeometry.ts, image analysis, no OCR). A model asked for the date of every row
//     misplaces the rows at the edge of a group; the rules of the table do not.
// Checks (any warning means the schedule is NOT stored, a person looks at it): the two readers must find the same number of rows; the table must have as many ruled rows as the
// readers found; a printed date must be a date of the schedule's month; groups of an odd size; dates out of order; the SL.NO sequence. A different ticket or department code read by
// the checker is kept as an alternative reading so that the HR directory can confirm one of them.

import { geminiReader, type PageReader } from "../pageReader";
import { shrinkForReading } from "../pageImage";
import { rosterPageGeometry, cropCellText } from "./rosterGeometry";
import { analyzeRosterStructure } from "./rosterProbe";
import { isEmployeeRow, cleanTicket, ScheduleTimeBudgetError, type ExtractedSchedule, type ScheduleRow } from "./extractSchedule";
import { judgeDate, parsePrintedDate, parseScheduleMonth, repairPrintedDate } from "./dates";
import { DEFAULT_CHECK_MODEL, DEFAULT_PRIMARY_MODEL } from "../geminiOcr";

export const ROSTER_PROMPT = `You are reading ONE PAGE of a health check-up schedule of employees: a ruled table with the columns SL.NO, T.NO (a 6-digit ticket number), NAME, DEPTT. CODE (3 to 5 digits), DEPARTMENT and DATE.
Return ONLY a JSON object, no markdown, with exactly these keys:
{"title": "<the heading text of the page, e.g. the line with the month the schedule is for>", "month": "<the month and year the schedule is for, as printed, or null>", "rows": [ {"serial": <integer or null>, "ticket": "<the T.NO exactly as printed>", "name": "<the NAME exactly as printed>", "deptCode": "<the DEPTT. CODE exactly as printed, or null>", "department": "<the DEPARTMENT exactly as printed>"} ] }
Rules: include EVERY row of the table, in order, one object per ruled row, and nothing else (no heading row, no signature, no dates). Copy digits exactly as printed; never correct, guess or invent a value. If a cell cannot be read, use null for it.`;

export const DATE_PROMPT = `This image holds ONE printed date from a table cell (digits with - . / between them, for example 06.01.2025 or 07-01-2025). Reply with ONLY that date exactly as printed and nothing else. If no date is printed in the image, reply NONE.`;

export interface RosterReaders {
  primary: PageReader;
  checker: PageReader | null;
  /** reads a crop holding one printed date: a cheap model first ... */
  dateFast: PageReader;
  /** ... and a stronger one when the first reading is not a date of the schedule's month */
  dateStrong: PageReader | null;
}

export function geminiRosterReaders(env: Record<string, string | undefined> = process.env): RosterReaders {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set: a roster is read by Gemini");
  const rows = (model: string): PageReader => {
    const r = geminiReader({ apiKey, model, prompt: ROSTER_PROMPT, json: true, timeoutMs: 110_000 });
    return { name: r.name, read: async (png, hooks) => r.read(await shrinkForReading(png), hooks) };
  };
  const date = (model: string): PageReader => geminiReader({ apiKey, model, prompt: DATE_PROMPT, timeoutMs: 40_000 });
  const primaryModel = (env.OCR_PRIMARY_MODEL || env.GEMINI_VISION_MODEL || DEFAULT_PRIMARY_MODEL).trim();
  const checkModel = (env.OCR_CHECK_MODEL || DEFAULT_CHECK_MODEL).trim();
  const hasChecker = !!checkModel && checkModel !== primaryModel;
  return { primary: rows(primaryModel), checker: hasChecker ? rows(checkModel) : null, dateFast: date(hasChecker ? checkModel : primaryModel), dateStrong: hasChecker ? date(primaryModel) : null };
}

export interface RawRosterRow { serial: number | null; ticket: string; name: string; deptCode: string | null; department: string }
export interface RosterReading { title: string; month: string | null; rows: RawRosterRow[] }

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();
const toInt = (v: unknown): number | null => { const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : null; };
const cleanCode = (v: unknown): string | null => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 3 && d.length <= 5 ? d : null; };

/** The model's JSON reply as a reading; null when it is not a roster reading at all. */
export function parseRosterReply(raw: string): RosterReading | null {
  const t = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let j: any;
  try { j = JSON.parse(t); } catch { return null; }
  if (!j || !Array.isArray(j.rows)) return null;
  const rows: RawRosterRow[] = j.rows.filter((r: any) => r && typeof r === "object").map((r: any) => ({
    serial: toInt(r.serial), ticket: str(r.ticket), name: str(r.name), deptCode: r.deptCode === null || r.deptCode === undefined ? null : str(r.deptCode), department: str(r.department),
  }));
  return { title: str(j.title), month: j.month === null || j.month === undefined ? null : str(j.month), rows };
}

/**
 * Which ruled interval each row of the reading sits in. The table's heading rows (title, column names) lie ABOVE the first data row, and the date column shows where that is: the
 * heading is a closed cell (or two) at the top of the date column with no date in it, and the first cell with a date starts at the first data row (a cell open at the top is a group carried over a page break, never a heading). Intervals above that point are not data.
 * Where a rule is missing (rows with no line between them) one interval holds several rows: the interval whose pieces would be tallest is divided, again and again, until the
 * number of intervals equals the number of rows the readers found. Returns the vertical centre of every row, how many rows had to be made by dividing, and how many
 * intervals were left over at the bottom.
 */
export function alignRows(edges: number[], cells: Array<{ y0: number; y1: number; openTop: boolean; date: string | null; printed: string | null }>, rows: number): { centers: number[]; divided: number; surplus: number; dataTop: number } {
  let lead = 0;
  while (lead < cells.length - 1 && cells[lead].date === null && !cells[lead].printed && !cells[lead].openTop) lead++;
  if (lead > 0 && cells[lead].date === null) lead = 0; // no date anywhere after them: nothing marks where the data starts
  const dataTop = lead > 0 ? cells[lead].y0 : edges[0];
  const bottom = edges[edges.length - 1];
  const all = [...edges].sort((x, y) => x - y);
  const hs = all.slice(1).map((e, i) => e - all[i]).filter((h) => h > 0).sort((x, y) => x - y);
  const median = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  const tol = 0.3 * median;
  const inner = all.filter((e) => e > dataTop + tol && e < bottom - tol);
  const marks = [dataTop, ...inner, bottom];
  const segs = marks.slice(1).map((e, i) => ({ a: marks[i], b: e, k: 1 }));
  const intervals = segs.length;
  let total = intervals;
  let divided = 0;
  for (let guard = 0; guard < 400 && total < rows; guard++) {
    let best = 0;
    segs.forEach((g, i) => { if ((g.b - g.a) / g.k > (segs[best].b - segs[best].a) / segs[best].k) best = i; });
    segs[best].k++;
    total++;
    divided++;
  }
  const centers: number[] = [];
  for (const g of segs) for (let q = 0; q < g.k; q++) centers.push(g.a + ((q + 0.5) * (g.b - g.a)) / g.k);
  return { centers: centers.slice(0, rows), divided, surplus: Math.max(0, intervals - rows), dataTop };
}

const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

function nearName(a: string, b: string): boolean {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y || x === y) return true;
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) { let diag = prev[0]; prev[0] = i; for (let j = 1; j <= y.length; j++) { const t = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1)); diag = t; } }
  return prev[y.length] <= Math.max(2, Math.floor(Math.max(x.length, y.length) * 0.2));
}

export interface GeminiScheduleDeps {
  readers: RosterReaders;
  shouldStop?: () => boolean;
  trace?: (message: string) => void;
}

async function readRows(reader: PageReader, png: Buffer): Promise<{ reading: RosterReading | null; error?: string }> {
  try { const r = parseRosterReply(await reader.read(png)); return r ? { reading: r } : { reading: null, error: "the reply was not a roster reading" }; }
  catch (e) { return { reading: null, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}

interface PageCell { y0: number; y1: number; openTop: boolean; openBottom: boolean; printed: string | null; date: string | null; note: string | null; fromOther: boolean; hasRows: boolean; /** vertical centre of the printed date; null = nothing printed in the cell */ cy: number | null }
interface PageData { pageNo: number; a: RosterReading; b: RosterReading | null; rowCenters: number[]; cellOfRow: number[]; cells: PageCell[]; geom: NonNullable<Awaited<ReturnType<typeof rosterPageGeometry>>> }

/** Reads the roster pages and returns the same ExtractedSchedule as before. Pages that are not roster pages are skipped (a covering letter). */
export async function extractScheduleGemini(pages: Buffer[], deps: GeminiScheduleDeps, knownMonth?: { month: number; year: number } | null): Promise<ExtractedSchedule> {
  const warnings: string[] = [];
  const info: string[] = [];
  let scheduleMonth = knownMonth ?? null;
  const pageData: PageData[] = [];

  // ---------- pass 1: per page, the geometry and the words of the rows
  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    if (deps.shouldStop?.()) throw new ScheduleTimeBudgetError();
    const structure = await analyzeRosterStructure(pages[p]).catch(() => ({ rosterLike: false, why: "the page image could not be analysed" }));
    if (!structure.rosterLike) { info.push(`page ${pageNo}: not a roster page (${structure.why}); skipped`); continue; }
    const geom = await rosterPageGeometry(pages[p]).catch(() => null);
    if (!geom) { info.push(`page ${pageNo}: no ruled table with a date column; skipped`); continue; }
    const [a, b] = await Promise.all([readRows(deps.readers.primary, pages[p]), deps.readers.checker ? readRows(deps.readers.checker, pages[p]) : Promise.resolve({ reading: null, error: "no checker is configured" })]);
    if (!a.reading) { warnings.push(`page ${pageNo}: the roster could not be read (${a.error})`); continue; }
    if (!b.reading) warnings.push(`page ${pageNo}: the second reader could not read the roster (${b.error}); a roster is not stored on one reading`);
    else if (b.reading.rows.length !== a.reading.rows.length) warnings.push(`page ${pageNo}: the two readers found a different number of rows (${a.reading.rows.length} and ${b.reading.rows.length})`);
    deps.trace?.(`page ${pageNo}: ${a.reading.rows.length} rows by the primary, ${b.reading ? b.reading.rows.length : "none"} by the checker; the table has ${geom.rowEdges.length - 1} ruled rows in ${geom.cells.length} date cells`);
    if (!scheduleMonth) scheduleMonth = parseScheduleMonth(`${a.reading.title} ${a.reading.month ?? ""}`) ?? (b.reading ? parseScheduleMonth(`${b.reading.title} ${b.reading.month ?? ""}`) : null);

    // the ruled lines of the table; which row sits between which two is worked out in pass 3, once the date cells are known (alignRows)
    const cells: PageCell[] = geom.cells.map((c) => ({ y0: c.y0, y1: c.y1, openTop: c.openTop, openBottom: c.openBottom, printed: null, date: null, note: null, fromOther: false, hasRows: false, cy: null }));
    pageData.push({ pageNo, a: a.reading, b: b.reading, rowCenters: [], cellOfRow: [], cells, geom });
  }

  // ---------- pass 2: the date printed in each date cell that holds rows (a cheap model first; a stronger one when that is not a date of this month)
  for (const pd of pageData) {
    for (const cell of pd.cells) {
      if (cell.y1 - cell.y0 < 70) continue; // a cell too small to hold a date (a sliver cut by a stray mark): it joins its neighbour below
      if (deps.shouldStop?.()) throw new ScheduleTimeBudgetError();
      const crop = await cropCellText(pd.geom.g, pd.geom.band, { y0: cell.y0, y1: cell.y1, openTop: cell.openTop, openBottom: cell.openBottom }, false);
      if (!crop) continue; // nothing printed: the date of this group is on the other side of the page break (or the cell is a sliver)
      cell.cy = crop.cy;
      for (const reader of [deps.readers.dateFast, deps.readers.dateStrong]) {
        if (!reader) continue;
        let text = "";
        try { text = str(await reader.read(crop.png)).replace(/^[^\d]+|[^\d]+$/g, ""); } catch { text = ""; }
        if (!text || /^none$/i.test(text)) continue;
        if (parsePrintedDate(text)) {
          const j = judgeDate(text, scheduleMonth);
          cell.printed = text;
          if (j.ok) { cell.date = j.date; cell.note = j.note; break; }
          cell.note = j.note; // a date, but not one of this schedule: ask the stronger reader, and keep it as a problem if nobody agrees
        } else {
          const r = repairPrintedDate(text, scheduleMonth);
          cell.printed = text;
          if (r) { cell.date = r.date; cell.note = r.note; break; }
        }
      }
      deps.trace?.(`page ${pd.pageNo} cell ${Math.round(cell.y0)}-${Math.round(cell.y1)}: printed "${cell.printed ?? ""}" -> ${cell.date ?? "no date"}`);
    }
  }

  // ---------- pass 3: cells cut by a stray mark are one merged cell. A blank cell between two others joins the neighbour whose date is printed in the CENTRE of the merged cell
  // (that is where the date of a merged cell always is). Then every row takes the cell it sits in.
  for (const pd of pageData) {
    const cs = pd.cells;
    const al = alignRows(pd.geom.rowEdges, cs, pd.a.rows.length); // before the cells are joined: the first data row is found from the cells as the geometry found them
    pd.rowCenters = al.centers;
    if (al.surplus > 2) warnings.push(`page ${pd.pageNo}: the table has ${al.surplus} more ruled rows than the readers found`);
    if (al.divided > 0) deps.trace?.(`page ${pd.pageNo}: ${al.divided} row(s) had no ruled line of their own and were placed by dividing the taller intervals`);
    for (let i = 1; i < cs.length - 1; i++) {
      if (cs[i].cy !== null) continue; // an interior cell with no ink at all can never be a date cell
      let j = i;
      while (j + 1 < cs.length && cs[j + 1].cy === null) j++;
      const above = cs[i - 1], below = cs[j + 1];
      if (!below || above.cy === null || below.cy === null) { i = j; continue; }
      const errAbove = Math.abs(above.cy - (above.y0 + cs[j].y1) / 2);
      const errBelow = Math.abs(below.cy - (cs[i].y0 + below.y1) / 2);
      if (errBelow <= errAbove) below.y0 = cs[i].y0; else above.y1 = cs[j].y1;
      deps.trace?.(`page ${pd.pageNo}: ${j - i + 1} sliver cell(s) joined the ${errBelow <= errAbove ? "next" : "previous"} cell`);
      cs.splice(i, j - i + 1);
      i = Math.max(0, i - 1);
    }
    pd.cellOfRow = pd.rowCenters.map((cy) => {
      let k = cs.findIndex((c) => cy >= c.y0 && cy < c.y1);
      if (k < 0) k = cs.reduce((best, c, i) => (Math.abs((c.y0 + c.y1) / 2 - cy) < Math.abs((cs[best].y0 + cs[best].y1) / 2 - cy) ? i : best), 0);
      cs[k].hasRows = true;
      return k;
    });
  }

  // ---------- pass 4: a cell cut by a page break is ONE cell: its date is printed on one side only
  for (let k = 0; k + 1 < pageData.length; k++) {
    const a = pageData[k].cells.filter((c) => c.hasRows).slice(-1)[0];
    const b = pageData[k + 1].cells.filter((c) => c.hasRows)[0];
    if (!a || !b || !a.openBottom || !b.openTop) continue;
    if (a.date && b.date && a.date !== b.date) warnings.push(`pages ${pageData[k].pageNo}-${pageData[k + 1].pageNo}: the group cut by the page break has two different dates (${a.date} and ${b.date})`);
    else if (a.date && !b.date) { b.date = a.date; b.printed = a.printed; b.note = a.note; b.fromOther = true; }
    else if (b.date && !a.date) { a.date = b.date; a.printed = b.printed; a.note = b.note; a.fromOther = true; }
  }

  // ---------- pass 5: every employee row takes the date of the cell it sits in
  const rows: ScheduleRow[] = [];
  const groups: Array<{ date: string | null; rows: number }> = [];
  const noDate: string[] = [];
  let seq = 0;
  for (const pd of pageData) {
    const sameLen = !!pd.b && pd.b.rows.length === pd.a.rows.length;
    for (let i = 0; i < pd.a.rows.length; i++) {
      const A = pd.a.rows[i];
      const B = sameLen ? pd.b!.rows[i] : null;
      const ticket = cleanTicket(A.ticket);
      const name = A.name.replace(/[^A-Za-z .'\-]/g, " ").replace(/^[\s.'\-]+/, "").replace(/\s+/g, " ").trim();
      const code = cleanCode(A.deptCode);
      if (!isEmployeeRow(ticket, name, code, A.department)) continue;
      const cell = pd.cells[pd.cellOfRow[i]];
      seq++;
      const ticketAlt: string[] = [], codeAlt: string[] = [];
      if (B) {
        const bt = cleanTicket(B.ticket); if (bt && bt !== ticket) ticketAlt.push(bt);
        const bc = cleanCode(B.deptCode); if (bc && bc !== code) codeAlt.push(bc);
        if (ticketAlt.length === 0 && !nearName(A.name, B.name)) warnings.push(`page ${pd.pageNo}, row ${seq}: the two readers read different names ("${A.name}" and "${B.name}")`);
      }
      rows.push({ page: pd.pageNo, seq, serial: A.serial, ticket, name, departmentCode: code, department: A.department, datePrinted: cell?.printed ?? null, checkupDate: cell?.date ?? null, dateNote: cell?.note ?? null, dateFromOtherPage: cell?.fromOther ?? false, ticketAlt, codeAlt });
      const d = cell?.date ?? null;
      if (d === null) noDate.push(`${seq}`);
      const last = groups[groups.length - 1];
      if (last && last.date === d && d !== null) last.rows++; else groups.push({ date: d, rows: 1 });
    }
  }

  // ---------- checks a person should hear about (the same as for the old reading)
  if (noDate.length) warnings.push(`${noDate.length} row(s) have no check-up date (rows ${noDate.slice(0, 12).join(", ")}${noDate.length > 12 ? " ..." : ""})`);
  const sizes = groups.filter((g) => g.date).map((g) => g.rows);
  if (sizes.length >= 3) {
    const freq = new Map<number, number>();
    for (const s of sizes) freq.set(s, (freq.get(s) ?? 0) + 1);
    const modal = [...freq.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
    groups.forEach((g, i) => { if (g.date && g.rows !== modal && i !== groups.length - 1) warnings.push(`the group of ${g.date} has ${g.rows} rows; the usual group has ${modal}`); });
  }
  for (let i = 1; i < groups.length; i++) { const x = groups[i - 1].date, y = groups[i].date; if (x && y && y <= x) warnings.push(`dates out of order: ${x} then ${y}`); }
  const off = rows.map((r) => (r.serial === null ? null : r.seq - r.serial));
  let shifted = 0;
  for (let i = 0; i < off.length; i++) {
    const v = off[i];
    if (v === null || v === 0) continue;
    const next = off.slice(i + 1, i + 4).filter((q) => q !== null);
    if (next.length && next.every((q) => q === v)) shifted++;
  }
  if (shifted) warnings.push(`the printed SL.NO is off by a constant amount over ${shifted}+ row(s): a row was probably missed or doubled`);
  return { scheduleMonth, rows, warnings, info, groups };
}
