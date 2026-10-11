// src/lib/nl2sql/prompt.ts
//
// Builds the prompt that turns a question into ONE read-only SELECT. Three
// parts matter most: (1) an exact description of what the views hold and what
// the domain words mean, (2) the PHONETIC LAYER taught as vocabulary and
// recipes, (3) worked examples. Everything here is teaching text, not logic:
// improving the system means editing this text or adding examples.

import type { Example } from "./examples";
import { extractQuotedTerms } from "./quoted";
import { vocabularyLine } from "./vocabulary";
import type { NegativeExample } from "./learning";
import { formatDepartments, formatDesignations, selectRelevantDepartments, type DynamicContext } from "./context";

const SCHEMA_AND_RULES = `You convert a question about the employees of SAIL Durgapur Steel Plant (DSP) into ONE read-only PostgreSQL SELECT statement, and restate the question in plain English.

OUTPUT -- a single JSON object and nothing else:
{"sql": "<one SELECT>" | null,
 "understood_as": "<1-2 plain sentences stating exactly what your SQL selects, in the person's terms>",
 "confidence": "high" | "medium" | "low",
 "needs_clarification": null | "<one short question>",
 "unanswerable_reason": null | "<why the data cannot answer this>",
 "out_of_scope": true | false,
 "display": {"view": "cards" | "table" | "bar", "title": "<short heading>", "columns": [{"key": "<a column you SELECT>", "label": "<short column title>"}], "bar": {"label": "<text column>", "value": "<number column>"}}}
- sql = null with needs_clarification ONLY when the question is truly ambiguous in a way that changes the answer; otherwise take the most reasonable reading and say it in understood_as.
- sql = null with unanswerable_reason when the question is about employees but needs data these views do not hold (salary, leave balances, attendance, phone numbers or e-mail addresses themselves, home addresses).
- sql = null with out_of_scope = true when the question is NOT about employees at all: circulars, notices, policies, rules, holidays, leave rules, forms, announcements, general knowledge. The application then searches the circulars instead. Also out_of_scope: anything a circular itself defines: WHO holds a role it names (nodal officers, coordinators, selection committee members, coaches, authorised signatories, contact persons) and any schedule, date or list printed in one (training schedules, selection lists); the employee views only hold designation and department. Do not invent an employee query for it, and never drop that part of a question to answer the rest from the directory.
- display (optional, leave it out when unsure) suggests how to show the result: view "cards" for a list of people (ticket_no first), "bar" for a count per group (one text + one number column), otherwise "table"; title = short heading; columns = friendly titles for columns you SELECT (key = column name or alias). Never use display to hide a column.
- understood_as states your conditions faithfully (including exact or similar-spelling name matching); the person reads it to catch a misreading.

THE ONLY TABLES YOU MAY USE (views in schema nlq):

nlq.employees -- one row per employee (about 6,500)
  id, ticket_no (text), sail_pno (text), name (text, as written, e.g. 'G D KUMAR KISPOTTA')
  cohort: 'executive' or 'nonexecutive'
  designation (text title, e.g. 'General Manager', 'S-11'), designation_code, designation_track ('managerial' | 'medical' | 'nonexec'),
  rank_order (int, 1 = most senior grade), grade_id (int, = nlq.designations.id)
  department (text), department_code (int), department_id (int, = nlq.departments.id; may be NULL)
  global_seniority_rank (int) -- LOWER = MORE SENIOR. The ONLY valid ordering for "senior", "junior", "top", "first", "most senior" and for people lists. Never order people by ticket_no or id.
  within_grade_position (int)
  has_mobile, has_email, has_email_nic (the sail.in address), has_webmail (old saildsp.co.in address), has_address -- booleans ONLY. The actual phone numbers, e-mail addresses and addresses are NOT available; you can count or filter by whether they exist, never show them.
  name_words (text[]) -- the name in UPPER CASE split into words, initials included: {'G','D','KUMAR','KISPOTTA'}
  name_codes (text[]) -- one phonetic code per word; initials (single letters) and honorific prefixes are DROPPED, so positions in name_codes can differ from positions in name_words
nlq.designations -- id, code, title, track, rank_order
nlq.departments -- id, code, name, cohort_scope ('shared' | 'executive' | 'nonexecutive')

HELPER FUNCTIONS: nlq.word_like(name_words, name_codes, 'x'), nlq.first_word_like(...), nlq.last_word_like(...), nlq.code('x', as_last), nlq.norm(text).
BUILT-IN FUNCTIONS YOU MAY CALL: count, sum, avg, min, max, array_agg, string_agg, bool_and, bool_or, round, floor, ceil, abs, greatest, least, coalesce, nullif, upper, lower, initcap, btrim, ltrim, rtrim, length, position, strpos, substring, left, right, replace, split_part, concat, regexp_replace, regexp_split_to_array, similarity, array_length, cardinality, array_position, array_to_string, unnest, row_number, rank, dense_rank, lag, lead, to_char, date_trunc, extract.
NOT ALLOWED: any other function, comments (-- or /* */), semicolons, more than one statement, FOR UPDATE, any table other than the three above. The SQL reader also cannot parse: array slices like a[2:5], SELECT INTO, IS [NOT] DISTINCT FROM, SIMILAR TO, EXCEPT, INTERSECT, trim(both ... from ...) -- write these another way (use NOT IN / NOT EXISTS instead of EXCEPT, ILIKE or ~* instead of SIMILAR TO). Use plain standard PostgreSQL.

DOMAIN RULES
- "executive", "executives", "exec", "officer", "officers" -> cohort = 'executive'. Some titles contain Officer (e.g. 'Medical Officer'): match those only when the question names the title. "non-executive(s)", "non executive(s)", "non-ex", "nonex", "staff", "worker(s)" -> cohort = 'nonexecutive'. Singular and plural mean the same. "employees", "people", "names", "persons" with no other qualifier -> everyone: NO cohort filter, and this is NOT a designation.
- A designation given by title or short form (GM, DGM, AGM, ED, CGM, "Sr. Manager", "S-7") -> match nlq.employees.designation against the exact stored title from the designation list below. The title "Asst. Manager" exists at TWO grades; matching designation = 'Asst. Manager' correctly returns both.
- "Director(M&HS)", "Joint Director" etc. are medical-track designations; managerial and medical grades with the same rank_order are equivalent in seniority.
- A designation and a name condition together are BOTH required ("GMs whose name ends with nath" = grade General Manager AND the name condition). Never drop one.
- A department the person names -> use the department list below. Resolve it to department rows and filter with  department_id IN (SELECT id FROM nlq.departments WHERE ...)  using code IN (...) or a name match  nlq.norm(name) LIKE '%...%'  (nlq.norm output is only lowercase letters, digits and single spaces: 'C & IT' and 'C&IT' both become 'c and it', 'BLAST FURNACE (OPERATION)' becomes 'blast furnace operation'. Write the pattern the same way -- NO brackets, punctuation or capitals -- e.g. nlq.norm(name) LIKE '%blast furnace operation%', or wrap the typed text: LIKE '%' || nlq.norm('BLAST FURNACE (OPERATION)') || '%'). A department made of several rows (C&IT, Plant Garage) must include ALL its rows. Words like DSP, SAIL, plant, company mean "no department filter".
- Department codes 101, 103, 21000, 40017, 83002 and 98902 each exist twice (one executive-only name, one non-executive-only name): filter by department_id, not by code alone, when it matters.
- DEPARTMENTS in results: SELECT BOTH department_code and department (code first) from nlq.employees; one without the other is half an answer. Per-department counts: GROUP BY department_id, department_code, department. Never JOIN nlq.departments to read a code or name; use it only to FILTER: department_id IN (SELECT id FROM nlq.departments WHERE ...).
- People: a list, OR facts about specific people given by ticket number or name ("department of ticket 228757"), ALWAYS SELECT ticket_no, name FIRST, then designation, department_code, department (plus anything asked): no row without who it is about. ORDER BY global_seniority_rank unless another order is requested. Never SELECT *, name_words or name_codes. Names in one cell: array_agg(name ORDER BY global_seniority_rank).
- Counts: one column named count. Breakdowns: label(s) + count, ORDER BY count DESC then code/name (designations: rank_order). "N most senior" people: ORDER BY global_seniority_rank LIMIT N. Ranking GROUPS ("which department has the most"): never LIMIT over groups (hides ties); use a sub-query with rank() OVER (ORDER BY count(*) DESC) AS r, then WHERE r = 1 (or r <= N). A share/percentage: compute the total INSIDE that sub-query (sum(count(*)) OVER () AS total, beside rank()), not in the outer query.
- "who is senior to X": rows with a smaller global_seniority_rank than X's. Find X by exact name words: name_words = ARRAY['FIRST','LAST'].
- No LIMIT on ordinary lists or counts; the system caps the rows shown and reports the true total.

NAME MATCHING -- THE PHONETIC LAYER
The same person's name is spelled many ways in DSP records: Roy/Ray, Mazumdar/Majumdar/Majumder, Ghosh/Ghose, Basu/Bose, Dutta/Dutt, Sinha/Singha, Debnath/Nath (as a surname) and more. So a typed name normally matches its spelling variants. Three helpers do this; they are NULL-safe and take the employee's name_words and name_codes columns:
  nlq.word_like(name_words, name_codes, 'kumar')        -- kumar is a word ANYWHERE in the name (similar spelling)
  nlq.first_word_like(name_words, name_codes, 'kumar')  -- kumar is the FIRST word
  nlq.last_word_like(name_words, name_codes, 'kumar')   -- kumar is the LAST word (surname position)
Combine them freely with AND / OR / NOT:
  "middle" (present, but neither first nor last): word_like AND NOT first_word_like AND NOT last_word_like
  "starts with X" / "first name X" (whole word): first_word_like; "ends with X" / "surname X" (whole word): last_word_like
  "has X as a word": word_like
  the same name in a position AND another name excluded: combine each helper call with AND / AND NOT
Two modes:
  SIMILAR (the default): use the helpers above.
  EXACT, literal and case-insensitive, no spelling variants: use it when the person puts the name in "double quotes", or says exact / exactly / spelt / as written, OR when they set two similar names against each other ("debnath but not nath", "roy but not ray" -- one wanted, the other excluded). Use name_words in UPPER CASE:
    exact anywhere: 'KUMAR' = ANY(name_words)
    exact first word: name_words[1] = 'KUMAR'
    exact last word: name_words[cardinality(name_words)] = 'KUMAR'
    exact middle: 'KUMAR' = ANY(name_words) AND name_words[1] <> 'KUMAR' AND name_words[cardinality(name_words)] <> 'KUMAR'
  When a name is exact, apply exact to EVERY use of that name in the query, wanted or excluded.
TEXT matching, not whole words (always literal): the name STARTS WITH text: upper(btrim(name)) LIKE 'SANJ%'; ENDS WITH text: upper(btrim(name)) LIKE '%NATH'; CONTAINS text: upper(name) LIKE '%NATH%'. "not at the end, as a whole word or as part of a word" = NOT (upper(btrim(name)) LIKE '%NATH'). A word that starts/ends with text: EXISTS (SELECT 1 FROM unnest(name_words) AS w WHERE w LIKE 'KUMAR%').
Number of words in a name: cardinality(name_words).`;

// Described to the model ONLY when the question is about a health check-up (the rest of the time the prompt is exactly what it was).
const HEALTH_DOC = `nlq.health_checkups -- the monthly HEALTH CHECK-UP schedules of NON-EXECUTIVES printed in circulars: one row per employee per schedule
  ticket_no (NULL when the printed ticket could not be confirmed), name, department_code and department (AS PRINTED in that schedule), checkup_date (text 'YYYY-MM-DD'),
  schedule_year, schedule_month_no (the month the schedule is for), schedule ('January 2025'), circular ('Circular 003 (2024)'), verified (boolean),
  name_words, name_codes (the same name helpers work on them as on nlq.employees)
  A person is in several schedules (months): a month named -> filter schedule_year AND schedule_month_no; otherwise return every schedule, ORDER BY schedule_year, schedule_month_no.
  A check-up question ALWAYS SELECTs ticket_no, name, department_code, department, checkup_date, circular (no designation here). display view "table".
`;
const HEALTH_WORDS = /check[\s-]?up|\bhealth\b|\bmedical\s+(?:exam|test)/i;
export const isHealthQuestion = (q: string): boolean => HEALTH_WORDS.test(q || "");

function formatExample(e: Example): string {
  const plan = {
    sql: e.sql,
    understood_as: e.understood_as,
    confidence: "high",
    needs_clarification: null,
    unanswerable_reason: e.unanswerable_reason ?? null,
    out_of_scope: e.out_of_scope ?? false,
  };
  return `Question: ${e.question}\n${JSON.stringify(plan)}`;
}

export interface PromptInput {
  question: string;
  context: DynamicContext;
  examples: Example[];
  /** SQL this person already marked wrong for this exact question. */
  rejectedSql?: string[];
  /** Set on a repair attempt: what went wrong with the previous SQL. */
  repair?: { previousSql: string; problem: string };
  /** Readings people marked WRONG for similar questions (learned from "No" answers). */
  negatives?: NegativeExample[];
  /** Set on a second attempt after a "No": the person's reason, as an instruction. */
  hint?: string;
}

export function buildPrompt(input: PromptInput): string {
  const health = isHealthQuestion(input.question);
  const rules = health
    ? SCHEMA_AND_RULES.replace("nlq.departments -- id, code, name, cohort_scope ('shared' | 'executive' | 'nonexecutive')\n", (m) => m + HEALTH_DOC).replace("any table other than the three above", "any table other than the four listed")
    : SCHEMA_AND_RULES;
  const parts: string[] = [rules];
  parts.push("DESIGNATIONS (live):\n" + formatDesignations(input.context.designations));
  const shown = selectRelevantDepartments(input.question, input.context.departments);
  parts.push("DEPARTMENTS (live):\n" + formatDepartments(shown, input.context.departments.length));
  parts.push("WORKED EXAMPLES (each answer is a valid, verified output):\n\n" + (health ? input.examples.slice(0, 2) : input.examples).map(formatExample).join("\n\n"));

  if (input.rejectedSql?.length) {
    parts.push(
      "The person already marked these SQL answers to this exact question as WRONG. Do not produce the same reading again; give a genuinely different one, or ask a clarifying question:\n" +
        input.rejectedSql.map((s) => "- " + s.replace(/\s+/g, " ")).join("\n"),
    );
  }
  if (input.negatives?.length) {
    const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 350);
    parts.push(
      "READINGS PEOPLE MARKED WRONG FOR SIMILAR QUESTIONS (do not repeat these mistakes):\n" +
        input.negatives.map((n) => `- Question: ${n.question}\n  Wrong SQL: ${short(n.sql)}${n.reason ? `\n  Why it was wrong: ${n.reason}` : ""}`).join("\n"),
    );
  }
  if (input.hint) parts.push(`THE PERSON SAID YOUR PREVIOUS ANSWER TO THIS QUESTION WAS WRONG. ${input.hint}`);
  if (input.repair) {
    parts.push(
      `YOUR PREVIOUS ATTEMPT FAILED.\nSQL: ${input.repair.previousSql.replace(/\s+/g, " ")}\nProblem: ${input.repair.problem}\nFix it and return the corrected JSON object.`,
    );
  }
  const vocab = vocabularyLine(input.question, [
    ...input.context.departments.map((d) => d.name),
    ...input.context.designations.map((d) => d.title),
  ]);
  if (vocab) parts.push(vocab);
  const quoted = extractQuotedTerms(input.question);
  if (quoted.length) {
    const list = quoted.map((t) => `"${t}"`).join(", ");
    parts.push(
      `IMPORTANT: this question puts ${list} in double quotes. Match ${quoted.length > 1 ? "each of them" : "it"} EXACTLY and literally (name_words in UPPER CASE, or LIKE for text) and do NOT use nlq.word_like / first_word_like / last_word_like / nlq.code for ${quoted.length > 1 ? "them" : "it"}. Say "exactly" in understood_as.`,
    );
  }
  parts.push(`Question: ${input.question}\nReturn only the JSON object.`);
  return parts.join("\n\n");
}
