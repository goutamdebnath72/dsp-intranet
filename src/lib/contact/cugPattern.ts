// src/lib/contact/cugPattern.ts
//
// QUESTIONS ABOUT THE FIRST DIGITS OF EXECUTIVES' CUG MOBILE NUMBERS ("find the executives whose CUG mobile number does not start with 943479"). My rule (23 Nov 2026): any signed-in executive may ask.
//
// Why this is not the AI's job: I never give the language model that writes the database questions any phone numbers, only a yes/no flag (src/lib/nl2sql/sql/01_nlq_schema_views_role.sql), so it must refuse such a question, and it does. The digits are tested HERE,
// by the application's own connection, in plain code: the sentence is read by rules (no model, no wait), the database is asked one question, and the answer is a list of people whose numbers stay MASKED on their cards (the Reveal button keeps its login check, its audit row and its hourly cap).
//
// What it takes, and what it refuses (so that it cannot become a way round the Reveal cap):
//   - "starts with" / "begins with" / "series" / "prefix", and the same with a "not": the first 1 to 6 digits. The first six digits of a CUG number are the series every executive shares (the six that follow the plant's own); I never allow the last four, which tell people apart, to be asked.
//   - "ends with", "contains", "last 4 digits", and a pattern of more than 6 digits are answered with a sentence that says they cannot be asked, and why: a prefix and a suffix together would rebuild a whole number.
//   - Only a signed-in executive (ticket 4xxxxx, the LOGIN's ticket) is answered; everybody else gets one sentence and the database is not asked.
//   - At most PER_HOUR questions an hour for one ticket (coarse: kept in this server copy's memory).
// Pure apart from the `search` it is given. Tested by cugPattern.selftest.ts.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { EmployeeResult } from "@/lib/search/employeeSearch";

export const MAX_DIGITS = 6;
export const MAX_SHOWN = 100;
export const PER_HOUR = 30;

export interface CugPatternQuery {
  /** true means the numbers that do NOT start with the digits */
  negate: boolean;
  digits: string;
}
export type CugPatternRead = { kind: "prefix"; query: CugPatternQuery } | { kind: "refused"; why: "ends" | "contains" | "long" } | null;

// The subject I accept: a phone number of the plant's own (CUG), "mobile", "phone", "cell" or "contact number"
const PHONE = /\b(?:cug|mobile|mob|phone|cell|contact\s+(?:no|number))\b/i;
const NUMBERISH = /\b(?:numbers?|nos?\.?|numeric|digits?|series|prefix)\b|\bcug\b/i;
// what is asked of the digits
const STARTS = /\b(?:start(?:s|ed|ing)?|begin(?:s|ning)?|commenc\w*|prefix(?:ed)?|series)\b/i;
const ENDS = /\b(?:end(?:s|ed|ing)?\s+(?:with|in|on|at)|last\s+(?:\d+\s+|few\s+)?digits?|trailing|suffix)\b/i;
const CONTAINS = /\b(?:contain(?:s|ing)?|includ(?:e|es|ing)|having\s+the\s+digits|has\s+the\s+digits|with\s+the\s+digits\s+in)\b/i;
const NEGATION = /\b(?:not|never|without|other\s+than|except|apart\s+from|outside|excluding|aside\s+from|different\s+from)\b|n['’]t\b/i;
// A question about a ticket, a P.No. or a PAX number is not mine to answer here, even if it says "starts with"
const OTHER_SUBJECT = /\b(?:ticket|p\.?\s?no\.?|pno|personal\s+number|pax|extension)\b/i;

/** Reads a sentence. It returns null when the sentence is not a question about the digits of a phone number, and the other routes then answer it as before. */
export function readCugPattern(typed: string): CugPatternRead {
  const q = String(typed ?? "").trim();
  if (!q || q.length > 300) return null;
  if (!PHONE.test(q) || !NUMBERISH.test(q)) return null;
  const hasStarts = STARTS.test(q);
  const hasEnds = ENDS.test(q);
  const hasContains = CONTAINS.test(q);
  if (!hasStarts && !hasEnds && !hasContains) return null;
  if (OTHER_SUBJECT.test(q) && !/\b(?:cug|mobile|phone|cell)\b/i.test(q)) return null;
  const digits = q.match(/\b\d{1,15}\b/g) ?? [];
  if (digits.length === 0) return null;
  // I take the pattern to be the digit run that follows the asking word, else the first one
  const pattern = digits[0] as string;
  if (hasEnds && !hasStarts) return { kind: "refused", why: "ends" };
  if (hasContains && !hasStarts) return { kind: "refused", why: "contains" };
  if (hasEnds || hasContains) return { kind: "refused", why: hasEnds ? "ends" : "contains" };
  if (pattern.length > MAX_DIGITS) return { kind: "refused", why: "long" };
  // I count the negation when it comes before the digits ("does not start with 943479", "other than 943479 series", "not beginning with ...")
  const before = q.slice(0, q.indexOf(pattern));
  return { kind: "prefix", query: { negate: NEGATION.test(before), digits: pattern } };
}

export const REFUSALS = {
  signIn: "Questions about the digits of CUG numbers are answered for signed-in executives only.",
  ends: "This search can tell you what a CUG number starts with, not how it ends: the last digits are what tell one number from another, and they are shown only on the card, behind the Reveal button.",
  contains: "This search can tell you what a CUG number starts with, not which digits it contains: the digits inside a number are shown only on the card, behind the Reveal button.",
  long: `Ask for the first ${MAX_DIGITS} digits at most (for example 943479): the rest of a number is shown only on the card, behind the Reveal button.`,
  tooMany: "You have asked a great many questions about CUG numbers in the last hour. Please try again later.",
} as const;

export interface CugSearchResult {
  /** In all, how many executives have a CUG number on record */
  withNumber: number;
  /** Of those, how many match (start with the digits, or, for "not", do not) */
  matching: number;
  /** How many executives have no CUG number on record */
  withoutNumber: number;
  /** The people to show (masked as the search masks them), at most MAX_SHOWN */
  people: EmployeeResult[];
}

export interface CugDeps {
  search: (q: CugPatternQuery) => Promise<CugSearchResult>;
  now?: () => number;
}

const hits = new Map<string, number[]>();
/** The hourly allowance of one ticket; I export it for the test, which clears it */
export const resetCugCounter = (): void => hits.clear();
function allowed(ticket: string, now: number): boolean {
  const recent = (hits.get(ticket) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_HOUR) { hits.set(ticket, recent); return false; }
  recent.push(now);
  hits.set(ticket, recent);
  return true;
}

const isExecutiveTicket = (t: string | null | undefined): boolean => /^4\d{5}$/.test(String(t ?? "").trim());
const n = (x: number) => x.toLocaleString("en-IN");
const refusal = (text: string): AnalyticsPayload => ({ kind: "clarify", answer: text });

export function describePattern(q: CugPatternQuery): string {
  return `executives whose CUG mobile number ${q.negate ? "does not start" : "starts"} with ${q.digits}`;
}

export async function answerCugPattern(typed: string, ticket: string | null, deps: CugDeps): Promise<AnalyticsPayload | null> {
  const read = readCugPattern(typed);
  if (!read) return null;
  // Not signed in as an executive: I give one sentence and read nothing (the sentence itself is the only thing looked at)
  if (!isExecutiveTicket(ticket)) return refusal(REFUSALS.signIn);
  if (read.kind === "refused") return refusal(REFUSALS[read.why]);
  if (!allowed(String(ticket).trim(), (deps.now ?? Date.now)())) return refusal(REFUSALS.tooMany);

  const r = await deps.search(read.query);
  const what = describePattern(read.query);
  const noNumber = r.withoutNumber > 0 ? ` ${n(r.withoutNumber)} ${r.withoutNumber === 1 ? "executive has" : "executives have"} no CUG number on record and ${r.withoutNumber === 1 ? "is" : "are"} not counted.` : "";
  const shownNote = r.matching > r.people.length ? ` The first ${n(r.people.length)} are shown.` : "";
  let text: string;
  let headline: string;
  if (r.matching === 0) {
    text = `No executive matches: of the ${n(r.withNumber)} CUG numbers on record, ${read.query.negate ? "every one starts with" : "none starts with"} ${read.query.digits}.${noNumber}`;
    headline = "None";
  } else {
    text = `${n(r.matching)} of the ${n(r.withNumber)} executives with a CUG number: ${read.query.negate ? "the number does not start" : "the number starts"} with ${read.query.digits}.${shownNote}${noNumber} The numbers are masked on the cards: press Reveal to see one (every reveal is logged).`;
    headline = `${n(r.matching)} ${r.matching === 1 ? "executive" : "executives"}`;
  }
  const people = r.people.map((p) => ({ ...p, hasEmail: false, emailMasked: null }));
  return {
    kind: "count",
    count: r.matching,
    answer: text,
    headline: { text: headline, tone: r.matching === 0 ? "unknown" : "info" },
    people,
    interpretation: `The first digits of executives' CUG mobile numbers: ${what}`,
    listTruncated: r.matching > people.length,
  } as AnalyticsPayload;
}
