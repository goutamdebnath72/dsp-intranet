// src/lib/search/rankAdjust.ts
//
// Pure post-ranking adjustments for the omnibar's circular search (semantic
// mode, Latin non-quoted queries only). No DB, no model, no state: the same
// function is exercised offline against recorded battery results.
//
// Each rule is a statement a human reader would agree with:
//   1. YEAR      A year in the question counts. A result whose own title states a
//                different year is demoted; one that states the asked year is lifted.
//                With no year in the question, the NEWEST holiday policy / holiday
//                list wins, and older yearly copies of the same policy collapse.
//   2. AUDIENCE  Contractor-worker circulars do not answer a question that never
//                mentions contractors; regular-employee holiday documents do not
//                answer a question about contractor workers.
//   3. HOLIDAYS  For a holiday-topic question the holiday notes / holiday lists
//                are the answer and must rank among the best.
//   4. CUTOFF    When the best result is strong, results far below it are noise.
//
// Quoted and Indic-script queries are returned untouched.

import { AUDIENCE_WORDS, contentTokens, isHolidayTopic } from "./topicGate";

export interface RankItem {
  id: number;
  type: string; // "circular" | "announcement" | "holiday"
  headline?: string | null;
  matchPercentage: number;
  /** true for holiday-list circulars found only by headline embedding (they have no body text) */
  fromHeadlineEmbedding?: boolean;
}

export interface RankOptions {
  /** results more than this many points below the best are dropped (when best >= 85); default 12 */
  margin?: number;
  /** max headline-embedding holiday lists kept when the question names no year */
  maxHolidayLists?: number;
}

const AMENDING_RE = /\b(corrigendum|corrigenda|addendum|amendment|amended|revised|revision|modification)\b/i;
const AMENDING_NOISE = new Set(["circular", "notice", "corrigendum", "corrigenda", "addendum", "amendment", "amended", "revised", "revision", "modification", "order", "amount"]);
const INDIC = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;
const CONTRACT_RE = /\bcontract(?:or|ors|s|ual)?\b/i;
// What a QUESTION says when it is about contractor workers: the headline word, but also the short forms people
// type ("CW", "labour", "workers"). Used for the question only; headlines are tested with CONTRACT_RE.
const CONTRACT_QUERY_RE = /\b(contract(?:or|ors|s|ual)?|cws?|labou?rs?|workers?)\b/i;
const EMPLOYEE_EXPLICIT_RE = /\b(employee|employees|executive|executives|officer|officers|regular|permanent|staff|non-executive|non-executives)\b/i;

/** Every year a text states, including ranges: "2024-25" -> 2024, 2025; "01.01.2025" -> 2025. */
export function yearsIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of (text || "").matchAll(/\b(20\d{2})(?:\s*[-\u2013/]\s*(\d{2,4}))?\b/g)) {
    const y = Number(m[1]);
    out.add(y);
    if (m[2]) {
      let y2 = Number(m[2]);
      if (m[2].length === 2) y2 = Math.floor(y / 100) * 100 + y2;
      if (y2 > y && y2 - y <= 1) out.add(y2);
    }
  }
  return Array.from(out);
}

/**
 * With no year in the question, yearly copies of the same holiday policy
 * ("Compensatory Off (2020 holiday policy)" ... "(2026 holiday policy)") collapse to the
 * newest one: the question is about the policy as it stands now. With a year in the
 * question the list is returned unchanged (the year rule ranks them instead).
 */
export function collapseYearlyPolicyCopies<T extends RankItem>(q: string, items: T[]): T[] {
  if (!q || INDIC.test(q) || q.includes('"') || yearsIn(q).length) return items;
  const keyOf = (it: T) => (it.headline || "").replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const newest = new Map<string, number>();
  for (const it of items) {
    if (it.type !== "holiday") continue;
    const ys = yearsIn(it.headline || "");
    if (ys.length) newest.set(keyOf(it), Math.max(newest.get(keyOf(it)) ?? 0, ...ys));
  }
  return items.filter((it) => {
    if (it.type !== "holiday") return true;
    const ys = yearsIn(it.headline || "");
    return !ys.length || Math.max(...ys) >= (newest.get(keyOf(it)) ?? 0);
  });
}

const isHolidayDoc = (it: RankItem) => it.type === "holiday" || !!it.fromHeadlineEmbedding;

export function applyRankAdjustments<T extends RankItem>(q: string, items: T[], opts: RankOptions = {}): T[] {
  const margin = opts.margin ?? 12;
  const maxLists = opts.maxHolidayLists ?? 3;
  if (!q || INDIC.test(q) || q.includes('"')) return items;

  const qYears = yearsIn(q);
  const qContract = CONTRACT_QUERY_RE.test(q);
  const qExplicitEmployee = EMPLOYEE_EXPLICIT_RE.test(q);
  const holidayTopic = isHolidayTopic(q);

  // 2. AUDIENCE / POPULATION:
  // In DSP / SAIL, company employees (executives, non-executives, officers, staff) and contractor workers
  // are distinct populations with separate circulars and holiday lists. This is a RANKING matter, not a
  // filter: a headline that says "Contractor Workers" can still be the one right answer (GPAIS premium,
  // wage rates, biometric attendance exist ONLY as contractor circulars), so it is demoted, never hidden,
  // except in the one case below. (An earlier version hid every such headline; real queries such as
  // "revised GPAIS premium amount" or "daily rate of wages" then lost their only correct circular.)
  const isDoc = (it: RankItem) => it.type === "circular" || it.type === "announcement";
  const isContractorDoc = (it: RankItem) => isDoc(it) && CONTRACT_RE.test(it.headline || "");
  // 2a. A question about contractor workers: regular-employee holiday documents do not answer it
  //     (a contractor holiday circular is itself a holiday document and must stay).
  let list = items.filter((it) => !(qContract && isHolidayDoc(it) && !isContractorDoc(it)));
  // 2b. A question that explicitly names employees/executives/officers: contractor circulars are dropped,
  //     but only if something else remains (otherwise the user would see an empty page for a real topic).
  //     "Something else" must be a real alternative: a regular document scoring at least as high. A contractor
  //     circular that is clearly the best match ("nodal officers GPAIS premium": "officers" is just a noun there)
  //     is kept, demoted below.
  if (!qContract && qExplicitEmployee) {
    const bestRegular = Math.max(-1, ...list.filter((it) => !isContractorDoc(it)).map((it) => it.matchPercentage));
    if (bestRegular >= 0) list = list.filter((it) => !isContractorDoc(it) || it.matchPercentage > bestRegular);
  }

  // 1b. no year asked: collapse yearly copies of the same holiday policy to the newest one
  list = collapseYearlyPolicyCopies(q, list);

  const adjusted = list.map((it) => {
    let pct = it.matchPercentage;
    const h = it.headline || "";
    const hy = yearsIn(h);

    // 3. holiday-topic: holiday notes / lists are the answer (floor applied BEFORE the year rule)
    if (holidayTopic && !qContract && isHolidayDoc(it) && !isContractorDoc(it)) pct = Math.max(pct, 86);

    // 1. year
    if (qYears.length) {
      if (hy.length) pct += hy.some((y) => qYears.includes(y)) ? 8 : -16;
    } else if (hy.length && isHolidayDoc(it)) {
      pct += Math.max(0, Math.min(6, Math.max(...hy) - 2020));
    }

    // 2c. demotion: a contractor circular ranks below the equivalent regular-employee one when the question
    //     is not about contractors (more strongly when it explicitly names employees). Headline-embedded
    //     holiday lists are included: they are exactly where the two audiences get mixed up.
    if (!qContract && isContractorDoc(it)) pct -= qExplicitEmployee ? 30 : 12;

    return { ...it, matchPercentage: Math.max(40, Math.min(99, Math.round(pct))) };
  });

  // 5. an amending document (corrigendum, addendum, amendment, revised ...) outranks the
  //    circular it amends when both are in the results: the question's answer is the
  //    amended version ("Rs 15,000 is to be read as Rs 14,999"). Dates are not used: they
  //    are entered by hand and cannot be trusted for this.
  const amends = (it: { headline?: string | null }) => AMENDING_RE.test(it.headline || "");
  const words = (it: { headline?: string | null }) =>
    new Set(contentTokens((it.headline || "").toLowerCase()).filter((w) => !AMENDING_NOISE.has(w) && !AUDIENCE_WORDS.has(w)));
  for (const s of adjusted) {
    if (!amends(s) || s.type !== "circular") continue;
    const sw = words(s);
    for (const x of adjusted) {
      if (x === s || x.type !== "circular" || amends(x)) continue;
      let shared = 0;
      for (const w of words(x)) if (sw.has(w)) shared++;
      if (shared >= 2 && s.matchPercentage <= x.matchPercentage) s.matchPercentage = Math.min(99, x.matchPercentage + 1);
    }
  }

  adjusted.sort((a, b) => b.matchPercentage - a.matchPercentage);

  // cap headline-only holiday lists when no year was asked (newest first by the recency bonus above)
  let listsKept = 0;
  let out = adjusted.filter((it) => {
    if (!it.fromHeadlineEmbedding || qYears.length) return true;
    return ++listsKept <= maxLists;
  });

  // 4. cutoff
  const best = out[0]?.matchPercentage ?? 0;
  if (best >= 85) out = out.filter((it) => it.matchPercentage >= best - margin);
  return out;
}
