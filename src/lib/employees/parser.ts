// src/lib/employees/parser.ts
//
// Deterministic intent parser: a typed question -> a structured analytics intent
// (or null). No AI. Rules (validated against real phrasings):
//   - a recognised rank/class + count intent  -> { count }
//   - total / headcount                        -> { total }
//   - breakdown / distribution / grade-wise    -> { breakdown }
//   - a department is named                     -> { deptPending }  (Phase 2)
//   - nothing recognised                        -> null  (hand off; no guessing)

import { RANKS, normTerm } from "./designations";

export type AnalyticsIntent =
  | { kind: "count"; term: string; label: string }
  | { kind: "total" }
  | { kind: "breakdown" }
  | { kind: "deptPending"; dept: string; label?: string };

const COUNT_WORDS = ["how many", "number of", "no of", "no. of", "count of", "count", "total number of", "how much"];
const TOTAL_WORDS = ["total employees", "total headcount", "total strength", "total manpower", "total staff", "total people", "headcount", "manpower", "how many employees", "how many people", "how many staff", "overall strength", "total workforce", "total number of employees"];
const BREAKDOWN_WORDS = ["breakdown", "break up", "distribution", "grade wise", "designation wise", "each designation", "how many of each", "rank wise", "by designation"];

const DSP_WIDE = new Set(["dsp", "sail", "plant", "company", "organisation", "organization", "overall", "total", "all", "durgapur steel plant"]);
const FILLER = new Set(["currently", "now", "present", "presently", "today", "department", "dept", "section", "the", "entire", "whole", "in", "at", "has", "have", "we", "current"]);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest recognised designation phrase in the text (plural-tolerant),
// then S-grade pattern, then group terms.
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

  if (/ non executives? /.test(nq) || / non exec /.test(nq) || / s grade /.test(nq) || / s scale /.test(nq) || / workers? /.test(nq))
    return { term: "non-executive", label: "Non-executives" };
  if (/ executives? /.test(nq) || / execs? /.test(nq))
    return { term: "executives", label: "Executives" };

  return null;
}

// A named department (not DSP-wide) after in/at/for/under/within.
// Returns the ORIGINAL casing (e.g. "C&IT") for display, after trimming
// leading/trailing filler words; null when the scope is DSP-wide or absent.
function findDeptScope(original: string): string | null {
  const m = original.match(/\b(?:in|at|for|under|within)\b\s+(.+)$/i);
  if (!m) return null;
  const words = m[1].replace(/[?.!,]/g, "").trim().split(/\s+/).filter(Boolean);
  while (words.length && FILLER.has(normTerm(words[0]))) words.shift();
  while (words.length && FILLER.has(normTerm(words[words.length - 1]))) words.pop();
  if (words.length === 0) return null;
  const normToks = normTerm(words.join(" ")).split(" ").filter(Boolean);
  if (normToks.length === 0) return null;
  if (DSP_WIDE.has(normToks[0]) || normToks.every((t) => DSP_WIDE.has(t))) return null;
  return words.join(" ");
}

export function parseAnalytics(query: string): AnalyticsIntent | null {
  const q = normTerm(query);
  const hasCount = COUNT_WORDS.some((w) => q.includes(normTerm(w)));
  const hasTotal = TOTAL_WORDS.some((w) => q.includes(normTerm(w)));
  const hasBreakdown = BREAKDOWN_WORDS.some((w) => q.includes(normTerm(w)));
  if (!hasCount && !hasTotal && !hasBreakdown) return null; // not analytics

  const dept = findDeptScope(query);
  const desig = findDesignation(query);

  if (dept) return { kind: "deptPending", dept, label: desig?.label };
  if (hasBreakdown) return { kind: "breakdown" };
  if (desig) return { kind: "count", term: desig.term, label: desig.label };
  if (hasTotal || (hasCount && /(employees?|people|staff|manpower|workforce|strength)/.test(q)))
    return { kind: "total" };
  return null;
}
