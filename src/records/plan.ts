// src/records/plan.ts
//
// THE PLANNER: what a typed line could be, from its words alone (pure, offline, a few microseconds, no model, no database). It is used for two things only:
//   1. the hint under the box while the person types ("Looks like PAX: choose PAX to search it directly"), and
//   2. the shadow log of the server (x-omni-plan), which records what the planner would have chosen beside what actually answered, so a later step can compare them.
// It never routes a line by itself: with the selection on "Everything" the existing paths decide exactly as before; with a selection chosen the reader decided.
// The order it uses is the one of docs/QUERY_UMBRELLA_PLAN.md: an explicit domain word, then an exact identifier, then the shape of a name, with the margin that asks instead of guessing.

import { isIdQuery } from "@/lib/search/idQuery";
import { looksLikeNameSearch } from "@/lib/search/nameSearchGate";
import type { Claim, DomainId, Plan } from "./types";
import { DOMAINS } from "./domains";

/** two claims closer than this, in different domains, are not guessed between */
export const MARGIN = 15;

/**
 * Domains whose NAME is in the line, in the order that settles a clash between two of them (decided, not guessed):
 * "pax number of hospital opd" is a PAX question, "holiday list for the hospital" a holiday one. The earlier wins; they are never reported as ambiguous with each other.
 */
export const PRECEDENCE: readonly DomainId[] = ["pax", "hospital", "holidays", "degrees", "documents", "people"];
const NAMED_BASE = 99;

const count = (re: RegExp, s: string): number => (s.match(new RegExp(re.source, "gi")) ?? []).length;

export function planLine(raw: string): Plan {
  const line = String(raw ?? "").trim().toLowerCase();
  if (line.length < 2) return { claims: [], best: null, ambiguous: false };
  const claims: Claim[] = [];

  for (const d of DOMAINS) {
    if (d.named.test(line)) {
      const rank = PRECEDENCE.indexOf(d.id);
      claims.push({ domain: d.id, band: 1, strength: NAMED_BASE - (rank < 0 ? 5 : rank), why: `the line names ${d.label}` });
    } else if (d.id !== "people" && d.cues.test(line)) {
      claims.push({ domain: d.id, band: 3, strength: Math.min(85, 55 + 10 * (count(d.cues, line) - 1)), why: `a word of ${d.label}` });
    }
  }
  if (isIdQuery(line)) claims.push({ domain: "people", band: 2, strength: 95, why: "an identifier (ticket, P.No, mobile, CUG4)" });
  else if (/\p{L}/u.test(line) && looksLikeNameSearch(line)) claims.push({ domain: "people", band: 3, strength: 40, why: "the shape of a name" });
  else if (!claims.some((c) => c.domain === "people") && DOMAINS[0].cues.test(line)) claims.push({ domain: "people", band: 3, strength: 55, why: "a word about people" });

  // an identifier is exact: it outranks a weak cue word, but not the explicit name of another domain ("who has 42046 pax")
  const rankOf = (c: Claim) => (6 - c.band) * 100 + c.strength;
  claims.sort((a, b) => rankOf(b) - rankOf(a));
  const best = claims[0] ?? null;
  const next = claims.find((c) => best && c.domain !== best.domain);
  const bothNamed = !!best && !!next && best.band === 1 && next.band === 1 && best.strength >= NAMED_BASE - PRECEDENCE.length && next.strength >= NAMED_BASE - PRECEDENCE.length;
  const ambiguous = !!best && !!next && !bothNamed && rankOf(best) - rankOf(next) <= MARGIN;
  return { claims, best, ambiguous };
}

/** the domain to suggest under the box, or null when the line is only text, or two readings are close (then nothing is suggested) */
export function suggestDomain(line: string): DomainId | null {
  const p = planLine(line);
  return p.best && !p.ambiguous ? p.best.domain : null;
}
