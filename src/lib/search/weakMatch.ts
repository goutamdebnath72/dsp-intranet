// src/lib/search/weakMatch.ts
//
// A DOCUMENT THAT DOES NOT ANSWER THE QUESTION must not wear a confident "87% MATCH" (step 61a; ledger item 57).
// On 26 Oct 2026 "list the employees of the centre for human resource development" found nothing it could answer, fell to the circular search and showed "Circular-Health check-up for non-executive
// employees during the month of December" at 87%: nothing in it is about the question. The search is by MEANING, so a good hit can share no word with the question; a weak one can score 87%.
// The rule is only a LABEL, never a hiding: a result is WEAK when
//   - none of the question's content words (words that are not stop words, nor generic ones like "employees", "list", "circular") appears in its title or its best passage, AND
//   - it is not a perfect (quoted) match, AND
//   - its similarity is below 90%.
// A weak result keeps its place and its link, but loses its percentage; when ALL the results are weak the screen says so in one line. Pure (no server code).

export interface WeakCandidate {
  headline?: string | null;
  chunkText?: string | null;
  similarity?: number | null;
  matchPercentage?: number | null;
  isPerfectMatch?: boolean;
}

const STOP = new Set(
  ("a an the of in on at to for from by with without and or but not no nor so as is are was were be been being am do does did done have has had having i me my we our us you your he she it its they them their this that these those there here which who whom whose what when where why how " +
    "can could will would shall should may might must please kindly tell give show find list lists name names number numbers many much total count all any every some more most less other another about regarding related relating details detail information info latest new recent " +
    "employee employees people person persons staff department departments dept section sections circular circulars document documents notice notices order orders office plant dsp sail steel").split(/\s+/),
);

/** The words of a question that say WHAT it is about, each cut to its first five letters (so "contractor" finds "contract", "development" finds "developments"). */
export function contentStems(question: string): string[] {
  const words = String(question ?? "").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 3 || STOP.has(w)) continue;
    const stem = w.slice(0, 5);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

const confidence = (r: WeakCandidate): number | null => {
  if (typeof r.matchPercentage === "number") return r.matchPercentage / 100;
  return typeof r.similarity === "number" ? r.similarity : null;
};

export function isWeakMatch(question: string, r: WeakCandidate): boolean {
  if (r.isPerfectMatch) return false;
  const stems = contentStems(question);
  if (stems.length === 0) return false; // nothing to test the document against: it is not called weak
  const c = confidence(r);
  if (c !== null && c >= 0.9) return false; // a very confident hit by meaning stays as it is
  const text = `${r.headline ?? ""} ${r.chunkText ?? ""}`.toLowerCase();
  return !stems.some((s) => text.includes(s));
}

/** The same results, with each weak one marked (weakMatch) and stripped of its percentage. The array itself is returned when nothing is weak. */
export function markWeakMatches<T extends WeakCandidate>(question: string, results: T[]): (T & { weakMatch?: boolean })[] {
  if (!results.length || !results.some((r) => isWeakMatch(question, r))) return results;
  return results.map((r) => (isWeakMatch(question, r) ? { ...r, similarity: null, matchPercentage: undefined, weakMatch: true } : r));
}

export const WEAK_NOTE = "No document clearly answers this question. These are the closest ones, and they may not.";
