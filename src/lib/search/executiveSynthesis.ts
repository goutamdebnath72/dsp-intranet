// src/lib/search/executiveSynthesis.ts
import { describeIssuers } from "./issuerFinding";
import { fixDiscretionIssuers, fixItemCount, stripUnsupportedForce, restoreAllAbbreviations, normaliseIdentifiers, fixUnprintedNotApplicable } from "./wordingGuard";
import { VERIFY_PROMPT, verifierInput, parseVerdict, applyVerdict } from "./edsVerify";
import { checkAbsences, describeDifferences, dropContradictedClaims, type AbsenceFix, type ConfirmedAbsence } from "./absenceCheck";
import { DateTime } from "luxon";
import { definedAbbreviations, usedDefinitions } from "./abbreviations";
import { Agent } from "undici";
import { createHash } from "node:crypto";
import { SearchResultRow } from "./titleSearch";
import { buildSourceNames, sanitizeSourceRefs } from "./sourceRefs";
import { GeminiError, geminiGenerate, synthesisModels, type ThinkingLevel } from "../ai/geminiChat";
import { scoreBriefing, pickBest, isMagnitudeNotShare, smallNumbersIn, subjectQualifiers, stemsOf, STORE_MIN_SCORE, type BriefingScore, type ScoreContext } from "./edsQuality";
import type { EdsRow, EdsStore } from "./edsStore";
import { withKpiCards } from "./kpiFromTable";
import { withConditionFindings } from "./conditionFinding";

const ollamaDispatcher = new Agent({
  headersTimeout: 10 * 60 * 1000,
  bodyTimeout: 10 * 60 * 1000,
  connectTimeout: 60 * 1000,
});

/* ------------------------------------------------------------------ *
 * TYPED SYNTHESIS CONTRACT
 * The frontend consumes this object directly — no markdown string, no
 * embedded HTML-comment chart directive. Every claim-bearing element
 * carries a `sources[]` array of circular ids so the UI can render
 * citation chips that open the existing CircularViewerLightbox.
 *
 * The LLM NEVER names a chart type. It emits typed datasets tagged with
 * an `intent`; the chart type is chosen deterministically here.
 * ------------------------------------------------------------------ */

export type ChartType =
  | "pie" // parts of one whole
  | "bar" // same measure across 2+ entities/periods (grouped columns)
  | "line" // ordered numeric value over time (trend)
  | "timeline" // ordered milestones / phased rollouts
  | "scatter" // correlation between two numeric axes
  | "kpi"; // standalone headline numbers (metric cards)

export interface SynthesisChartItem {
  label: string;
  value: number;
  secondaryValue?: number; // second series (bar) OR y-axis (scatter)
  detail?: string;
}

export interface SynthesisChart {
  type: ChartType;
  title: string;
  subtitle?: string;
  entityLabels?: [string, string]; // bar (series names) / scatter (axis names)
  unit?: string; // e.g. "₹", "days", "%"
  items: SynthesisChartItem[];
  /** circular ids the figures of this chart come from (shown as chips under its title) */
  sources?: number[];
}

export interface SynthesisFinding {
  text: string;
  sources: number[]; // circular ids backing this finding
}

export interface SynthesisTable {
  columns: string[]; // 2 to 4 columns (the parameter + up to 3 entities / periods)
  rows: string[][];
  /** circular ids the table comes from (shown as chips under it) */
  sources?: number[];
  /** a short caption saying what the table holds (shown above it; needed when there are two tables) */
  title?: string;
}

export interface SynthesisCitation {
  id: number;
  headline: string;
  publishedAt: string | null;
  /** how the archive names it to the reader: "Circular 046 (2022)" (the chip on a finding shows this) */
  label?: string;
}

export interface SynthesisResult {
  overview: string;
  headline?: string; // short striking title for the briefing
  keyFindings: SynthesisFinding[];
  table?: SynthesisTable | null;
  /** a SECOND table, only when the inquiry has a second, separate structured part (e.g. an amounts schedule AND a wage table) */
  extraTable?: SynthesisTable | null;
  charts: SynthesisChart[];
  citations: SynthesisCitation[];
  /** abbreviations the circulars define themselves ("financial assistance (FA)") and the reply uses: { FA: "Financial Assistance" } */
  abbreviations?: Record<string, string>;
  /** the second reading (edsVerify.ts): whether it ran, and what it changed */
  verification?: { checked: boolean; changes: string[] };
  error?: string;
}

/* ------------------------------------------------------------------ *
 * What the LLM returns — a data-only payload.
 * ------------------------------------------------------------------ */

type RawIntent =
  | "breakdown"
  | "comparison"
  | "trend"
  | "timeline"
  | "correlation"
  | "kpi";

interface RawFinding {
  text?: string;
  sources?: number[];
}

interface RawDataset {
  intent?: RawIntent;
  title?: string;
  subtitle?: string;
  entityLabels?: [string, string];
  unit?: string;
  sources?: number[];
  items?: Array<{
    label?: string;
    value?: number | string;
    secondaryValue?: number | string;
    detail?: string;
  }>;
}

interface RawPayload {
  headline?: string;
  overview?: string;
  keyFindings?: RawFinding[];
  table?: { columns?: string[]; rows?: string[][]; sources?: number[]; title?: string } | null;
  table2?: { columns?: string[]; rows?: string[][]; sources?: number[]; title?: string } | null;
  datasets?: RawDataset[];
}

function emptyResult(msg: string): SynthesisResult {
  return {
    error: msg,
    overview: msg,
    keyFindings: [],
    table: null,
    charts: [],
    citations: [],
  };
}

// Per-circular context budget for the synthesis prompt. The route supplies
// the FULL circular text including multi-page annexures and tables. With Gemini Pro
// (2M token window), we allow up to 60,000 characters per circular so full
// 10+ page circulars (e.g. Circular 3 higher education bond schedules) are intact.
const SYNTH_CONTEXT_BUDGET = 60000;
// ...but ALL the circulars together are capped as well (up to 5 sources). Real circulars average ~7.7k
// characters so this rarely bites; it stops a worst case (5 x 60k = ~100k tokens, more for Hindi/Bengali)
// from blowing the 52 s deadline and the cost. The share per source is total / number of sources, never
// above SYNTH_CONTEXT_BUDGET; the numeric-priority condenser below trims a source that exceeds its share.
const SYNTH_TOTAL_BUDGET = 150000;

function condenseForSynthesis(text: string, budget: number = SYNTH_CONTEXT_BUDGET): string {
  const t = (text || "").trim();
  if (t.length <= budget) return t;

  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const numeric: string[] = [];
  const prose: string[] = [];
  for (const l of lines) {
    // "numeric-dense" = contains ₹/Rs, a decimal, a 3+ digit run, a date, or a
    // code — the stuff a figures question needs.
    if (
      /[₹]|\bRs\.?\b/i.test(l) ||
      /\d+\.\d+/.test(l) ||
      /\d{3,}/.test(l) ||
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(l) ||
      /[A-Za-z]+[-/][A-Za-z0-9]+/.test(l)
    ) {
      numeric.push(l);
    } else {
      prose.push(l);
    }
  }

  // Lead with the opening prose (context/headline area), then pack numeric
  // lines, then any remaining prose — all clamped to budget.
  const ordered = [...prose.slice(0, 6), ...numeric, ...prose.slice(6)];
  let out = "";
  for (const l of ordered) {
    if (out.length + l.length + 1 > budget) break;
    out += (out ? "\n" : "") + l;
  }
  return out || t.slice(0, budget);
}

// ----------------------------------------------------------------------------
// SOURCE RELEVANCE PRE-FILTER
//
// This is a second, independent checkpoint layered on top of the existing
// search/qualification ranking in route.ts -- it does not replace or touch
// that ranking (which stays untouched, same blast-radius reasoning as the
// earlier smartSemanticRouter.ts fix). It only removes candidates that
// ranking let through but that are DECISIVELY wrong on two specific,
// checkable axes, BEFORE they ever reach the LLM as context -- not just
// hidden from the citation list afterward (that's the separate, already-
// shipped keyFindings-based filter further down in buildResult; this is
// upstream of it, so a wrong source doesn't even get a chance to influence
// what the model writes).
//
//   1. YEAR MISMATCH: the query names an explicit year, and the candidate's
//      own HEADLINE names a DIFFERENT explicit year. Deliberately checks the
//      HEADLINE's own stated year, not `publishedAt`'s calendar year -- this
//      corpus's holiday-list circulars are routinely published in December
//      of the PRIOR year (the 2023 Holiday List circular is dated
//      26/12/2022), so comparing publishedAt's year directly would wrongly
//      exclude the correct source. A circular whose own title says "-2025"
//      answering a question about 2023 is unambiguously wrong regardless of
//      when it was filed.
//   2. POPULATION MISMATCH: the query does not mention contract/contractor
//      workers at all, but the candidate's headline is specifically about
//      contract/contractor workers -- a distinct, differently-administered
//      population in this corpus (see the recurring "Holidays & Leaves for
//      Contractor Workers" circulars), never the right source for an
//      ordinary DSP-employee policy question.
//
// Both checks are decisive (not scored/probabilistic) on purpose: this is
// exactly what was missing when "why is Maha Shivratri an extra holiday in
// 2023?" pulled in a 2025-dated Holiday List circular and two contractor-
// worker circulars at 88-90% match -- nothing upstream ever asked "does
// this source even claim to be about the right year and the right
// population," only "is this vector/lexically close enough."
//
// Deliberately narrow: this does NOT attempt full topical/semantic
// relevance -- a same-year, same-population but only tangentially related
// source (e.g. a generic Compensatory Off policy chunk) still passes this
// filter. Closing that gap is a much larger piece of work, intentionally
// left for a dedicated pass on the executive synthesis engine, not bundled
// into this fix.
// ----------------------------------------------------------------------------
const YEAR_RE = /\b(20\d{2})\b/g;
const CONTRACTOR_RE = /\bcontract(?:or)?s?\b/i;

function extractYearsFromText(text: string): number[] {
  const out: number[] = [];
  const matches = (text || "").match(YEAR_RE);
  if (matches) for (const m of matches) out.push(parseInt(m, 10));
  return out;
}

function filterSourcesForRelevance(
  q: string,
  records: SearchResultRow[],
): SearchResultRow[] {
  const queryYears = extractYearsFromText(q);
  const queryMentionsContractor = CONTRACTOR_RE.test(q || "");

  const clean = records.filter((r) => {
    const headline = r.headline || "";
    const headlineYears = extractYearsFromText(headline);
    const yearMismatch =
      queryYears.length > 0 &&
      headlineYears.length > 0 &&
      !headlineYears.some((y) => queryYears.includes(y));

    const populationMismatch =
      !queryMentionsContractor && CONTRACTOR_RE.test(headline);

    return !yearMismatch && !populationMismatch;
  });

  // Safety net: never zero out the candidate pool entirely. An imperfect
  // answer from the original ranking is better than no answer at all if
  // these heuristics happen to reject everything (e.g. every candidate's
  // headline genuinely lacks a year and the query is very specific). If
  // this fallback fires often in practice, that's a sign the heuristics
  // need revisiting -- not a reason to hide the gap behind a silently empty
  // result.
  return clean.length > 0 ? clean : records;
}

const SYSTEM_PROMPT = `You are the Senior Executive Intelligence Architect for Durgapur Steel Plant (DSP).
Produce a TERSE, high-signal executive briefing that answers the inquiry directly from the circular records. Every sentence must earn its place — no filler, no restating the question, no generic corporate prose.

Return a STRICT JSON object (data only — you do NOT choose any chart type; you tag each dataset with an INTENT and we render the right chart):
{
  "headline": "<=8 word striking title for the briefing",
  "overview": "2-3 sentences MAX. The direct conclusion the executive needs. Bold key figures/dates with **markdown**.",
  "keyFindings": [
    { "text": "one tight, specific finding (a figure, rule, cutoff, or contrast)", "sources": [<circular id>] }
  ],
  "table": {
    "title": "Short caption: what this table holds",
    "columns": ["Parameter", "Entity/Period A", "Entity/Period B"],
    "rows": [["...","...","..."]],
    "sources": [<circular id the table was read from>]
  },
  "table2": null,   // OPTIONAL second table, same shape (see TWO TABLES below); null when not needed
  "datasets": [
    {
      "intent": "breakdown | comparison | trend | timeline | correlation | kpi",
      "title": "Short chart title",
      "subtitle": "Clear 1-sentence description explaining what the chart numbers represent",
      "unit": "Exact unit of measure (e.g. 'Multiples of the base rate', '₹', 'Days', '%', 'Months')",
      "sources": [<circular id the numbers of this chart were read from>],
      "entityLabels": ["A","B"],
      "items": [
        { "label":"...", "value": <number>, "secondaryValue": <number optional>, "detail":"..." }
      ]
    }
  ]
}

KEY FINDINGS DISCIPLINE (PRIORITIZED FOR CONSISTENCY):
- The same inquiry must always get the same structure: at least ONE key finding for each part of the inquiry (so 3 or more when it has 3 parts), then the conditions or exceptions; never more than 6.
- Answer the parts of the inquiry IN THE ORDER the inquiry names them: one finding per part (an eligibility or criteria part may take two), stating the rule, figure, date or limit that answers it.
- After the parts, give the conditions or exceptions that limit those headline rules (a footnote, a site-specific limit, an exceptional clause), briefly.
- Do NOT spend findings on special cases the inquiry did not ask about (a rarer category of people, a penalty clause, a form to fill) unless the inquiry asks about them.

TABLE PRESENTATION DISCIPLINE:
- EVERY CASE, WITH ITS CONDITION: before you write a table, find the circular's OWN table or list for the item asked and COUNT its cases (rows such as "Type of Sponsorship", grade, category, with / without something). Your table has exactly one column or row for EACH of those cases, in the circular's order, each labelled with the circular's own condition in full; fewer cases than the circular gives is a wrong answer. Never merge cases under a shorter label that hides the condition (for example "With financial assistance" when the circular splits it by study leave), and never state a rule in the overview or in a finding without the condition it holds under. If the question names only one side of the split, still show every other case the circular gives for the same item, so that nothing reads as the whole rule when it is only a part.
- DEFINITIONS OF TERMS: when a figure is given in a term the circular itself defines (salary = Basic + DA + NPA, premium = fee + service charge + tax), one finding states that definition once, as the circular words it.
- NO FIGURES OF YOUR OWN: quote a rule as the circular writes it ("course duration plus two years"). A figure you work out yourself (2-year course + 2 years = 4 years) may only stand beside the circular's own wording, never instead of it, and never in the table.
- NAMES AS THE CIRCULAR SPELLS THEM: a scheme, level, allowance or place is written the way the circulars write it, never the way the question misspells it. Never invent a name, and never put the question's wrong spelling in brackets. If a name in the question matches no name in the circulars exactly, use the ONE closest name and say so in a plain sentence of the overview ("Taken to mean the Pragya level"); if two names are equally close, give both.
- NO SHORT FORMS OF YOUR OWN: write words in full ("Financial Assistance"), unless the circular itself uses the short form and defines it, or it is a standard abbreviation (HRA, GST).
- ROW AND COLUMN LABELS ARE PLAIN: a row label never carries a bracket that applies to one column only; such a difference goes into that column's cell, and the label uses the form common to all the columns.
- DEFINITIONS AND EXCEPTIONS: when you use a category that the circular defines by listing its members (types of city, categories of employee), name those members once, in the overview or a finding; and when the circular gives a different limit, cap or rule for another case of the same subject (another cause, another group), say it in one sentence.
- ONE RANGE, ONE VALUE: a sentence that gives one value (an authority, a rate, a period) for several rows, periods or years is checked against every column of your table; where the columns differ, name each one's value. A condition that your table gives to some rows or periods only (\"exceptional circumstances\", \"provided that\", \"subject to\") is said of those rows or periods only, never of the whole range or of its largest value.
- IDENTIFIERS ARE NOT AMOUNTS: an account number, IFSC code, policy number, cheque number or ticket number is written exactly as the circular prints it, its digits in one unbroken run: no comma, no space, no rupee sign. Only sums of money are grouped (₹ 10,00,000).
- QUALIFIERS STAY WHERE THE CIRCULAR PUTS THEM: a footnote, note or exception belongs to the item it is attached to, and to that item only. "Expenditure ... shall not include normal salary" qualifies the expenditure (the financial assistance), not the months of salary beside it; "on pro-rata basis" qualifies the amount by the course duration. Carry it with the item it qualifies, in the circular's words, and never move it to its neighbour.
- EVERY FIELD A READER NEEDS: when the circular's table gives several fields for each row (a bank: name, address, account number, IFSC code; a place: name, date, time), the briefing carries each field a reader needs to act on, never only some of them (an account number without its code).
- ITEMS, NOT TOTALS: when the inquiry asks for lists of things (holidays, schemes, officers, dates, what is allowed), the table holds the things themselves, one per row, with their date or figure in each edition asked; how many there are is one sentence, never the whole answer. A table of counts alone (6 days, 13 days) answers \"how many\", not \"which\".
- WHAT DIFFERS: for a question that compares editions, years or versions, the answer shows what DIFFERS: every item added, removed, renamed, moved or re-valued between them, with its date or figure in each. What stayed equal is said once, in one sentence. A table has a column for each edition or year the question names (the label column plus up to three).
- THE NEWEST WORD WINS: when one circular corrects, amends, extends or replaces another (corrigendum, amendment, revised, extended, "may be read as"), state the CURRENT figure or date, say in the same sentence what it replaced, and cite BOTH circulars. Never give the figure of the circular that was corrected.
- WHO IS COVERED: state who a circular covers in its own words ("Executives and Non-Executives"), never narrower and never wider, even when the question names only one group.
- NO FIGURE FROM "AS BEFORE": "as in the previous year" or "continued" gives no figure for the earlier period. Never state or tabulate one.
- UNIVERSAL WORDS: write "all", "every", "unchanged", "increased across" only after checking every row of your own table; if one row differs, name the exception.
- ALTERNATIVES STAY ALTERNATIVES: when the circular gives "A or B" conditions (5 years in Level 11 or 10 years in Level 10), write them as alternatives, never merged into a range (5-10 years).
- NOT STATED MEANS NOT IN THE CIRCULAR: before writing "Not stated" (or "Not stated in circular", "Not applicable") in ANY cell, do this for that cell: search that edition's whole text for the item's name, in every list, footnote and note. If it appears anywhere, the cell says what the circular says about it there, in its own words and with its date ("Restricted holiday, 2nd February", "Treated as an additional festival holiday for Category B, 23rd October"). "Not stated" is allowed only when the name appears nowhere in that edition. The other rules that give "Not stated in circular" as the filler for an absent value apply only after this search.
- SAME MEANS SAME: where a value is identical in every edition or year, say it is unchanged. Never write that it "shifts", "varies" or "changes" unless a value in your table differs. A weekday that moves is not a date that moves.
- TRIGGERS AND SUBSTITUTES: when each edition states why or when a rule applies, and what takes the place of something (for example which day is given instead), say it as THAT edition states it. If the editions state different triggers or different substitutes, name each one with its edition; never merge them into one general trigger.
- NOTHING TO ANSWER: when the circulars hold none of what was asked, say so in the overview and give only the directly related facts. No table of unrelated rows.
- ASKED, BUT NOT IN THE CIRCULARS: when the question names a year, edition, period, scheme or place for which none of the circulars provided has a figure, say so in ONE plain sentence in the overview ("The circulars provided hold only the scheme issued on 11 December 2023; none for 2025 is among them"). Never present one year's figures as if they covered another, and never invent the missing ones.
- COMPLETE TABLE: when the circular gives a rule per period, tier, grade or category, the table has EVERY such row for EVERY entity compared, in the circular's own order (earliest period first). A row the circular does not give for one entity gets \"Not stated in circular\" for that entity; \"Not applicable\" only where the circular itself says the case does not apply.
- THE ITEMS ASKED ABOUT STAY IN THE TABLE: when the circular's own table pairs each of several items (violations, rules, duties, schemes, categories) with a stage, level, grade or consequence, and the question asks about EACH item (\"each violation\", \"every rule\"), the table names the items: one row per item, in the circular's order and its own words, with its stage, its consequence and who issues or approves it; or one row per stage with every item of that stage listed in the first cell. A table of stages alone, without the items the question asked about, is an incomplete answer.
- WHO ISSUES, APPROVES OR SANCTIONS: when the question asks through whom, by whom or by which authority something is issued, approved, sanctioned or done, the table has a column of its own for it (never folded into the consequence cell). Where the circular names nobody for a row, that cell says \"Not stated in circular\". The key findings say it too, including the rows for which no authority is named.
- A NAME IS NOT A REQUEST TO COMPARE: the word \"revised\", \"amended\" or \"new\" inside the NAME of a rule or circular (\"the revised Zero Tolerance Safety Rules\") does not ask how it differs from the earlier edition. Such a question gets the current rule only; the earlier edition, if the same document holds it, is at most one sentence in the overview, never a column of the table. WHAT DIFFERS applies only when the question asks what changed, differs or compares.
- DISCRETION IS NOT ISSUING: an authority the circular names only as holding a discretion (\"Discretion of Head of Safety\") does not issue or sanction anything by that. Keep the words \"Discretion of Head of Safety\" in the consequence cell, and the issuer cell says \"Not stated in circular\" unless the circular says that authority issues, approves or sanctions it.
- SAY ONLY WHAT THE CIRCULAR SAYS: do not add words of speed, force or consequence the circular does not use (\"immediately\", \"automatically\", \"directly\", \"bypasses\", \"regardless\"). A row that has no stage is described as it is printed (\"no stage is stated; Standing Order Rule 29(X) applies\"), never as skipping, bypassing or overriding the stages.
- NO SENTENCE TWICE IN A ROW: when the circular prints one sentence under several headings of the same row (a clause that is at once the item, the stage and the consequence), write it once, in the column where it belongs, give the row a short name as its label (for example \"Violation by a contract worker\", \"Entering the plant intoxicated\") and put \"-\" in the other cells of that row. A row never shows the same words in two cells.
- FOOTNOTES ARE CONDITIONS: a footnote mark (*, #) on ONE row of a rule table in the circular limits THAT row (e.g. \"only at site X\", \"only in exceptional cases\"): put that condition, in a few words, in square brackets at the end of that cell. A mark on a column or table HEADING, or a special case the inquiry did not ask about, applies to the whole table or to another case: do NOT repeat it in every cell; leave it out unless the inquiry asks about that case. Never put the same condition in more than one cell.
- CELL FORM: every value cell reads \"<value> (<approver>) [<condition>]\". The value is short and uniform: a multiplier as \"4x <base>\" (never \"Four times of the <base>\"), a date as the circular writes it, an amount with its unit. The approver goes in round brackets ONLY when the circular names who approves or sanctions THAT item (e.g. \"Head of Department\"); a date, a system name or a duration has no approver: write no brackets at all, and NEVER write the generic words \"Competent Authority\" in brackets. No label such as \"Auth:\". The condition, if any, comes last in square brackets. Example: \"10 days (Head of Department) [only for new joiners]\".
- When an inquiry names several things to detail, EACH of them appears in the table cells and in at least one key finding.
- 2 to 4 columns: the parameter first, then ONE column per entity, group or period compared (at most 3). A schedule of amounts by month or period (premium, fee, charge, tax, total) is read across: components as rows, the months or periods as columns. Keep the table to the rows that matter.
- Column 1: the parameter, period, grade or milestone (e.g. \"Parameter\", \"Period\").
- Column 2 & 3: the entities, groups or locations being compared, named as the inquiry names them.
- Standardize phrasing across cells, in the same form for the same kind of value (\"Not stated in circular\" for a missing one).

DATASET INTENT & PRESENTATION RULES:
Choose the intent that matches the DATA you actually have. Emit a dataset ONLY when the records contain the real numbers to fill it; omit it otherwise. Emit AT MOST TWO datasets, and only when each shows something the table does not. Never emit two datasets that show the same numbers. For ONE measure compared across two entities and periods emit ONE dataset (intent \"comparison\").
- "breakdown": parts of ONE whole that add up to a total — allowance/budget shares (Basic, HRA, VDA...), percentages that sum to 100. Same unit. value = each part. -> pie. NEVER use \"breakdown\" for multipliers, rates, ratios, durations or limits (4x, 2x, 6 months): those are not parts of a whole, they are a \"comparison\".
- "comparison": the SAME measure across two entities/periods (Executives vs Contract Workers; 2023 vs 2024). Provide entityLabels; value = A, secondaryValue = B for each label. -> grouped columns
- "trend": ONE numeric measure moving over ordered time points (wage 2022->2025; premium year on year). label = period, value = number. Needs >=3 points. -> line
- "timeline": ordered MILESTONES / phased rollouts / validity cutoffs where the point is the sequence, not a magnitude. label = date/phase, detail = what happened. -> timeline rail
- "correlation": two numeric axes to show relationship (e.g. course duration vs bond amount). value = x, secondaryValue = y, entityLabels = [xAxisName, yAxisName]. -> scatter
- "kpi": standalone headline numbers — quotas, pass numbers, daily counts (200 workers/day, pass number 13, 2 awards/month). value = number, detail = unit/context. -> metric cards
- "unit": REQUIRED for every dataset. Explicitly specify the exact unit of measure (e.g. "Multiples of the base rate", "₹ per day", "Days", "%", "Months"). Every chart must be self-explanatory to an executive without guessing.
- "subtitle": REQUIRED. Write a clear, concise sentence explaining what the chart numbers represent. If the chart covers an initial phase or specific metric (e.g. "Multiples of the base rate for the first 4 months; later months use a different basis, see the table"), explicitly state that so the scope is unambiguous.
- "entityLabels": REQUIRED for comparison charts (e.g. ["Executives", "Contract Workers"]).

EVOLUTION / TRACE / HISTORY / TRANSITION QUESTIONS (the inquiry says "trace", "evolution", "history", "transition", "phased", "over time", "from X to Y"):
- COMPLETE CHRONOLOGY: the story starts at the EARLIEST dated step in the records, not at the step the inquiry names. Include EVERY dated milestone that bears on the inquiry, earliest first: trial or pilot starts, the notice that replaced an earlier one, effective ("w.e.f.") dates, the end or validity date of the old arrangement, and the start of the new one. A trial that preceded the formal start MUST appear.
- Emit ONE dataset with intent "timeline" for it: label = the date as the circular writes it, detail = what began, changed or ended on that date and for whom, items in strict chronological order. A department-by-department schedule is NOT the evolution: give it as a table row or, only if the inquiry asks for the schedule, as a second dataset.
- A phased or department-by-department schedule is summarised, never dropped: the timeline carries the FIRST and the LAST date of the schedule (with what each covers, e.g. the first and the last department or area named), and a key finding gives that span in words. Do NOT state how many steps or departments there are unless the circular itself states the number.
- The overview and the first key finding name the earliest and the latest milestone.

SCOPE, MEANING AND COMPLETENESS (apply to every inquiry):
- CONTEXT COLUMNS: when the inquiry names ONE area, grade, group or period (e.g. \"for the Works area\") and the circular's own table lists OTHER areas, grades, groups or periods beside it, show them too: the named one FIRST, then the others in the circular's own order (at most 3 value columns), so the reader sees the figure in context and the answer is complete. The key findings still answer for the named one.
- STRUCTURE / BREAKDOWN / CALCULATION asked: when the inquiry asks for the "structure", "breakdown", "calculation" or "components" of an amount, give EVERY component with its rule as the circular states it (a percentage of what, a fixed fee) AND the total, as table rows.
- WHAT A SCHEDULE OF AMOUNTS MEANS: when the circular lists amounts by month, period of joining, inclusion or application, say exactly that (the amount payable for someone joining in that month). Do NOT call it an increase, decrease, reduction, rise or trend of the same item unless the circular says that item itself changes. Use the circular's own words for the situation (e.g. \"mid-term inclusion\").
- ELIGIBILITY / CRITERIA asked: give it as TWO findings. (1) WHO QUALIFIES: every condition the circular states, in one sentence separated by semicolons: who is covered (scope), what must be held or shown (valid pass, documents), minimum thresholds (attendance, service), conduct, and the limit per person or per period (e.g. once in a financial year). (2) WHAT IS GIVEN AND HOW: the award or benefit and its amount, how often, how many per department or unit (and any larger allowance for big units), and who selects or approves. Never drop a condition to save space.
- SITUATION TAG: a record header may carry \"situation: X\" (taken from the circular's own subject line, e.g. \"Mid-term inclusion\"). Say X, in those words, when you describe that circular's amounts or rules, in the finding and in the caption of the table or chart that comes from it.
- A column or chart label that spans a period ("March to August") is one RANGE, not one point in time: never draw it as a point on a line.

- TWO TABLES: when the inquiry has TWO separate structured parts that cannot share columns (e.g. a schedule of amounts by month AND a wage table by component), give each its own table: "table" for the first part the inquiry names and "table2" for the second, each with a short "title". Otherwise "table2" is null. Never split one comparison across two tables.
- AMOUNTS CARRY THEIR UNIT: every amount cell is written with its unit (\u20b9 3,350.00), or the column heading names it ("Amount (\u20b9)"). A bare number is not enough.
- LIMITED SPACE FOR FINDINGS: when the inquiry has several parts and the findings are few, an eligibility or criteria part goes into ONE finding that lists ALL its criteria compactly, separated by semicolons (scope; threshold; limit per person; limit per department; who approves). Never drop a criterion to save space.
- DO NOT STATE WHAT THE CIRCULAR DOES NOT: write "monthly", "per worker", "per year", "one-time" only if the circular says it for THAT amount. A schedule by month of joining is "payable for a worker joining in that month", not a monthly amount.

HOMOGENEOUS AXIS SCALE REQUIREMENT:
- NEVER combine different underlying financial or measurement baselines on the same numeric axis (for instance, DO NOT plot multiples of one base amount alongside multiples of a different base amount on the same chart, because their baselines differ).
- If the rules change their basis from one period or tier to the next, DO NOT generate a hybrid chart. Rely on the comparison table to convey the full structured rule, or chart ONLY the part where the unit is strictly identical (e.g. "Multiples of the base rate (first 4 months)").

HARD ACCURACY RULES:
- Transcribe figures, \u20b9 amounts, dates, circular numbers VERBATIM from the records. NEVER invent or interpolate a number.
- The rupee sign (\u20b9, also printed Rs. / INR / \u0930\u0941.) only marks an amount as rupees; it is never a digit. OCR sometimes reads it as a digit stuck to the front of an amount ("215,000" for "Rs. 15,000"). If a record gives the same amount two ways that differ only by one extra leading digit, report the shorter, printed amount and say the other reading is unclear. Give amounts with the unit \u20b9.
- CADENCE DISCIPLINE: Do NOT label an amount "per day / daily", "per month / monthly", or "per annum" unless the circular explicitly says so for THAT amount. If the cadence is not stated, call it simply "wage" or "total" without a time unit. Never assume daily.
- HEADLINE THE TOTAL, NOT A COMPONENT: When a wage is broken into components (Basic, VDA, allowances...) with a stated or sum total, the headline figure is the TOTAL — never a single component. Do NOT call "Basic" (or any one line) "the wage". State the total, then list components.
- MAGNITUDE SANITY: If a figure's magnitude is implausible for the cadence the query implies (e.g. a "daily" wage in the tens of thousands), do NOT assert that cadence. Report the figure as a total without inventing a time unit; flag it "as printed" if it looks like an OCR artifact. Do not swing to the opposite error of quoting a small component as the whole.
- RECONCILE TOTALS: If the circular lists components (Basic, VDA, HRA, ...) AND a stated total, and the components sum to a different number, report the components and the ARITHMETIC SUM; flag the stated total as "as printed" rather than asserting it. Never present a total that contradicts its own components without noting the mismatch.
- COLUMN FIDELITY: Only report an area / entity / period column (Works, Town, Projects, Executives, a year, ...) whose NAME appears VERBATIM in the records. Never rename one column to another (e.g. do not relabel "Town" as "Projects") and never introduce a column the text does not name. If you cannot tell which area a number belongs to, omit that number rather than guessing its column.
- DATE LABEL FIDELITY: a date goes under the label the circular itself gives it. A start of enrolment, trial or phase 1 is a \"start\" or \"phase 1\" date; it is NOT a \"mandatory\", \"full implementation\" or \"effective\" date unless the circular says it becomes mandatory / effective on that date. Where the circular gives no such date for one side, write \"Not stated in circular\" for that side.
- NO DERIVED COLUMNS OR VALUES: Every number you output must be READ from the text. Never compute one column from another (e.g. copying Works and zeroing one allowance to fabricate a second area), never subtract/add across columns to fill a cell, never synthesize a second entity by modifying the first. A derived number is a fabricated number — forbidden.
- FIGURES MUST EXIST IN THE TEXT: Only build a table row, a chart item, or a numeric finding from a number that literally appears in the provided circular text. If the records contain only narrative prose and NOT the actual figures the inquiry asks for (e.g. the rate table was not captured), do NOT manufacture numbers, a components table, or a chart. Instead: give a short overview of what the prose DOES say, and state plainly in one finding that the specific figures are not present in the retrieved text. An honest "the rate table is not in the retrieved circular text" is REQUIRED over an invented table.
- If a comparison value is genuinely absent, put "Not stated in circular" in the TABLE cell — do NOT copy a number across periods, and do NOT fabricate a dataset item for it.
- Every keyFinding.sources id MUST be one of the provided [Circular id=...] values. Cite the circular the fact actually came from.
- ROSTER / SCHEDULE TABLES: in a roster the DATE cell often appears on only SOME rows (one date covers a whole group of rows), and a row is tagged "DATE:" only when it has one. NEVER give a person a date taken from another row or group. If that person's own row has no date, say the date is not shown against that row, and give what the row does show (ticket number, name, department).
- NEVER write a circular's id number in any text (no "Circular 49", no "id=49"). To name a circular in text, write its "cite as" label exactly as shown in its header (e.g. "Circular 007 (2026)"), or its title. The id belongs only in the "sources" arrays.
- 2 or 3 table columns only. Keep the table to the rows that matter.
- Output strictly parseable JSON. No prose outside the JSON.`;

/** A short signature of the prompt: part of the key of a stored briefing, so a changed prompt can never serve a briefing made with the old one. */
const PROMPT_SIG = createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 10);

// ----------------------------------------------------------------------------
// ONE BRIEFING PER QUESTION: stored, scored, consistent.
//
// A question's briefing is made ONCE and then read back:
//   1. this server's memory (valid while the archive of circulars is unchanged),
//   2. the permanent store (edsStore.ts, table eds_briefing): any server, any day, until the archive or the engine changes,
//   3. otherwise it is MADE: several candidates are written at once, each is scored by plain code (edsQuality.ts), the best one is kept, and, if it is
//      good enough, written to the store. Two servers making the same question together both end up showing the row that was stored first.
// A question typed with other capitals, spaces or punctuation is the same question. A question worded differently is a different question.
// If the model cannot be reached (no credit, outage) a briefing stored for an older archive is shown rather than nothing.
// ----------------------------------------------------------------------------
/** Change this when the scoring or the chart/table rules change: every stored briefing made under the old rules is then made afresh. */
const EDS_ENGINE_VERSION = "77.7";
const ENGINE_SIG = `${EDS_ENGINE_VERSION}.${PROMPT_SIG}`;
const MEMORY_MAX = 100;
const MEMORY_TTL_NO_STORE_MS = 30 * 60 * 1000; // without the store a server cannot know the archive changed, so its memory is short
const SEED_BASE = 7;
/** The whole making of one briefing (writing, checking, storing) must end within this: under the route's maxDuration (120 s, src/app/api/ai-search/route.ts). */
const EDS_DEADLINE_MS = 110_000;
/** the second reading needs at least this much of the deadline left to be attempted at all */
const VERIFY_MIN_MS = 15_000;

const memory = new Map<string, { at: number; fingerprint: string; result: SynthesisResult }>();
const inflight = new Map<string, Promise<SynthesisResult>>();

export function clearExecutiveSynthesisCache(): void {
  memory.clear();
  inflight.clear();
}

/** The identity of a question: capitals, spaces and punctuation do not matter; the engine signature does. */
export function edsKeyFor(q: string): string {
  const norm = (q || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return createHash("sha256").update(`${ENGINE_SIG}|${norm}`).digest("hex");
}

export interface SynthesisOptions {
  /** the permanent store (the route passes the database one); none = this server's memory only */
  store?: EdsStore | null;
  /** how many candidates to write and score (default env EDS_CANDIDATES, else 2; 1 to 3) */
  candidates?: number;
  /** test hook: the model's raw JSON for candidate number i */
  generate?: (userPrompt: string, system: string, i: number) => Promise<string>;
  /** test hook: the verifier's raw JSON (edsVerify.ts). With `generate` set and this unset, no verification runs. */
  verify?: (userPrompt: string, system: string) => Promise<string>;
  /** test hook: with `generate` set, the one repair attempt runs only when this is true (it adds a model call, which the engine tests count) */
  repair?: boolean;
}

/** The score's structural notes a writer can act on, turned into instructions (empty when there are none). */
export function structuralRepairs(notes: string[]): string[] {
  const out: string[] = [];
  for (const n of notes) {
    const years = /year\(s\) asked but missing from the tables: (.+)$/.exec(n);
    if (years) out.push(`The table must carry EVERY year the inquiry names, as a column each; missing now: ${years[1]}. Where the circulars give no figure for a year, that year's cell says "Not stated in circular"; where the figures are the same, they are shown under each year.`);
    else if (/comparison asked but no table/.test(n)) out.push("The inquiry compares: give the comparison as a table, the parameter first and one column per side compared.");
    else if (/evolution asked but no timeline/.test(n)) out.push('The inquiry asks for an evolution: give one dataset with intent "timeline", earliest dated step first.');
  }
  return out;
}

function remember(key: string, fingerprint: string, result: SynthesisResult): void {
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string);
  memory.set(key, { at: Date.now(), fingerprint, result });
}

export async function executeExecutiveSynthesis(
  q: string,
  records: SearchResultRow[],
  // circular id -> "Circular 007 (2026)" (the number the circulars modal shows, plus the year). Used to name a circular to the reader.
  labels?: Map<number, string>,
  opts: SynthesisOptions = {},
): Promise<SynthesisResult> {
  const key = edsKeyFor(q);
  const store = opts.store ?? null;

  // the state of the archive: what a stored briefing must have been made from to be shown
  let fingerprint = "";
  let storeUsable = false;
  if (store) {
    try {
      fingerprint = await store.fingerprint();
      storeUsable = true;
    } catch (e: any) {
      console.warn("[EDS] archive fingerprint failed, using memory only:", e?.message || e);
    }
  }

  const mem = memory.get(key);
  if (mem && mem.fingerprint === fingerprint && (storeUsable || Date.now() - mem.at < MEMORY_TTL_NO_STORE_MS)) return mem.result;

  let stale: EdsRow | null = null;
  if (storeUsable) {
    try {
      const row = await store!.get(key);
      if (row) {
        if (row.fingerprint === fingerprint) {
          remember(key, fingerprint, row.result);
          return row.result;
        }
        stale = row; // made from an older archive: only used if the model cannot be reached
      }
    } catch (e: any) {
      console.warn("[EDS] store read failed:", e?.message || e);
    }
  }

  // one making at a time per question on this server
  const running = inflight.get(key);
  if (running) return running;
  const job = makeBriefing(q, records, labels, opts, { key, fingerprint, storeUsable, stale }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function makeBriefing(
  q: string,
  records: SearchResultRow[],
  labels: Map<number, string> | undefined,
  opts: SynthesisOptions,
  ctx: { key: string; fingerprint: string; storeUsable: boolean; stale: EdsRow | null },
): Promise<SynthesisResult> {
  const started = Date.now();
  const sources = filterSourcesForRelevance(q, records).slice(0, 5);
  const store = opts.store ?? null;

  const citations: SynthesisCitation[] = sources.map((r) => ({
    id: r.id,
    headline: r.headline,
    publishedAt: r.publishedAt ?? null,
    label: labels?.get(r.id),
  }));
  const validIds = new Set(sources.map((r) => r.id));

  const qualifiersBySource: Record<number, string[]> = Object.fromEntries(sources.map((r) => [r.id, subjectQualifiers(r.chunkText || "")]));
  const amendments = amendmentsAmong(sources);
  const perSourceBudget = Math.min(SYNTH_CONTEXT_BUDGET, Math.floor(SYNTH_TOTAL_BUDGET / Math.max(1, sources.length)));
  const contextData = sources
    .map(
      (r) =>
        `[Circular id=${r.id}${labels?.get(r.id) ? ` | cite as: ${labels.get(r.id)}` : ""}${qualifiersBySource[r.id]?.length ? ` | situation: ${qualifiersBySource[r.id].join("; ")}` : ""}] Title: ${r.headline} (Date: ${
          r.publishedAt || "N/A"
        })\nContent:\n${condenseForSynthesis(r.chunkText || "", perSourceBudget)}`,
    )
    .join("\n\n---\n\n");

  const userPrompt = `Inquiry: "${q}"

Official Circular Records:
${contextData}

JSON Output:`;

  const sourceText = sources.map((r) => r.chunkText || "").join("\n");
  const wanted = Math.round(Number(opts.candidates ?? process.env.EDS_CANDIDATES ?? 2));
  const n = Math.min(3, Math.max(1, Number.isFinite(wanted) ? wanted : 2));

  // true when a model other than the main (pro) one answered, because the main one was out of quota or down: such a briefing is shown once but never kept
  let weakerModel = false;
  const noteModel = (m: string) => { if (m && m !== synthesisModels()[0] && !/pro/i.test(m)) weakerModel = true; };
  const callModel = async (i: number, prompt: string = userPrompt): Promise<string> => {
    if (opts.generate) return opts.generate(prompt, SYSTEM_PROMPT, i);
    const useLocalOllama = process.env.AI_ENVIRONMENT === "local" && process.env.NODE_ENV === "development";
    if (useLocalOllama) {
      const ollamaRes = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        dispatcher: ollamaDispatcher,
        body: JSON.stringify({
          model: "llama3.1:latest",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          format: "json",
          stream: false,
          options: { temperature: 0.1, num_predict: 1500, seed: SEED_BASE + i },
        }),
      } as any);
      if (!ollamaRes.ok) throw new Error(`Local Ollama error: ${await ollamaRes.text()}`);
      return (await ollamaRes.json()).message?.content || "";
    }
    // One hardened call (src/lib/ai/geminiChat.ts): per-attempt timeout and a total deadline under EDS_DEADLINE_MS (the route allows 120 s), thinking at
    // "low" with its tokens added to the budget, a cut-off answer is an error, the key travels in a header, a bad key / billing stop is not retried.
    const thinkingEnv = (process.env.GEMINI_SYNTHESIS_THINKING || "").trim().toLowerCase();
    const thinking: ThinkingLevel = thinkingEnv === "minimal" || thinkingEnv === "medium" || thinkingEnv === "high" ? thinkingEnv : "low";
    const reply = await geminiGenerate(prompt, {
      system: SYSTEM_PROMPT,
      json: true,
      models: synthesisModels(),
      maxOutputTokens: 6000,
      temperature: 0.0,
      seed: SEED_BASE + i * 12, // a fixed, different seed per candidate: repeatable, yet not the same draw twice
      thinking,
      attemptTimeoutMs: 45_000,
      totalTimeoutMs: 60_000,
      label: n > 1 ? `EDS#${i + 1}` : "EDS",
    });
    noteModel(reply.model);
    return reply.text;
  };

  const settled = await Promise.allSettled(Array.from({ length: n }, (_, i) => callModel(i)));
  const cands: Array<{ result: SynthesisResult; score: BriefingScore; differences: { text: string; sources: number[] } | null; scoreCtx: ScoreContext }> = [];
  let firstError: unknown = null;
  /** one raw answer -> a built, checked and scored candidate (null when unreadable) */
  const processCandidate = (raw: string): (typeof cands)[number] | null => {
    const stats: BuildStats = { droppedFigures: 0 };
    const result = buildResult(raw, citations, validIds, sourceText, labels, stats);
    if (result.error) return null; // unreadable output
    // a "Not stated" cell for an item the column's circular names is a wrong answer: replace it by the circular's own words (absenceCheck.ts, plain code)
    const absence = sources.map((r) => ({ id: r.id, headline: r.headline || "", text: r.chunkText || "" }));
    const allFixes: AbsenceFix[] = [];
    const allConfirmed: ConfirmedAbsence[] = [];
    let differences: { text: string; sources: number[] } | null = null;
    for (const key of ["table", "extraTable"] as const) {
      const t = result[key];
      if (!t) continue;
      const fixed = checkAbsences(t, absence);
      allFixes.push(...fixed.fixes);
      allConfirmed.push(...fixed.confirmed);
      differences ??= describeDifferences(fixed.table, fixed.fixes, fixed.confirmed);
      if (fixed.fixes.length) {
        result[key] = fixed.table;
        console.log(`[EDS] absence check: ${fixed.fixes.length} "not stated" cell(s) of the ${key === "table" ? "table" : "second table"} corrected (${fixed.fixes.map((f) => `${f.row} / ${f.column}`).join("; ")})`);
      }
    }
    // the sentences of the reply must not contradict the corrected table: a sentence that says the item is absent for that period is removed, not rewritten
    if (allFixes.length) {
      const gone: string[] = [];
      result.keyFindings = result.keyFindings.flatMap((f) => {
        const d = dropContradictedClaims(f.text, allFixes);
        gone.push(...d.removed);
        return d.text.trim() ? [{ ...f, text: d.text }] : [];
      });
      const o = dropContradictedClaims(result.overview, allFixes);
      gone.push(...o.removed);
      if (o.removed.length) result.overview = o.text.trim() || "The table below sets out the comparison, in the words of the circulars.";
      if (gone.length) console.log(`[EDS] absence check: ${gone.length} sentence(s) that contradicted the corrected table removed (${gone.map((g) => g.slice(0, 60)).join(" | ")})`);
    }
    // wordingGuard.ts: an authority named only as the holder of a DISCRETION ("Discretion of Head of Safety") is not the one who issues; and speed / force words the circulars never use are taken out
    for (const key of ["table", "extraTable"] as const) {
      const t = result[key];
      if (!t) continue;
      const d = fixDiscretionIssuers(t, sourceText);
      if (d.fixes.length) {
        result[key] = d.table;
        console.log(`[EDS] wording guard: ${d.fixes.length} authority named only as a discretion holder moved out of the issuer column (${d.fixes.map((f) => f.authority).join("; ")})`);
      }
    }
    {
      const gone: string[] = [];
      result.keyFindings = result.keyFindings.map((f) => { const r = stripUnsupportedForce(f.text, sourceText); gone.push(...r.removed); return r.removed.length ? { ...f, text: r.text } : f; });
      const o = stripUnsupportedForce(result.overview, sourceText);
      gone.push(...o.removed);
      if (o.removed.length) result.overview = o.text;
      if (gone.length) console.log(`[EDS] wording guard: force word(s) the circulars never use removed (${[...new Set(gone)].join(", ")})`);
    }
    // the count of the items compared is the table's row count (wordingGuard.ts: fixItemCount)
    {
      const changed: string[] = [];
      const o = fixItemCount(result.overview, result.table);
      if (o.changed.length) { result.overview = o.text; changed.push(...o.changed); }
      result.keyFindings = result.keyFindings.map((f) => { const r = fixItemCount(f.text, result.table); changed.push(...r.changed); return r.changed.length ? { ...f, text: r.text } : f; });
      if (changed.length) console.log(`[EDS] wording guard: item count made the table's row count (${changed.join("; ")})`);
    }
    // a cut abbreviation ("sq. f.") goes back to the circulars' own form ("sq. ft.") in every text (wordingGuard.ts: restoreAllAbbreviations)
    {
      const o = restoreAllAbbreviations(result, sourceText);
      if (o.changed.length) { Object.assign(result, o.result); console.log(`[EDS] wording guard: cut abbreviation(s) restored to the circulars' form (${[...new Set(o.changed)].join("; ")})`); }
    }
    // an account, policy or cheque number is written as the circular prints it, digits unbroken (src/lib/ui/identifiers.ts)
    {
      const o = normaliseIdentifiers(result);
      if (o.changed.length) { Object.assign(result, o.result); console.log(`[EDS] identifier(s) written without separators (${[...new Set(o.changed)].join("; ")})`); }
    }
    // "Not applicable" in a cell is a claim the circular must print; a case it merely does not list is "Not stated in circular" (wordingGuard.ts)
    {
      const o = fixUnprintedNotApplicable(result, sourceText);
      if (o.changed) { Object.assign(result, o.result); console.log(`[EDS] wording guard: ${o.changed} cell(s) "Not applicable" -> "Not stated in circular" (the circulars never say so)`); }
    }
    const scoreCtx = { query: q, sourceText, droppedFigures: stats.droppedFigures, labels: [...(labels?.values() ?? [])], qualifiersBySource, amendments };
    return { result, score: scoreBriefing(result, scoreCtx), differences, scoreCtx };
  };
  for (const s of settled) {
    if (s.status === "rejected") {
      firstError ??= s.reason;
      continue;
    }
    const c = processCandidate(s.value);
    if (c) cands.push(c);
  }

  let best = pickBest(cands);
  if (!best || best.score.total === 0) {
    // Nothing usable. A briefing stored for an older archive is better than none.
    if (ctx.stale) return ctx.stale.result;
    if (firstError instanceof GeminiError) return emptyResult(`Executive synthesis unavailable: ${firstError.message}`);
    if (firstError) {
      console.error("[EDS] synthesis failed:", (firstError as any)?.message || firstError);
      return emptyResult("Executive synthesis could not be completed. Please try again.");
    }
    return best?.result ?? emptyResult("Executive synthesis could not be completed. Please try again.");
  }
  if (cands.length > 1) {
    console.log(`[EDS] ${cands.length} candidates scored ${cands.map((c) => c.score.total).join(" / ")}; kept ${best.score.total}${best.score.notes.length ? ` (${best.score.notes.join("; ")})` : ""}`);
  }

  // ---- ONE REPAIR ATTEMPT -----------------------------------------------------------------------------------------------------
  // A fault plain code can SEE in the best candidate's structure (a year the inquiry names with no column in the table; a comparison with no
  // table; an evolution with no timeline) is put to the writer once more, named, and the new answer is kept only if it scores higher.
  // General: the faults are the score's own notes (edsQuality.ts), not anything about this question.
  const repairs = structuralRepairs(best.score.notes);
  if (repairs.length && (!opts.generate || opts.repair) && EDS_DEADLINE_MS - (Date.now() - started) > 45_000) {
    try {
      const prompt = `${userPrompt.replace(/\n\nJSON Output:$/, "")}\n\nA previous answer to this inquiry had these faults, found by checking its structure. Write the answer again without them:\n- ${repairs.join("\n- ")}\n\nJSON Output:`;
      const again = processCandidate(await callModel(n, prompt));
      // the repaired answer is kept when it scores higher, or when the named faults are gone and it scores within 5 points: a definite fault in the
      // structure (a year with no column) weighs more than a few soft points of wording or coverage
      const faultsGone = !!again && structuralRepairs(again.score.notes).length === 0;
      if (again && (again.score.total > best.score.total || (faultsGone && again.score.total >= best.score.total - 5))) {
        console.log(`[EDS] repair attempt kept: ${again.score.total} (was ${best.score.total}; faults ${faultsGone ? "gone" : "remain"})${again.score.notes.length ? ` (${again.score.notes.join("; ")})` : ""}`);
        best = again;
      } else {
        console.log(`[EDS] repair attempt not kept (${again ? `${again.score.total}, faults ${faultsGone ? "gone" : "remain"}${again.score.notes.length ? `: ${again.score.notes.join("; ")}` : ""}` : "unreadable"} vs ${best.score.total})`);
      }
    } catch (e: any) {
      console.warn("[EDS] repair attempt failed:", e?.message || e);
    }
  }

  // ---- THE SECOND READING (edsVerify.ts) ----------------------------------------------------------------------------------
  // The best candidate is read against the circulars by a second model call, and what that reading reports is applied only where plain code can
  // check it (a quote found verbatim in the circulars, figures the circulars write, the circulars' own words). "failed" = the call could not be
  // made or gave no report: the briefing is shown as it is, but NOT stored, so the next ask reads it again.
  let verifyState: "done" | "failed" | "off" = "off";
  const verifyOff = (process.env.EDS_VERIFY || "").trim().toLowerCase() === "off" || (!!opts.generate && !opts.verify);
  if (!verifyOff) {
    const left = EDS_DEADLINE_MS - (Date.now() - started);
    if (left < VERIFY_MIN_MS) {
      verifyState = "failed";
      console.warn(`[EDS] verification skipped: only ${Math.round(left / 1000)} s left`);
    } else {
      try {
        const input = verifierInput(q, best.result, contextData);
        const raw = opts.verify
          ? await opts.verify(input, VERIFY_PROMPT)
          : await (async () => {
              const reply = await geminiGenerate(input, {
                system: VERIFY_PROMPT,
                json: true,
                models: synthesisModels(),
                maxOutputTokens: 4000,
                temperature: 0.0,
                seed: SEED_BASE,
                thinking: "low",
                attemptTimeoutMs: Math.min(45_000, left - 1_000),
                totalTimeoutMs: Math.min(47_000, left - 500),
                label: "EDS-check",
              });
              noteModel(reply.model);
              return reply.text;
            })();
        if (process.env.EDS_DEBUG_VERIFY) console.log("[EDS-check raw]", raw);
        const verdict = parseVerdict(raw);
        if (!verdict) {
          verifyState = "failed";
          console.warn("[EDS] verification gave no readable report");
        } else {
          const guard = figureGuard(sourceText, labels);
          const out = applyVerdict(best.result, verdict, { sources: sources.map((r) => ({ id: r.id, text: r.chunkText || "" })), figuresSafe: guard.figuresSafe, question: q });
          best.result = { ...out.result, verification: { checked: true, changes: out.changes } };
          // a column the reading added carries "Not stated in circular" where it had no quote: those cells get the absence check too (plain code, as before)
          if (out.changes.some((c) => c.startsWith("column added"))) {
            const absence = sources.map((r) => ({ id: r.id, headline: r.headline || "", text: r.chunkText || "" }));
            for (const key of ["table", "extraTable"] as const) {
              const t = best.result[key];
              if (!t) continue;
              const fixed = checkAbsences(t, absence);
              if (fixed.fixes.length) { best.result[key] = fixed.table; console.log(`[EDS] absence check after the reading: ${fixed.fixes.length} cell(s) of the ${key} filled`); }
            }
          }
          best.scoreCtx = { ...best.scoreCtx, verification: { removed: out.removed, ignored: out.ignored } };
          verifyState = "done";
          const reported = verdict.sentences.length + verdict.cells.length + verdict.missingRows.length + verdict.unanswered.length + verdict.abbreviations.length;
          console.log(`[EDS] verification: ${reported} report(s), ${out.changes.length} change(s) made, ${out.ignored} left alone${out.changes.length ? `\n  - ${out.changes.join("\n  - ")}` : ""}${out.ignoredWhy.length ? `\n  left alone: ${out.ignoredWhy.join("\n  left alone: ")}` : ""}`);
        }
      } catch (e: any) {
        verifyState = "failed";
        console.warn("[EDS] verification failed:", e?.message || e);
      }
    }
  }
  if (verifyState !== "done" && best.result.verification === undefined) best.result = { ...best.result, verification: { checked: false, changes: [] } };

  // what differs between the editions, said exactly from the checked cells (absenceCheck.ts: describeDifferences); one more finding, only when there is room.
  // Added AFTER the contradiction filter and the verifier: its own sentences name items, years and "only", which the filter would take for a claim of absence.
  // "what differs between the columns" means something only when the columns are editions, years or versions of ONE thing: the question compares, or the columns are years. Two different
  // topics side by side (a Gaurav Diwas notice and a Flag Day notice) have no "differences": the finding was noise there (query 4, 11 Nov 2026).
  const columnsAreEditions = /\b(?:compar\w*|differ\w*|chang\w*|versus|vs\.?|between|evolv\w*|revis\w*|amend\w*|earlier|later|previous)\b/i.test(q) || (!!best.result.table && best.result.table.columns.slice(1).length >= 2 && best.result.table.columns.slice(1).every((h) => /\b(?:19|20)\d{2}\b/.test(h)));
  if (best.differences && columnsAreEditions && best.result.keyFindings.length < 6) {
    best.result.keyFindings.push({ text: best.differences.text, sources: best.differences.sources });
    console.log("[EDS] absence check: a \"differences between the years\" finding was added from the checked table");
  }
  // "through whom": the table's own issuer column, said once in the findings when the question asks and the findings have not said it (issuerFinding.ts)
  if (best.result.keyFindings.length < 6) {
    const issuers = describeIssuers(best.result.table, q, best.result.keyFindings.map((f) => f.text));
    if (issuers) {
      best.result.keyFindings.push(issuers);
      console.log("[EDS] a \"who issues it\" finding was added from the table's own column");
    }
  }
  best.result = fixUnprintedNotApplicable(normaliseIdentifiers(best.result).result, sourceText).result; // also what the second reading wrote
  best.result = withConditionFindings(best.result); // a condition the table gives to a row, said in the sentences too (conditionFinding.ts)
  best.result = withKpiCards(best.result); // big number cards from a short one-amount-per-row table (kpiFromTable.ts), after every correction of the table
  best.score = scoreBriefing(best.result, best.scoreCtx);

  // Keep it only if it is good enough: a poor briefing is shown, but the next ask tries again instead of repeating it for ever.
  if (weakerModel) console.warn("[EDS] a fallback model answered: the briefing is shown, but not kept (the next ask tries the main model again)");
  if (best.score.total >= STORE_MIN_SCORE && verifyState !== "failed" && !weakerModel) {
    let standing = best.result;
    if (store && ctx.storeUsable) {
      try {
        const row = await store.put({ key: ctx.key, fingerprint: ctx.fingerprint, result: best.result, score: best.score.total, query: q, engine: ENGINE_SIG });
        standing = row.result; // the row that stands: ours, or the one another server stored first
      } catch (e: any) {
        console.warn("[EDS] store write failed:", e?.message || e);
      }
    }
    remember(ctx.key, ctx.fingerprint, standing);
    return standing;
  }
  return best.result;
}

/* ------------------------------------------------------------------ *
 * Parse the model payload -> typed SynthesisResult.
 * Chart TYPE is decided here, deterministically, from dataset.intent
 * and the shape of the data — never by the LLM.
 * ------------------------------------------------------------------ */

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function chartTypeFor(intent: RawIntent | undefined): ChartType | null {
  switch (intent) {
    case "breakdown":
      return "pie";
    case "comparison":
      return "bar";
    case "trend":
      return "line";
    case "timeline":
      return "timeline";
    case "correlation":
      return "scatter";
    case "kpi":
      return "kpi";
    default:
      return null;
  }
}

/**
 * The chart type is a rule of the DATA, not a choice of the model: the same numbers must be drawn the same way at every ask (before, one run called
 * "4x and 2x" a breakdown and drew a pie, the next called it a comparison and drew columns).
 *  - a pie only for parts of ONE whole: the intent says breakdown, the unit is not a multiple / rate / ratio / duration, one series, 2 or more parts;
 *  - two series (a second value on the items) are columns, whatever the intent said;
 *  - a pie that fails those tests is columns (one series).
 */
/** A label that spans a period ("MAR-25 TO AUG-25", "Jan - Mar", "2022 \u2013 2024") is a range, not one moment. */
export function isRangeLabel(label: string | undefined): boolean {
  return /\b(?:to|through|thru|till|until)\b|\s[\u2013\u2014-]\s|\d\s*[\u2013\u2014]\s*\d/i.test(label || "");
}

/**
 * Which of the circulars handed over CORRECT, AMEND or EXTEND another one of them ("the amount mentioned as Rs.15,000/- may be read as Rs.14,999/-",
 * "the last date is extended to ..."): such a circular refers to the earlier one by its subject words. Returns, for each, the ids it amends.
 */
export function amendmentsAmong(sources: Array<{ id: number; headline?: string | null; chunkText?: string | null }>): Array<{ id: number; amends: number[] }> {
  const out: Array<{ id: number; amends: number[] }> = [];
  for (const a of sources) {
    const head = `${a.headline || ""} ${(a.chunkText || "").slice(0, 1500)}`;
    if (!/\b(corrigendum|addendum|may (?:please )?be read as|in supersession|amendment|amended|extension of|is extended|are extended|extended up ?to|revised)\b/i.test(head)) continue;
    const aStems = stemsOf(head);
    const amends = sources
      .filter((b) => b.id !== a.id)
      .filter((b) => {
        const bs = stemsOf(b.headline || "");
        const shared = [...bs].filter((st) => aStems.has(st)).length;
        const own = stemsOf(a.headline || "");
        const union = new Set([...own, ...bs]).size || 1;
        const sameNotice = [...bs].filter((st) => own.has(st)).length / union >= 0.6; // the same notice in another language is not an amendment of itself
        return shared >= 2 && !sameNotice;
      })
      .map((b) => b.id);
    if (amends.length) out.push({ id: a.id, amends });
  }
  return out;
}

/** Words that say the numbers are ceilings, maxima or per-level amounts: separate figures side by side, never the parts of one total. */
const NOT_A_WHOLE = /\b(maxim\w*|minim\w*|highest|lowest|top|up ?to|ceiling|cap|limit\w*|per level|each level|at most|at least)\b/i;

export function decideChartType(intent: RawIntent | undefined, unit: string | undefined, items: Array<{ secondaryValue?: number; label?: string }>, describedAs?: string): ChartType | null {
  const asked = chartTypeFor(intent);
  if (!asked) return null;
  // a line joins single moments in time: when one of its points is a RANGE ("Mar to Aug") the line would show a slope that does not exist: columns
  if (asked === "line" && items.some((i) => isRangeLabel(i.label))) return "bar";
  const twoSeries = items.some((i) => typeof i.secondaryValue === "number");
  if (asked === "pie") {
    if (twoSeries || isMagnitudeNotShare(unit) || NOT_A_WHOLE.test(describedAs || "")) return "bar";
    return "pie";
  }
  if ((asked === "kpi" || asked === "line") && twoSeries && items.length >= 2) return asked === "line" ? "line" : "bar";
  return asked;
}

function buildChart(ds: RawDataset, validIds?: Set<number>): SynthesisChart | null {
  const asked = chartTypeFor(ds.intent);
  if (!asked) return null;
  // the type follows the data (decideChartType): a pie of multipliers is columns
  const type = decideChartType(
    ds.intent,
    ds.unit,
    (Array.isArray(ds.items) ? ds.items : []).map((i) => ({ secondaryValue: coerceNumber(i?.secondaryValue) ?? undefined, label: (i?.label || "").toString() })),
    `${ds.title || ""} ${ds.subtitle || ""}`,
  ) as ChartType;

  // Scale coherence guard: ONE axis has ONE unit. A unit that offers two alternatives ("X or Y": two different bases on the same axis), or items that are
  // marked as measured against two different bases ("(base: A)" and "(base: B)"), cannot be drawn honestly: no chart (the table carries the facts).
  if (ds.unit && /\bor\b/i.test(ds.unit)) {
    return null;
  }
  const rawItems = Array.isArray(ds.items) ? ds.items : [];
  const bases = new Set(
    rawItems
      .map((it) => /\(\s*base\s*:\s*([^)]+)\)/i.exec(it?.label || "")?.[1]?.trim().toLowerCase())
      .filter((b): b is string => !!b),
  );
  if (bases.size > 1) {
    return null;
  }
  const items: SynthesisChartItem[] = [];

  for (const it of rawItems) {
    const label = (it?.label || "").toString().trim();

    if (type === "timeline") {
      if (!label) continue;
      const v = coerceNumber(it.value);
      items.push({
        label,
        value: v ?? items.length + 1,
        detail: it.detail?.toString().trim() || undefined,
      });
      continue;
    }

    if (type === "scatter") {
      const x = coerceNumber(it.value);
      const y = coerceNumber(it.secondaryValue);
      if (x === null || y === null) continue;
      items.push({
        label: label || `${x}`,
        value: x,
        secondaryValue: y,
        detail: it.detail?.toString().trim() || undefined,
      });
      continue;
    }

    // pie / bar / line / kpi: primary value must be numeric
    if (!label) continue;
    const v = coerceNumber(it.value);
    if (v === null) continue;

    const item: SynthesisChartItem = { label, value: v };
    const sv = coerceNumber(it.secondaryValue);
    if (sv !== null) item.secondaryValue = sv;
    if (it.detail) item.detail = it.detail.toString().trim();
    items.push(item);
  }

  // two series with no names of their own ("Value" / "Comparison") cannot be read: a bar of 3 against a bar of 6, and no word for what either is, misleads. Such a chart is not shown.
  if (type === "bar" && items.some((i) => typeof i.secondaryValue === "number")) {
    const names = Array.isArray(ds.entityLabels) && ds.entityLabels.length === 2 ? ds.entityLabels.map((n) => String(n).trim()) : [];
    if (names.length !== 2 || names.some((n) => !n || /^(?:value|comparison|series\s*\d?|[ab]|x|y)$/i.test(n))) return null;
  }

  const min: Record<ChartType, number> = {
    pie: 2,
    bar: 1,
    line: 3,
    timeline: 2,
    scatter: 2,
    kpi: 1,
  };
  if (items.length < min[type]) return null;

  let finalType: ChartType = type;
  let finalItems = items;

  // Deterministic bar -> pie reclassification.
  // A "comparison" with only ONE category but a two-series item (value +
  // secondaryValue) is really a breakdown of that single thing into two
  // parts (e.g. one award: Winner vs Runner-up). A grouped bar with one
  // x-group reads as two floating bars; a pie of the two parts is clearer.
  if (
    type === "bar" &&
    items.length === 1 &&
    typeof items[0].secondaryValue === "number" &&
    !isMagnitudeNotShare(ds.unit) &&
    !NOT_A_WHOLE.test(`${ds.title || ""} ${ds.subtitle || ""}`)
  ) {
    const [aLabel, bLabel] =
      Array.isArray(ds.entityLabels) && ds.entityLabels.length === 2
        ? [String(ds.entityLabels[0]), String(ds.entityLabels[1])]
        : ["Value", "Comparison"];
    finalType = "pie";
    finalItems = [
      { label: aLabel, value: items[0].value, detail: items[0].label },
      { label: bLabel, value: items[0].secondaryValue as number, detail: items[0].label },
    ];
  }

  const chart: SynthesisChart = {
    type: finalType,
    title: (ds.title || "").toString().trim() || "Overview",
    items: finalType === "timeline" ? chronologicalOrder(finalItems).map((it, i) => ({ ...it, value: i + 1 })) : finalItems,
  };
  if (ds.subtitle) chart.subtitle = ds.subtitle.toString().trim();
  if (ds.unit) chart.unit = ds.unit.toString().trim();
  const chartSources = (Array.isArray(ds.sources) ? ds.sources : []).map(Number).filter((n) => Number.isFinite(n) && (!validIds || validIds.has(n)));
  if (chartSources.length) chart.sources = [...new Set(chartSources)];
  if (
    (finalType === "bar" || finalType === "scatter") &&
    Array.isArray(ds.entityLabels) &&
    ds.entityLabels.length === 2
  ) {
    chart.entityLabels = [
      String(ds.entityLabels[0]),
      String(ds.entityLabels[1]),
    ];
  }
  return chart;
}

/* Build the comparison table, applying three sparsity guards:
 *  (a) drop any comparison column (index >= 1) whose every body cell is empty;
 *  (b) drop rows left with no informative value after (a);
 *  (c) drop the whole table if it is still mostly empty (< 40% informative
 *      body cells) — a wall of "Not stated" is noise, the overview already
 *      states the gap.
 */
export function buildTable(
  raw: { columns?: string[]; rows?: string[][] } | null | undefined,
): SynthesisTable | null {
  if (
    !raw ||
    !Array.isArray(raw.columns) ||
    raw.columns.length < 2 ||
    !Array.isArray(raw.rows) ||
    raw.rows.length === 0
  ) {
    return null;
  }

  let columns = raw.columns.map((c) => (c ?? "").toString().trim());
  const colCount = columns.length;

  let rows = raw.rows
    .filter((r) => Array.isArray(r) && r.length >= 2)
    .map((r) =>
      Array.from({ length: colCount }, (_, i) => (r[i] ?? "").toString().trim()),
    );
  if (rows.length === 0) return null;

  // (a) Identify value columns (index >= 1) that are entirely empty.
  const keepCol = columns.map((_, ci) => {
    if (ci === 0) return true; // always keep the parameter/label column
    return rows.some((r) => !isEmptyCell(r[ci]));
  });

  if (keepCol.some((k) => !k)) {
    columns = columns.filter((_, ci) => keepCol[ci]);
    rows = rows.map((r) => r.filter((_, ci) => keepCol[ci]));
  }

  // If only the label column survives, there is nothing to compare.
  if (columns.length < 2) return null;

  // (b) Drop rows whose value cells are all empty.
  rows = rows.filter((r) => r.slice(1).some((c) => !isEmptyCell(c)));
  if (rows.length === 0) return null;

  // (c) Overall informativeness of the remaining value cells.
  let valueCells = 0;
  let informative = 0;
  for (const r of rows) {
    for (let ci = 1; ci < columns.length; ci++) {
      valueCells++;
      if (!isEmptyCell(r[ci])) informative++;
    }
  }
  if (valueCells === 0 || informative / valueCells < 0.4) return null;

  // Drop DERIVED columns. A fabricated area (e.g. "Projects") is often produced
  // by copying a real column and zeroing one component. Detect a value column
  // that equals an earlier value column on every row except where one side is
  // zero/empty — that is not independent data, it is manufactured.
  // A DATE is not a quantity: "24th January [Friday]" and "24th January [Saturday]" both read as 24 when only the digits are kept, so the real columns of a holiday list
  // (the same date every year, a different weekday) were taken for copies of each other and dropped. A cell with a month, a weekday or an ordinal date is never compared as a number.
  const DATE_WORDS = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}(?:st|nd|rd|th)\b/i;
  const numAt = (v: string): number | null => {
    if (DATE_WORDS.test(v)) return null;
    const c = v.replace(/[^0-9.\-]/g, "");
    if (c === "" || c === "-" || c === ".") return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  };
  const isTotalLabel = (label: string): boolean =>
    /total|grand|sum|net|gross/i.test(label);

  // Pure identical copy of another column (including any total rows).
  const isExactCopy = (bi: number, ai: number): boolean => {
    let real = 0;
    for (const r of rows) {
      const a = numAt(r[ai]);
      const b = numAt(r[bi]);
      if (a === null && b === null) continue;
      real++;
      if (a === null || b === null || Math.abs(a - b) >= 0.005) return false;
    }
    return real >= 3;
  };

  // Column B is DERIVED from A if, ignoring TOTAL rows (which are just the
  // consequence of the components), B equals A on the component rows except
  // where B zeroes out a component A has. A differing TOTAL is expected and is
  // NOT evidence of independence. Requires >=1 zeroed component so a genuine
  // second area (all components independently different) is never flagged.
  const isDerivedOf = (bi: number, ai: number): boolean => {
    let equalRows = 0;
    let dropRows = 0;
    let realRows = 0;
    for (const r of rows) {
      if (isTotalLabel(String(r[0]))) continue;
      const a = numAt(r[ai]);
      const b = numAt(r[bi]);
      if (a === null && b === null) continue;
      realRows++;
      if (a !== null && b !== null && Math.abs(a - b) < 0.005) {
        equalRows++;
      } else if (
        a !== null &&
        a !== 0 &&
        (b === null || b === 0 || isEmptyCell(r[bi]))
      ) {
        dropRows++; // b dropped a component that a has
      } else {
        return false; // a genuine independent value -> not derived
      }
    }
    return (
      realRows >= 3 &&
      equalRows >= 1 &&
      dropRows >= 1 &&
      equalRows + dropRows === realRows
    );
  };

  const dropCols = new Set<number>();
  for (let bi = columns.length - 1; bi >= 1; bi--) {
    for (let ai = 1; ai < bi; ai++) {
      if (dropCols.has(ai)) continue;
      if (isDerivedOf(bi, ai) || isExactCopy(bi, ai)) {
        dropCols.add(bi);
        break;
      }
    }
  }
  if (dropCols.size > 0) {
    columns = columns.filter((_, ci) => !dropCols.has(ci));
    rows = rows.map((r) => r.filter((_, ci) => !dropCols.has(ci)));
    if (columns.length < 2) return null; // nothing real left to compare
  }

  return { columns, rows };
}

/* A cell / finding that conveys no information — "Not stated in circular",
 * "N/A", "-", "—", "not available", empty, etc. */
function isEmptyCell(v: string): boolean {
  const t = v.trim().toLowerCase().replace(/[.\s]+$/g, "");
  if (t === "") return true;
  if (t === "-" || t === "—" || t === "–" || t === "n/a" || t === "na")
    return true;
  return (
    t.startsWith("not stated") ||
    t.startsWith("not specified") ||
    t.startsWith("not available") ||
    t.startsWith("not mentioned") ||
    t.startsWith("not disclosed") ||
    t.startsWith("not provided")
  );
}

/* A "finding" that is really just a statement of absence — e.g.
 * "Number of awards per month: not stated in circular". Unlike a table cell,
 * the non-informative phrase can sit anywhere in the sentence (often after a
 * colon), so we scan the whole text rather than only its start. */
function isNonFinding(text: string): boolean {
  if (isEmptyCell(text)) return true;
  const t = text.toLowerCase();
  // "... not stated / not specified / not available / not mentioned ..."
  if (/\bnot\s+(stated|specified|available|mentioned|disclosed|provided)\b/.test(t))
    return true;
  // "no figures / no data / no premium amount ... (are) specified"
  if (/\bno\s+\w+(\s+\w+)?\s+(is|are|were|was)?\s*(stated|specified|available|provided|given|disclosed)\b/.test(t))
    return true;
  return false;
}

/**
 * ONE written form for a value cell of the comparison table, whatever words the model chose: "<rate> (<authority>) [<condition>]".
 *   "Four times of the base rate (Auth: Head of Dept)"  ->  "4x base rate (Head of Dept)"
 *   "Twice of the base rate"                            ->  "2x base rate"
 * The screen draws the rate in bold, the authority as a chip and the condition as a note, and reads exactly this form.
 */
const NUMBER_WORDS: Record<string, string> = { once: "1", twice: "2", thrice: "3", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
export function canonicalCell(cell: string): string {
  let c = (cell || "").replace(/\s+/g, " ").replace(/\s*\[\s*\]/g, "").trim(); // an empty condition "[]" is nothing
  if (!c) return c;
  // "Four times of the X" / "4 times the X" / "Twice of the X" -> "4x X" / "2x X"
  c = c.replace(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+times\s+(?:of\s+)?(?:the\s+)?/gi, (_m, n: string) => `${NUMBER_WORDS[n.toLowerCase()] ?? n}x `);
  c = c.replace(/\b(once|twice|thrice)\s+(?:of\s+)?(?:the\s+)?/gi, (_m, n: string) => `${NUMBER_WORDS[n.toLowerCase()]}x `);
  c = c.replace(/(\d)\s*[x\u00d7]\s+/g, "$1x "); // "4 x X", "4× X" -> "4x X"
  // "(Auth: Head of P&A)" / "(Authority: ...)" / "(Approver: ...)" -> "(Head of P&A)"
  c = c.replace(/\(\s*(?:auth(?:ority)?|approv(?:er|al)|sanction(?:ing)?\s+authority|competent\s+authority)\s*[:\-]\s*/gi, "(");
  // the generic "(Competent Authority)" says nothing about WHO: it is not a name, so it is not shown
  c = c.replace(/\s*\(\s*(?:the\s+)?(?:concerned\s+|respective\s+)?(?:competent\s+)?authority\s*\)/gi, "").trim();
  // a condition in square brackets goes last: "<rate> [cond] (auth)" -> "<rate> (auth) [cond]"
  const m = c.match(/^(.*?)\s*(\[[^\]]+\])\s*(\([^()]+\))\s*$/);
  if (m) c = `${m[1]} ${m[3]} ${m[2]}`.replace(/\s+/g, " ").trim();
  return c;
}

/**
 * The first date a timeline label names ("31.10.2023", "28.12.2023 to 30.12.2023", "5th December, 2024", "Dec 2024", "2024-12-05"), as a sortable number; null when it names none.
 */
export function firstDateIn(label: string): number | null {
  const t = (label || "").trim();
  const ms = (y: number, m: number, d: number): number | null => {
    const dt = DateTime.utc(y, m, d);
    return dt.isValid ? dt.toMillis() : null;
  };
  const num = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/.exec(t);
  if (num) return ms(Number(num[3]), Number(num[2]), Number(num[1]));
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return ms(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?[\\s,.-]*)?(${MONTH_NAMES})\\b[\\s,.'-]*(\\d{4})\\b`, "i").exec(t);
  if (named) return ms(Number(named[3]), MONTH_NUMBER[named[2].slice(0, 3).toLowerCase()], named[1] ? Number(named[1]) : 1);
  return null;
}

/** A timeline is in the order of time: when EVERY point names a date, they are sorted by it (the model sometimes lists a deadline after the start it precedes). Otherwise the order given stands. */
export function chronologicalOrder<T extends { label: string }>(items: T[]): T[] {
  const dates = items.map((i) => firstDateIn(i.label));
  if (items.length < 2 || dates.some((d) => d === null)) return items;
  return items.map((it, i) => ({ it, i, d: dates[i] as number })).sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.it);
}

/* ---- dates: a date is grounded by WHAT date it is, not by how it is written ----
 * The circular writes "31st December'2023"; the briefing writes "31.12.2023". Compared as numbers ("31.12", "2023") the second looked invented and the
 * finding holding it was thrown away. Both are read to day-month-year here, and a numeric date in the briefing that the circulars write in ANY form
 * is not checked digit by digit. A date the circulars do not contain is still checked like any figure (and fails). */
const MONTH_NUMBER: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NUMERIC_DATE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

export function datesWritten(text: string): Set<string> {
  const set = new Set<string>();
  const t = text || "";
  const add = (d: number, m: number, y: number) => {
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1990 && y <= 2100) set.add(`${y}-${m}-${d}`);
  };
  for (const m of t.matchAll(NUMERIC_DATE)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  // "31st December'2023", "31 Dec 2023", "31 December, 2023"
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH_NAMES})\\.?[\\s,'\u2019-]*((?:19|20)\\d{2})\\b`, "gi"))) {
    add(Number(m[1]), MONTH_NUMBER[m[2].slice(0, 3).toLowerCase()], Number(m[3]));
  }
  // "December 31, 2023"
  for (const m of t.matchAll(new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*['\u2019]?((?:19|20)\\d{2})\\b`, "gi"))) {
    add(Number(m[2]), MONTH_NUMBER[m[1].slice(0, 3).toLowerCase()], Number(m[3]));
  }
  return set;
}

/** The text with every numeric date that the circulars contain (in any written form) taken out, so only the rest is checked as figures. */
export function withoutKnownDates(text: string, sourceDates: Set<string>): string {
  return (text || "").replace(NUMERIC_DATE, (whole, d: string, m: string, y: string) => (sourceDates.has(`${Number(y)}-${Number(m)}-${Number(d)}`) ? " " : whole));
}

/** What the grounding step had to throw away from one candidate (each is a figure the model made up); the quality score reads it. */
export interface BuildStats {
  droppedFigures: number;
}

/** Exported for the grounding selftest (executiveGrounding.selftest.ts). */
export function buildResult(
  rawJson: string,
  citations: SynthesisCitation[],
  validIds: Set<number>,
  sourceText: string,
  labels?: Map<number, string>,
  stats?: BuildStats,
): SynthesisResult {
  let droppedFigures = 0;
  if (!rawJson) return emptyResult("No synthesis could be derived.");

  let parsed: RawPayload;
  try {
    const cleaned = rawJson
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return emptyResult("Synthesis returned no structured output.");
    parsed = JSON.parse(match[0]);
  } catch {
    return emptyResult("Synthesis output could not be parsed.");
  }
  // The model sometimes copies a source's internal id into its wording ("per Circular 49"). Replace any such reference by the circular's
  // archive label ("Circular 007 (2026)"; its title if the serial is unknown) now, before the figure-grounding checks below (they would otherwise drop a finding for containing the "ungrounded number" 49).
  parsed = sanitizeSourceRefs(parsed, buildSourceNames(citations, labels));

  const overview = (parsed.overview || "").toString().trim();

  // ---- NUMBER GROUNDING ----------------------------------------------------
  // Every figure shown to the executive must literally exist in the retrieved
  // circular text. Build a set of the numbers actually present in the source,
  // then strip any figure the model produced that is NOT grounded. This kills
  // hallucinated tables/charts/findings when the real table was never OCR'd,
  // without needing embeddings. Small integers (<= 31, e.g. dates/counts/step
  // numbers) are exempt from stripping to avoid false positives — the concern
  // is invented rupee amounts and rates, not "3 stages" or "24 January".
  const { numberIsGrounded, figuresSafe, sourceDates, percentsSafe } = figureGuard(sourceText, labels);

  const keyFindings: SynthesisFinding[] = (parsed.keyFindings || [])
    .map((f) => {
      const text = (f?.text || "").toString().trim();
      const srcs = Array.isArray(f?.sources)
        ? f!.sources!
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && validIds.has(n))
        : [];
      return { text, sources: srcs };
    })
    // Drop empty findings, pure "not stated" non-findings, AND findings that
    // assert an ungrounded figure (a hallucinated amount).
    .filter((f) => {
      if (f.text.length === 0 || isNonFinding(f.text)) return false;
      if (!figuresSafe(f.text)) {
        droppedFigures++;
        return false;
      }
      return true;
    })
    // never more than 6 findings, and the model's own order (the prompt fixes it: periods, money, authorities, caveats)
    .slice(0, 6);

  const makeTable = (raw: RawPayload["table"]): SynthesisTable | null => {
    let t: SynthesisTable | null = buildTable(raw);
    if (!t) return null;
    t = { columns: t.columns, rows: t.rows.map((r) => r.map((cell, ci) => (ci === 0 ? cell : canonicalCell(cell)))) };
    const before = t.rows.length;
    const grounded = groundTable(t, numberIsGrounded, (cell) => withoutKnownDates(cell, sourceDates), percentsSafe);
    droppedFigures += before - (grounded?.rows.length ?? 0);
    if (!grounded) return null;
    const srcs = (Array.isArray(raw?.sources) ? raw!.sources! : []).map(Number).filter((n) => Number.isFinite(n) && validIds.has(n));
    const out: SynthesisTable = { ...grounded };
    if (srcs.length) out.sources = [...new Set(srcs)];
    const title = (raw?.title || "").toString().trim();
    if (title) out.title = title.slice(0, 120);
    return out;
  };
  const table: SynthesisTable | null = makeTable(parsed.table);
  // a second table is kept only when there IS a first one, and it is not a copy of it
  let extraTable: SynthesisTable | null = parsed.table2 ? makeTable(parsed.table2) : null;
  if (extraTable && (!table || JSON.stringify(extraTable.rows) === JSON.stringify(table.rows))) extraTable = null;

  const builtCharts = (parsed.datasets || [])
    .map((d) => buildChart(d, validIds))
    .filter((c): c is SynthesisChart => c !== null);
  const charts: SynthesisChart[] = [];
  const seenCharts = new Set<string>();
  for (const c of builtCharts) {
    const g = groundChart(c, numberIsGrounded);
    droppedFigures += c.items.length - (g?.items.length ?? 0);
    if (!g) continue;
    // two charts of the same numbers are one chart (a run that drew a pie AND columns of the same figures showed both); at most two charts
    const sig = g.items.map((i) => `${i.value}/${i.secondaryValue ?? ""}`).join("|");
    if (seenCharts.has(sig)) continue;
    seenCharts.add(sig);
    if (charts.length < 2) charts.push(g);
  }

  // ---- CITATION RELEVANCE FILTER ---------------------------------------
  // `citations` (the parameter above) was built from ALL of the top-5
  // candidate records handed to the LLM as context, BEFORE the LLM ever
  // saw them -- every candidate that cleared the upstream search/qualify
  // filter shows up here unconditionally, regardless of whether it turned
  // out to be topically relevant to the actual answer. That's what let a
  // wrong-year Holiday List circular and two contractor-worker circulars
  // appear as confident "primary sources" for an unrelated 2023 Category-B
  // holiday question -- they cleared the noise floor, but were never
  // relevant to what got synthesized.
  //
  // Key findings already track which ids they actually relied on
  // (`keyFindings[].sources`, validated against `validIds` above); a
  // source only earns a place in the final citation list if at least one
  // surviving finding actually cites it. This does NOT touch the upstream
  // qualification filter (route.ts) or which records get handed to the
  // model at all -- only which of them get presented as "sources" in the
  // final result.
  //
  // Known limitation: `table` and `chart` items don't currently carry
  // per-item source ids (only `keyFindings` do), so an answer consisting
  // only of a table/chart with no key findings will end up with an empty
  // citation list. That's a deliberate consequence of this narrow fix, not
  // a bug -- extending source-tracking to tables/charts is a separate,
  // larger change.
  // a circular a table or a chart was read from is cited too (before, only findings counted: an answer that was all table and chart had no sources)
  const citedIds = new Set<number>([...keyFindings.flatMap((f) => f.sources), ...(table?.sources ?? []), ...(extraTable?.sources ?? []), ...charts.flatMap((c) => c.sources ?? [])]);
  const filteredCitations = citations.filter((c) => citedIds.has(c.id)).map((c) => ({ ...c, label: c.label ?? labels?.get(c.id) }));

  // The overview is the first thing read, so it is held to the same rule as the findings: a sentence that asserts a figure
  // found in no circular is dropped (before, only findings, the table and the charts were checked). If nothing safe is
  // left, the first verified finding stands in for it rather than an invented sentence.
  if (overview && !figuresSafe(overview)) droppedFigures++;
  if (stats) stats.droppedFigures = droppedFigures;
  const safeOverview =
    !overview || figuresSafe(overview)
      ? overview
      : overview
          .split(/(?<=[.!?])\s+(?=[A-Z*])/)
          .filter((sentence) => figuresSafe(sentence))
          .join(" ")
          .trim();

  const shown = [safeOverview, ...keyFindings.map((f) => f.text), ...[table, extraTable].flatMap((t) => (t ? [t.title || "", ...t.columns, ...t.rows.flat()] : []))].join(" \n ");
  const defined = usedDefinitions(definedAbbreviations(sourceText), shown);

  return {
    overview: safeOverview || keyFindings[0]?.text || "No synthesis could be derived.",
    headline: parsed.headline?.toString().trim() || undefined,
    keyFindings,
    table,
    ...(extraTable ? { extraTable } : {}),
    charts,
    citations: filteredCitations,
    ...(Object.keys(defined).length ? { abbreviations: defined } : {}),
  };
}

/* ---- number grounding utilities ---- */

/**
 * The figure guard of a set of circulars: `numberIsGrounded(n)` is true when the number is written in them, `figuresSafe(text)` when every
 * substantial number of the text is. Used by buildResult on the writer's output and by the verifier's repairs (edsVerify.ts) alike.
 * Small whole numbers (3..31: a multiplier, a month, a count) must be WRITTEN in the circulars too, as digits or as a word ("Four times", "Twice",
 * "sixth"); 0, 1 and 2 stay free ("Standard HRR" is 1x; "two sides"). The archive's own name for a circular ("Circular 007 (2026)") has numbers
 * in it that are the archive's, not claims, and a date the circulars write is not a figure: neither is checked.
 */
export function figureGuard(sourceText: string, labels?: Map<number, string>): { numberIsGrounded: (n: number) => boolean; figuresSafe: (text: string) => boolean; sourceDates: Set<string>; percentsSafe: (text: string) => boolean } {
  const groundedNumbers = extractGroundedNumbers(sourceText);
  const writtenSmall = smallNumbersIn(sourceText);
  const numberIsGrounded = (n: number): boolean => {
    if (Number.isInteger(n) && n >= 0 && n <= 2) return true;
    if (Number.isInteger(n) && n <= 31) return writtenSmall.has(n) || groundedNumbers.has(normalizeNum(n));
    return groundedNumbers.has(normalizeNum(n));
  };
  const labelTexts = [...(labels?.values() ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  const withoutLabels = (text: string): string => labelTexts.reduce((acc, l) => acc.split(l).join(" "), text);
  const sourceDates = datesWritten(sourceText);
  const percentsWritten = percentFiguresIn(sourceText);
  const percentsSafe = (text: string): boolean => percentFiguresIn(text).size === 0 || [...percentFiguresIn(text)].every((p) => percentsWritten.has(p));
  const figuresSafe = (text: string): boolean => {
    const nums = extractNumbersFromText(withoutKnownDates(withoutLabels(text), sourceDates));
    for (const n of nums) if (!numberIsGrounded(n)) return false;
    return percentsSafe(text);
  };
  return { numberIsGrounded, figuresSafe, sourceDates, percentsSafe };
}

/**
 * The numbers a text writes AS A PERCENTAGE ("25%", "25 %", "25 per cent", "7.5 percent"). A percentage in a briefing must be printed as a percentage in the circulars:
 * "all contributions are exempt" is not "100% exempt", and a bare 100 that happens to stand elsewhere (a Rs 100 fee, a clause number) does not make it so.
 */
export function percentFiguresIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(/(\d+(?:\.\d+)?)\s?(?:%|per[\s-]?cent\b|percent\b)/gi)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.add(normalizeNum(n));
  }
  return out;
}

// Normalize a number to a canonical key so 20995.30, 20995.3, "20,995.30" and
// "20995.300" all compare equal. Keep up to 2 decimals (rupee paise).
function normalizeNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// All numbers literally present in the source text, as a Set of normalized keys.
function extractGroundedNumbers(text: string): Set<string> {
  const set = new Set<string>();
  if (!text) return set;
  // strip thousands separators inside digit groups so "20,995.30" -> "20995.30"
  const normalized = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
  for (const m of matches) {
    const n = Number(m);
    if (Number.isFinite(n)) set.add(normalizeNum(n));
  }
  return set;
}

// Extract the substantial numbers from a piece of model text (same
// thousands-separator handling), for grounding checks.
function extractNumbersFromText(text: string): number[] {
  if (!text) return [];
  const normalized = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

// Drop table rows whose value cells contain an ungrounded number. A cell that
// is text-only (e.g. "Discontinued") is kept. If a value column ends up all
// empty, buildTable's caller already handled emptiness; here we re-run the
// emptiness guard after grounding.
function groundTable(
  table: SynthesisTable,
  ok: (n: number) => boolean,
  clean: (cell: string) => string = (c) => c,
  textOk: (cell: string) => boolean = () => true,
): SynthesisTable | null {
  const rows = table.rows.filter((r) =>
    r.slice(1).every((cell) => {
      const nums = extractNumbersFromText(clean(cell));
      return nums.every(ok) && textOk(cell);
    }),
  );
  if (rows.length === 0) return null;
  // re-check informativeness
  let valueCells = 0;
  let informative = 0;
  for (const r of rows) {
    for (let ci = 1; ci < table.columns.length; ci++) {
      valueCells++;
      if (r[ci] && r[ci].trim() !== "" && r[ci] !== "-") informative++;
    }
  }
  if (valueCells === 0 || informative / valueCells < 0.4) return null;
  return { columns: table.columns, rows };
}

// Drop chart items whose numeric value(s) are ungrounded. If too few remain for
// the chart type, drop the whole chart.
function groundChart(
  chart: SynthesisChart,
  ok: (n: number) => boolean,
): SynthesisChart | null {
  // Timeline items are label/date driven, not magnitude — keep as-is.
  if (chart.type === "timeline") return chart;

  const items = chart.items.filter((it) => {
    if (!ok(it.value)) return false;
    if (typeof it.secondaryValue === "number" && !ok(it.secondaryValue))
      return false;
    return true;
  });

  const min: Record<string, number> = {
    pie: 2,
    bar: 1,
    line: 3,
    scatter: 2,
    kpi: 1,
    timeline: 2,
  };
  if (items.length < (min[chart.type] ?? 1)) return null;
  return { ...chart, items };
}

// For tests only: the pure result builder.
export { buildResult as buildSynthesisResultForTest };
