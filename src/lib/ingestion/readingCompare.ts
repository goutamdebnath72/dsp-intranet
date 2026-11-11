// src/lib/ingestion/readingCompare.ts
//
// Helpers for comparing and cleaning the readings of a page by two Gemini models (used by geminiOcr.ts). Pure: no I/O.
import { numberContext } from "./readingCheck";

/** The share of the checker's words that the primary's reading must also have, else the two readings are not of the same page. */
export const MIN_SHARED_WORDS = 0.5;

export interface Dispute {
  /** The number as the primary reading has it. */
  primary: string;
  /** The nearest number the checker's reading has instead (one or two digits away). */
  checker: string;
  /** The words around the checker's number. */
  context: string;
}

/** A reading as text for search: the bare marks of things that are not text are removed; legible text on a stamp, handwriting and [illegible] stay. */
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

/** Pairs each important number only the primary had with the nearest important number only the checker had (at most two digits away): "215000" and "15000". */
export function pairDisputes(onlyPrimary: string[], onlyChecker: string[], primaryText: string, checkerText: string): Dispute[] {
  const out: Dispute[] = [];
  const used = new Set<string>();
  for (const u of onlyPrimary) {
    const du = digitsOf(u);
    let best: string | null = null;
    let bestD = 3;
    for (const g of onlyChecker) {
      if (used.has(g)) continue;
      const d = distance(du, digitsOf(g));
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best !== null && Math.min(du.length, digitsOf(best).length) >= 3) {
      used.add(best);
      out.push({ primary: u, checker: best, context: numberContext(checkerText, best) ?? numberContext(primaryText, u) ?? "" });
    }
  }
  return out;
}
