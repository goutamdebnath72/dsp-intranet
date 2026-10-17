// src/lib/search/circularAnswer.ts
//
// ANSWER FIRST, SOURCES AFTER. When a question is answered by text in the stored documents (circulars, holiday policy notes,
// announcements), the person should see the ANSWER first and, for accountability, the document it came from, with the exact words
// that prove it. This module is GENERIC: it knows nothing about any particular circular. It
//   1. picks the passages to read (buildPassages),
//   2. asks the model to answer ONLY from them, with a verbatim quote for every fact (buildAnswerPrompt, parseModelAnswer),
//   3. REFUSES to show an answer the text does not prove (verifyAnswer).
//
// The model is never trusted. An answer is shown only when ALL of these hold:
//   - it says it is answerable and gives 1 to 8 facts;
//   - every fact's quote is found, word for word (ignoring spaces, case and punctuation), in the passage it names;
//   - every value listed for a fact appears inside that fact's quote;
//   - every number or date in the answer sentence appears in a verified quote (or in the cited document's title or date),
//     so a figure the documents do not contain can never be shown;
//   - number words are counted too ("four" is 4), and no calculation is accepted: figures are copied, not computed.
// If any rule fails, no answer is shown and the person sees the matching documents exactly as before: "a right answer or an honest
// 'not found', never a confident wrong one".
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

export interface AnswerFact {
  source: number;
  quote: string;
  values: string[];
}

export interface ModelAnswer {
  answerable: boolean;
  answer: string;
  facts: AnswerFact[];
}

export interface CircularAnswer {
  text: string;
  evidence: { source: number; quote: string; page: number | null }[];
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
2. Copy every number, amount and date exactly as printed. Do NOT calculate, add, convert or round anything.
3. "answer": one to four short sentences in plain English that answer the question. Do not number or bullet them. If the passages give different values for different years, areas or categories, say which belongs to which.
4. "facts": one entry for every fact the answer states. Each entry has "source" (the passage number), "quote" (text copied CHARACTER FOR CHARACTER from that passage, at most 240 characters, short enough to be one sentence or one table row, and containing the fact together with its label) and "values" (the numbers or dates of that fact exactly as they appear in the quote).
5. If passages disagree, or an answer depends on a condition, state that in the answer.

Return JSON only, in this form:
{"answerable": true, "answer": "...", "facts": [{"source": 1, "quote": "...", "values": ["..."]}]}

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
  const facts: AnswerFact[] = Array.isArray(o.facts)
    ? o.facts
        .filter((f: any) => f && typeof f === "object")
        .map((f: any) => ({
          source: Number(f.source),
          quote: typeof f.quote === "string" ? f.quote : "",
          values: Array.isArray(f.values) ? f.values.map((v: unknown) => String(v)) : [],
        }))
    : [];
  return { answerable: o.answerable === true, answer: typeof o.answer === "string" ? o.answer.trim() : "", facts };
}

// ------------------------------------------------------------------------------------------------ the check
export const MAX_ANSWER_CHARS = 800;
export const MAX_QUOTE_CHARS = 300;
export const MAX_FACTS = 8;

export function verifyAnswer(a: ModelAnswer, passages: Passage[]): VerifyResult {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });
  if (!a.answerable) return fail("not_answerable");
  if (!a.answer || a.answer.length > MAX_ANSWER_CHARS) return fail("unverified: the answer is empty or too long");
  if (!a.facts.length || a.facts.length > MAX_FACTS) return fail("unverified: the answer has no facts, or too many");

  const quoteNumbers = new Set<number>();
  const cited = new Map<number, Passage>();
  const evidence: CircularAnswer["evidence"] = [];

  for (const f of a.facts) {
    const p = passages.find((x) => x.n === f.source);
    if (!p) return fail("unverified: a fact names a passage that does not exist");
    const q = f.quote.trim();
    if (q.length > MAX_QUOTE_CHARS) return fail("unverified: a quote is too long to be one sentence or one table row");
    const nq = normalizeForQuote(q);
    if (nq.length < 6) return fail("unverified: a quote is too short to prove anything");
    // the quote must be in the passage word for word
    const inPassage = normalizeForQuote(p.text).includes(nq);
    if (!inPassage) return fail("unverified: a quote is not in the document word for word");
    // every value of the fact must be inside that quote
    const qNums = new Set(numbersIn(q, true));
    for (const v of f.values) {
      const vn = numbersIn(v, true);
      if (vn.length) {
        if (!vn.every((x) => qNums.has(x))) return fail(`unverified: the value "${v}" is not in its quote`);
      } else if (!nq.includes(normalizeForQuote(v))) {
        return fail(`unverified: the value "${v}" is not in its quote`);
      }
    }
    qNums.forEach((x) => quoteNumbers.add(x));
    cited.set(p.n, p);
    const part = p.parts.find((pt) => normalizeForQuote(pt.text).includes(nq));
    evidence.push({ source: p.n, quote: q, page: part?.page ?? p.page });
  }

  // every number or date in the answer sentence must come from a verified quote, or from the cited document's own title or date
  const allowed = new Set<number>(quoteNumbers);
  cited.forEach((p) => {
    numbersIn(p.title, true).forEach((x) => allowed.add(x));
    if (p.date) numbersIn(p.date, true).forEach((x) => allowed.add(x));
  });
  for (const x of numbersIn(a.answer, false)) {
    if (!allowed.has(x)) return fail(`unverified: the number ${x} in the answer is in no quote`);
  }

  return {
    ok: true,
    value: {
      text: a.answer,
      evidence,
      sources: Array.from(cited.values())
        .sort((x, y) => x.n - y.n)
        .map((p) => ({ n: p.n, type: p.type, id: p.id, headline: p.title, publishedAt: p.date, page: evidence.find((e) => e.source === p.n)?.page ?? p.page })),
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
