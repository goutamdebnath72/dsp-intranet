// src/lib/search/dataGapRule.ts
//
// FRONT-PATH RULE (step 38c): who owns a question when the structured data cannot answer it.
//
// THE PROBLEM (seen 18 Oct on "which pathology room should non-executive employees report to for the health check-up in January 2026"):
// the SQL engine answers an employee or health check-up question from its views. When it says "unanswerable" (the views hold no room column), the
// route used to return that message as the FINAL answer, so the circular search, which may well hold the room, never ran.
//
// THE RULE: an "unanswerable" answer is final only when the question points at one particular person, department or ticket (a salary of a named
// person is NOT in any circular: say so). When nobody is named, the circulars get their turn first; the route keeps the engine's explanation and shows
// it only if the circulars have nothing either. Anything the rule cannot judge (the directory's name list is unavailable, a non-Latin question)
// keeps today's behaviour: the explanation is final.
//
// Pure except the loader it is handed. Unit-tested by dataGapRule.selftest.ts.

import { namesSomeone } from "./frontGate";

/** The part of the SQL engine's payload this rule reads (a structural type: the engine's module is heavy). */
export interface EnginePayload {
  kind?: string;
  unanswerable?: boolean;
}

const INDIC = /[\u0900-\u097F\u0980-\u09FF]/;

/** True when the circulars should be tried before the engine's "unanswerable" explanation is returned as final. */
export async function continueToCirculars(
  payload: EnginePayload | null | undefined,
  q: string,
  loadDirectoryWords: () => Promise<ReadonlySet<string>>,
  ctx: { isNameShaped: boolean; deptMentioned: boolean },
): Promise<boolean> {
  if (!payload || payload.kind !== "clarify" || payload.unanswerable !== true) return false; // only a data gap
  const question = String(q ?? "").trim();
  if (!question || INDIC.test(question)) return false; // not judged here
  if (ctx.isNameShaped || ctx.deptMentioned) return false; // about a particular person or department
  let words: ReadonlySet<string>;
  try {
    words = await loadDirectoryWords();
  } catch {
    return false; // the name list is unavailable: behave exactly as before
  }
  if (words.size === 0) return false;
  return !namesSomeone(question, { isNameShaped: false, directoryWords: words });
}

// A model explanation that names the database's own parts ("The health_checkups view does not include a pathology-room column") means nothing to a reader.
const INTERNAL = /\bnlq\.\w+|\b[a-z]+_[a-z_]+\b|\b(?:views?|columns?|tables?|schema|SQL)\b/i;
export const PLAIN_DATA_GAP = "The directory and the health check-up schedules do not hold that information.";

/** The explanation as shown: the model's own words, unless they name the database's internals. */
export function friendlyUnanswerable(message: string): string {
  const m = String(message ?? "").trim();
  return !m || INTERNAL.test(m) ? PLAIN_DATA_GAP : m;
}
