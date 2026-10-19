// src/lib/ingestion/pageVerify.ts
//
// THE SECOND READING AT UPLOAD (step 39a): what is stored for a page once two readers have read it.
//
// THE PROBLEM: the stored text of a circular came from Tesseract alone, and on hard pages it was the main cause of wrong answers (a rupee sign read
// as "2", a date read as "20-0802", names read as garbage). A second reader (Gemini, reading the page image) existed only as an offline check tool.
// On the 11 hard pages of the pilot (eval/ocr-pilot-truth.json, transcribed by eye) the pipeline read 117 of 120 key numbers, 66 of 69 key phrases and
// 24 of 26 label+value pairs; Gemini read all of them. Number repairs alone could not have fixed the names, so the better reading becomes the text.
//
// THE RULE, per page:
//   - the second reading is COMPLETE and describes the same page  -> the second reading is the page's text (cleaned of [logo] / [stamp] marks);
//       the readers' disagreements are recorded (which numbers differ, which of the pipeline's numbers were dropped), never silently decided;
//   - the second reading failed, is empty, was cut off, is far too short, or does not describe the same page -> the pipeline's text STAYS, exactly as
//       before, and no check is recorded (the page is simply not second-read);
//   - the pipeline read nothing on a page the second reader read -> the second reading is the text.
// Pure: no I/O. The reader and the timing live in uploadSecondReading.ts. Unit-tested by pageVerify.selftest.ts against the pilot's hand-made truth.

import { STOPPED_MARKER } from "./pageReader";
import { checkReadings, numberContext } from "./readingCheck";

/** The share of the second reading's words that the pipeline's reading must also have, else the two readings are not of the same page. */
export const MIN_SHARED_WORDS = 0.5;
/** A reading of fewer words than this is not judged by word overlap (the length rule of checkReadings covers a near-empty one). */
const MIN_WORDS_FOR_OVERLAP = 8;
const MAX_LISTED = 12;

export interface Dispute {
  /** The number as the pipeline read it. */
  pipeline: string;
  /** The nearest number the second reading has instead (one or two digits away). */
  second: string;
  /** The words around the second reading's number. */
  context: string;
}

export interface PageVerdict {
  /** What to store for the page. */
  text: string;
  source: "second" | "pipeline";
  /** In plain words, for the log. */
  reason: string;
  /** The row for circular_page_check; null when the page was not second-read. */
  check: null | { status: string; confirmed: string[]; unconfirmed: string[]; secondOnly: string[]; reader: string };
  /** Numbers the readers read differently (paired by digits). */
  disputes: Dispute[];
  /** Important numbers only the pipeline had, which the stored text no longer has (noise from stamps and grid lines, or something the second reader left out). */
  dropped: string[];
  stats: { confirmed: number; onlyPipeline: number; onlySecond: number };
}

const words = (s: string): Set<string> => new Set(String(s ?? "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** The second reading as text for search: the bare marks of things that are not text are removed; legible text on a stamp, handwriting and [illegible] stay. */
export function cleanSecondReading(text: string): string {
  return String(text ?? "")
    .replace(/\[(?:logo|stamp|blank form rows)\]/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const digitsOf = (canon: string) => canon.replace(/\D/g, "");

/** Pairs each important number only the pipeline had with the nearest important number only the second reader had (at most two digits away): "215000" and "15000". */
export function pairDisputes(onlyPipeline: string[], onlySecond: string[], pipelineText: string, secondText: string): Dispute[] {
  const out: Dispute[] = [];
  const used = new Set<string>();
  for (const u of onlyPipeline) {
    const du = digitsOf(u);
    let best: string | null = null;
    let bestD = 3;
    for (const g of onlySecond) {
      if (used.has(g)) continue;
      const d = distance(du, digitsOf(g));
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best !== null && Math.min(du.length, digitsOf(best).length) >= 3) {
      used.add(best);
      out.push({ pipeline: u, second: best, context: numberContext(secondText, best) ?? numberContext(pipelineText, u) ?? "" });
    }
  }
  return out;
}

/** Decides the text of one page from the pipeline's reading and the second reading (or the reason there is none). */
export function reconcilePage(pipelineText: string | null | undefined, secondText: string | null | undefined, readerName: string, secondError?: string): PageVerdict {
  const P = String(pipelineText ?? "").trim();
  const keep = (reason: string): PageVerdict => ({ text: P, source: "pipeline", reason, check: null, disputes: [], dropped: [], stats: { confirmed: 0, onlyPipeline: 0, onlySecond: 0 } });

  if (secondError) return keep(`no second reading: ${secondError}`);
  const raw = String(secondText ?? "");
  if (!raw.trim()) return keep("no second reading: the reply was empty");
  if (raw.includes(STOPPED_MARKER)) return keep("the second reading stopped early (cut off or repeating itself), so the pipeline's text stays");

  const chk = checkReadings(P, raw);
  if (chk.status === "second_unusable") return keep(`the second reading is unusable: ${chk.secondProblem ?? "too short to use"}`);

  const G = cleanSecondReading(raw);
  if (!G) return keep("no second reading: nothing is left after cleaning it");
  if (P) {
    const g = words(G), p = words(P);
    if (g.size >= MIN_WORDS_FOR_OVERLAP) {
      const share = [...g].filter((w) => p.has(w)).length / g.size;
      if (share < MIN_SHARED_WORDS) return keep(`the two readings do not describe the same page (${Math.round(share * 100)}% of the second reading's words are in the first), so the pipeline's text stays`);
    }
  }

  const disputes = pairDisputes(chk.onlyFirst, chk.onlySecond, P, G);
  const differ = chk.onlyFirst.length > 0 || chk.onlySecond.length > 0;
  return {
    text: G,
    source: "second",
    reason: !P ? "the pipeline read nothing on this page: the second reading is the text" : differ ? "the second reading is the text; the readers differ on some important numbers" : "the second reading is the text; every important number agrees",
    check: { status: chk.status, confirmed: chk.confirmed, unconfirmed: [], secondOnly: [...chk.onlySecond, ...chk.minorOnlySecond], reader: readerName },
    disputes: disputes.slice(0, MAX_LISTED),
    dropped: chk.onlyFirst.slice(0, MAX_LISTED),
    stats: { confirmed: chk.confirmed.length, onlyPipeline: chk.onlyFirst.length, onlySecond: chk.onlySecond.length },
  };
}
