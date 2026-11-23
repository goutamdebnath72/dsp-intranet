// src/lib/help/edsExamples.ts
//
// THE SHELF OF PROVEN QUESTIONS under the Executive Deep Search button (src/components/EdsExamples.tsx): every question the project has tried on EDS and found to reach it as typed, grouped by what each one teaches. A signed-in
// executive who presses the button sees this shelf in the window; pressing a question runs it. The QUESTIONS are not written here: they are the guide's own (TEST_QUERIES in src/lib/help/edsGuide.ts: the panel, the gold set, the fresh
// set and the corrected forms, 9 to 12 November 2026, each scored by the real detector in edsGuide.selftest), so the guide and the shelf can never disagree. This file only says how they are grouped and in what order, and adds
// what the guide does not hold: a question put in plain words (A-C3 of eval/router-acceptance.json: verified on screen, 18 Oct 2026). Every circular a question needs was checked against the database on 23 Nov 2026.
// The shelf's four types are the four groups of KEYWORDS below (same titles, same order). A new proven question: add it to TEST_QUERIES, then name its id in ONE type (TYPES); edsExamples.selftest fails until every question is in exactly one.
// Free of server-only imports (drawn in the browser).
import { TEST_QUERIES, TEMPLATES } from "@/lib/help/edsGuide";

export interface ShelfItem {
  id: string;
  /** the question, exactly as it is run */
  q: string;
  /** what it teaches, in two or three words (the guide's own "kind" for a guide question) */
  kind: string;
  /** the circulars it is read from, in words */
  needs: string;
  note?: string;
}

export interface ShelfGroup {
  id: string;
  title: string;
  /** one line: what these questions show */
  blurb: string;
  items: ShelfItem[];
  /** a type with no question yet shows templates to build one from (never run as typed: they have blanks); none does today */
  templates?: string[];
}

/** a proven question that is not one of the guide's: put in the words a person would use */
const PLAIN: ShelfItem[] = [
  { id: "A-C3", kind: "In plain words", q: "employees can choose a gift card online, what amount was first announced and what was it corrected to", needs: "the 2026 gift card circular and its corrigendum", note: "Verified on screen: the first circular says Rs 15,000; the corrigendum corrects it to Rs 14,999." },
];

/** THE "FINDING WHAT IS HIDDEN" QUESTIONS, written for this shelf on 23 Nov 2026: each was run through the real engine (the same retrieval, writer and checker as the app) on circulars that are in the database, and every claim in its note
 *  was checked against the circular's own text. The wording is the one that was run: do not reword one without running it again (H01 was: a more neutral wording, tried on 23 Nov 2026, missed the very slips the question exists to show). The note says what the question found when it was tried. */
const HIDDEN: ShelfItem[] = [
  { id: "H01", kind: "Anomalies", needs: "the holiday lists notified for DSP employees for 2024, 2025 and 2026", q: "Are there any anomalies in the holiday lists for 2024, 2025 and 2026, such as a festival whose date or category differs from the previous year?", note: "Found when tried: in the 2025 list the Hindi table gives Maha Shivaratri (26 February) as Monday where the English table says Wednesday, and a note names 2024 where 2025 is meant." },
  { id: "H02", kind: "Inconsistencies", needs: "the 2026 gift card circular and its corrigendum", q: "What inconsistencies did the gift card corrigendum correct in the original 2026 gift card circular, and which details stayed the same?", note: "Found when tried: the amount corrected from Rs 15,000 to Rs 14,999, and the last date that stayed 15.08.2026." },
  { id: "H03", kind: "Hidden requirements", needs: "the circular on submitting the Format B declaration for SIR and the circular naming the nodal officers", q: "What hidden requirements do the circulars on the SIR Format B declaration and on the nodal officers place on the Nodal Officer and the HOD before the declarations reach the plant-level nodal officer?", note: "Found when tried: the Format-A1 undertaking, signed by the Nodal Officer and countersigned by the HOD, that goes with the second copy." },
  { id: "H04", kind: "Implications", needs: "the revised GPAIS premium notice for contractor workers (from 1 January 2025)", q: "What are the implications of the revised GPAIS premium for a contract worker included in the scheme in February 2025 rather than January 2025?", note: "Found when tried: Rs 169 payable for February against Rs 193 for January, the membership fee unchanged." },
  { id: "H05", kind: "Overlooked conditions", needs: "the circular on the Motivational Award Schemes of DSP", q: "Which conditions and exceptions in the Motivational Award Schemes of DSP are most likely to be overlooked by the departments that nominate candidates?", note: "Found when tried: the accident bar on the Utthan Award, the 23-day attendance rule of the Kaushal Award, and the 250 working days for the Netaji Subhas Chandra Bose Award." },
  { id: "H06", kind: "The big picture", needs: "the contractor workers' holidays-and-leaves circulars for 2023, 2024 and 2025", q: "What is the big picture of the holidays and leave given to contractor workers in DSP across the 2023, 2024 and 2025 circulars?", note: "Found when tried: what did not change in the three years, 4 closed holidays, 4 days of casual leave and 7 of medical leave." },
  { id: "H07", kind: "Insights", needs: "the non-executive health check-up circulars of December 2024, January 2025 and January 2026", q: "What insights do the health check-up circulars of December 2024, January 2025 and January 2026 give about how the arrangements for non-executives were refined?", note: "Found when tried: the venue moving from Room No. 18 to Room No. 15, and the new evening slot for a test missed in the morning." },
  { id: "H08", kind: "Language versions", needs: "the English, Hindi and Bengali versions of the 2026 Merit Award Scheme amendment for contract workers", q: "Do the English, Hindi and Bengali versions of the 2026 Merit Award Scheme amendment for contract workers contradict each other anywhere?", note: "Found when tried: no. A good answer can be that nothing contradicts: the three versions agree." },
];

/** what a reader is told besides the question. The guide's own notes are the project's test notes (how a question scored, which version of it went where) and are NOT shown; only these two are for a reader */
const READER_NOTES: Record<string, { needs?: string; note?: string }> = {
  E23: { needs: "nothing: the archive holds no circular on these rules", note: "A test of honesty: a good answer says plainly that the circulars do not state these rules, and offers no other scheme's figures instead." },
};

const byId = new Map<string, ShelfItem>([
  ...TEST_QUERIES.map((t): [string, ShelfItem] => [t.id, { id: t.id, q: t.q, kind: t.kind, needs: READER_NOTES[t.id]?.needs ?? t.needs, note: READER_NOTES[t.id]?.note }]),
  ...PLAIN.map((p): [string, ShelfItem] => [p.id, p]),
  ...HIDDEN.map((p): [string, ShelfItem] => [p.id, p]),
]);

/** the shelf, type by type (an id that names no question is left out: the selftest fails on it) */
export function edsShelf(): ShelfGroup[] {
  return TYPES.map((t) => {
    const kw = KEYWORD_GROUPS.find((k) => k.id === t.id)!;
    return { id: t.id, title: kw.title, blurb: t.blurb, items: t.ids.map((i) => byId.get(i)).filter((x): x is ShelfItem => !!x), templates: t.templates };
  });
}

/** every question of the shelf, in the order drawn */
export function edsShelfQuestions(): ShelfItem[] {
  return edsShelf().flatMap((g) => g.items);
}

/** how to write one's own: the guide's templates, shown at the foot of the shelf */
export const SHELF_TEMPLATES: readonly string[] = TEMPLATES;

/** THE KEYWORDS: the words the browser's own rules (src/lib/search/synthesisIntent.ts: no AI, no wait) score when a question is typed in the ordinary box. 5 points make a deep question. Each group says what its words are worth and how to
 *  complete them; edsExamples.selftest scores a probe sentence for every word with the real detector, so this list cannot drift from the rules. */
export interface KeywordGroup {
  id: string;
  title: string;
  /** what a word of this group does on its own, and what finishes the job */
  how: string;
  words: string[];
  /** a short sentence that uses ONE word of the group (the selftest scores it with the others' words left out); {w} is the word */
  probe: string;
  /** true: a word of this group is enough alone (5 points); false: it is worth 3 and needs one more clue */
  alone: boolean;
}

export const KEYWORD_GROUPS: KeywordGroup[] = [
  { id: "discovery", title: "Finding what is hidden", alone: true, how: "Enough on their own.", probe: "What {w} do the circulars show?", words: ["correlate", "hidden", "overlooked", "inconsistencies", "contradictions", "discrepancies", "implications", "insights", "anomalies", "big picture"] },
  { id: "verbs", title: "Action words", alone: false, how: "Begin with one, and name two years or two things.", probe: "{w} the 2023 and 2024 circulars", words: ["compare", "contrast", "trace", "summarise", "synthesise", "cross-reference", "analyse", "briefing", "evolution", "timeline", "reconcile"] },
  { id: "versions", title: "What changed", alone: false, how: "Add two years or an action word.", probe: "{w} in the 2023 and 2024 circulars", words: ["what changed", "differ", "original", "first announced", "corrected to", "earlier circular", "previous circular", "change between"] },
  { id: "stages", title: "Stage by stage", alone: false, how: "Add two years or an action word.", probe: "Which rule applies {w} in the 2023 and 2024 circulars?", words: ["at each stage", "for each level", "for every category", "grade-wise"] },
];

/** THE FOUR TYPES OF THE SHELF are the four groups of keywords above, in the same order and under the same titles: a question is filed under the type of the keyword it is built on. A question with no listed keyword (it reaches EDS by its shape: years, "and which",
 *  a list after a colon) is filed by what it asks. The "hidden" type's questions (H01-H08) were written and tried for this shelf on 23 Nov 2026 (see HIDDEN). */
const TYPES: { id: string; blurb: string; ids: string[]; templates?: string[] }[] = [
  { id: "discovery", blurb: "Questions that look for what no single reading shows: a slip, a hidden condition, a consequence. No other clue is needed.", ids: ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"] },
  { id: "verbs", blurb: "Compare, summarise, explain: things set side by side.", ids: ["E05", "E07", "E08", "E09", "E10", "E11", "E16", "E22", "E19", "E21", "E23"] },
  { id: "versions", blurb: "The same subject in more than one year or edition, and what a correction changed.", ids: ["E01", "E02", "E03", "E04", "E06", "E12", "E13", "A-C3", "E14"] },
  { id: "stages", blurb: "A rule or procedure laid out stage by stage, grade by grade or category by category, as a table.", ids: ["E15", "E17", "E18", "E20"] },
];

export const SHELF_TEXT = {
  title: "Executive Deep Search",
  examplesTitle: "Questions to try",
  examplesIntro: "Examples, to show what a deep question looks like. Press one to run it.",
  keywordsTitle: "Write your own",
  keywordsIntro: "Keep one of these keywords in your question and it is recognised as a deep question at once, so it starts a little faster. Press Enter to run it.",
  keywordsNote: "With this button chosen, every question already runs as a deep question; the keywords matter when you type in Everything.",
  templatesTitle: "Templates",
} as const;
