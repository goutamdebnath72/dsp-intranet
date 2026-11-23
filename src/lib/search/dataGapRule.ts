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

// WHEN THE REASON IS THAT CONTACT DATA IS WITHHELD. The language model that writes the database questions is never given phone numbers, e-mail or home addresses, only yes/no flags (src/lib/nl2sql/sql/01_nlq_schema_views_role.sql:
// "can COUNT people without email but can never READ an address"). A question that needs the digits or the letters (a number that starts with ..., an address that contains ...) is therefore refused by the model, and the plain
// "the directory does not hold that information" that used to replace its explanation was untrue: the directory holds them and keeps them out of reach on purpose. Say that, and say where a number can be seen.
const CONTACT_DATA = /\b(?:phone|mobile|cell|cug|contact number|e-?mail|address(?:es)?)\b/i;
export const CONTACT_WITHHELD = "Phone numbers, e-mail and home addresses are kept out of reach of this search on purpose, so it cannot look inside them (for example, which numbers start with a given digit). Ask for a person by name or ticket to see their number, masked, with a Reveal button after you sign in.";

/** The explanation as shown: the model's own words, unless they name the database's internals; and when the reason is withheld contact data, the true reason in plain words. */
export function friendlyUnanswerable(message: string): string {
  const m = String(message ?? "").trim();
  if (m && CONTACT_DATA.test(m)) return CONTACT_WITHHELD;
  return !m || INTERNAL.test(m) ? PLAIN_DATA_GAP : m;
}
