// src/lib/employees/queryOrchestrator.ts
//
// THE "intelligent engine" requested in chat (29 Sep 2026) -- now a HYBRID,
// three-tier router, refined further in chat the same day:
//
//   1. FAST PATH -- the existing deterministic regex parser
//      (parser.ts/analytics.ts, unchanged). Instant, free. Tried first for
//      every query.
//   2. LEARNED-PATTERN CACHE (patternCache.ts) -- a template the LLM
//      previously generalized from a real, successfully-answered query
//      (e.g. "list all names ends with {name}"). Also fast and free: one
//      cached DB read plus a handful of regex tests, no LLM call. Matches
//      the SAME PHRASING SHAPE with a different name/department/
//      designation, the way a hand-written parser rule would -- except
//      this "rule" was derived by the LLM from real usage, not hand-coded
//      in advance.
//   3. SLOW PATH -- full LLM classification (intentClassifier.ts), only
//      reached when neither of the above recognises the query at all. Its
//      output is grounded against the same real resolution layers
//      (designationGrades.ts, sailDepartments.ts) as everything else, and
//      -- if grounding succeeds and the result looks real -- its
//      generalized template is persisted via patternCache.ts, so the SAME
//      shape of question is answered by tier 2 next time, not tier 3 again.
//
// This is a genuine cache in the SWR sense: a miss is slow (hits the LLM,
// the "source of truth" for classification), a hit is fast, and the fast
// path's coverage grows on its own from real, observed usage rather than
// needing a new hand-written rule for every new phrasing -- which was the
// whole point raised in chat: no fixed number of patches ever finishes,
// but a self-extending cache converges toward the real, bounded vocabulary
// actual users produce.
//
// LEARNING NOW REQUIRES REAL FEEDBACK, NOT JUST A HEURISTIC (refined further
// in chat, 29 Sep 2026): a fresh LLM-derived template is inserted as
// 'pending' and is NOT matchable by anyone until a person explicitly ticks
// it as correct. Nothing is inferred from behaviour (dwell-time signals were
// removed permanently -- see patternCache.ts for why).
// `looksLikeARealAnswer` below is only a cheap pre-filter to avoid even
// creating a pending row for an obvious error/empty result -- it is NOT
// what makes a pattern trustworthy; the feedback lifecycle is.

import { classifyQueryIntent, type ParsedIntent } from "./intentClassifier";
import { matchLearnedPattern, fillTemplate, learnPatternPending, recordPatternHit } from "./patternCache";
import { resolveDesignationTerm } from "./designationGrades";
import { findSailDepartmentInText, resolveSailDepartment, type DeptGroup } from "./sailDepartments";
import { answerAnalytics, runAnalyticsIntent, type AnalyticsPayload } from "./analytics";
import type { AnalyticsIntent } from "./parser";
import { DSP_WIDE, normTerm } from "./parser";
import {
  singleValue,
  describeNamePredicate,
  describeSimilarityNote,
  extractQuotedValues,
  markExactLeaves,
  hasExactLeaf,
} from "./namePredicate";

async function resolveDeptText(text: string): Promise<DeptGroup | null> {
  const direct = await resolveSailDepartment(text);
  if (direct) return direct;
  const scanned = await findSailDepartmentInText(text);
  return scanned ? scanned.group : null;
}

/**
 * Turn a validated ParsedIntent into a real, executable AnalyticsIntent by
 * grounding its free-text fields against actual data. Returns null when
 * something the person clearly mentioned (a department, a designation)
 * can't be resolved -- the caller treats this as a failed attempt, not a
 * partial success to guess through.
 */
async function groundIntent(parsed: ParsedIntent): Promise<AnalyticsIntent | null> {
  let deptIds: number[] | null = null;
  let deptName: string | null = null;
  if (parsed.departmentText) {
    // Safety net alongside the prompt instruction (intentClassifier.ts) --
    // never rely on the model alone to leave out a company-wide term like
    // "DSP"/"SAIL"/"the company". If it slips through anyway, treat it as
    // "no specific department mentioned" (a company-wide search) rather
    // than a failed grounding attempt that silently drops the whole query
    // -- this was confirmed live to be a real failure mode (chat, 29 Sep
    // 2026): "...in dsp" got dropped entirely instead of defaulting to a
    // company-wide name search.
    const normalized = normTerm(parsed.departmentText);
    const isCompanyWide = DSP_WIDE.has(normalized) || normalized.split(" ").every((t) => DSP_WIDE.has(t));
    if (!isCompanyWide) {
      const dept = await resolveDeptText(parsed.departmentText);
      if (!dept) return null;
      deptIds = dept.ids;
      deptName = dept.name;
    }
  }

  if (parsed.nameQuery) {
    return {
      kind: "peopleByName",
      fragment: singleValue(parsed.nameQuery) ?? "",
      namePredicate: parsed.nameQuery,
      scopeName: deptName,
      deptIds,
      list: true,
      strong: parsed.confidence !== "low",
      exact: false,
    };
  }

  if (parsed.designationTerm) {
    const res = await resolveDesignationTerm(parsed.designationTerm);
    if (!res) return null;
    const mapped =
      res.kind === "grade"
        ? { gradeIds: res.gradeIds, cohort: null as "executive" | "nonexecutive" | null }
        : res.kind === "exec"
          ? { gradeIds: null, cohort: "executive" as const }
          : res.kind === "nonexec"
            ? { gradeIds: null, cohort: "nonexecutive" as const }
            : { gradeIds: null, cohort: null };
    return {
      kind: "people",
      gradeIds: mapped.gradeIds,
      cohort: mapped.cohort,
      label: res.label,
      scopeName: deptName,
      deptIds,
      list: parsed.op === "list" || parsed.op === "breakdown" || parsed.op === "count",
    };
  }

  if (parsed.op === "breakdown") {
    return deptIds ? { kind: "deptBreakdown", deptName: deptName!, deptIds } : { kind: "breakdown" };
  }

  if (deptIds || parsed.op === "count" || parsed.op === "list") {
    return {
      kind: "people",
      gradeIds: null,
      cohort: null,
      label: "Employees",
      scopeName: deptName,
      deptIds,
      list: parsed.op === "list" || parsed.op === "count",
    };
  }

  return null;
}

/**
 * Plain-language description of what a grounded (LLM-derived or cache-derived)
 * intent will actually do, shown under the answer so a misread question is
 * visible at a glance (29 Sep 2026). Built from the GROUNDED intent -- what
 * really ran -- not from the model's own free-text, so it can't disagree with
 * the results beneath it. Returns null for intents with nothing useful to say.
 */
function describeGrounded(g: AnalyticsIntent): string | null {
  const where = (scopeName: string | null | undefined) => (scopeName ? `in ${scopeName}` : "across all of DSP");
  switch (g.kind) {
    case "peopleByName": {
      const cond = g.namePredicate ? describeNamePredicate(g.namePredicate) : `Name contains "${g.fragment}"`;
      const base = `People whose ${cond.replace(/^Name /, "name ")}, ${where(g.scopeName)}`;
      const note = g.namePredicate ? describeSimilarityNote(g.namePredicate) : null;
      return note ? `${base}. ${note}` : base;
    }
    case "people":
      return `${g.list ? "List" : "Count"} of ${g.label}, ${where(g.scopeName)}`;
    case "deptBreakdown":
      return `Designation breakdown of ${g.deptName}`;
    case "deptTotal":
      return `Headcount of ${g.deptName}`;
    case "breakdown":
      return "Designation breakdown across all of DSP";
    default:
      return null;
  }
}

/** Whether a result looks like a genuine, real answer worth learning from
 *  -- vs. an error/pending message or a hollow zero-with-no-list, which
 *  could just as easily mean the classification was subtly wrong. */
function looksLikeARealAnswer(payload: AnalyticsPayload | null): boolean {
  if (!payload) return false;
  if (payload.kind === "error" || payload.kind === "pending") return false;
  if (payload.count === 0 && (!payload.people || payload.people.length === 0)) return false;
  return true;
}

/**
 * Primary entry point -- SAME signature as analytics.ts's answerAnalytics,
 * a direct import swap at the ai-search route's call site.
 */
export async function answerEmployeeQuery(rawQuery: string): Promise<AnalyticsPayload | null> {
  // ---- TIER 1: deterministic parser (existing, unchanged, instant, free) ----
  const detPayload = await answerAnalytics(rawQuery);
  if (detPayload) return detPayload;

  // Values in "double quotes" are literal, exact-match requests (29 Sep 2026).
  // The pattern cache normalizes quotes away and substitutes a bare {name}, so
  // a quoted query must never be served from -- or taught to -- the cache, or
  // its exactness would be lost or leak onto unquoted queries.
  const quoted = extractQuotedValues(rawQuery);

  // ---- TIER 2: learned-pattern cache (fast, free, no LLM call) ----
  const cacheHit = quoted.length ? null : await matchLearnedPattern(rawQuery);
  if (cacheHit) {
    const filled = fillTemplate(cacheHit.shape, cacheHit.captures);
    if (filled.op === "clarify" && filled.clarifyQuestion) {
      return { kind: "clarify", answer: filled.clarifyQuestion };
    }
    const grounded = await groundIntent(filled);
    if (grounded) {
      recordPatternHit(cacheHit.id); // fire-and-forget, never blocks the response
      const payload = await runAnalyticsIntent(grounded);
      if (payload) {
        const interp = describeGrounded(grounded);
        if (interp) payload.interpretation = interp;
        return payload;
      }
    }
    // Grounding failed even though the phrasing SHAPE matched (e.g. a
    // department mentioned this time doesn't resolve) -- fall through to
    // a full LLM classification rather than give up on a partial match.
  }

  // ---- TIER 3: full LLM classification (only reached for genuinely new phrasing) ----
  // TEMPORARY DIAGNOSTIC LOGGING (29 Sep 2026) -- remove once the LLM tier
  // is confirmed working end-to-end on real queries. Logs exactly where in
  // this chain a query gives up, since that can't be diagnosed remotely
  // without server console output.
  const parsed = await classifyQueryIntent(rawQuery);
  console.log("[orchestrator] classifyQueryIntent result:", JSON.stringify(parsed));
  if (parsed) {
    if (parsed.op === "clarify" && parsed.clarifyQuestion) {
      return { kind: "clarify", answer: parsed.clarifyQuestion };
    }
    if (parsed.op !== "unsupported" && parsed.confidence !== "low") {
      // Decide which name conditions are exact, in code, not by the model:
      // quoted values, and values the person explicitly contrasted
      // ("ends with debnath but not nath"). See markExactLeaves.
      if (parsed.nameQuery) parsed.nameQuery = markExactLeaves(parsed.nameQuery, quoted);
      const grounded = await groundIntent(parsed);
      console.log("[orchestrator] groundIntent result:", JSON.stringify(grounded));
      if (grounded) {
        const payload = await runAnalyticsIntent(grounded);
        console.log("[orchestrator] runAnalyticsIntent result:", JSON.stringify(payload));
        const exactInvolved = quoted.length > 0 || (!!parsed.nameQuery && hasExactLeaf(parsed.nameQuery));
        if (looksLikeARealAnswer(payload) && parsed.patternTemplate && !exactInvolved) {
          // Insert as PENDING -- not yet matchable by anyone (see
          // patternCache.ts). Attach the id so the frontend can send back
          // real feedback (an explicit tick/cross) once the
          // person has actually seen and judged this specific answer.
          const pendingId = await learnPatternPending(parsed);
          if (pendingId && payload) payload.pendingPatternId = pendingId;
        }
        if (payload) {
          const interp = describeGrounded(grounded);
          if (interp) payload.interpretation = interp;
          return payload;
        }
      }
    } else {
      console.log("[orchestrator] LLM declined or low-confidence -- op:", parsed.op, "confidence:", parsed.confidence);
    }
  } else {
    console.log("[orchestrator] classifyQueryIntent returned null -- check GROQ_API_KEY / AI_ENVIRONMENT / network");
  }

  // Nothing recognised it at all -- hand off to semantic/circular search,
  // same as the original answerAnalytics contract.
  return null;
}

