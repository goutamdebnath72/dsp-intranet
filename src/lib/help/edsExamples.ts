// src/lib/help/edsExamples.ts
//
// The shelf of proven questions under the Executive Deep Search button (src/components/EdsExamples.tsx): every question the project has tried on EDS and found to reach it as typed, grouped by what each one teaches. A signed-in
// executive who presses the button sees this shelf in the window; pressing a question runs it. I do not write the QUESTIONS here: they are the guide's own (TEST_QUERIES in src/lib/help/edsGuide.ts: the panel, the gold set, the fresh
// set and the corrected forms, 9 to 12 November 2026, each scored by the real detector in edsGuide.selftest), so the guide and the shelf can never disagree. This file only says how they are grouped and in what order, and adds
// what the guide does not hold: a question put in plain words (A-C3 of eval/router-acceptance.json: verified on screen, 18 Oct 2026). Every circular a question needs was checked against the database on 23 Nov 2026.
// The shelf's four types are the four groups of KEYWORDS below (same titles, same order). For a new proven question, add it to TEST_QUERIES, then name its id in ONE type (TYPES); edsExamples.selftest fails until every question is in exactly one.
// Keep this file free of server-only imports: it is drawn in the browser.
import { TEST_QUERIES, TEMPLATES } from "@/lib/help/edsGuide";

export interface ShelfItem {
  id: string;
  /** The question, exactly as it is run. */
  q: string;
  /** What it teaches, in two or three words (the guide's own "kind" for a guide question) */
  kind: string;
  /** The circulars it is read from, in words. */
  needs: string;
  note?: string;
}

export interface ShelfGroup {
  id: string;
  title: string;
  /** One line on what these questions show. */
  blurb: string;
  items: ShelfItem[];
  /** If a type has no question yet, I show templates to build one from (they are never run as typed, since they have blanks); none is in that state today */
  templates?: string[];
}

/** A proven question that is not one of the guide's, put in the words a person would use. */
const PLAIN: ShelfItem[] = [
  { id: "A-C3", kind: "In plain words", q: "employees can choose a gift card online, what amount was first announced and what was it corrected to", needs: "the 2026 gift card circular and its corrigendum", note: "Verified on screen: the first circular says Rs 15,000; the corrigendum corrects it to Rs 14,999." },
];

/**
 * The "finding what is hidden" questions, written for this shelf on 23 Nov 2026: each was run through the real engine (the same retrieval, writer and checker as the app) on circulars that are in the database, and every claim in its note
 * was checked against the circular's own text. The wording is the one that was run: do not reword one without running it again (that happened with H01: a more neutral wording, tried on 23 Nov 2026, missed the very slips the question exists to show). The note says what the question found when it was tried.
 */
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

/**
 * Six more questions, tried on 23 Nov 2026 (scripts/eds-new-keys.ts): each is on circulars that no earlier question used, its answer key was written from the circular's own text before any run, and each was run through the real engine
 * (Flash writer and checker, the app's own retrieval). The note says what the run found; I name only what was found (the run's own check of the key). Wording as run: do not reword one without running it again.
 */
const TRIED: ShelfItem[] = [
  { id: "N01", kind: "Two notices compared", needs: "the football-coach notices of December 2022 and December 2024", q: "Compare the notices seeking a football coach for the Inter Steel Plant Football Championship in December 2022 and December 2024: which plant hosts it, on what dates, by when and where documents are sent, and what credentials are asked.", note: "Found when tried: Bokaro (January 2023) and IISCO, Burnpur (December 2024) as hosts, the two deadlines (23.12.2022 and 4.12.2024), the two e-mail addresses, and that the four credentials are the same." },
  { id: "N02", kind: "What differs", needs: "the Inter Department Night Volleyball Tournament circular of 2023 and the volleyball coach notice of December 2025", q: "How do the Inter Department Night Volleyball Tournament 2023 circular and the December 2025 notice for the All India Inter Steel Plants Volleyball Championship differ in who takes part and how entries, the team or the coach are chosen?", note: "Found when tried: entries only through the Head of Department by 18 December 2023, a team of 11, the Departmental Safety Officer as manager; for 2025, Alloy Steels Plant as host, the coach with the highest credential, players chosen by the coach and a senior ex-employee player, documents by 5 January 2026." },
  { id: "N03", kind: "A procedure, step by step", needs: "the circular on the online Leave Management System (LMS)", q: "What is the procedure of the online Leave Management System for DSP employees: from when it is compulsory, how to log in, who sanctions, how leave is cancelled, and how it feeds salary processing?", note: "Found when tried: compulsory from 1 January 2023, the log-in with the ESS user id, the recommending and sanctioning authorities kept by each department, cancelling by oneself only before the leave is granted and then only by the granting authority, and the 10th of the next month as the last date." },
  { id: "N04", kind: "Old date and new date", needs: "the SAIL Mediclaim renewal extension circular and the circular extending the non-executives' perks and allowances entry", q: "What deadline extensions did the 2026 circulars announce for the SAIL Mediclaim Scheme renewal and for the non-executives' entry of options for perks and allowances through ESS: the old and new last dates and who issued each?", note: "Found when tried: the Mediclaim renewal extended from 20 to 31 August 2026 (Gap cases included, from the Corporate Office), and the perks and allowances entry extended to 17 July 2026 for non-executives." },
  { id: "N05", kind: "A list by department", needs: "the promotion order E1-E2 effective 31.12.2025", q: "Which executives were promoted from Assistant Manager to Deputy Manager with effect from 31 December 2025, in which departments, to what pay scale, and who else was promoted?", note: "Found when tried: the Deputy Managers by department (MSM, Oxygen Plant, two in Safety, R&C Lab, C&IT), the two Medical Officers made Senior Medical Officers (M&HS), the scale 70000-3%-200000 and the date 31.12.2025." },
  { id: "N06", kind: "An event, group by group", needs: "the circular on the SAIL Foundation Day 5 km walk/run of 24 January 2026", q: "For the SAIL Foundation Day 5 km walk/run of 24 January 2026, who can take part, how and by when must entries be made, what is the programme timing, and what are the conditions about identity and leave?", note: "Found when tried: the date and Nehru Stadium as start and finish, registration by 15 January 2026 at 6 pm, the groups by class and age, the flag-off at 8:00 am, the medical card for wards and ex-employees, and no spent-on-duty." },
];

/** What a reader is told besides the question. The guide's own notes are the project's test notes (how a question scored, which version of it went where) and I do NOT show them; only these two are for a reader */
const READER_NOTES: Record<string, { needs?: string; note?: string }> = {
  E23: { needs: "nothing: the archive holds no circular on these rules", note: "A test of honesty: a good answer says plainly that the circulars do not state these rules, and offers no other scheme's figures instead." },
};

const byId = new Map<string, ShelfItem>([
  ...TEST_QUERIES.map((t): [string, ShelfItem] => [t.id, { id: t.id, q: t.q, kind: t.kind, needs: READER_NOTES[t.id]?.needs ?? t.needs, note: READER_NOTES[t.id]?.note }]),
  ...PLAIN.map((p): [string, ShelfItem] => [p.id, p]),
  ...HIDDEN.map((p): [string, ShelfItem] => [p.id, p]),
  ...TRIED.map((p): [string, ShelfItem] => [p.id, p]),
]);

/** The shelf, type by type; an id that names no question is left out, and the selftest fails on it. */
export function edsShelf(): ShelfGroup[] {
  return TYPES.map((t) => {
    const kw = KEYWORD_GROUPS.find((k) => k.id === t.id)!;
    return { id: t.id, title: kw.title, blurb: t.blurb, items: t.ids.map((i) => byId.get(i)).filter((x): x is ShelfItem => !!x), templates: t.templates };
  });
}

/** Every question of the shelf, in the order drawn. */
export function edsShelfQuestions(): ShelfItem[] {
  return edsShelf().flatMap((g) => g.items);
}

/** How to write your own question: I show the guide's templates at the foot of the shelf. */
export const SHELF_TEMPLATES: readonly string[] = TEMPLATES;

/**
 * The keywords: the words the browser's own rules (src/lib/search/synthesisIntent.ts: no AI, no wait) score when a question is typed in the ordinary box. 5 points make a deep question. Each group says what its words are worth and how to
 * complete them; edsExamples.selftest scores a probe sentence for every word with the real detector, so this list cannot drift from the rules.
 */
export interface KeywordGroup {
  id: string;
  title: string;
  /** What a word of this group does on its own, and what finishes the job */
  how: string;
  words: string[];
  /** A short sentence that uses ONE word of the group (the selftest scores it with the others' words left out); {w} is the word */
  probe: string;
  /** true means a word of this group is enough alone (5 points); false means it is worth 3 and needs one more clue */
  alone: boolean;
}

export const KEYWORD_GROUPS: KeywordGroup[] = [
  { id: "discovery", title: "Finding what is hidden", alone: true, how: "Enough on their own.", probe: "What {w} do the circulars show?", words: ["correlate", "hidden", "overlooked", "inconsistencies", "contradictions", "discrepancies", "implications", "insights", "anomalies", "big picture"] },
  { id: "verbs", title: "Action words", alone: false, how: "Begin with one, and name two years or two things.", probe: "{w} the 2023 and 2024 circulars", words: ["compare", "contrast", "trace", "summarise", "synthesise", "cross-reference", "analyse", "briefing", "evolution", "timeline", "reconcile"] },
  { id: "versions", title: "What changed", alone: false, how: "Add two years or an action word.", probe: "{w} in the 2023 and 2024 circulars", words: ["what changed", "differ", "original", "first announced", "corrected to", "earlier circular", "previous circular", "change between"] },
  { id: "stages", title: "Stage by stage", alone: false, how: "Add two years or an action word.", probe: "Which rule applies {w} in the 2023 and 2024 circulars?", words: ["at each stage", "for each level", "for every category", "grade-wise"] },
];

/**
 * The four types of the shelf are the four groups of keywords above, in the same order and under the same titles: I file a question under the type of the keyword it is built on. A question with no listed keyword (it reaches EDS by its shape: years, "and which",
 * a list after a colon) I file by what it asks. The "hidden" type's questions (H01-H08) were written and tried for this shelf on 23 Nov 2026 (see HIDDEN); N01-N06 were tried the same day (see TRIED).
 */
const TYPES: { id: string; blurb: string; ids: string[]; templates?: string[] }[] = [
  { id: "discovery", blurb: "Questions that look for what no single reading shows: a slip, a hidden condition, a consequence. No other clue is needed.", ids: ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"] },
  { id: "verbs", blurb: "Compare, summarise, explain: things set side by side.", ids: ["E05", "E07", "E08", "E09", "E10", "E11", "E16", "E22", "N01", "E19", "E21", "E23"] },
  { id: "versions", blurb: "The same subject in more than one year or edition, and what a correction changed.", ids: ["E01", "E02", "E03", "E04", "E06", "E12", "E13", "A-C3", "E14", "N02", "N04"] },
  { id: "stages", blurb: "A rule or procedure laid out stage by stage, grade by grade or category by category, as a table.", ids: ["E15", "E17", "E18", "E20", "N03", "N05", "N06"] },
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
