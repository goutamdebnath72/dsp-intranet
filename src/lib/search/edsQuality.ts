// src/lib/search/edsQuality.ts
//
// HOW THE ENGINE DECIDES WHICH EXECUTIVE BRIEFING IS THE BEST ONE.
//
// A model never answers the same question the same way twice, so the engine asks for several candidates, scores every one with THIS function
// (plain code: no model, no randomness, the same briefing always gets the same score), keeps the highest and stores it (edsStore.ts). Whatever is
// stored is what every later ask of that question shows, until the archive of circulars changes.
//
// The score is out of 100:
//   30  grounding  every figure is in the circulars (12), every number 3..31 is written in them too, as digits or as words (6),
//                  the words of the findings and the table are words of the circulars (12)
//   25  coverage   the briefing speaks of what the question asks (its key words are in the briefing)
//   25  structure  an overview (5), 3-6 findings (8), and for a "compare ..." question a complete table with a column per side (12)
//   10  charts     each chart has a title, a sentence saying what it shows, a unit, 2+ labelled items, both series named, one unit on one axis
//   10  citations  every finding names the circular it comes from
//
// This ranks candidates and keeps out a poor one; it does not prove a briefing true. The proof that a figure exists is the grounding step in
// executiveSynthesis.ts (a figure that is in no circular is removed before the score is taken).

import type { SynthesisResult } from "./executiveSynthesis";

export const ACCEPT_SCORE = 80; // a briefing at or above this is a good one
export const STORE_MIN_SCORE = 60; // below this a briefing is shown but never stored (the next ask tries again)

export interface BriefingScore {
  total: number;
  parts: { grounding: number; coverage: number; structure: number; charts: number; citations: number };
  notes: string[];
}

export interface ScoreContext {
  query: string;
  /** the text of the circulars the briefing was written from */
  sourceText: string;
  /** how many figures the grounding step had to remove from this candidate (each one is a figure the model made up) */
  droppedFigures?: number;
  /** the archive's own names for the circulars ("Circular 007 (2026)"): their numbers are not claims */
  labels?: string[];
  /** per circular id: the qualifiers its SUBJECT LINE puts in brackets ("Mid-term inclusion"): the circular's own name for the situation */
  qualifiersBySource?: Record<number, string[]>;
  /** the second reading (edsVerify.ts): sentences it had to remove as unsupported, and reports the code could not check and left alone */
  verification?: { removed: number; ignored: number };
  /** circulars that correct / amend / extend ANOTHER circular among the sources: `id` amends the circulars in `amends` */
  amendments?: Array<{ id: number; amends: number[] }>;
}

/**
 * The bracketed qualifiers of a circular's subject line. "Sub: Revised GPAIS amount (Mid-term inclusion) for contract workers" tells WHAT the amounts are:
 * a briefing that calls them "monthly deposits" that "decrease" has lost the circular's own meaning. A briefing that carries the qualifier is better.
 */
export function subjectQualifiers(text: string): string[] {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(/\bSub(?:ject)?\s*[:\-]\s*([^\n]{0,240})/gi)) {
    for (const q of m[1].matchAll(/\(([^()]{4,50})\)/g)) {
      const phrase = q[1].trim();
      if (!/[A-Za-z]{3}/.test(phrase) || /\d/.test(phrase) || /^(?:[A-Z]{2,6}\s*(?:&|and|\/|,)?\s*)+$/.test(phrase) || /[:/@]|\.[a-z]{2,4}\b/.test(phrase)) continue; // not a date, a number, an abbreviation or a reference ("Ref: ...")
      out.add(phrase);
    }
  }
  return [...out];
}

const STOP = new Set(
  ("synthesize synthesise summarize summarise detail details compare compared comparison comparing versus between under circular circulars about their there which what with from that this have been into regarding " +
    "explain describe list give show tell please whether across along both each other within also using specific specifically various relevant current following include including provide provided " +
    "company rules rule would could should shall will must than then them they these those where when while whose very such some only over most more many much like just does done doing being able").split(/\s+/),
);

/** The first 4 letters of every word of 4+ letters that is not a filler word: "authorities" and "authority" are both "auth", "rent" and "rental" both "rent". */
export function stemsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of (text || "").toLowerCase().split(/[^\p{L}]+/u)) {
    if (w.length >= 4 && !STOP.has(w)) out.add(w.slice(0, 4));
  }
  return out;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  twice: 2, thrice: 3, double: 2, triple: 3, once: 1,
};

/** Every number 0..31 that the circular text writes, as digits ("4th", "12") or as a word ("Four times", "twice", "sixth"). */
export function smallNumbersIn(text: string): Set<number> {
  const set = new Set<number>();
  const t = (text || "").toLowerCase();
  for (const m of t.match(/\d+(?:\.\d+)?/g) || []) {
    const n = Number(m);
    if (Number.isFinite(n) && n <= 31) set.add(n);
  }
  for (const w of t.split(/[^a-z]+/)) if (w in WORD_NUMBERS) set.add(WORD_NUMBERS[w]);
  // "twenty-four" style compounds are not needed here: 31 and below, and the tens are listed above
  return set;
}

function briefingText(r: SynthesisResult): string {
  const parts: string[] = [r.headline ?? "", r.overview ?? ""];
  for (const f of r.keyFindings ?? []) parts.push(f.text);
  if (r.table) parts.push(r.table.title ?? "", r.table.columns.join(" "), ...r.table.rows.map((row) => row.join(" ")));
  if (r.extraTable) parts.push(r.extraTable.title ?? "", r.extraTable.columns.join(" "), ...r.extraTable.rows.map((row) => row.join(" ")));
  for (const c of r.charts ?? []) parts.push(c.title, c.subtitle ?? "", c.unit ?? "", ...(c.entityLabels ?? []), ...c.items.map((i) => i.label));
  return parts.join(" \n ");
}

function claimText(r: SynthesisResult): string {
  const parts: string[] = [r.overview ?? ""];
  for (const f of r.keyFindings ?? []) parts.push(f.text);
  if (r.table) parts.push(...r.table.rows.map((row) => row.join(" ")));
  if (r.extraTable) parts.push(...r.extraTable.rows.map((row) => row.join(" ")));
  return parts.join(" \n ");
}

export function wantsEvolution(query: string): boolean {
  return /\b(trace|evolution|evolve\w*|history|histor\w*|transition\w*|phased|over time|timeline|chronolog\w*)\b/i.test(query || "");
}

export function wantsComparison(query: string): boolean {
  return /\b(compar\w*|versus|vs\.?|differen\w*|between|contrast\w*)\b/i.test(query || "");
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** True when a unit says "parts of one whole" cannot apply: multiples, ratios, rates, durations. Shared with the chart-type rule. */
export function isMagnitudeNotShare(unit: string | undefined): boolean {
  const u = (unit || "").toLowerCase();
  if (/₹|\brs\b|inr|rupee/.test(u)) return false; // money (an allowance, a premium) can be a part of a total
  return /multipl|times|×|\bx\b|ratio|rate\b|month|day|year|week|hour|grade|level|rank|score|increase|hike|escalat/.test(u);
}

export function scoreBriefing(r: SynthesisResult, ctx: ScoreContext): BriefingScore {
  const notes: string[] = [];
  if (!r || r.error || !r.overview || r.overview === "No synthesis could be derived.") {
    return { total: 0, parts: { grounding: 0, coverage: 0, structure: 0, charts: 0, citations: 0 }, notes: ["no briefing"] };
  }
  const src = ctx.sourceText || "";
  const srcStems = stemsOf(src);

  // ---- grounding (30) ----
  const dropped = ctx.droppedFigures ?? 0;
  const figures = clamp(12 - 4 * dropped, 0, 12);
  if (dropped > 0) notes.push(`${dropped} made-up figure(s) had to be removed`);
  const claims = (ctx.labels ?? []).filter(Boolean).sort((a, b) => b.length - a.length).reduce((acc, l) => acc.split(l).join(" "), claimText(r));
  const known = smallNumbersIn(src);
  const unknownSmall = new Set<number>();
  for (const m of claims.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) || []) {
    const n = Number(m);
    if (Number.isFinite(n) && n >= 3 && n <= 31 && !known.has(n)) unknownSmall.add(n);
  }
  const small = clamp(6 - 3 * unknownSmall.size, 0, 6);
  if (unknownSmall.size) notes.push(`number(s) ${[...unknownSmall].join(", ")} are not in the circulars`);
  const claimStems = stemsOf(claims);
  let inSrc = 0;
  for (const s of claimStems) if (srcStems.has(s)) inSrc++;
  const support = claimStems.size ? inSrc / claimStems.size : 0;
  const wording = 12 * clamp(support / 0.8, 0, 1);
  if (support < 0.8) notes.push(`only ${Math.round(support * 100)}% of the wording is found in the circulars`);
  let grounding = figures + small + wording;
  // the second reading: a sentence that had to go was a sentence the writer got wrong; a report left unchecked may still be wrong in the shown briefing
  if (ctx.verification) {
    const { removed, ignored } = ctx.verification;
    if (removed) notes.push(`${removed} unsupported sentence(s) removed by the second reading`);
    if (ignored) notes.push(`${ignored} report(s) of the second reading could not be checked`);
    grounding = clamp(grounding - 2 * removed - 1 * ignored, 0, 30);
  }

  // ---- coverage (25) ----
  const want = stemsOf(ctx.query);
  // the circular's own name for the situation counts as something the briefing should carry (only for circulars it actually cites)
  const citedIds = new Set<number>([...(r.keyFindings ?? []).flatMap((f) => f.sources), ...(r.table?.sources ?? []), ...(r.extraTable?.sources ?? []), ...(r.charts ?? []).flatMap((c) => c.sources ?? [])]);
  for (const id of citedIds) for (const phrase of ctx.qualifiersBySource?.[id] ?? []) for (const st of stemsOf(phrase)) want.add(st);
  const have = stemsOf(briefingText(r));
  let hit = 0;
  const missing: string[] = [];
  for (const s of want) (have.has(s) ? hit++ : missing.push(s));
  const ratio = want.size ? hit / want.size : 1;
  const coverage = 25 * clamp(ratio / 0.85, 0, 1);
  if (missing.length && ratio < 0.85) notes.push(`question words not answered: ${missing.slice(0, 6).join(", ")}`);

  // ---- structure (25) ----
  let structure = 0;
  if (r.overview.trim().length >= 40) structure += 5;
  else notes.push("overview too short");
  const nf = (r.keyFindings ?? []).length;
  structure += nf >= 3 && nf <= 6 ? 8 : nf === 2 ? 5 : nf === 1 ? 2 : nf > 6 ? 6 : 0;
  if (nf < 3) notes.push(`${nf} finding(s)`);
  const cmp = wantsComparison(ctx.query);
  const t = r.table;
  if (cmp) {
    if (!t) {
      notes.push("comparison asked but no table");
    } else {
      const rows = t.rows.length;
      structure += rows >= 3 ? 6 : rows === 2 ? 4 : 2;
      structure += t.columns.length >= 3 ? 3 : 1;
      let cells = 0;
      let filled = 0;
      for (const row of t.rows) {
        for (let i = 1; i < t.columns.length; i++) {
          cells++;
          if ((row[i] ?? "").trim() && !/^(not stated|not specified|n\/a|-)/i.test((row[i] ?? "").trim())) filled++;
        }
      }
      structure += cells ? 3 * clamp(filled / cells / 0.8, 0, 1) : 0;
    }
  } else {
    structure += 12; // no comparison asked: a table is welcome, not required
  }

  // an "evolution / trace" question wants the chronology as a timeline, from its earliest step
  if (wantsEvolution(ctx.query) && !(r.charts ?? []).some((c) => c.type === "timeline")) {
    structure = Math.max(0, structure - 5);
    notes.push("evolution asked but no timeline of milestones");
  }

  // a question that names several years wants each of them in a table (column or row), not only in a sentence; a year the briefing says is NOT in the circulars is exempt
  const years = [...new Set((ctx.query.match(/\b(?:19|20)\d{2}\b/g) || []))];
  if (years.length >= 2 && r.table) {
    const grid = [r.table, r.extraTable].flatMap((tb) => (tb ? [tb.title ?? "", ...tb.columns, ...tb.rows.map((row) => row[0] ?? "")] : [])).join(" ");
    const said = [r.overview, ...(r.keyFindings ?? []).map((f) => f.text)].join(" ").split(/(?<=[.!?])\s+/);
    // "Room No. 18" is not a "no": the abbreviation No. (followed by a full stop) does not count
    const absent = years.filter((y) => !grid.includes(y) && !said.some((sent) => sent.includes(y) && /\b(?:none|not|only|absent|without)\b|\bno\b(?!\.)/i.test(sent)));
    if (absent.length) {
      structure = Math.max(0, structure - 5);
      notes.push(`year(s) asked but missing from the tables: ${absent.join(", ")}`);
    }
  }

  // a corrigendum / amendment to a circular this briefing relies on must be cited too: the figure it corrects is no longer the current one
  for (const a of ctx.amendments ?? []) {
    if (!citedIds.has(a.id) && a.amends.some((id) => citedIds.has(id))) {
      structure = Math.max(0, structure - 6);
      notes.push(`a circular that amends a cited circular is not cited (id ${a.id})`);
      break;
    }
  }

  // ---- charts (10) ----
  let charts = 0;
  if (!r.charts || r.charts.length === 0) {
    charts = t ? 6 : 4; // a chart is optional; a table already shows the figures
  } else {
    let sum = 0;
    for (const c of r.charts) {
      let ok = 0;
      if ((c.title || "").trim().length >= 4) ok++;
      if ((c.subtitle || "").trim().length >= 15) ok++;
      if ((c.unit || "").trim().length >= 1) ok++;
      if (c.items.length >= 2 && new Set(c.items.map((i) => i.label)).size === c.items.length) ok++;
      if (c.type !== "bar" || (c.entityLabels && c.entityLabels.length === 2) || !c.items.some((i) => typeof i.secondaryValue === "number")) ok++;
      if (!(c.type === "pie" && isMagnitudeNotShare(c.unit))) ok++;
      sum += ok / 6;
    }
    charts = 10 * (sum / r.charts.length);
  }

  // ---- citations (10) ----
  const withSource = (r.keyFindings ?? []).filter((f) => f.sources.length > 0).length;
  const citations = (nf ? 6 * (withSource / nf) : 0) + ((r.citations ?? []).length > 0 ? 4 : 0);
  if (nf && withSource < nf) notes.push("a finding names no circular");

  const parts = {
    grounding: Math.round(grounding * 10) / 10,
    coverage: Math.round(coverage * 10) / 10,
    structure: Math.round(structure * 10) / 10,
    charts: Math.round(charts * 10) / 10,
    citations: Math.round(citations * 10) / 10,
  };
  const total = Math.round(parts.grounding + parts.coverage + parts.structure + parts.charts + parts.citations);
  return { total, parts, notes };
}

/**
 * The best of several scored candidates. Higher total wins; a tie goes to the better coverage, then to the one whose canonical JSON sorts first,
 * so the same candidates always give the same winner whatever order they arrived in.
 */
export function pickBest<T extends { result: SynthesisResult; score: BriefingScore }>(cands: T[]): T | null {
  if (cands.length === 0) return null;
  return [...cands].sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (b.score.parts.coverage !== a.score.parts.coverage) return b.score.parts.coverage - a.score.parts.coverage;
    const ja = JSON.stringify(a.result);
    const jb = JSON.stringify(b.result);
    return ja < jb ? -1 : ja > jb ? 1 : 0;
  })[0];
}
