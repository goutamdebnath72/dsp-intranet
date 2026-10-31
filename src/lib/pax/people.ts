// src/lib/pax/people.ts
//
// THE SUBJECT IS A PERSON (step 63b; owner, 31 Oct 2026): "pax number", "phone number" and "contact number" are one keyword. When the thing asked about is a department or any other non-human entity the answer is its
// PAX number (answer.ts); when it is a HUMAN BEING who is an EXECUTIVE (a six-digit ticket that starts with 4) the number asked for is his or her CUG MOBILE number. This file is the person half. PURE: no database.
//
// What it does NOT change: how the number is shown. The CUG number is masked on the card (943479xxxx) and the full number comes only through the existing Reveal button, which needs a login and writes the audit row
// (/api/employees/[id]/reveal, contact_access_log). The answer here puts the masked number first; it never prints a full number.
//
// A person is taken ONLY when every word the person typed is a WHOLE word of the stored name ("sanjay roy" = SANJAY KUMAR ROY). The directory's own name search is fuzzy and phonetic on purpose, which is right for a people search
// and wrong for deciding that a question is about a person at all: "contact number of water pump" must not turn into somebody with a similar-sounding name.
// A non-executive is NOT answered here (the owner gave no rule for them): the question goes on to the other routes exactly as before.

import type { EmployeeResult } from "@/lib/search/employeeSearch";
import type { AnswerHeadline } from "@/lib/ui/answerHeadline";
import { normalizePax } from "./matcher";

/** Titles that are not part of the stored name. */
const TITLES = new Set(["dr", "doctor", "mr", "mrs", "ms", "shri", "sri", "smt", "prof"]);

/** A name is at most this many words; a longer subject is a sentence, not a name (no name search is run for it). */
export const MAX_NAME_WORDS = 4;
/** At most this many executives are shown for one name ("kumar" is hundreds). */
export const MAX_PEOPLE = 10;

export const isExecutiveTicket = (t: string | null | undefined): boolean => /^4\d{5}$/.test(String(t ?? "").trim());

export const subjectWords = (tokens: string[]): string[] => tokens.filter((t) => t && !TITLES.has(t));

/** The people whose stored name holds EVERY typed word as a whole word (each person once). */
export function namedPeople(tokens: string[], found: EmployeeResult[]): EmployeeResult[] {
  const words = subjectWords(tokens);
  if (words.length === 0 || words.length > MAX_NAME_WORDS) return [];
  const seen = new Set<string>();
  const out: EmployeeResult[] = [];
  for (const p of found) {
    const nameWords = new Set(normalizePax(p.name).split(" "));
    if (!words.every((w) => nameWords.has(w))) continue;
    const key = String(p.ticketNo || p.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export interface PeopleAnswer {
  summary: string;
  interpretation: string;
  headline: AnswerHeadline;
  /** The cards: the existing person cards (masked number + Reveal). Only the executives, at most MAX_PEOPLE, with the e-mail button left off (it was not asked for). */
  people: EmployeeResult[];
  total: number;
  truncated: boolean;
}

const display = (p: EmployeeResult) => `${p.title ? `${p.title} ` : ""}${p.name}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The answer for people found by name or by ticket. `matches` = everybody the subject names; only the executives get the CUG number.
 * Returns null when no executive is among them (the question then goes on as before).
 */
export function buildPeopleAnswer(subject: string, matches: EmployeeResult[]): PeopleAnswer | null {
  const execs = matches.filter((p) => isExecutiveTicket(p.ticketNo));
  if (execs.length === 0) return null;
  const others = matches.length - execs.length;
  const shown = execs.slice(0, MAX_PEOPLE).map((p) => ({ ...p, hasEmail: false, emailMasked: null }));
  const interpretation = `CUG mobile number of ${execs.length === 1 ? "the executive" : "the executives named"} “${subject}”`;
  const notShown = others > 0 ? ` ${plural(others, "non-executive employee", "non-executive employees")} with this name ${others === 1 ? "is" : "are"} not shown: CUG numbers are given for executives only.` : "";

  if (execs.length === 1) {
    const p = execs[0];
    if (!p.hasMobile) {
      const text = `${display(p)} is an executive, but no CUG mobile number is on record.${notShown}`;
      return { summary: text, interpretation, headline: { text: "No CUG number on record", tone: "unknown" }, people: shown, total: 1, truncated: false };
    }
    const masked = p.mobileMasked || "on record";
    const text = `${display(p)}: CUG mobile number ${masked}. Press reveal on the card to see the full number (every reveal is logged).${notShown}`;
    return { summary: text, interpretation, headline: { text: masked, tone: "info" }, people: shown, total: 1, truncated: false };
  }
  const truncated = execs.length > MAX_PEOPLE;
  const text = `${plural(execs.length, "executive is", "executives are")} named “${subject}”${truncated ? `: the first ${MAX_PEOPLE} are shown. Type more of the name to narrow it` : ""}. Press reveal on a card for the full CUG number (every reveal is logged).${notShown}`;
  return { summary: text, interpretation, headline: { text: `${execs.length} executives match`, tone: "info" }, people: shown, total: execs.length, truncated };
}
