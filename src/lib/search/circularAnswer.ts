// src/lib/search/circularAnswer.ts
//
// ANSWER FIRST, SOURCES AFTER. When a question is answered by text in the stored documents (circulars, holiday policy notes,
// announcements), the person should see the ANSWER first, as clear FACTS (a small table, or one key figure), and, for
// accountability, the document it came from with the exact words that prove it. This module is GENERIC: it knows nothing about any
// particular circular. It
//   1. picks the passages to read (buildPassages),
//   2. asks the model for FACTS, each with a verbatim quote (buildAnswerPrompt, parseModelAnswer),
//   3. REFUSES to show anything the text does not prove (verifyAnswer).
//
// The model is never trusted. An answer is shown only when ALL of these hold, for EVERY row (label | value) of the answer:
//   - its quote is found, word for word (ignoring spaces, case and punctuation), in the passage it names;
//   - the value's numbers and words are all inside that quote (nothing added, nothing calculated);
//   - the label's words are inside that quote, so a value can never sit under another row's label;
//   - a number taken from a TABLE ROW (a quote with five or more numbers) must come with its COLUMN label, and that label must stand
//     right next to the number in the quote ("Wages Per Day: 808"). A total, or any other column, can therefore never be passed off
//     as the figure asked for (this is the mistake that put "Rs 20995.30 per day" on screen on 17 Oct: a monthly total);
//   - words like "daily" or "monthly" in the title or note are backed by a column that says so;
//   - every number in the title and note is in a quote or in the cited document's own title or date.
// If any rule fails, no answer is shown and the person sees the matching documents exactly as before: "a right answer or an honest
// 'not found', never a confident wrong one". If the stored text of a scan is damaged (a lost column, a garbled number) the rules
// fail, so a damaged scan gives NO answer, never a wrong one.
//
// Pure (no database, no network): unit-tested by circularAnswer.selftest.ts. The model call is passed in (an LlmFn).

import { numbersOf } from "../ingestion/readingCheck";
import { detectSynthesisIntent } from "./synthesisIntent";

export type PassageType = "circular" | "announcement" | "holiday";

/**
 * What a SECOND READER said about the numbers of each page of a circular (see ingestion/readingCheck.ts): the numbers both readings have, and the
 * numbers only the pipeline's reading has. Present only for a page that was checked AND whose stored text is still the text that was checked.
 */
export type PageChecks = Record<number, { confirmed: string[]; unconfirmed: string[] }>;

export interface PassagePart {
  page: number | null;
  text: string;
}

export interface Passage {
  /** 1-based number the model cites. */
  n: number;
  type: PassageType;
  id: number;
  title: string;
  /** ISO date or null. */
  date: string | null;
  /** The page of the best-matching part (for the source line). */
  page: number | null;
  /** All of the text the model reads for this document. */
  text: string;
  parts: PassagePart[];
  /** What a second reader said about the numbers of the pages (only for checked pages whose text is unchanged). */
  checks?: PageChecks;
}

export interface DocInput {
  type: PassageType;
  id: number;
  title: string;
  date: string | null;
  chunks: { page: number | null; index: number; text: string }[];
  /** What a second reader said about the numbers of the pages (only for checked pages whose text is unchanged). */
  checks?: PageChecks;
}

/** One fact as the model writes it. */
export interface RowIn {
  label: string;
  column: string;
  value: string;
  source: number;
  quote: string;
}

export interface ModelAnswer {
  answerable: boolean;
  title: string;
  rows: RowIn[];
  note: string;
}

/** One verified fact, ready to show. */
export interface AnswerRow {
  /** False when the label and the column are the assistant's own wording and could not be tied to the document's words (prose); true otherwise. */
  linked?: boolean;
  label: string;
  column: string;
  value: string;
  source: number;
  quote: string;
  page: number | null;
}

export interface CircularAnswer {
  title: string;
  rows: AnswerRow[];
  note: string;
  sources: { n: number; type: PassageType; id: number; headline: string; publishedAt: string | null; page: number | null }[];
}

export type VerifyResult = { ok: true; value: CircularAnswer; /** the model's own reply, kept for the log */ reply?: string } | { ok: false; reason: string; reply?: string };

// ------------------------------------------------------------------------------------------------ text helpers
/** Letters and digits only, lower case: "Rs. 15,000/-" and "rs 15000" compare equal. Hindi and Bengali letters are kept. */
export function normalizeForQuote(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, lakh: 100000,
};

/**
 * Every number in a text, as numeric values: 15,000 -> 15000; 1720.30 -> 1720.3; the parts of a date 01.01.2024 -> 1, 1, 2024;
 * number words (four -> 4). The word "one" counts only when `includeOne` is set (it is mostly a pronoun: "no one", "one of").
 */
export function numbersIn(text: string, includeOne = false): number[] {
  const out: number[] = [];
  let t = String(text ?? "");
  t = t.replace(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g, " $1 $2 $3 ");
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(v);
  }
  for (const w of t.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const v = NUMBER_WORDS[w[0]];
    if (v === undefined) continue;
    if (w[0] === "one" && !includeOne) continue;
    out.push(v);
  }
  return out;
}

const STOP = new Set(
  "what which when where does have that this with from about there their they will would should could and the for are was were how many much any all can per into been being also than then some such only other over under these those your you who whom whose".split(" "),
);

function keywords(question: string): string[] {
  return Array.from(new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w))));
}

// ------------------------------------------------------------------------------------------------ which results are worth reading
/** The top result must match at least this well (percent): a weaker match is probably not about the question, so no model call. */
export const MIN_TOP_MATCH = 85;
/** Other results are read together with the top one only if they match at least this well. */
export const MIN_OTHER_MATCH = 80;
export const MAX_DOCS = 3;

export function percentOf(r: { matchPercentage?: unknown; similarity?: number | null }): number {
  if (typeof r.matchPercentage === "number") return r.matchPercentage;
  return typeof r.similarity === "number" ? Math.round(r.similarity * 100) : 0;
}

const KNOWN_TYPES: PassageType[] = ["circular", "announcement", "holiday"];

/** The documents to read for a question: up to three, and only when the FIRST result is a strong match. */
export function pickAnswerItems(
  results: { id: number; type: string; matchPercentage?: unknown; similarity?: number | null }[],
  max: number = MAX_DOCS,
): { type: PassageType; id: number }[] {
  if (!results.length || percentOf(results[0]) < MIN_TOP_MATCH) return [];
  return results
    .filter((r) => KNOWN_TYPES.includes(r.type as PassageType) && percentOf(r) >= MIN_OTHER_MATCH)
    .slice(0, max)
    .map((r) => ({ type: r.type as PassageType, id: r.id }));
}

// ------------------------------------------------------------------------------------------------ choosing what the model reads
/**
 * One passage per document. A short document is read whole; a long one is cut to the parts that share the most words with the
 * question (kept in page order). The whole budget is shared, so the model never gets more than about 2,000 tokens of text.
 */
export function buildPassages(question: string, docs: DocInput[], totalBudget = 8000): Passage[] {
  const live = docs.filter((d) => d.chunks.some((c) => c.text && c.text.trim()));
  if (!live.length) return [];
  const perDoc = Math.max(1500, Math.floor(totalBudget / live.length));
  const kw = keywords(question);
  const out: Passage[] = [];
  for (const d of live) {
    const chunks = d.chunks.filter((c) => c.text && c.text.trim()).map((c, i) => ({ ...c, order: i, text: c.text.trim() }));
    const scored = chunks.map((c) => ({ ...c, score: kw.filter((w) => c.text.toLowerCase().includes(w)).length }));
    const chosen: typeof scored = [];
    let used = 0;
    for (const c of [...scored].sort((a, b) => b.score - a.score || a.order - b.order)) {
      if (used >= perDoc) break;
      const room = perDoc - used;
      const text = c.text.length > room ? c.text.slice(0, room) : c.text;
      chosen.push({ ...c, text });
      used += text.length + 2; // the two characters that separate parts when they are joined
    }
    chosen.sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.order - b.order);
    const best = [...scored].sort((a, b) => b.score - a.score || a.order - b.order)[0];
    out.push({
      n: out.length + 1,
      type: d.type,
      id: d.id,
      title: d.title,
      date: d.date,
      page: best?.page ?? chosen[0]?.page ?? null,
      text: chosen.map((c) => c.text).join("\n\n"),
      parts: chosen.map((c) => ({ page: c.page, text: c.text })),
      ...(d.checks ? { checks: d.checks } : {}),
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the request to the model
export function buildAnswerPrompt(question: string, passages: Passage[]): string {
  const blocks = passages
    .map((p) => `[${p.n}] Document: ${p.title}${p.date ? ` (dated ${p.date.slice(0, 10)})` : ""}\n${p.text}`)
    .join("\n\n----\n\n");
  return `You answer ONE question for an employee of a steel plant, using ONLY the numbered passages below, which are the text of official documents.

QUESTION: ${question}

RULES
1. If the passages do not clearly contain the answer, return {"answerable": false}. Do not guess and never use outside knowledge.
2. Copy numbers, amounts, dates and names exactly as printed. Do NOT calculate, add, convert or round anything.
3. Give the answer as FACTS in "rows", one row per fact. Each row has:
   "label": what the fact is about, in a few words (an area, a category, a person, "Last date" ...);
   "value": the answer cell, copied from the quote: a number, a date, a name, a colour ... Nothing else: no units, no "per day", no sentence;
   "column": what the value measures, as the document labels it (for example "Wages Per Day", "Casual Leave"). REQUIRED for a number that comes from a table;
   "source": the passage number;
   "quote": text copied CHARACTER FOR CHARACTER from that passage, at most 300 characters, ONE table row or ONE sentence, that contains the label, the column label and the value together.
4. TABLES: where a table was rebuilt as "Column: value | Column: value", use those labels and take the value from the column the question asks about. NEVER take a total or any other column just because it is the number you can read. If the column labels are missing or unclear, return {"answerable": false}.
5. "title": a short heading for the answer (at most 80 characters), with the date or year it applies from if the document says so. Use words like daily, monthly or yearly in the title or note ONLY if a column label or the quote itself says so.
6. "note": optional, one short sentence for a condition or exception the passages state. Leave it out if there is none.
7. If the passages give different values for different years or versions, give a row for each and say in the note which is the latest.

Return JSON only, in this form:
{"answerable": true, "title": "...", "rows": [{"label": "...", "column": "...", "value": "...", "source": 1, "quote": "..."}], "note": "..."}

PASSAGES
${blocks}`;
}

export function parseModelAnswer(raw: string): ModelAnswer | null {
  let t = String(raw ?? "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o: any;
  try {
    o = JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const rows: RowIn[] = Array.isArray(o.rows)
    ? o.rows
        .filter((r: any) => r && typeof r === "object")
        .map((r: any) => ({ label: str(r.label), column: str(r.column), value: str(r.value), source: Number(r.source), quote: typeof r.quote === "string" ? r.quote : "" }))
    : [];
  return { answerable: o.answerable === true, title: str(o.title), rows, note: str(o.note) };
}

// ------------------------------------------------------------------------------------------------ the check
export const MAX_TITLE_CHARS = 90;
export const MAX_NOTE_CHARS = 220;
export const MAX_CELL_CHARS = 60;
export const MAX_VALUE_CHARS = 120;
/** The share of the model's own quote words that must stand in the document's context of the value for the quote to be taken as a pointer to it. */
export const SNAP_MIN_OVERLAP = 0.5;
export const MAX_QUOTE_CHARS = 300;
export const MAX_ROWS = 12;
/** A quote with at least this many different numbers (or the app's " | " cell separator) is a table row: its numbers need their column label. */
export const TABLE_LIKE_NUMBERS = 5;

const FILLER = new Set(["per", "the", "for", "and", "with", "rs", "inr", "rupees", "rupee", "not", "are", "was", "has", "any", "all", "its", "our", "out", "off", "may", "can"]);
const CURRENCY = new Set(["rs", "inr", "rupees", "rupee"]);

/** The words of a text (letters only, lower case, three letters or more) without filler. */
function contentWords(s: string): string[] {
  return (String(s ?? "").toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((w) => !STOP.has(w) && !FILLER.has(w));
}
function wordSet(s: string): Set<string> {
  return new Set(String(s ?? "").toLowerCase().match(/\p{L}+/gu) ?? []);
}

const TIME_GROUPS: string[][] = [
  ["day", "days", "daily"],
  ["week", "weeks", "weekly"],
  ["month", "months", "monthly"],
  ["year", "years", "yearly", "annual", "annually"],
  ["hour", "hours", "hourly"],
  // a claim of RECENCY ("the 2024 trial is the latest") goes beyond what a few retrieved circulars can prove; only the document's own words may say it
  ["latest", "newest", "newer", "recent", "recently"],
];

/**
 * True if the column label stands right next to the value in the quote. In a table row ("TOTAL: 20995.30 | Wages Per Day: 808") a value
 * belongs to the label BEFORE it, never to the label after it, so there the value must FOLLOW its column label (`allowBefore` false).
 * In a sentence ("Four (04) days Casual Leave") the value may come before the label.
 */
function columnBesideValue(nq: string, column: string, value: string, allowBefore: boolean): boolean {
  const nc = normalizeForQuote(column);
  let nv = normalizeForQuote(value);
  for (const c of CURRENCY) if (nv.startsWith(c) && nv.length > c.length) nv = nv.slice(c.length);
  if (!nc || !nv) return false;
  const GAP = 8; // a colon, a bracket, "rs" and the like normalise to a few characters at most
  let from = 0;
  for (;;) {
    const at = nq.indexOf(nc, from);
    if (at < 0) return false;
    const end = at + nc.length;
    const after = nq.indexOf(nv, end);
    if (after >= 0 && after - end <= GAP) return true;
    if (allowBefore) {
      const before = nq.lastIndexOf(nv, at);
      if (before >= 0 && at - (before + nv.length) <= GAP && before + nv.length <= at) return true;
    }
    from = at + 1;
  }
}

/** Lower-case letters and digits only, each kept character with its place in the original text. */
function normalizeWithMap(s: string): { norm: string; at: number[] } {
  let norm = "";
  const at: number[] = [];
  let i = 0;
  for (const ch of s) {
    for (const c of ch.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")) { norm += c; at.push(i); }
    i += ch.length;
  }
  return { norm, at };
}

/** True if a label ("Area", "BASIC", "Daily Wages (Rs.)") stands twice in the text: two rows of a table, not one. */
function labelRepeats(span: string): boolean {
  const seen = new Set<string>();
  for (const m of span.matchAll(/([\p{L}][\p{L}\p{N} .()/&'-]{0,50}?):/gu)) {
    const k = normalizeForQuote(m[1]);
    if (k.length < 2) continue;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/**
 * A quote that leaves cells out. A model asked for "the label, the column and the value together" often copies only those cells ("Area: WORKS |
 * Daily Wages (Rs. Per Day of duty): 808"), or marks what it left out with "...". That is accepted when every piece (cells split at "|" and at an
 * ellipsis) is found word for word in the document, IN ORDER, within ONE table row: the span from the first piece to the last must be short and must
 * not hold the same column label twice (that would be two rows, and a label could end up beside another row's value).
 */
export function piecesInOneRow(quote: string, passageText: string): boolean {
  const pieces = quote.split(/…|\.{3}|\|/).map((x) => normalizeForQuote(x)).filter((x) => x.length >= 2);
  if (pieces.length < 2) return false;
  const { norm, at } = normalizeWithMap(passageText);
  const maxSpan = Math.max(450, quote.length * 3);
  for (let s = norm.indexOf(pieces[0]); s >= 0; s = norm.indexOf(pieces[0], s + 1)) {
    let pos = s + pieces[0].length, ok = true;
    for (let k = 1; k < pieces.length; k++) {
      const idx = norm.indexOf(pieces[k], pos);
      if (idx < 0) { ok = false; break; }
      pos = idx + pieces[k].length;
    }
    if (!ok) continue;
    const span = passageText.slice(at[s], at[pos - 1] + 1);
    if (span.length <= maxSpan && !labelRepeats(span)) return true;
  }
  return false;
}

/**
 * The words of the SENTENCE of the document that holds the quote. A model often quotes only a clause (`may please be read as "Rs.14,999/-"`),
 * whose subject ("the amount of the Gift Card") stands earlier in the same sentence. The sentence runs back to the previous full stop followed by a
 * space (or line break) and forward to the next one, at most 400 characters either way; "Rs.15,000" and "w.e.f." do not end a sentence (no space after
 * the dot). ONLY PROSE QUALIFIES: the result is empty if the quote cannot be located, if a real sentence boundary is not found on BOTH sides within 400
 * characters (a table, flattened to one run of text, has none: its heading must never back a value of another column), or if the window holds a table
 * cell separator ("|") or a table marker.
 */
export function sentenceWordsAround(passageText: string, quote: string): Set<string> {
  const { norm, at } = normalizeWithMap(passageText);
  const whole = normalizeForQuote(quote);
  let from = -1, to = -1;
  const i = whole ? norm.indexOf(whole) : -1;
  if (i >= 0) { from = at[i]; to = at[i + whole.length - 1] + 1; }
  else {
    const pieces = quote.split(/…|\.{3}|\|/).map((x) => normalizeForQuote(x)).filter((x) => x.length >= 2);
    if (pieces.length) {
      const a = norm.indexOf(pieces[0]);
      const b = a >= 0 ? norm.indexOf(pieces[pieces.length - 1], a) : -1;
      if (a >= 0 && b >= 0) { from = at[a]; to = at[b + pieces[pieces.length - 1].length - 1] + 1; }
    }
  }
  if (from < 0) return new Set();
  const lo = Math.max(0, from - 400);
  const lm = [...passageText.slice(lo, from).matchAll(/[.!?]["')\]]?\s+|\n/g)].pop();
  if (!lm && lo > 0) return new Set(); // no sentence start within reach
  const a0 = lm && lm.index !== undefined ? lo + lm.index + lm[0].length : 0;
  const rm = passageText.slice(to, to + 400).match(/[.!?]["')\]]?(\s|$)|\n/);
  if (!rm && to + 400 < passageText.length) return new Set(); // no sentence end within reach
  const b0 = rm && rm.index !== undefined ? to + rm.index + rm[0].length : passageText.length;
  const window = passageText.slice(a0, b0);
  if (/\||\[\/?TABLE\]/.test(window)) return new Set(); // a table row, not a sentence
  return wordSet(window);
}

/** For the terminal: where a refused quote stops matching the document (the longest start of it that IS there). */
export function quoteMissReport(quote: string, passageText: string): string {
  const nq = normalizeForQuote(quote), np = normalizeForQuote(passageText);
  let k = 0;
  while (k < nq.length && np.includes(nq.slice(0, k + 1))) k++;
  return k >= nq.length ? "the whole quote is there (checked as pieces in one row)" : `it matches the document for its first ${k} of ${nq.length} letters and digits, then breaks at: "...${quote.slice(Math.max(0, quote.length - (nq.length - k) - 12), quote.length - (nq.length - k) + 40).replace(/\s+/g, " ")}"`;
}

/** The cells of a table row as the app's own table reader writes it: "Label: value | Label: value". */
function rowCells(quote: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const cell of quote.split("|")) {
    const i = cell.indexOf(":");
    if (i > 0) out.push({ label: cell.slice(0, i), value: cell.slice(i + 1) });
  }
  return out;
}

/**
 * In a rebuilt table row the value must sit in a CELL whose label carries the column the model names. The model may shorten a long heading
 * ("Daily Wages" for "Daily Wages (Rs. Per Day of duty)") or reorder it ("Wages per day"), but every word it names must be in the label of THE SAME
 * cell as the value: a value can still never be passed off under another column's label (a total is not a daily wage).
 */
function columnInValueCell(quote: string, column: string, value: string): boolean {
  let nv = normalizeForQuote(value);
  for (const c of CURRENCY) if (nv.startsWith(c) && nv.length > c.length) nv = nv.slice(c.length);
  const nc = normalizeForQuote(column);
  const cw = contentWords(column);
  if (!nv || !nc) return false;
  for (const cell of rowCells(quote)) {
    const cv = normalizeForQuote(cell.value);
    // the cell holds this value: all of it (808 is not 8080), possibly followed by words ("808 per day")
    if (!(cv === nv || (cv.startsWith(nv) && !/^\d/.test(cv.slice(nv.length))))) continue;
    if (normalizeForQuote(cell.label).includes(nc)) return true;
    const lw = wordSet(cell.label);
    if (cw.length && cw.every((w) => lw.has(w))) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ dates
const MONTHS: Record<string, number> = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
const dateKey = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const real = new Date(Date.UTC(y, m - 1, d)); // the calendar decides: 31.02.2024 is no date
  return real.getUTCFullYear() === y && real.getUTCMonth() === m - 1 && real.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};

/**
 * The dates in a text, each as a canonical key (YYYY-MM-DD) with its place: 5.12.2024, 05-12-2024, 5/12/2024 (day first, as in these circulars),
 * "5th December, 2024", 5 Dec 2024, December 5, 2024. The OCR often reads the "th" as a quote mark: 5" December, 2024.
 */
export function datesIn(text: string): { key: string; from: number; to: number }[] {
  const out: { key: string; from: number; to: number }[] = [];
  const add = (key: string | null, m: RegExpMatchArray) => { if (key) out.push({ key, from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }); };
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})(?!\d)/g)) add(dateKey(+m[3], +m[2], +m[1]), m);
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*(?:st|nd|rd|th)?\s*["'\u2019\u201d]?\s*(?:of\s+)?([A-Za-z]{3,9})\.?,?\s*(\d{4})(?!\d)/g)) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) add(dateKey(+m[3], mo, +m[1]), m); }
  for (const m of text.matchAll(/(?<![A-Za-z])([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:st|nd|rd|th)?,?\s*(\d{4})(?!\d)/g)) { const mo = MONTHS[m[1].toLowerCase()]; if (mo) add(dateKey(+m[3], mo, +m[2]), m); }
  return out.sort((a, b) => a.from - b.from);
}

/** True if everything in the value is in the text: its dates by meaning (any written form), its other numbers and its words as written. */
function valueIsIn(value: string, text: string): boolean {
  const vd = datesIn(value);
  let rest = value;
  for (const d of [...vd].reverse()) rest = rest.slice(0, d.from) + " " + rest.slice(d.to);
  const have = new Set(datesIn(text).map((d) => d.key));
  if (!vd.every((d) => have.has(d.key))) return false;
  const qn = new Set(numbersIn(text, true)), qw = wordSet(text);
  return numbersIn(rest, true).every((x) => qn.has(x)) && contentWords(rest).every((w) => CURRENCY.has(w) || qw.has(w));
}

// ------------------------------------------------------------------------------------------------ verifying the FACT, not the model's wording
interface Cell { label: string; nlabel: string; from: number; to: number; /** the first cell of a table ROW: it follows the previous row's last cell WITHOUT a pipe (glued on), or starts a line */ rowStart: boolean }

/** The cells ("Label: value") of the app's own table text between two positions; a cell glued on without a "|" (the next row's first one) is split off. */
function parseCells(text: string, lo: number, hi: number): Cell[] {
  const cells: Cell[] = [];
  let pos = lo;
  for (const seg of text.slice(lo, hi).split("|")) {
    const segFrom = pos;
    pos += seg.length + 1;
    const found = [...seg.matchAll(/(?:^|[\s\]])(\p{L}[\p{L}\p{N} .()/&'-]{0,50}?):(?=\s|$)/gu)];
    const starts = found.map((m) => segFrom + (m.index ?? 0) + m[0].indexOf(m[1]));
    found.forEach((m, k) => cells.push({
      label: m[1].trim(), nlabel: normalizeForQuote(m[1]), from: starts[k], to: k + 1 < found.length ? starts[k + 1] : segFrom + seg.length,
      rowStart: k > 0 || /\n/.test(seg.slice(0, (m.index ?? 0) + 1)),
    }));
  }
  return cells;
}

/** Where a value stands in a text (original positions). A number is never found inside a longer one ("15,000" is not in "215,000" or "1,15,000"), a word never inside a longer word. */
function valueSpans(text: string, value: string): [number, number][] {
  const vd = datesIn(value);
  if (vd.length) {
    const spans = datesIn(text).filter((d) => d.key === vd[0].key).map((d) => [d.from, d.to] as [number, number]);
    if (spans.length) return spans.slice(0, 60);
  }
  let nv = normalizeForQuote(value);
  for (const c of CURRENCY) if (nv.startsWith(c) && nv.length > c.length) { nv = nv.slice(c.length); break; }
  if (!nv) return [];
  const { norm, at } = normalizeWithMap(text);
  const digits = /^\p{N}+$/u.test(nv), letters = /^\p{L}+$/u.test(nv);
  const out: [number, number][] = [];
  for (let i = norm.indexOf(nv); i >= 0 && out.length < 60; i = norm.indexOf(nv, i + 1)) {
    const from = at[i], to = at[i + nv.length - 1] + 1;
    if (digits && (/\p{N}/u.test(norm[i - 1] ?? "") || /\p{N}/u.test(norm[i + nv.length] ?? ""))) continue;
    if (letters && (/\p{L}/u.test(text[from - 1] ?? "") || /\p{L}/u.test(text[to] ?? ""))) continue;
    out.push([from, to]);
  }
  return out;
}

/** Shortens a text at a word boundary, ending with an ellipsis. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const t = s.slice(0, max - 1), sp = t.lastIndexOf(" ");
  return (sp > max * 0.5 ? t.slice(0, sp) : t).trimEnd() + "\u2026";
}

/**
 * The document's own words around a value, taken by the system (so they are word for word by construction): in a rebuilt table, the cells from the
 * one that carries the label to the value's cell (no column label repeated in between: that would be two rows); in prose, the sentence.
 */
function contextAround(text: string, from: number, to: number, labelWords: string[]): { text: string; table: boolean; tied: boolean } {
  const one = (t: string) => t.replace(/\s+/g, " ").trim();
  if (text.slice(Math.max(0, from - 200), to + 200).includes("|")) {
    // the table block (between its own markers), its cells, and the ROWS: a row starts wherever the first column label that repeats comes again
    const bs0 = text.lastIndexOf("[TABLE]", from), be0 = text.indexOf("[/TABLE]", to);
    const bs = bs0 >= 0 && from - bs0 < 4000 ? bs0 + "[TABLE]".length : Math.max(0, from - 1500);
    const be = be0 >= 0 && be0 - to < 4000 ? be0 : Math.min(text.length, to + 1500);
    const cells = parseCells(text, bs, be);
    const k = cells.findIndex((c) => c.from <= from && to <= c.to + 1);
    if (k >= 0) {
      // in the stored text a row ends exactly where the next row's first cell is glued on (no pipe), or at a line break: that is where rows start
      const starts = cells.map((c, i) => (c.rowStart ? i : -1)).filter((i) => i >= 0);
      const prev = starts.filter((i) => i <= k).pop();
      const next = starts.find((i) => i > k);
      const ra = prev ?? 0, rb = (next ?? cells.length) - 1;
      // the label must be carried by a cell of THIS row (the nearest one to the value's cell)
      let best = -1;
      for (let j = ra; j <= rb; j++) {
        if (!labelWords.some((w) => wordSet(text.slice(cells[j].from, cells[j].to)).has(w))) continue;
        if (best < 0 || Math.abs(j - k) < Math.abs(best - k)) best = j;
      }
      const cellText = (i: number) => one(text.slice(cells[i].from, cells[i].to));
      if (best < 0 && labelWords.length) return { text: cellText(k), table: true, tied: false };
      const row = one(text.slice(cells[ra].from, cells[rb].to));
      if (row.length <= MAX_QUOTE_CHARS) return { text: row, table: true, tied: true };
      const [x, y] = best >= 0 ? (best < k ? [best, k] : [k, best]) : [k, k];
      const span = one(text.slice(cells[x].from, cells[y].to));
      return { text: span.length <= MAX_QUOTE_CHARS ? span : x === y ? cellText(k) : `${cellText(x)} \u2026 ${cellText(y)}`, table: true, tied: true };
    }
  }
  const lo = Math.max(0, from - 400);
  const lm = [...text.slice(lo, from).matchAll(/[.!?]["')\]]?\s+|\n/g)].pop();
  const a0 = lm && lm.index !== undefined ? lo + lm.index + lm[0].length : Math.max(0, from - 160);
  const rm = text.slice(to, to + 400).match(/[.!?]["')\]]?(\s|$)|\n/);
  const b0 = rm && rm.index !== undefined ? to + rm.index + rm[0].length : Math.min(text.length, to + 160);
  let out = one(text.slice(a0, b0));
  if (out.length > MAX_QUOTE_CHARS) {
    const v = from - a0;
    let x = Math.max(0, v - 140), y = Math.min(out.length, v + (to - from) + 140);
    while (x > 0 && !/\s/.test(out[x - 1])) x++;
    while (y < out.length && !/\s/.test(out[y])) y--;
    out = out.slice(x, y).trim();
  }
  return { text: out, table: false, tied: true };
}

/**
 * THE QUOTE AS A POINTER. A model's quote is often not a copy (cells left out, a clause, a few words changed). The fact is what has to be proved, so
 * the value is looked up in the document and the document's own words around it are taken; the model's quote is accepted as a pointer to that place
 * only if at least SNAP_MIN_OVERLAP of its own words stand in those surroundings (a value quoted from the wrong place has few of them there).
 * Returns the document's words (word for word by construction), or null.
 */
export function snapQuote(p: Passage, r: RowIn): string | null {
  const spans = valueSpans(p.text, r.value);
  const evidence = new Set(contentWords(r.quote));
  if (!spans.length || !evidence.size) return null;
  const labelWords = contentWords(r.label);
  let best: { score: number; text: string } | null = null;
  for (const [from, to] of spans) {
    const ctx = contextAround(p.text, from, to, labelWords);
    if (ctx.table && !ctx.tied) continue; // a value of a table row whose label is not in that row: never taken (WORKS beside another row's wage)
    const words = wordSet(ctx.text);
    let hit = 0;
    evidence.forEach((w) => { if (words.has(w)) hit++; });
    const score = hit / evidence.size;
    if (!best || score > best.score) best = { score, text: ctx.text };
  }
  return best && best.score >= SNAP_MIN_OVERLAP && best.text.length <= MAX_QUOTE_CHARS ? best.text : null;
}

/** Presentation is repaired, not refused: a long heading or label is shortened, a long note without a sentence end is dropped, extra rows are cut. */
function tidyAnswer(a: ModelAnswer): ModelAnswer {
  let note = String(a.note ?? "");
  if (note.length > MAX_NOTE_CHARS) {
    const head = note.slice(0, MAX_NOTE_CHARS), i = head.lastIndexOf(".");
    note = i > 10 ? head.slice(0, i + 1) : "";
  }
  let rows = a.rows;
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS);
    note = note || "The document lists more than are shown here.";
  }
  return { ...a, title: cut(String(a.title ?? "").trim(), MAX_TITLE_CHARS), note, rows: rows.map((r) => ({ ...r, label: cut(String(r.label ?? ""), MAX_CELL_CHARS), column: cut(String(r.column ?? ""), MAX_CELL_CHARS) })) };
}

/**
 * THE CONFIRMATION GATE. For a page that a second reader checked, a number of the answer's VALUE that only the pipeline's reading had is not
 * confirmed (it may be a misreading: a rupee sign read as a "2" turned "(Rs 15,000)" into "215,000"), so the answer is refused. A number that
 * both readings had, a number on a page that was never checked, and a value with no digits are not affected.
 * The pages are those that hold the quote (its longest piece, when the quote leaves cells out); when a row was cut by a chunk break and the
 * quote is in no single part, every page of the passage counts, and a number only counts as unconfirmed if NO page confirms it.
 */
function confirmationRefusal(p: Passage, value: string, quote: string): string | null {
  if (!p.checks) return null;
  const nums = [...numbersOf(value)];
  if (!nums.length) return null;
  const pieces = quote.split(/…|\.{3}|\|/).map((x) => normalizeForQuote(x)).filter((x) => x.length >= 6).sort((a, b) => b.length - a.length);
  const probe = pieces[0] ?? normalizeForQuote(quote);
  const holding = new Set<number>();
  for (const pt of p.parts) if (pt.page != null && normalizeForQuote(pt.text).includes(probe)) holding.add(pt.page);
  const pages = holding.size ? [...holding] : [...new Set(p.parts.map((pt) => pt.page).filter((x): x is number => x != null))];
  const rows = pages.map((pg) => ({ pg, c: p.checks![pg] })).filter((x) => x.c);
  if (!rows.length) return null; // these pages were not checked
  for (const n of nums) {
    if (rows.some((x) => x.c.confirmed.includes(n))) continue;
    const refuting = rows.find((x) => x.c.unconfirmed.includes(n));
    if (refuting) return `unverified: the value "${value}" is not confirmed by the second reading of page ${refuting.pg}`;
  }
  return null;
}

const DATE_WORDS = ["date", "dates", "deadline", "when"];
const AMOUNT_WORDS = ["amount", "amounts", "rate", "rates", "wage", "wages", "salary", "premium", "fee", "fees", "price", "cost", "rupees", "payment"];
const looksLikeAmount = (v: string) => /(?:^|\s)(?:rs\.?|inr|\u20b9)\s*\d/i.test(v) || /\d{1,3}(?:,\d{2,3})+/.test(v);

/**
 * A label that says "date" over a value that is plainly an amount (or an amount label over a date) is wrong whatever the vocabulary: refused. Only a
 * clear contradiction counts: a label with both kinds of words ("premium due date"), or a value such as "within 15 days", is left alone.
 */
function typeClash(label: string, column: string, value: string): string | null {
  const words = new Set([...wordSet(label), ...wordSet(column)]);
  const saysDate = DATE_WORDS.some((w) => words.has(w)), saysAmount = AMOUNT_WORDS.some((w) => words.has(w));
  if (saysDate === saysAmount) return null;
  const dates = datesIn(value);
  let rest = value;
  for (const d of [...dates].reverse()) rest = rest.slice(0, d.from) + " " + rest.slice(d.to);
  if (saysDate && !dates.length && looksLikeAmount(value)) return `unverified: the label "${label}" says a date but the value "${value}" is an amount`;
  if (saysAmount && dates.length && numbersIn(rest, true).length === 0) return `unverified: the label "${label}" says an amount but the value "${value}" is a date`;
  return null;
}

/** The OCR reads the "th" of "5th December" as a quote mark: the DISPLAYED value loses that mark (the exact words below it are never touched). */
export function tidyValue(value: string): string {
  return value.replace(/(\d)["'\u2019\u201d]\s*(?=[A-Za-z]{3,9}\b)/g, "$1 ");
}

/** True for a question that asks for a list or a count across a period ("list the sports events ... in December 2024"). */
export function asksForAList(question: string): boolean {
  return detectSynthesisIntent(question).reasons.some((r) => /aggregate/i.test(r));
}
export const LIST_NOTE = "This lists what was found in the circulars retrieved for this question; other circulars may also apply.";

/** The table column a value sits under, read from the quote's own cells ("Label: value | Label: value"); "" if the quote has no such cell. */
function deriveColumn(quote: string, value: string): string {
  let nv = normalizeForQuote(value);
  for (const c of CURRENCY) if (nv.startsWith(c) && nv.length > c.length) { nv = nv.slice(c.length); break; }
  for (const c of rowCells(quote)) {
    const cv = normalizeForQuote(c.value);
    if (nv && (cv === nv || (cv.startsWith(nv) && !/^\d/.test(cv.slice(nv.length))))) return c.label.trim();
  }
  return "";
}

/**
 * Where a fact is in the documents: the passage the model cited first, then the others (a model may cite the wrong number), and the words of the
 * document that prove it (the model's quote when it is a copy that holds the value, otherwise the document's own words around the value).
 */
function locateFact(r: RowIn, passages: Passage[]): { p: Passage; quote: string } | { error: string } {
  const order = [...passages].sort((x, y) => Number(y.n === r.source) - Number(x.n === r.source));
  if (!order.length || !order.some((x) => x.n === r.source)) { if (!order.length) return { error: "unverified: a fact names a passage that does not exist" }; }
  let error = "";
  for (const p of order) {
    const quote = r.quote.trim();
    const verbatim = (q: string) => { const n = normalizeForQuote(q); return n.length >= 6 && (normalizeForQuote(p.text).includes(n) || piecesInOneRow(q, p.text)); };
    if (quote.length <= MAX_QUOTE_CHARS && verbatim(quote) && valueIsIn(r.value, quote)) return { p, quote };
    const snapped = snapQuote(p, { ...r, quote });
    if (snapped) return { p, quote: snapped };
    if (!error && p.n === r.source) {
      if (quote.length > MAX_QUOTE_CHARS) error = "unverified: a quote is too long to be one sentence or one table row";
      else if (normalizeForQuote(quote).length < 6) error = "unverified: a quote is too short to prove anything";
      else if (!verbatim(quote)) error = `unverified: a quote is not in the document word for word (${quoteMissReport(quote, p.text)})`;
      else error = `unverified: the value "${r.value}" is not in its quote`;
    }
  }
  return { error: error || "unverified: a fact names a passage that does not exist" };
}

export function verifyAnswer(answer: ModelAnswer, passages: Passage[]): VerifyResult {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });
  if (!answer.answerable) return fail("not_answerable");
  const a = tidyAnswer(answer);
  if (!a.rows.length) return fail("unverified: the answer has no facts");

  const allowed = new Set<number>();
  const cited = new Map<number, Passage>();
  const rows: AnswerRow[] = [];
  const supportWords = new Set<string>(); // what backs a time word ("daily") in the heading or note

  for (const r of a.rows) {
    const located = locateFact(r, passages);
    if ("error" in located) return fail(located.error);
    const { p, quote } = located;
    const nq = normalizeForQuote(quote);
    if (!r.label || !r.value || r.value.length > MAX_VALUE_CHARS) return fail("unverified: a label or a value is empty or too long");

    const qNums = new Set(numbersIn(quote, true));
    const qWords = wordSet(quote);

    // the VALUE: all of it is in the quote (a date in any written form, a number in any format)
    if (!valueIsIn(r.value, quote)) return fail(`unverified: the value "${r.value}" is not in its quote`);
    const vNums = numbersIn(r.value, true);

    const clash = typeClash(r.label, r.column, r.value);
    if (clash) return fail(clash);
    const unconfirmed = confirmationRefusal(p, r.value, quote);
    if (unconfirmed) return fail(unconfirmed);

    const distinct = new Set(numbersIn(quote, false));
    // a table row: ANY quote with the " | " the app's own table reader puts between cells (a two-cell piece of a row has one number, yet its label must
    // be in it: "Area: PROJECTS | Daily Wages: 740" is not a fact about Works), or a plain run of numbers with few words as damaged OCR leaves a table
    // (a sentence that merely holds five numbers is not a table)
    const tokens = quote.split(/\s+/).filter(Boolean);
    const dense = tokens.length > 0 && tokens.filter((t) => /\d/.test(t)).length / tokens.length >= 0.3;
    const tableLike = (distinct.size >= TABLE_LIKE_NUMBERS && dense) || /\s\|\s/.test(quote);

    // TABLE: the label must be in the value's own row, and the value must sit under the column the model names (a table is checked by its STRUCTURE)
    if (tableLike) {
      const lw = contentWords(r.label);
      if (lw.length) {
        if (!lw.some((w) => qWords.has(w))) return fail(`unverified: the label "${r.label}" is not in the same quote as its value`);
      } else {
        const ln = numbersIn(r.label, true);
        if (!ln.length || !ln.every((x) => qNums.has(x))) return fail(`unverified: the label "${r.label}" is not in the same quote as its value`);
      }
    }
    let column = r.column;
    let linked = true;
    if (tableLike && vNums.length) {
      if (!column) column = deriveColumn(quote, r.value); // the table itself says which column the cell is under
      if (!column) return fail("unverified: a number from a table row needs its column label");
      if (!columnBesideValue(nq, column, r.value, false) && !columnInValueCell(quote, column, r.value)) return fail(`unverified: the column "${column}" does not stand beside the value "${r.value}" in its quote`);
    } else if (column) {
      // PROSE: the label and the column are the assistant's own description of the fact. When their words are in the quote or its sentence they are tied
      // to the document; when they are not (a descriptive phrase such as "last date of renewal") the fact is still shown, marked as the assistant's wording
      const cw = contentWords(column);
      const tied = cw.every((w) => qWords.has(w)) || (cw.length > 0 && (() => { const sw = sentenceWordsAround(p.text, quote); return cw.every((w) => sw.has(w)); })());
      if (!tied) linked = false;
    }

    qNums.forEach((x) => allowed.add(x));
    cited.set(p.n, p);
    // a column backs a time word ("daily"); a quote does too, but only a SENTENCE: a table row holds many columns, so its quote proves nothing
    for (const w of wordSet(column)) supportWords.add(w);
    if (!tableLike) for (const w of wordSet(quote)) supportWords.add(w);
    const part = p.parts.find((pt) => normalizeForQuote(pt.text).includes(nq));
    rows.push({ label: r.label, column, value: tidyValue(r.value), source: p.n, quote, page: part?.page ?? p.page, linked });
  }

  // the heading and the note: their numbers come from a quote or from the cited document's own title or date. A heading or note that says more than the
  // document does is REPAIRED (the document's own title, no note), not a reason to refuse a correct answer.
  const docs = Array.from(cited.values()).sort((x, y) => x.n - y.n);
  docs.forEach((p) => {
    numbersIn(p.title, true).forEach((x) => allowed.add(x));
    if (p.date) numbersIn(p.date, true).forEach((x) => allowed.add(x));
  });
  const saysTooMuch = (text: string): boolean => {
    if (numbersIn(text, false).some((x) => !allowed.has(x))) return true;
    const words = wordSet(text);
    return TIME_GROUPS.some((g) => g.some((w) => words.has(w)) && !g.some((w) => supportWords.has(w)));
  };
  const title = !a.title || saysTooMuch(a.title) ? cut(docs[0]?.title ?? "", MAX_TITLE_CHARS) : a.title;
  const note = a.note && saysTooMuch(a.note) ? "" : a.note;

  return {
    ok: true,
    value: {
      title,
      rows,
      note,
      sources: docs.map((p) => ({ n: p.n, type: p.type, id: p.id, headline: p.title, publishedAt: p.date, page: rows.find((r) => r.source === p.n)?.page ?? p.page })),
    },
  };
}

// ------------------------------------------------------------------------------------------------ asking, with a small cache
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; result: VerifyResult }>();

export function clearAnswerCache(): void {
  cache.clear();
}

function cacheKey(question: string, passages: Passage[]): string {
  return `${normalizeForQuote(question)}|${passages.map((p) => `${p.type}${p.id}:${p.text.length}`).join(",")}`;
}

/**
 * Ask the model and verify. `llm` is the model call (one prompt in, text out). A model failure is never cached; a "not answerable"
 * and a verified answer are, for 30 minutes, so asking the same thing twice costs nothing.
 */
export async function answerFromPassages(question: string, passages: Passage[], llm: (prompt: string) => Promise<string>, now: number = Date.now()): Promise<VerifyResult> {
  if (!passages.length) return { ok: false, reason: "no_passages" };
  const key = cacheKey(question, passages);
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  let raw: string;
  try {
    raw = await llm(buildAnswerPrompt(question, passages));
  } catch {
    return { ok: false, reason: "model_error" };
  }
  const parsed = parseModelAnswer(raw);
  const verdict: VerifyResult = parsed ? verifyAnswer(parsed, passages) : { ok: false, reason: "unverified: the model's reply was not readable" };
  // a list question can be answered only from the circulars the search found: say so, so that a partial list does not read as a complete one
  const noted: VerifyResult = verdict.ok && asksForAList(question) ? { ...verdict, value: { ...verdict.value, note: [verdict.value.note, LIST_NOTE].filter(Boolean).join(" ") } } : verdict;
  const result: VerifyResult = { ...noted, reply: String(raw) };
  // the front-path line shows only the first word of a refusal; this says exactly which rule refused, so a refusal can be understood at once
  if (!result.ok && result.reason !== "not_answerable") {
    console.info(`[answer] not shown: ${result.reason}`);
    console.info(`[answer] the model's reply was: ${String(raw).replace(/\s+/g, " ").slice(0, 1500)}`);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, result });
  return result;
}
