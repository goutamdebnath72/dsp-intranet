// src/lib/employees/intentClassifier.ts
//
// LLM-based intent classification for the employee-query omnibar. This is
// the PRIMARY router now (see queryOrchestrator.ts) -- parser.ts's
// parseAnalytics remains only as the fallback path, because no finite set
// of hand-coded phrasing patterns can cover every way a person might ask
// the same question, in English, Hindi, or Bengali (see chat, 29 Sep 2026,
// for the full reasoning behind this architecture change).
//
// STRICT SEPARATION OF CONCERNS: this file's ONLY job is to turn a raw
// query string into a small, strictly-typed intent object. It NEVER touches
// the database, NEVER fabricates a final answer, and NEVER invents a
// designation/department/name that wasn't grounded against the real,
// already-built resolution layers (designationGrades.ts, sailDepartments.ts,
// rosterQuery.ts) by the caller (queryOrchestrator.ts). If the model's
// output doesn't parse as valid JSON matching the schema below, this
// returns null -- signaling the caller to fall back to the deterministic
// parser rather than trust a malformed result.
//
// Reuses generateChatResponse (src/lib/ai-services.ts) -- the SAME Groq
// call already used by Executive Deep Synthesis and holiday-circular
// extraction, rather than introducing a second, parallel way of calling an
// LLM in this codebase.
//
// NOT EMPIRICALLY TESTED IN THIS ENVIRONMENT: this sandbox has no network
// access to Groq's API (not in the allowed domain list), so the actual live
// classification accuracy -- especially for Hindi/Bengali script input --
// has NOT been verified the way the phonetic-matching fixes were, with real
// data and real query results. Treat the first deployment as a pilot that
// needs real testing against real queries, not a finished, proven feature.

import { generateChatResponse } from "@/lib/ai-services";
import type { NamePredicate } from "./namePredicate";

export interface ParsedIntent {
  op: "count" | "list" | "breakdown" | "clarify" | "unsupported";
  /** Free-text designation term as the person said it ("GM", "officer",
   *  "S-7", "employees", "staff") -- resolved by the caller via
   *  designationGrades.ts. Null if the query isn't scoped to any
   *  designation/cohort (e.g. a pure name search, or a plain dept headcount). */
  designationTerm: string | null;
  /** Free-text department mention, in whatever language/script/short form
   *  was used -- resolved by the caller via sailDepartments.ts. Null if no
   *  department was mentioned. */
  departmentText: string | null;
  /** A person-name search, if that's what was asked -- a compositional
   *  predicate tree (REPLACED 29 Sep 2026: the previous flat
   *  `{value, mode, excludePositions}` shape required a new field for every
   *  new logical combination a question could express, e.g. "kumar as a
   *  word but not first or last" silently lost its exclusion because
   *  "anyword" was the closest available category. A small set of
   *  primitives combined via AND/OR/NOT composes for free -- see
   *  namePredicate.ts. Every leaf value MUST be transliterated to Latin
   *  script by the model, however it was originally written. */
  nameQuery: NamePredicate | null;
  /** Set only when op is "clarify" -- a short, specific question to show
   *  the person instead of guessing. */
  clarifyQuestion: string | null;
  /** Model's own confidence. "low" makes the caller prefer falling back to
   *  the deterministic parser (or clarifying) over trusting a guess --
   *  correctness over speed is the explicit priority here (see chat). */
  confidence: "high" | "medium" | "low";
  /**
   * ADDED for the hybrid learned-pattern cache (29 Sep 2026, see
   * patternCache.ts): the question's INVARIANT shape, with whichever of
   * designationTerm/departmentText/nameQuery.value was actually extracted
   * replaced by the literal placeholder token {designation}, {department},
   * or {name} respectively. E.g. for "list all names ends with debnath",
   * this should be "list all names ends with {name}". Null when the
   * question has no generalizable free-text slot (e.g. op "breakdown" with
   * no department, or "unsupported"), or when the phrasing is a one-off
   * not worth caching (e.g. under a "clarify" op).
   */
  patternTemplate: string | null;
}

const SYSTEM_PROMPT = `You are the intent-classification layer for an internal HR search tool at a steel plant (DSP). Employees ask questions about staff -- in English, Hindi (Devanagari or Roman/Hinglish), or Bengali (Bengali script or Roman/Banglish), often mixed within one sentence.

Your ONLY job: read the question and return ONE strict JSON object describing what the person wants -- structure only, never an answer, never a guess at data you don't have access to.

Return EXACTLY this shape, nothing else, no markdown fences, no commentary, no explanation:
{
  "op": "count" | "list" | "breakdown" | "clarify" | "unsupported",
  "designationTerm": string | null,
  "departmentText": string | null,
  "nameQuery": <NamePredicate> | null,
  "clarifyQuestion": string | null,
  "confidence": "high" | "medium" | "low",
  "patternTemplate": string | null
}

Field rules:
- "op": "count" for how-many/number-of/total questions, "list" for show/list/who-are questions, "breakdown" for a designation-wise/grade-wise split, "clarify" when the question is genuinely ambiguous between two clearly different meanings, "unsupported" when it is clearly not an employee-directory question at all (leave designationTerm/departmentText/nameQuery/patternTemplate null in that case).
- "designationTerm": the raw designation/rank/cohort word(s) exactly as the person said them -- "GM", "officer", "non-ex", "S-7", "employees", "staff", "asst manager". Null if no designation/cohort was mentioned.
- "departmentText": the raw department mention, in whatever form/script it was given. Null if none mentioned, OR if the only "scope" word is a company-wide reference rather than an actual department -- "in DSP", "in SAIL", "at the plant", "in the company", "here" all mean the whole organization, not a specific department, so leave this null for those (the query then defaults to a company-wide search, which is what was actually meant). Only set this for a REAL, specific department/section/unit name. Transliterate a non-Latin department name to Roman script; do NOT translate it to an English meaning or guess a canonical name -- that resolution happens separately against real data.
- "nameQuery": only when the question is about finding specific person(s) by name. Every leaf's "value" MUST be transliterated to Roman/Latin script, however the person wrote it (Devanagari, Bengali script, Hinglish, Banglish, or already Roman). Preserve the actual sound/spelling as intended; do not "correct" it to a dictionary form.

  A NamePredicate is ONE of these shapes (nest and combine them to express exactly what was asked -- do not drop part of a compound condition to fit a simpler shape):
    { "type": "wordEquals", "value": string }    -- this exact word appears somewhere in the name
    { "type": "wordIsFirst", "value": string }   -- this exact word is specifically the FIRST word (given name)
    { "type": "wordIsLast", "value": string }    -- this exact word is specifically the LAST word (surname)
    { "type": "substring", "value": string }     -- this text appears anywhere, not necessarily as a whole word
    { "type": "fuzzy", "value": string }         -- loosest phonetic-only match; use only when nothing more specific is implied
    { "type": "and", "clauses": [NamePredicate, ...] }  -- ALL of these must hold
    { "type": "or",  "clauses": [NamePredicate, ...] }  -- ANY of these must hold
    { "type": "not", "clause": NamePredicate }          -- the wrapped condition must NOT hold

  Map the question's actual logic onto this directly, combining primitives as needed -- never simplify a compound condition away. Examples:
    "ends with debnath" / "surnamed debnath" / "family name is debnath" -> {"type":"wordIsLast","value":"debnath"}
    "starts with X" / "first name is X" -> {"type":"wordIsFirst","value":"X"}
    "has kumar as a word" (position unspecified) -> {"type":"wordEquals","value":"kumar"}
    "contains kumar" (substring, not necessarily a whole word) -> {"type":"substring","value":"kumar"}
    "has kumar as a word but not starting with or ending with kumar" ->
      {"type":"and","clauses":[
        {"type":"wordEquals","value":"kumar"},
        {"type":"not","clause":{"type":"wordIsFirst","value":"kumar"}},
        {"type":"not","clause":{"type":"wordIsLast","value":"kumar"}}
      ]}
    "has kumar in the middle" / "kumar between the first and last name" / "kumar as a middle name" -> the SAME three-clause and/not/not shape as the previous example: a middle word is one that is present but is neither the first nor the last word.
    Text the person put in double quotes means "match exactly". Classify the question normally, but give the value WITHOUT the quotation marks -- exactness is applied separately, in code.
    "starts with arup or ends with kumar" ->
      {"type":"or","clauses":[{"type":"wordIsFirst","value":"arup"},{"type":"wordIsLast","value":"kumar"}]}
  These examples establish the GRAMMAR, not an exhaustive list -- combine the same primitives with and/or/not for any other logical condition the question states, including ones not shown above.
- "clarifyQuestion": only set when op is "clarify" -- a short, specific, answerable question, in the same language the person used.
- "confidence": "low" whenever you are genuinely unsure between two readings of the question -- the caller will prefer to fall back or ask rather than guess wrong. Only use "high" when the request is unambiguous.
- "patternTemplate": the question's INVARIANT shape as a reusable pattern, ENGLISH ONLY regardless of what language the question was asked in (this is for matching the SHAPE of future English-normalized queries, not for display). Take the question, and replace whichever of designationTerm / departmentText / nameQuery.value you extracted with the literal placeholder token {designation}, {department}, or {name} respectively -- keep every other word exactly as it was, just lowercase, so the same phrasing pattern (in English) can be recognized again automatically with a different name/department/designation next time. Example: "list all names ends with debnath" -> "list all names ends with {name}". Example: "how many GM in c&it" -> "how many {designation} in {department}". Use null when there is no free-text slot to generalize (e.g. a plain "how many employees" with nothing else), when op is "clarify" or "unsupported", or when the phrasing is too irregular/one-off to be worth generalizing.

Do not attempt to resolve WHICH specific department or WHICH exact designation grade this refers to -- that is done separately against real data. Just extract what was literally asked, understood correctly regardless of language or script.`;

function safeParseIntent(raw: string): ParsedIntent | null {
  let obj: unknown;
  try {
    // Defensive: strip a markdown fence if the model added one despite
    // instructions not to -- cheap insurance, not a substitute for the
    // schema validation below.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const VALID_OPS = new Set(["count", "list", "breakdown", "clarify", "unsupported"]);
  if (typeof o.op !== "string" || !VALID_OPS.has(o.op)) return null;

  const VALID_LEAF_TYPES = new Set(["wordEquals", "wordIsFirst", "wordIsLast", "substring", "fuzzy"]);
  /**
   * Recursively validate an untrusted JSON value as a NamePredicate tree.
   * Returns null on ANY structural problem at ANY depth -- a partially
   * malformed compound condition is worse than none, since silently
   * dropping part of a nested tree would reproduce the exact "lost
   * exclusion" bug this whole redesign exists to fix.
   */
  function parseNamePredicate(v: unknown, depth: number): NamePredicate | null {
    if (depth > 6) return null; // sane recursion cap -- a legitimate question never nests this deep
    if (typeof v !== "object" || v === null) return null;
    const n = v as Record<string, unknown>;
    if (typeof n.type !== "string") return null;

    if (n.type === "and" || n.type === "or") {
      if (!Array.isArray(n.clauses) || n.clauses.length === 0) return null;
      const clauses: NamePredicate[] = [];
      for (const c of n.clauses) {
        const parsed = parseNamePredicate(c, depth + 1);
        if (!parsed) return null;
        clauses.push(parsed);
      }
      return { type: n.type, clauses } as NamePredicate;
    }
    if (n.type === "not") {
      const clause = parseNamePredicate(n.clause, depth + 1);
      return clause ? { type: "not", clause } : null;
    }
    if (VALID_LEAF_TYPES.has(n.type) && typeof n.value === "string" && n.value.trim()) {
      return { type: n.type, value: n.value.trim() } as NamePredicate;
    }
    return null;
  }

  let nameQuery: ParsedIntent["nameQuery"] = null;
  if (o.nameQuery !== null && o.nameQuery !== undefined) {
    nameQuery = parseNamePredicate(o.nameQuery, 0);
    if (!nameQuery) return null; // malformed nameQuery is worse than none -- don't guess at it
  }

  const VALID_CONF = new Set(["high", "medium", "low"]);
  const confidence =
    typeof o.confidence === "string" && VALID_CONF.has(o.confidence)
      ? (o.confidence as ParsedIntent["confidence"])
      : "low"; // missing/invalid confidence defaults to low, never high

  return {
    op: o.op as ParsedIntent["op"],
    designationTerm: typeof o.designationTerm === "string" && o.designationTerm.trim() ? o.designationTerm.trim() : null,
    departmentText: typeof o.departmentText === "string" && o.departmentText.trim() ? o.departmentText.trim() : null,
    nameQuery,
    clarifyQuestion: typeof o.clarifyQuestion === "string" && o.clarifyQuestion.trim() ? o.clarifyQuestion.trim() : null,
    confidence,
    patternTemplate:
      typeof o.patternTemplate === "string" && o.patternTemplate.trim() ? o.patternTemplate.trim().toLowerCase() : null,
  };
}

/**
 * Classify a raw query into a structured intent. Returns null on ANY
 * failure (network error, malformed JSON, schema violation) -- the caller
 * (queryOrchestrator.ts) MUST fall back to the deterministic parser rather
 * than treat null as "unsupported".
 */
export async function classifyQueryIntent(query: string): Promise<ParsedIntent | null> {
  const q = (query || "").trim();
  if (!q) return null;
  try {
    const raw = await generateChatResponse(`${SYSTEM_PROMPT}\n\nQuestion: ${q}`, {
      jsonMode: true,
      // FIXED (29 Sep 2026): was 300, far too small -- confirmed live as
      // the actual root cause of every classification failure so far
      // (Groq's error showed an EMPTY failed_generation, meaning the model
      // spent its whole token budget before producing any usable output,
      // not that it produced malformed JSON). 3000 matches this app's own
      // already-proven working budget for the same kind of structured-JSON
      // task with the same model family (see ai-services.ts's header
      // comment on Executive Deep Synthesis's own call).
      maxTokens: 3000,
    });
    const parsed = safeParseIntent(raw);
    if (!parsed) {
      // The call succeeded but the response didn't validate against the
      // schema -- log the RAW text so a real cause (markdown fence despite
      // instructions, missing field, wrong type) is visible instead of an
      // unexplained null.
      console.log("[intentClassifier] LLM call succeeded but output failed schema validation. Raw response:", raw);
    }
    return parsed;
  } catch (err) {
    // TEMPORARY DIAGNOSTIC (29 Sep 2026) -- the call itself threw. Logging
    // the real error so "missing GROQ_API_KEY", "AI_ENVIRONMENT not set to
    // cloud (falls back to local Ollama, which isn't running)", and a
    // genuine network/firewall failure are distinguishable instead of all
    // looking like an identical silent null.
    console.log("[intentClassifier] generateChatResponse threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
