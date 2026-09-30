// src/lib/employees/parser.ts
//
// Deterministic intent parser: a typed question -> a structured analytics
// intent (or null). No AI. Fully DB-driven (Stage 8 overhaul, 28 Sep 2026):
// designation matching goes through designationGrades.ts (backed by
// `designation_grade`), department matching through sailDepartments.ts
// (backed by `sail_department`). No hardcoded RANKS/DEPARTMENTS/HIERARCHY
// arrays survive from the pre-overhaul version.
//
// Rules (unchanged in spirit from before, fixed in substance):
//   - a holiday-domain question -> a holiday intent (Stage 2), checked FIRST.
//   - designation (+ optional department) with a count/list word, or a terse
//     "just designation [in dept]" form -> { people } (count [+ list]).
//   - the bare word "employees"/"staff"/etc with no specific designation
//     means BOTH cohorts combined -- this used to silently fall through to a
//     bare department count even when "list" was typed; fixed below.
//   - "officer(s)" -> executives, "non-ex"/"nonex"/"non ex" -> non-executives
//     -- previously only recognised by the (unused-for-routing) count layer,
//     never by this parser, which is why they mis-routed to circular search.
//   - total / headcount [in dept]                     -> { total | deptTotal }
//   - breakdown / distribution [of dept]              -> { breakdown | deptBreakdown }
//   - nothing recognised                              -> null (hand off)
//   - keywords may appear ANYWHERE in the query string, never position-bound
//     -- both findDesignationInText and findSailDepartmentInText scan the
//     whole normalized string rather than anchoring to a fixed slot.

import { DateTime } from "luxon";
import {
  findDesignationInText,
  isFullyDesignationPhrase,
  normTitle,
  type DesignationResolution,
} from "./designationGrades";
import { findSailDepartmentInText, type DeptGroup } from "./sailDepartments";
import { parseHolidayIntent, type HolidayIntent } from "@/lib/holidays/parser";

// Local normalizer kept identical to the old designations.ts's normTerm so
// every existing regex/constant below keeps working unchanged.
export function normTerm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[?!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AnalyticsIntent =
  | {
      kind: "people";
      gradeIds: number[] | null; // specific designation_grade ids, or null
      cohort: "executive" | "nonexecutive" | null; // null when gradeIds set, or when combined
      label: string;
      scopeName: string | null;
      deptIds: number[] | null; // sail_department ids
      list: boolean;
    }
  | {
      kind: "peopleByName";
      fragment: string;
      scopeName: string | null;
      deptIds: number[] | null;
      list: boolean;
      strong: boolean;
      exact: boolean;
      /**
       * REPLACED 29 Sep 2026 (matchMode/excludePositions -> namePredicate):
       * a compositional predicate tree, set only by the LLM orchestrator
       * (queryOrchestrator.ts) -- see namePredicate.ts. Absent/undefined
       * for intents built by THIS file's own deterministic candidate logic,
       * which continues to use the plain fragment/exact fields below,
       * unchanged.
       */
      namePredicate?: import("./namePredicate").NamePredicate;
    }
  | { kind: "total" }
  | { kind: "breakdown" }
  | { kind: "deptTotal"; deptName: string; deptIds: number[] }
  | { kind: "deptBreakdown"; deptName: string; deptIds: number[] }
  | HolidayIntent;

const COUNT_WORDS = ["how many", "number of", "no of", "no. of", "count of", "count", "total number of", "how much"];
const LIST_WORDS = ["list", "show", "who are", "who is", "names of", "name the", "display", "list them", "show them"];
const BREAKDOWN_WORDS = ["breakdown", "break up", "distribution", "grade wise", "designation wise", "each designation", "how many of each", "rank wise", "by designation"];
const PEOPLE_RE = /(employees?|people|staff|manpower|workforce|strength)/;

export const DSP_WIDE = new Set(["dsp", "sail", "plant", "company", "organisation", "organization", "overall", "total", "all", "durgapur steel plant"]);
const FILLER = new Set(["currently", "now", "present", "presently", "today", "department", "dept", "section", "the", "entire", "whole", "in", "at", "has", "have", "we", "current", "of"]);
const LIST_TOK = new Set(["list", "them", "show", "display", "names", "name", "who"]);
const PEOPLE_TOK = new Set(["employees", "employee", "people", "staff", "manpower", "workforce", "strength"]);
// Connector words that may sit around a quoted name without changing its
// meaning: `list employees whose name is exactly "debnath"`.
const QUOTED_CONNECTORS = new Set(["whose", "name", "names", "named", "called", "with", "having", "containing", "exact", "exactly", "is", "as", "a", "word"]);
const NAME_STOP = new Set([
  "how", "many", "much", "are", "is", "am", "was", "were", "be", "been",
  "there", "any", "some", "who", "whom", "whose", "do", "does", "did", "will",
  "would", "number", "count", "named", "called", "total",
]);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "workers" only signals the non-executive designation when it isn't
// qualified by another noun ("contract workers" etc are a different category
// entirely and must fall through to search, not be reinterpreted).
const WORKERS_NEUTRAL_PRECEDER = new Set([
  "the", "our", "all", "these", "those", "total", "current", "many", "how",
  "dsp", "sail", "plant", "company",
]);
function hasBareWorkersTerm(nq: string): boolean {
  const toks = nq.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    if (/^workers?$/.test(toks[i])) {
      const prev = i > 0 ? toks[i - 1] : null;
      if (prev === null || WORKERS_NEUTRAL_PRECEDER.has(prev)) return true;
    }
  }
  return false;
}

// Department scope, now order-independent (FIXED 28 Sep 2026): department
// mentions are found ANYWHERE in the query via findSailDepartmentInText's
// scan-anywhere match -- "in c&it list executives", "list executives in
// c&it", and "c&it executives list" all resolve identically now. This is
// the same rule already applied to designations; department detection had
// been left on the old position-bound (after a preposition, through the end
// of the string) behavior by mistake until this fix.
//
async function findDeptScope(original: string): Promise<{ group: DeptGroup; phrase: string } | null> {
  // FIXED (29 Sep 2026), per explicit direction: this used to fall back to
  // a preposition regex (in/at/for/under/within + trailing words) whenever
  // findSailDepartmentInText found nothing, and surfaced THAT as an
  // "I couldn't identify the department X" error -- even when the trailing
  // text plainly wasn't a department attempt at all ("any position", "any
  // location", "between the name" all misfired this way, confirmed live).
  // findSailDepartmentInText already checks the COMPLETE, verified
  // department list (all real sail_department rows, confirmed aliases, and
  // the legacy departments.ts bridge) -- so when it finds nothing, that is
  // now treated as confident proof the phrase is NOT a department mention,
  // not as "an unresolved one". No more manufactured department-shaped
  // error from arbitrary leftover text; a non-match here just means no
  // department was mentioned, and the rest of the query is free to carry
  // whatever OTHER meaning it actually has.
  const hit = await findSailDepartmentInText(original);
  return hit ? { group: hit.group, phrase: hit.phrase } : null;
}

function mapResolutionToPeople(
  res: DesignationResolution,
): { gradeIds: number[] | null; cohort: "executive" | "nonexecutive" | null } {
  if (res.kind === "grade") return { gradeIds: res.gradeIds, cohort: null };
  if (res.kind === "exec") return { gradeIds: null, cohort: "executive" };
  if (res.kind === "nonexec") return { gradeIds: null, cohort: "nonexecutive" };
  return { gradeIds: null, cohort: null }; // "combined" -- both, no filter
}

export async function parseAnalytics(query: string): Promise<AnalyticsIntent | null> {
  // ---- Holiday-domain questions, checked FIRST ----
  const holidayIntent = await parseHolidayIntent(query, DateTime.now());
  if (holidayIntent) return holidayIntent;

  const q = normTerm(query);
  const hasCount = COUNT_WORDS.some((w) => q.includes(normTerm(w)));
  // A count phrase ("how many", "number of", "count of", "total number of")
  // maps directly onto "list them" -- there is no separate bare-count-only
  // response anymore. hasCount is folded straight into hasList here, once,
  // rather than added as a parallel OR-condition in every branch below.
  const hasList = LIST_WORDS.some((w) => q.includes(normTerm(w))) || / them$/.test(q) || hasCount;
  const hasBreakdown = BREAKDOWN_WORDS.some((w) => q.includes(normTerm(w)));
  const hasPeopleWord = PEOPLE_RE.test(q);

  // Real designation match (a specific title, S-grade, exec, or non-exec) --
  // scanned anywhere in the text, DB-driven (see designationGrades.ts).
  let desigMatch = await findDesignationInText(query);
  const nq = ` ${q} `;
  if (!desigMatch && hasBareWorkersTerm(nq)) {
    desigMatch = { term: "workers", resolution: { gradeIds: [], label: "Non-executives", kind: "nonexec" } };
  }

  const scope = await findDeptScope(query);
  let dept: DeptGroup | null = null;
  let scopePhrase: string | null = null;
  if (scope) {
    dept = scope.group;
    scopePhrase = scope.phrase;
  }

  // Terse = the query is essentially just "designation [in dept]" — nothing else.
  let leftover = q;
  if (desigMatch) leftover = leftover.replace(new RegExp(`${esc(desigMatch.term)}(s|es)?`, "g"), " ");
  if (scopePhrase) leftover = leftover.split(normTerm(scopePhrase)).join(" ");
  for (const w of [...COUNT_WORDS, ...LIST_WORDS, ...BREAKDOWN_WORDS]) leftover = leftover.split(normTerm(w)).join(" ");
  leftover = leftover
    .split(" ")
    .filter((t) => t && !FILLER.has(t) && !LIST_TOK.has(t) && !DSP_WIDE.has(t) && !PEOPLE_TOK.has(t))
    .join(" ")
    .trim();
  const terse = leftover === "" && !hasCount && !hasList && !hasBreakdown;

  const leftoverClean = leftover === "";

  if (hasBreakdown)
    return dept ? { kind: "deptBreakdown", deptName: dept.name, deptIds: dept.ids } : { kind: "breakdown" };

  // Strips a single trailing colloquial "s" from an unquoted name fragment's
  // LAST word ("mazumdars" -> "mazumdar", "list all sens" -> "... sen") --
  // NEVER applied to a quoted/exact fragment, where the person deliberately
  // typed the string verbatim and it should be searched as-is. Safe for the
  // ILIKE side (stripping only ever WIDENS a substring match -- "%mazumdar%"
  // still matches a real "MAZUMDARS" surname if one existed, via substring
  // inclusion) and fixes the phonetic side, where the stored name's fold
  // code has no plural "s" to match against. Guarded to length >= 4 before
  // stripping so short, already-terminal names ending in s ("Das", "Bose")
  // are left alone rather than truncated to something too short to mean
  // anything ("Da", "Bo").
  function stripColloquialPlural(frag: string): string {
    const words = frag.split(" ");
    const last = words[words.length - 1];
    if (last.length >= 4 && /s$/.test(last) && !/ss$/.test(last)) {
      words[words.length - 1] = last.slice(0, -1);
    }
    return words.join(" ");
  }

  // ---- Person-name count/list ("how many \"goutam\"", "people named debnath") ----
  // Only when no real designation was found (a designation always wins).
  if (!desigMatch) {
    const qm = query.match(/["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/);
    const namedM = q.match(/\b(?:named|called)\s+([a-z][a-z ]{1,38})\b/);
    let fragment: string | null = null;
    let strong = false;
    let exact = false;
    // A quoted phrase is only a plain "count/list this exact name" request
    // when NOTHING else meaningful is in the query. Previously it took the
    // first quoted phrase and silently ignored everything else ("ends with
    // \"debnath\" but not \"nath\"" became just "debnath" anywhere). Any
    // unrecognized extra word now sends the query to the LLM tier instead.
    let quotedIsSimple = false;
    if (qm && (hasCount || hasList)) {
      // normTerm keeps quote characters, so drop the quote marks themselves
      // too -- otherwise even a plain `list "debnath"` leaves stray `"` tokens
      // behind and is wrongly treated as having extra content.
      let rest = q.split(normTerm(qm[1])).join(" ").replace(/["'“”‘’]/g, " ");
      for (const w of [...COUNT_WORDS, ...LIST_WORDS]) rest = rest.split(normTerm(w)).join(" ");
      if (scopePhrase) rest = rest.split(normTerm(scopePhrase)).join(" ");
      quotedIsSimple = rest
        .split(" ")
        .filter(
          (t) =>
            t &&
            !FILLER.has(t) &&
            !LIST_TOK.has(t) &&
            !PEOPLE_TOK.has(t) &&
            !NAME_STOP.has(t) &&
            !DSP_WIDE.has(t) &&
            !QUOTED_CONNECTORS.has(t),
        ).length === 0;
    }
    if (qm && (hasCount || hasList) && quotedIsSimple) {
      fragment = qm[1].trim();
      strong = true;
      exact = true;
    } else if (namedM) {
      fragment = stripColloquialPlural(namedM[1].trim().replace(/\s+(?:in|at|of|for)$/, ""));
      strong = true;
    } else if ((hasCount || hasList) && !qm) {
      let t = q;
      for (const w of [...COUNT_WORDS, ...LIST_WORDS]) t = t.split(normTerm(w)).join(" ");
      if (scopePhrase) t = t.split(normTerm(scopePhrase)).join(" ");
      const cand = t
        .split(" ")
        .filter((x) => x && !NAME_STOP.has(x) && !FILLER.has(x) && !DSP_WIDE.has(x) && !LIST_TOK.has(x) && !PEOPLE_TOK.has(x))
        .join(" ")
        .trim();
      if (/^[a-z][a-z]{2,}( [a-z]{2,})?$/.test(cand)) {
        fragment = stripColloquialPlural(cand);
        strong = false;
      }
    }
    if (fragment) {
      return {
        kind: "peopleByName",
        fragment,
        scopeName: dept?.name ?? null,
        deptIds: dept?.ids ?? null,
        list: hasList,
        strong,
        exact,
      };
    }
  }

  // A real designation (specific grade, exec, or non-exec) -> people intent.
  if (desigMatch && (hasCount || hasList || terse)) {
    const list = hasList || (terse && !!dept);
    const mapped = mapResolutionToPeople(desigMatch.resolution);
    return {
      kind: "people",
      gradeIds: mapped.gradeIds,
      cohort: mapped.cohort,
      label: desigMatch.resolution.label,
      scopeName: dept?.name ?? null,
      deptIds: dept?.ids ?? null,
      list,
    };
  }

  // Bare "employees"/"staff"/etc, no specific designation -- BOTH cohorts
  // combined. This is the fix for "list of employees in c&it" silently
  // returning a bare count: previously there was no designation match at
  // all for a generic people-word, so control fell straight to the
  // dept-total branch below with no way to see `hasList`. Now it's treated
  // as a first-class combined intent that respects list/count the same way
  // a real designation does. hasList already carries the count-phrase
  // meaning (see above), so no separate hasCount check is needed here.
  //
  // FIXED (29 Sep 2026): this used to fire whenever hasPeopleWord AND
  // (hasCount OR hasList) were true, with NO check on whatever else was in
  // the query -- meaning "list the employees whose name ends with debnath"
  // matched here too (since it has "list" and "employees"), swallowing the
  // query as a generic "list all 6,489 employees" BEFORE the LLM
  // orchestrator (queryOrchestrator.ts) ever got a chance to run, since
  // Tier 1 returning a non-null payload short-circuits the whole pipeline.
  // Requiring leftoverClean here means this branch now only fires when
  // there's genuinely nothing else unrecognized in the query -- anything
  // with real extra content (like "whose name ends with X") correctly
  // returns null instead, falling through to the pattern cache / LLM tiers.
  if (hasPeopleWord && leftoverClean && (hasCount || hasList || !!dept)) {
    return {
      kind: "people",
      gradeIds: null,
      cohort: null,
      label: "Employees",
      scopeName: dept?.name ?? null,
      deptIds: dept?.ids ?? null,
      list: hasList,
    };
  }

  if (dept && (leftoverClean || terse)) return { kind: "deptTotal", deptName: dept.name, deptIds: dept.ids };

  return null;
}
