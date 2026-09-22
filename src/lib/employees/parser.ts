// src/lib/employees/parser.ts
//
// Deterministic intent parser: a typed question -> a structured analytics intent
// (or null). No AI. Validated against real phrasings. Rules:
//   - a holiday-domain question (word "holiday(s)", or a known holiday NAME)
//     -> a holiday intent (Stage 2) -- checked FIRST, before any people logic,
//     so it can never be mistaken for a name search or a breakdown request.
//   - designation (+ optional department) with a count word, a list word, or a
//     terse "just designation [in dept]" form  -> { people }  (count [+ list])
//   - total / headcount [in dept]                              -> { total | deptTotal }
//   - breakdown / distribution [of dept]                       -> { breakdown | deptBreakdown }
//   - a department named after in/at that we can't resolve     -> { deptUnknown }
//   - nothing recognised                                       -> null  (hand off)

import { DateTime } from "luxon";
import { RANKS, normTerm } from "./designations";
import { resolveDepartment } from "./departments";
import { parseHolidayIntent, type HolidayIntent } from "@/lib/holidays/parser";

export type AnalyticsIntent =
  | {
      kind: "people";
      term: string;
      label: string;
      scopeName: string | null;
      codes: number[] | null;
      list: boolean;
    }
  | {
      kind: "peopleByName";
      fragment: string;
      scopeName: string | null;
      codes: number[] | null;
      list: boolean;
      strong: boolean;
      exact: boolean; // quoted term -> exact (case-insensitive), not phonetic
    }
  | { kind: "total" }
  | { kind: "breakdown" }
  | { kind: "deptTotal"; deptName: string; codes: number[] }
  | { kind: "deptBreakdown"; deptName: string; codes: number[] }
  | { kind: "deptUnknown"; dept: string }
  | HolidayIntent;

const COUNT_WORDS = ["how many", "number of", "no of", "no. of", "count of", "count", "total number of", "how much"];
const LIST_WORDS = ["list", "show", "who are", "who is", "names of", "name the", "display", "list them", "show them"];
const BREAKDOWN_WORDS = ["breakdown", "break up", "distribution", "grade wise", "designation wise", "each designation", "how many of each", "rank wise", "by designation"];
const PEOPLE_RE = /(employees?|people|staff|manpower|workforce|strength)/;

const DSP_WIDE = new Set(["dsp", "sail", "plant", "company", "organisation", "organization", "overall", "total", "all", "durgapur steel plant"]);
const FILLER = new Set(["currently", "now", "present", "presently", "today", "department", "dept", "section", "the", "entire", "whole", "in", "at", "has", "have", "we", "current", "of"]);
const LIST_TOK = new Set(["list", "them", "show", "display", "names", "name", "who"]);
const PEOPLE_TOK = new Set(["employees", "employee", "people", "staff", "manpower", "workforce", "strength"]);
// Stop/aux/interrogative words to strip when extracting an UNQUOTED name
// candidate ("how many goutam are in dsp" -> "goutam"). Not in FILLER because
// they shouldn't affect department-scope or terse detection.
const NAME_STOP = new Set([
  "how", "many", "much", "are", "is", "am", "was", "were", "be", "been",
  "there", "any", "some", "who", "whom", "whose", "do", "does", "did", "will",
  "would", "number", "count", "named", "called", "total",
]);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "workers" only signals the non-executive designation when it isn't qualified
// by some other noun/adjective ("contract workers", "casual workers", "outsourced
// workers" are a different category entirely -- not DSP's own non-executive
// cadre -- and must NOT be silently reinterpreted as a designation query; the
// caller should instead let the query fall through toward a department/unknown
// check or hand off to search). Whitelisted here are only words that are truly
// neutral quantifiers/determiners and never a category qualifier by themselves.
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

// Longest recognised designation phrase (plural-tolerant), then S-grade, then groups.
function findDesignation(query: string): { term: string; label: string } | null {
  const nq = ` ${normTerm(query)} `;
  const all: { p: string; label: string }[] = [];
  for (const r of RANKS) for (const a of [...r.aliases, r.short]) all.push({ p: normTerm(a), label: r.short });
  all.sort((x, y) => y.p.length - x.p.length);
  for (const { p, label } of all) {
    if (new RegExp(` ${esc(p)}(s|es)? `).test(nq)) return { term: p, label };
  }
  const sm = nq.match(/ (?:grade )?s (\d{1,2}) /);
  if (sm) {
    const n = parseInt(sm[1], 10);
    if (n >= 1 && n <= 11) return { term: `s-${n}`, label: `S-${n}` };
  }
  if (/ non executives? /.test(nq) || / non exec /.test(nq) || / s grade /.test(nq) || / s scale /.test(nq) || hasBareWorkersTerm(nq))
    return { term: "non-executive", label: "Non-executives" };
  if (/ executives? /.test(nq) || / execs? /.test(nq))
    return { term: "executives", label: "Executives" };
  return null;
}

// Whole-phrase (anchored) version of the designation check above: true only
// when the ENTIRE phrase is nothing but a recognised designation term (plus
// its own plural), not merely containing one. Used to tell "for employees" /
// "for non-executive employees" apart from a genuine department name — those
// describe WHO, not WHERE, and must never be treated as an unresolved
// department (see findDeptScope below).
function fullyConsumedByDesignation(phrase: string): boolean {
  const nq = ` ${normTerm(phrase)} `;
  const all: { p: string }[] = [];
  for (const r of RANKS) for (const a of [...r.aliases, r.short]) all.push({ p: normTerm(a) });
  all.sort((x, y) => y.p.length - x.p.length);
  for (const { p } of all) {
    if (new RegExp(`^ ${esc(p)}(s|es)? $`).test(nq)) return true;
  }
  if (/^ (?:grade )?s \d{1,2} $/.test(nq)) return true;
  if (/^ non executives? $/.test(nq) || /^ non exec $/.test(nq) || /^ s grade $/.test(nq) || /^ s scale $/.test(nq)) return true;
  if (/^ executives? $/.test(nq) || /^ execs? $/.test(nq)) return true;
  if (/^ workers? $/.test(nq) && hasBareWorkersTerm(nq)) return true;
  return false;
}

// Department scope after a preposition. Strong (in/at/for/under/within) drives
// the "unknown department" message; weak (of) is only used if it resolves — so
// "number OF AGM" is never mistaken for a department.
function findDeptScope(original: string): { phrase: string; strong: boolean } | null {
  let strong = true;
  let m = original.match(/\b(?:in|at|for|under|within)\b\s+(.+)$/i);
  if (!m) {
    m = original.match(/\bof\b\s+(.+)$/i);
    strong = false;
  }
  if (!m) return null;
  const cand = m[1].split("?")[0].replace(/[.!,]/g, "").trim();
  const words = cand.split(/\s+/).filter(Boolean);
  while (words.length && FILLER.has(normTerm(words[0]))) words.shift();
  while (
    words.length &&
    (FILLER.has(normTerm(words[words.length - 1])) || LIST_TOK.has(normTerm(words[words.length - 1])))
  )
    words.pop();
  if (!words.length) return null;
  const nt = normTerm(words.join(" ")).split(" ").filter(Boolean);
  if (!nt.length || DSP_WIDE.has(nt[0]) || nt.every((t) => DSP_WIDE.has(t))) return null;
  // Reject candidates that are nothing but generic people-words and/or a
  // designation phrase ("employees", "non-executive employees") -- those are
  // never an attempted department name, so must not become "deptUnknown".
  if (nt.every((t) => PEOPLE_TOK.has(t))) return null;
  const withoutPeopleWords = nt.filter((t) => !PEOPLE_TOK.has(t)).join(" ");
  if (withoutPeopleWords && fullyConsumedByDesignation(withoutPeopleWords)) return null;
  return { phrase: words.join(" "), strong };
}

export async function parseAnalytics(query: string): Promise<AnalyticsIntent | null> {
  // ---- Stage 2: holiday-domain questions, checked FIRST (handoff §2.5) ----
  // Must run before every people-domain branch below, including the
  // breakdown check -- "holiday breakdown for 2026" must never be caught by
  // BREAKDOWN_WORDS and answered as a designation breakdown.
  const holidayIntent = await parseHolidayIntent(query, DateTime.now());
  if (holidayIntent) return holidayIntent;

  const q = normTerm(query);
  const hasCount = COUNT_WORDS.some((w) => q.includes(normTerm(w)));
  const hasList = LIST_WORDS.some((w) => q.includes(normTerm(w))) || / them$/.test(q);
  const hasBreakdown = BREAKDOWN_WORDS.some((w) => q.includes(normTerm(w)));

  const desig = findDesignation(query);
  const scope = findDeptScope(query);

  let dept: { name: string; codes: number[] } | null = null;
  let deptUnknown: string | null = null;
  if (scope) {
    const g = resolveDepartment(scope.phrase);
    if (g) dept = { name: g.name, codes: g.codes };
    else if (scope.strong) deptUnknown = scope.phrase;
  }

  // Terse = the query is essentially just "designation [in dept]" — nothing else.
  let leftover = q;
  if (desig) leftover = leftover.replace(new RegExp(`${esc(desig.term)}(s|es)?`, "g"), " ");
  if (scope) leftover = leftover.split(normTerm(scope.phrase)).join(" ");
  for (const w of [...COUNT_WORDS, ...LIST_WORDS, ...BREAKDOWN_WORDS]) leftover = leftover.split(normTerm(w)).join(" ");
  leftover = leftover
    .split(" ")
    .filter((t) => t && !FILLER.has(t) && !LIST_TOK.has(t) && !DSP_WIDE.has(t) && !PEOPLE_TOK.has(t))
    .join(" ")
    .trim();
  const terse = leftover === "" && !hasCount && !hasList && !hasBreakdown;

  // A department reference only counts as an analytics query when the query is
  // actually about people/headcount: a designation, a people word, breakdown
  // intent, or a "clean" leftover (nothing survives but the department + a
  // count/terse form). A stray "in <place>" inside a conversational question —
  // where the leftover still carries a topic ("deposit", "bonus", "training") —
  // is NOT a department query and must hand off to circular search.
  const hasPeopleWord = PEOPLE_RE.test(q);
  const leftoverClean = leftover === "";
  const peopleContext = !!desig || hasPeopleWord || hasBreakdown;
  const deptIsAnalytic = peopleContext || leftoverClean;

  if (deptUnknown && deptIsAnalytic)
    return { kind: "deptUnknown", dept: deptUnknown };

  if (hasBreakdown)
    return dept
      ? { kind: "deptBreakdown", deptName: dept.name, codes: dept.codes }
      : { kind: "breakdown" };

  // ---- Person-name count/list ("how many \"goutam\"", "people named debnath")
  // Only when NO designation was found. A quoted term or "named/called X" is a
  // strong signal (answer even if zero); a bare leftover token is a weak guess
  // (verified in analytics — count 0 hands off instead of saying "0").
  if (!desig) {
    const qm = query.match(
      /["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/,
    );
    const namedM = q.match(/\b(?:named|called)\s+([a-z][a-z ]{1,38})\b/);
    let fragment: string | null = null;
    let strong = false;
    let exact = false;
    if (qm && (hasCount || hasList)) {
      fragment = qm[1].trim();
      strong = true;
      exact = true; // quoted => match exactly, case-insensitively
    } else if (namedM) {
      fragment = namedM[1].trim().replace(/\s+(?:in|at|of|for)$/, "");
      strong = true;
    } else if (hasCount || hasList) {
      // Derive the name candidate: strip count/list words, the department scope,
      // then all filler/stop/people words. Whatever remains should be the name.
      let t = q;
      for (const w of [...COUNT_WORDS, ...LIST_WORDS])
        t = t.split(normTerm(w)).join(" ");
      if (scope) t = t.split(normTerm(scope.phrase)).join(" ");
      const cand = t
        .split(" ")
        .filter(
          (x) =>
            x &&
            !NAME_STOP.has(x) &&
            !FILLER.has(x) &&
            !DSP_WIDE.has(x) &&
            !LIST_TOK.has(x) &&
            !PEOPLE_TOK.has(x),
        )
        .join(" ")
        .trim();
      if (/^[a-z][a-z]{2,}( [a-z]{2,})?$/.test(cand)) {
        fragment = cand;
        strong = false;
      }
    }
    if (fragment) {
      return {
        kind: "peopleByName",
        fragment,
        scopeName: dept?.name ?? null,
        codes: dept?.codes ?? null,
        list: hasList,
        strong,
        exact,
      };
    }
  }

  if (desig && (hasCount || hasList || terse)) {
    const list = hasList || (terse && !!dept);
    return {
      kind: "people",
      term: desig.term,
      label: desig.label,
      scopeName: dept?.name ?? null,
      codes: dept?.codes ?? null,
      list,
    };
  }

  if (hasCount && PEOPLE_RE.test(q))
    return dept ? { kind: "deptTotal", deptName: dept.name, codes: dept.codes } : { kind: "total" };
  if (dept && (leftoverClean || terse)) return { kind: "deptTotal", deptName: dept.name, codes: dept.codes };

  // Bare headcount: "total employees", "staff", "manpower in <dept>" — a people
  // word with nothing else left over (no topic) is a headcount request even
  // without an explicit count word. The clean-leftover guard keeps
  // conversational uses ("employees who...", "staff morale") in the search lane.
  if (hasPeopleWord && leftoverClean)
    return dept
      ? { kind: "deptTotal", deptName: dept.name, codes: dept.codes }
      : { kind: "total" };

  return null;
}
