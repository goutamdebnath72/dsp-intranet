// src/lib/search/documentSummary.ts
//
// This is the summary that every circular or announcement search reply carries. A precise answer (circularAnswer.ts: a figure with the document's own words) appears only when the text proves one. A reply that has
// found a circular or an announcement but cannot prove an answer used to show a bare title, so the reader could not tell whether it was the answer. Now I make such a reply always carry a SUMMARY of the best match, and
// it says plainly when that match does not answer the question.
//
//   1. The model writes two to four short sentences from the passages (and says whether they answer the question: `addresses`).
//   2. Plain code verifies the summary: every number in it must stand in the text of a passage (a figure that is not in the document is refused, as everywhere in this app); no markup; a sensible length.
//   3. If the model is unavailable, or its summary is refused, I use the OPENING of the best document in its own words (the first sentences), labelled as that. So a summary is ALWAYS there.
// I never let anything here throw.

import { numbersIn, type Passage, type CircularAnswer } from "./circularAnswer";

export interface DocSummary {
  /** Holds the summary text, or the document's own opening. */
  text: string;
  /** Says whether the passages answer the question; I keep null when that is not known (the opening of a document). */
  addresses: boolean | null;
  /** "model" means the summary was written and verified; "opening" means I used the document's own first words (the model was unavailable or its summary was refused). */
  via: "model" | "opening";
  sources: CircularAnswer["sources"];
}

const MAX_WORDS = 90;
const OPENING_CHARS = 340;

export function buildSummaryPrompt(question: string, passages: Passage[]): string {
  const blocks = passages
    .map((p) => `[${p.n}] Document: ${p.title}${p.date ? ` (dated ${p.date.slice(0, 10)})` : ""}\n${p.text}`)
    .join("\n\n----\n\n");
  return `You write a SHORT SUMMARY for an employee of a steel plant, using ONLY the numbered passages below, which are the text of official documents (circulars or announcements).

QUESTION THE EMPLOYEE TYPED: ${question}

RULES
1. "summary": two to four short sentences (at most ${MAX_WORDS} words) saying what the document(s) say about the subject of the question. Say what the document is. Copy every number, amount, date and name exactly as printed; never calculate, convert or round; never use outside knowledge. If there are several documents, say in one clause what each is about.
2. "addresses": true only if the passages DIRECTLY answer the question; false if they are only about a related subject. Do not stretch a document to fit the question: if it does not answer it, say what it is about and set "addresses" to false.
3. Name a document by its title (never as "Document 1", "[1]" or "passage 1"). Write a date as day, month name and year (17 Nov 2026), not as 2026-11-17.
4. Plain text only: no markdown, no lists, no quotation marks around the whole summary.

Return JSON only: {"summary": "...", "addresses": true or false}

PASSAGES
${blocks}`;
}

export function parseSummary(raw: string): { text: string; addresses: boolean } | null {
  const t = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(t.slice(a, b + 1));
    const text = typeof o?.summary === "string" ? o.summary.replace(/\s+/g, " ").trim() : "";
    if (!text) return null;
    return { text, addresses: o.addresses === true };
  } catch {
    return null;
  }
}

/** I allow the summary no number that is not in the passages (or in the documents' titles and dates) and no markup, and it must be of a sensible size. */
export function summaryIsFaithful(text: string, passages: Passage[]): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 4 || words > MAX_WORDS + 40) return false;
  if (/[<>]|\*\*|^\s*[-*#]\s/m.test(text) || /https?:\/\//i.test(text)) return false;
  const allowed = new Set<number>();
  for (const p of passages) {
    numbersIn(p.text, true).forEach((n) => allowed.add(n));
    numbersIn(p.title, true).forEach((n) => allowed.add(n));
    if (p.date) numbersIn(p.date, true).forEach((n) => allowed.add(n));
  }
  return numbersIn(text, false).every((n) => allowed.has(n));
}

/** I take the first sentences of the best document, in its own words, clean the table markers out and cut at a word. The result is empty only if the document has no text. */
export function openingSummary(passages: Passage[]): string {
  const first = passages.find((p) => p.text && p.text.trim());
  if (!first) return "";
  const clean = first.text.replace(/\[\/?TABLE\]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= OPENING_CHARS) return clean;
  const cut = clean.slice(0, OPENING_CHARS);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > OPENING_CHARS * 0.5) return cut.slice(0, stop + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return `${(sp > OPENING_CHARS * 0.5 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

const sourcesOf = (passages: Passage[]): DocSummary["sources"] => passages.map((p) => ({ n: p.n, type: p.type, id: p.id, headline: p.title, publishedAt: p.date, page: p.page }));

/** This always returns a summary when any passage has text; it returns null only when there is no text at all, and then the caller shows the results as before. */
export async function summariseFromPassages(question: string, passages: Passage[], llm: (prompt: string) => Promise<string>): Promise<DocSummary | null> {
  const withText = passages.filter((p) => p.text && p.text.trim());
  if (withText.length === 0) return null;
  const sources = sourcesOf(withText);
  try {
    const parsed = parseSummary(await llm(buildSummaryPrompt(question, withText)));
    if (parsed && summaryIsFaithful(parsed.text, withText)) return { text: parsed.text, addresses: parsed.addresses, via: "model", sources };
    console.info("[summary] the model's summary was refused or unreadable: the opening of the document is shown");
  } catch {
    console.info("[summary] the model could not be reached: the opening of the document is shown");
  }
  const opening = openingSummary(withText);
  return opening ? { text: opening, addresses: null, via: "opening", sources } : null;
}
