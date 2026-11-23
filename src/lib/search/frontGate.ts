// src/lib/search/frontGate.ts
//
// The FRONT-PATH GATE (step 24a of the front-path plan, HANDOFF_dsp-intranet_front-path.md: "cheap first, model later").
//
// THE PROBLEM it addresses: every question that is not a holiday question is first sent to the language model (about
// 4,900 tokens and 1 to 5 seconds) so the model can say "this is not an employee question", and only then does circular
// search run. For a question like "what is the leave policy for contract workers" that model call is pure waste.
//
// THE GATE: I let a question be an employee-directory or health check-up question ONLY if it points at something in that
// data: a person who works here, a department, a ticket number, or one of the words that name what the directory holds
// (employee, executive, designation, senior, mobile, e-mail, health check-up ...). A question with NONE of those cannot be
// answered by the model's SQL, so I skip the model and let circular search answer first.
//
// WHY IT IS SAFE: (1) "a person who works here" is asked of the directory itself (every name word of nlq.employees), not of
// a hand-written list, so surnames inside sentences ("list all mazumdars") are caught; (2) the gate only changes the ORDER:
// if circular search then finds nothing, or fails, the route asks the model after all (see route.ts, rescueWithModel), so a
// wrong skip costs time, never a wrong answer; (3) it is OFF unless FRONT_PATH_SKIP_MODEL=true, so I can A/B it with the
// acceptance harness (node scripts/omnibar-acceptance.mjs ... then --compare) before trusting it.
//
// Pure except loadDirectoryNameWords (one cached query). Unit-tested by frontGate.selftest.ts on the acceptance set.

/** The gate is on only when FRONT_PATH_SKIP_MODEL=true. Anything else (unset, "false", "1") keeps today's behaviour exactly. */
export function frontGateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.FRONT_PATH_SKIP_MODEL ?? "").trim().toLowerCase() === "true";
}

// The words that name what the employee directory and the health check-up schedules hold. I made this a linguistic class (who /
// what-kind-of-person / which-data-field), not a list of phrasings. A word here only ever makes the gate say "ask the model",
// which is the safe direction.
const PEOPLE_DATA_WORDS =
  /\b(employees?|executives?|non[- ]?executives?|staff|officers?|managers?|designations?|grades?|departments?|sections?|seniors?|seniority|juniors?|tickets?|mobile|phones?|e-?mails?|mails?|nic|webmail|cug|address(?:es)?|surnames?|names?|named|who|whom|whose|people|persons?|everyone|headcount|hod|agms?|dgms?|gms?|health|check[- ]?ups?|medical|joined|retir\w*|women|men|male|female|workforce|manpower)\b/i;

// A ticket / mobile / P.No: 5 to 10 digits, or a letter followed by 4+ digits, or a 4-digit number that is not a plausible year.
const ID_LIKE = /\b\d{5,10}\b|\b[A-Za-z]\d{4,}\b/;
const FOUR_DIGITS = /\b(\d{4})\b/g;
const INDIC = /[\u0900-\u097F\u0980-\u09FF]/;

export interface GateInput {
  q: string;
  /** Comes from the route's own check: the whole question is a person's name (phonetic match against the directory). */
  isNameShaped: boolean;
  /** Comes from the route's own check: the question names one of the plant's departments. */
  deptMentioned: boolean;
  /** Every name word in the directory, lower-case (loadDirectoryNameWords). An empty set means "unknown", and then I never skip. */
  directoryWords: ReadonlySet<string>;
}

export interface GateDecision {
  skip: boolean;
  /** Why the model is still needed, or why it can be skipped. It is shown in the trace and in the tests. */
  reason: string;
}

const keep = (reason: string): GateDecision => ({ skip: false, reason });

/** Returns the first word of the question that is a name in the directory, or null. I match singular or plural: the directory holds "MAZUMDAR", people say "mazumdars". */
export function directoryWordIn(q: string, directoryWords: ReadonlySet<string>): string | null {
  for (const raw of q.toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 3) continue;
    const singular = raw.length > 3 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    if (directoryWords.has(raw) || directoryWords.has(singular)) return raw;
  }
  return null;
}

/**
 * True when the question points at ONE particular person or ticket: the whole question is a name, it holds a ticket-like number, or a word of it is a
 * name in the directory. I do not count the general people-data words (employees, executives, health check-up ...): they name what the data holds, not who.
 */
export function namesSomeone(q: string, i: { isNameShaped: boolean; directoryWords: ReadonlySet<string> }): boolean {
  return i.isNameShaped || ID_LIKE.test(q) || directoryWordIn(q, i.directoryWords) !== null;
}

export function decideModelSkip(i: GateInput): GateDecision {
  const q = i.q.trim();
  if (!q) return keep("empty question");
  if (i.directoryWords.size === 0) return keep("the directory's name list is not available");
  if (INDIC.test(q)) return keep("non-Latin script: not judged here");
  if (i.isNameShaped) return keep("the question is a person's name");
  if (i.deptMentioned) return keep("names a department");
  if (PEOPLE_DATA_WORDS.test(q)) return keep("uses a people-data word");
  if (ID_LIKE.test(q)) return keep("contains a ticket-like number");
  for (const m of q.matchAll(FOUR_DIGITS)) {
    const n = Number(m[1]);
    if (n < 1990 || n > 2100) return keep("contains a 4-digit number that is not a year");
  }
  const hit = directoryWordIn(q, i.directoryWords);
  if (hit) return keep(`mentions someone in the directory ("${hit}")`);
  return { skip: true, reason: "no person, department, ticket or people-data word: not an employee question" };
}

// ---------------------------------------------------------------------------------------------- the directory's name words
const WORDS_TTL_MS = 10 * 60 * 1000;
let wordsCache: { words: Set<string>; at: number } | null = null;

/**
 * Every name word of every employee, lower-case: one cheap query, cached for ten minutes. It throws when the list cannot be
 * loaded or is empty; the caller then simply does not skip, which is today's behaviour.
 */
export async function loadDirectoryNameWords(
  run: (sql: string) => Promise<Array<{ w: string }>>,
  now: number = Date.now(),
): Promise<Set<string>> {
  if (wordsCache && now - wordsCache.at < WORDS_TTL_MS) return wordsCache.words;
  const rows = await run(`SELECT DISTINCT lower(w) AS w FROM nlq.employees, unnest(name_words) AS w`);
  const words = new Set<string>();
  for (const r of rows) if (r && typeof r.w === "string" && r.w.length >= 3) words.add(r.w);
  if (words.size === 0) throw new Error("the directory returned no name words");
  wordsCache = { words, at: now };
  return words;
}

/** Used by the tests. */
export function resetDirectoryWordsCache(): void {
  wordsCache = null;
}
