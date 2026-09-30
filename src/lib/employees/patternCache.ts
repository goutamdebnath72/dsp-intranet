// src/lib/employees/patternCache.ts
//
// The "learned pattern" half of the hybrid router (29 Sep 2026, see chat):
// once the LLM successfully classifies and grounds a genuinely new
// phrasing, its generalized shape (ParsedIntent.patternTemplate, e.g.
// "list all names ends with {name}") is persisted here. On every future
// query, this cache is checked BEFORE the LLM is called at all -- a hit
// means the same phrasing shape, with a different name/department/
// designation, gets answered instantly and for free, the same way a
// hand-written deterministic parser rule would -- except this "rule" was
// derived by the LLM from real usage instead of hand-coded in advance.
//
// This is deliberately a SEPARATE table from anything hand-coded -- it only
// ever grows from confirmed-successful LLM classifications (see
// queryOrchestrator.ts's learning condition), never from a guess, and it
// never overrides the deterministic parser or the grounding layers
// underneath -- a cache hit still goes through the exact same
// resolveDesignationTerm/resolveSailDepartment/rosterQuery grounding as
// everything else, just with the free-text extraction step skipped.

import { getDb } from "@/lib/db";
import type { ParsedIntent } from "./intentClassifier";
import { singleValue, substituteValue } from "./namePredicate";

const PLACEHOLDER_FIELDS = ["name", "department", "designation"] as const;
type PlaceholderField = (typeof PLACEHOLDER_FIELDS)[number];

interface CachedPattern {
  id: number;
  template: string;
  shape: ParsedIntent; // with {name}/{department}/{designation} in place of real extracted values
}

let cache: CachedPattern[] | null = null;
let cacheAt = 0;
const TTL_MS = 60 * 1000; // short TTL -- unlike the mostly-static reference
// tables elsewhere (designation_grade, sail_department), this table grows
// during live use, so it needs to pick up new entries quickly.

async function loadPatterns(): Promise<CachedPattern[]> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const d = await getDb();
  const rows: any[] = await d.query(
    // ONLY 'confirmed' rows -- a 'pending' pattern (awaiting feedback) or a
    // 'rejected' one must never be served to a live query. Longest template
    // first -- prefer the more specific match on the rare chance two
    // learned templates could both match the same query.
    `SELECT id, template, intent_shape FROM public.query_pattern_cache
      WHERE status = 'confirmed'
      ORDER BY length(template) DESC`,
  );
  cache = rows.map((r) => ({ id: r.id, template: r.template, shape: r.intent_shape as ParsedIntent }));
  cacheAt = Date.now();
  return cache;
}

export function invalidatePatternCache(): void {
  cache = null;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a template like "how many {designation} in {department}" into a
 *  case-insensitive regex with named capture groups. */
function compileTemplate(template: string): RegExp {
  const parts = template.split(/(\{name\}|\{department\}|\{designation\})/g);
  const pattern = parts
    .map((part) => {
      if (part === "{name}") return "(?<name>.+?)";
      if (part === "{department}") return "(?<department>.+?)";
      if (part === "{designation}") return "(?<designation>.+?)";
      return escapeForRegex(part);
    })
    .join("");
  return new RegExp(`^\\s*${pattern}\\s*$`, "i");
}

function normalizeForMatch(q: string): string {
  return q
    .toLowerCase()
    .replace(/["'""]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PatternMatch {
  id: number;
  shape: ParsedIntent;
  captures: Partial<Record<PlaceholderField, string>>;
}

/** Check the learned-pattern cache for a match. Fast: one cached query,
 *  then a handful of in-memory regex tests -- no LLM call involved. */
export async function matchLearnedPattern(query: string): Promise<PatternMatch | null> {
  const q = normalizeForMatch(query);
  if (!q) return null;
  const patterns = await loadPatterns();
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = compileTemplate(p.template);
    } catch {
      continue; // a malformed stored template should never crash a live query
    }
    const m = re.exec(q);
    if (m && m.groups) {
      const captures: Partial<Record<PlaceholderField, string>> = {};
      for (const f of PLACEHOLDER_FIELDS) {
        if (m.groups[f]) captures[f] = m.groups[f].trim();
      }
      return { id: p.id, shape: p.shape, captures };
    }
  }
  return null;
}

/** Fill a cached shape's placeholders with values captured from a new
 *  query, producing a concrete ParsedIntent -- no LLM call involved. */
export function fillTemplate(
  shape: ParsedIntent,
  captures: Partial<Record<PlaceholderField, string>>,
): ParsedIntent {
  const filled: ParsedIntent = JSON.parse(JSON.stringify(shape));
  if (captures.designation && filled.designationTerm === "{designation}") {
    filled.designationTerm = captures.designation;
  }
  if (captures.department && filled.departmentText === "{department}") {
    filled.departmentText = captures.department;
  }
  if (captures.name && filled.nameQuery) {
    filled.nameQuery = substituteValue(filled.nameQuery, captures.name);
  }
  filled.patternTemplate = null; // not needed downstream, and avoids re-learning a re-learned pattern
  return filled;
}

/**
 * Validate that a parsed intent's patternTemplate is internally consistent
 * -- the placeholder actually appears for whichever field was populated,
 * and no placeholder appears for a field that's null. An inconsistent
 * template would silently produce wrong answers every time it matched,
 * which is worse than never caching it at all.
 */
function isTemplateConsistent(parsed: ParsedIntent): boolean {
  const t = parsed.patternTemplate;
  if (!t) return false;
  if (!!parsed.designationTerm !== t.includes("{designation}")) return false;
  if (!!parsed.departmentText !== t.includes("{department}")) return false;
  if (!!parsed.nameQuery !== t.includes("{name}")) return false;
  // A compound predicate referencing MORE THAN ONE distinct value (e.g.
  // "starts with arup OR ends with kumar") can't be safely reduced to a
  // single {name} placeholder -- substituting one new value into multiple
  // leaves would silently change the meaning of the cached pattern. Skip
  // caching for these; they'll simply go through the LLM again each time,
  // which is the safe default, not a regression.
  if (parsed.nameQuery && singleValue(parsed.nameQuery) === null) return false;
  return true;
}

/**
 * Insert a NEWLY classified-and-grounded intent's generalized template as a
 * PENDING pattern -- NOT yet matchable by matchLearnedPattern. It only
 * becomes usable once a person explicitly confirms it (tick) via
 * recordPatternFeedback below. Returns the new row's id so
 * the caller can attach it to the response for the frontend to reference
 * when feedback comes back. Also returns the id of an EXISTING pending row
 * when the same template + identical shape is asked again. Returns null when
 * the template is inconsistent, the existing row is already decided
 * (confirmed/rejected), or the existing row holds a DIFFERENT shape.
 */
export async function learnPatternPending(parsed: ParsedIntent): Promise<number | null> {
  if (!isTemplateConsistent(parsed)) return null;

  const shape: ParsedIntent = JSON.parse(JSON.stringify(parsed));
  if (shape.designationTerm) shape.designationTerm = "{designation}";
  if (shape.departmentText) shape.departmentText = "{department}";
  if (shape.nameQuery) shape.nameQuery = substituteValue(shape.nameQuery, "{name}");

  try {
    const d = await getDb();
    // UPSERT (no-op update) instead of DO NOTHING, so a RE-ASK of a template
    // that is still 'pending' gets the existing row's id back. With DO NOTHING
    // only the very first person to ever ask a given shape received an id --
    // everyone after that got null, so no tick/cross was shown to them and
    // feedback could never accumulate. The id is handed out only when the
    // stored shape is IDENTICAL to what this person just saw (jsonb equality,
    // key-order-insensitive) -- otherwise their tick would be confirming a
    // different interpretation than the one they judged.
    const rows: any[] = await d.query(
      `INSERT INTO public.query_pattern_cache (template, intent_shape, status)
       VALUES ($1, $2::jsonb, 'pending')
       ON CONFLICT (template) DO UPDATE SET template = EXCLUDED.template
       RETURNING id, status, (intent_shape = $2::jsonb) AS same_shape`,
      [parsed.patternTemplate, JSON.stringify(shape)],
    );
    invalidatePatternCache();
    const row = rows[0];
    if (!row || row.status !== "pending" || !row.same_shape) return null;
    return row.id;
  } catch {
    // Learning is a best-effort optimization -- never allowed to disturb
    // the answer the person already received.
    return null;
  }
}

/**
 * Feedback on a pending pattern. ONLY an explicit tick/cross is accepted.
 *
 * DECIDED 29 Sep 2026 (permanent): inferred signals such as how long an answer
 * stayed on screen were removed entirely. Reading a confidently WRONG answer
 * for several seconds looks identical to reading a right one, so an inferred
 * signal could promote a misread pattern and serve it to everyone. A pattern
 * becomes matchable only when a person says it is correct.
 */
export type PatternFeedback = { verdict: "confirm" | "reject" };

/**
 * Record a person's explicit verdict on a pending pattern. Decisive and
 * immediate. Only ever changes a row that is still 'pending', so a later
 * click can't flip an already-decided pattern.
 */
export async function recordPatternFeedback(patternId: number, feedback: PatternFeedback): Promise<void> {
  try {
    const d = await getDb();
    const status = feedback.verdict === "confirm" ? "confirmed" : "rejected";
    await d.query(`UPDATE public.query_pattern_cache SET status = $1 WHERE id = $2 AND status = 'pending'`, [
      status,
      patternId,
    ]);
    invalidatePatternCache();
  } catch {
    // Feedback recording is best-effort -- never let it throw into a
    // request path the person is no longer even looking at.
  }
}

/** Fire-and-forget: bump hit_count/last_used_at on a TIER-2 cache hit
 *  (i.e. the pattern was already 'confirmed' and got used again) -- a
 *  separate concern from the pending/confirmed feedback lifecycle above.
 *  Never awaited by the caller -- a failure here must never affect the
 *  response. */
export function recordPatternHit(id: number): void {
  getDb()
    .then((d) =>
      d.query(`UPDATE public.query_pattern_cache SET hit_count = hit_count + 1, last_used_at = now() WHERE id = $1`, [id]),
    )
    .catch(() => {});
}
