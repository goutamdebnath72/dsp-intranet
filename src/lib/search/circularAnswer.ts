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

export type PassageType = "circular" | "announcement" | "holiday";

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
}

export interface DocInput {
  type: PassageType;
  id: number;
  title: string;
  date: string | null;
  chunks: { page: number | null; index: number; text: string }[];
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

export type VerifyResult = { ok: true; value: CircularAnswer } | { ok: false; reason: string };

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

export function verifyAnswer(a: ModelAnswer, passages: Passage[]): VerifyResult {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });
  if (!a.answerable) return fail("not_answerable");
  if (!a.title || a.title.length > MAX_TITLE_CHARS) return fail("unverified: the heading is empty or too long");
  if (a.note.length > MAX_NOTE_CHARS) return fail("unverified: the note is too long");
  if (!a.rows.length || a.rows.length > MAX_ROWS) return fail("unverified: the answer has no facts, or too many");

  const allowed = new Set<number>();
  const cited = new Map<number, Passage>();
  const rows: AnswerRow[] = [];
  const supportWords = new Set<string>(); // what backs a time word ("daily") in the heading or note

  for (const r of a.rows) {
    const p = passages.find((x) => x.n === r.source);
    if (!p) return fail("unverified: a fact names a passage that does not exist");
    const quote = r.quote.trim();
    if (quote.length > MAX_QUOTE_CHARS) return fail("unverified: a quote is too long to be one sentence or one table row");
    const nq = normalizeForQuote(quote);
    if (nq.length < 6) return fail("unverified: a quote is too short to prove anything");
    if (!normalizeForQuote(p.text).includes(nq)) return fail("unverified: a quote is not in the document word for word");
    if (!r.label || r.label.length > MAX_CELL_CHARS || !r.value || r.value.length > MAX_CELL_CHARS || r.column.length > MAX_CELL_CHARS) {
      return fail("unverified: a label or a value is empty or too long");
    }

    const qNums = new Set(numbersIn(quote, true));
    const qWords = wordSet(quote);

    // the VALUE: every number and every word of it is inside the quote
    const vNums = numbersIn(r.value, true);
    if (!vNums.every((x) => qNums.has(x))) return fail(`unverified: the value "${r.value}" is not in its quote`);
    for (const w of contentWords(r.value)) {
      if (CURRENCY.has(w)) continue;
      if (!qWords.has(w)) return fail(`unverified: the value "${r.value}" is not in its quote`);
    }

    const distinct = new Set(numbersIn(quote, false));
    // a table row: five or more different numbers, or the " | " the app's own table reader puts between cells (with two numbers or more)
    const tableLike = distinct.size >= TABLE_LIKE_NUMBERS || (/\s\|\s/.test(quote) && distinct.size >= 2);

    // the LABEL ties the value to its own ROW of a table: one of its words (or its number) is in the same quote, so a value can never sit
    // under another row's label. In a sentence the label may simply describe the fact ("Date", "Venue"): the quote is shown beside it.
    if (tableLike) {
      const lw = contentWords(r.label);
      if (lw.length) {
        if (!lw.some((w) => qWords.has(w))) return fail(`unverified: the label "${r.label}" is not in the same quote as its value`);
      } else {
        const ln = numbersIn(r.label, true);
        if (!ln.length || !ln.every((x) => qNums.has(x))) return fail(`unverified: the label "${r.label}" is not in the same quote as its value`);
      }
    }

    // the COLUMN: a number from a table row must have its column label right before it; elsewhere the column's words must be in the quote
    if (tableLike && vNums.length) {
      if (!r.column) return fail("unverified: a number from a table row needs its column label");
      if (!columnBesideValue(nq, r.column, r.value, false)) return fail(`unverified: the column "${r.column}" does not stand beside the value "${r.value}" in its quote`);
    } else if (r.column) {
      const cw = contentWords(r.column);
      if (!cw.every((w) => qWords.has(w))) return fail(`unverified: the column "${r.column}" is not in its quote`);
    }

    qNums.forEach((x) => allowed.add(x));
    cited.set(p.n, p);
    // a column backs a time word ("daily"); a quote does too, but only a SENTENCE: a table row holds many columns, so its quote proves nothing
    for (const w of wordSet(r.column)) supportWords.add(w);
    if (!tableLike) for (const w of wordSet(quote)) supportWords.add(w);
    const part = p.parts.find((pt) => normalizeForQuote(pt.text).includes(nq));
    rows.push({ label: r.label, column: r.column, value: r.value, source: p.n, quote, page: part?.page ?? p.page });
  }

  // the heading and the note: their numbers come from a quote or from the cited document's own title or date
  cited.forEach((p) => {
    numbersIn(p.title, true).forEach((x) => allowed.add(x));
    if (p.date) numbersIn(p.date, true).forEach((x) => allowed.add(x));
  });
  for (const [what, text] of [["heading", a.title], ["note", a.note]] as const) {
    for (const x of numbersIn(text, false)) if (!allowed.has(x)) return fail(`unverified: the number ${x} in the ${what} is in no quote`);
    // "daily", "monthly" ... must be said by a column of the answer (or, for a row with no column, by its quote)
    const words = wordSet(text);
    for (const g of TIME_GROUPS) {
      if (g.some((w) => words.has(w)) && !g.some((w) => supportWords.has(w))) {
        return fail(`unverified: the ${what} says "${g.find((w) => words.has(w))}" but no column or quote of the answer says so`);
      }
    }
  }

  return {
    ok: true,
    value: {
      title: a.title,
      rows,
      note: a.note,
      sources: Array.from(cited.values())
        .sort((x, y) => x.n - y.n)
        .map((p) => ({ n: p.n, type: p.type, id: p.id, headline: p.title, publishedAt: p.date, page: rows.find((r) => r.source === p.n)?.page ?? p.page })),
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
  const result: VerifyResult = parsed ? verifyAnswer(parsed, passages) : { ok: false, reason: "unverified: the model's reply was not readable" };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, result });
  return result;
}
