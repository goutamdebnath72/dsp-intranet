// src/lib/search/synthesisIntent.ts
//
// Which questions belong to EXECUTIVE DEEP SYNTHESIS (EDS)? A pure, explainable detector, so the one Enter key can decide
// instead of a button. It reads the question only (no database, no model) and returns a score, a level and the reasons.
//
// THE PATTERN (found in the questions you marked as EDS: the four tests of the old query document and the "C" questions of
// the accuracy test, and checked against the Smart Semantic questions of the same document and the 210 other acceptance
// questions):
//
//   A Smart Semantic question asks ONE thing that ONE circular answers ("How do I return my provident fund advance...?").
//   An EDS question needs the answer to be BUILT from SEVERAL documents, versions or periods. It shows in four ways:
//
//   1. an ANALYTIC TASK VERB: trace / evolution, contrast, compare, synthesize, cross-reference, briefing, summarize ...
//      (all four old tests start with one; none of the 215 other questions contains one);
//   2. a VERSION RELATION between documents: "change(d) between", "what changed", "original ... corrected", "first announced",
//      "earlier circular" (three of the four "C" questions; none of the 215 others);
//   3. an AGGREGATE across a period: "list the ... events ... in December 2024";
//   4. DISCOVERY / DATA-MINING language, the kind a policy maker uses to see what is normally invisible: correlate, hidden,
//      overlooked, "what are we missing", inconsistencies, gaps, contradictions, implications, insights (decisive); patterns,
//      trends, themes, what emerges or is revealed, relationships and connections between things, overlap, divergence, impact
//      of X on Y, "how often", "across all circulars / years / schemes" (supporting, they need one more cue);
//   5. supporting shape: TWO OR MORE YEARS named ("from 2023 to 2024", "the 2024 and 2025 schemes"), a second verb, TWO questions joined by "and which /
//      and what", MANY NAMED things (6 to 11 capitalised names in the old tests), and LENGTH (29 to 44 words in the old tests;
//      the longest ordinary question has 19).
//
// "Data mining" here means: find what is hidden in the circulars by relating facts that look unrelated (a safety rule and an
// electoral-roll declaration; welfare schemes and attendance systems; how often a decision is revised after it is announced).
//
// Each feature has a weight; 5 or more = EDS ("synthesis"), 3 or 4 = "borderline" (a written summary may help: e.g. "Summarise the
// Mediclaim extension circular"), below 3 = an ordinary question. Supporting shape alone can never reach 5: a question must also
// have a verb, a version relation or an aggregate, or several supporting features at once.
//
// GUARD: a question about PEOPLE DATA (who / senior / designation / ticket / mobile ...) is never EDS, even if it says "compare":
// "compare the seniority of X and Y" belongs to the employee directory. (The old tests say "employees" and "executives" only as
// the groups a policy applies to, so those words do not block.)
//
// This detects the INTENT. Whether synthesis then runs also needs a logged-in executive (the screen) that the server verifies
// again, and the switch (ON by default since step 41a; NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false turns it off): never decided here. If an automatic synthesis finds no relevant
// circular, the screen falls back to the normal search (useOmniSearch.ts).

export type SynthesisLevel = "synthesis" | "borderline" | "none";

export interface SynthesisIntent {
  /** True when the level is "synthesis". */
  synthesis: boolean;
  level: SynthesisLevel;
  score: number;
  /** What fired, in plain words (shown in tests, the trace and the report). */
  reasons: string[];
  /** Set when the question looks like a people-data question: never EDS. */
  blockedBy: string | null;
}

export const SYNTHESIS_THRESHOLD = 5;
export const BORDERLINE_THRESHOLD = 3;

const ANALYTIC_VERB =
  /\b(synthesi[sz]e|trace|evolution|evolve[sd]?|contrast|compare|comparison|cross[- ]?referenc\w*|juxtapos\w*|briefing|brief me|summari[sz]e|analy[sz]e|trajectory|timeline|reconcile)\b/i;
// DISCOVERY, decisive (+5): words that name an act of finding what is hidden or relating the unrelated. Rare in ordinary lookups.
const DISCOVERY_STRONG =
  /\b(correlat\w+|hidden|unforeseen|overlooked|unnoticed|invisible|blind spots?|what are we missing|anomal\w+|inconsisten\w+|contradict\w*|discrepanc\w+|implications?|uncover\w*|insights?|big picture|overall picture|not (?:obvious|visible|apparent|evident)|nobody\b[^?.]{0,30}\b(?:talked|noticed|spotted|mentioned|realis\w*|realiz\w*)|relationships? (?:between|among)|connections? (?:between|among)|links? between|in common|overlap\w*|diverg\w*|converg\w*)\b/i;
// DISCOVERY, supporting (+2 for EACH distinct cue, up to three): common words that signal pattern-finding. One alone never
// reaches EDS; several together ("recurring themes", "trend" + "how many circulars were issued ... each of the last three
// years") do.
const DISCOVERY_MEDIUM = [
  /\b(?:patterns?|trends?)\b/i,
  /\b(?:recurring|themes?|emerg\w+|reveal\w*)\b/i,
  /\b(?:gaps? (?:between|in)|mismatch\w*|conflicts? (?:between|with))\b/i,
  /\b(?:impacts? (?:of|on)|effects? of\b[^?.]{0,60}\bon\b|consequences? of)\b/i,
  /\b(?:how often|how frequently)\b/i,
  /\b(?:over the years|year over year|over time|(?:each|every) of the (?:last|past|previous) \w+ years|over the (?:last|past) \w+ years)\b/i,
  /\bacross (?:all |the |every )?(?:circulars|notices|schemes|years|departments|policies)\b/i,
  /\bhow many (?:circulars|notices|schemes|orders) (?:were |have been )?(?:issued|published|announced)\b/i,
  /\b(?:fit together|taken together|as a whole|collectively|holistic\w*|common (?:thread|ground|factor)|runs? through|running through|underlying|tie[sd]? (?:\w+ )?together)\b/i,
];
const REPORT_VERB = /(?:^|[.,;]\s*|\band\s+)(detail|outline|describe|elaborate|explain|provide|specify)\b/i;
const VERSION_RELATION =
  /\b((?:revis|amend|correct|chang|extend)\w*\b[^?.]{0,25}\bafter\b|what changed|(?:chang|shift|evolv|mov)\w* (?:between|since|from|over)|did\b[^?.]{0,120}\bchange|differ\w*|original(?:ly)?|first\b[^?.]{0,25}\bannounce(?:d|ment)|initially announced|corrected to|earlier (?:circular|notice|order)|previous (?:circular|notice|order)|before and after)\b/i;
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const AGGREGATE = new RegExp(
  `\\b(?:list|enumerate|name|all|every)\\b[^?.]{0,60}\\b(?:events|circulars|notices|schemes|trials|tournaments|programmes|programs|orders|matches|competitions|announcements)\\b[^?.]{0,80}\\b(?:in|during|for|of)\\s+(?:${MONTHS})(?:\\s+(?:19|20)\\d{2})?\\b`,
  "i",
);
const TWO_QUESTIONS = /\band (?:which|what|when|who|how)\b/i;

// People-data operations: the employee directory answers these, never a synthesis of circulars.
const PEOPLE_OPS =
  /\b(who|whom|whose (?:ticket|name|mobile|phone|e-?mail|designation|grade|department)|seniors?|seniority|juniors?|designations?|grades?|tickets?|mobile|phones?|e-?mails?|surnames?|headcount|how many (?:people|employees|executives|staff|officers|managers))\b/i;
const ID_LIKE = /\b\d{5,10}\b|\b[A-Za-z]\d{4,}\b/;

const wordsOf = (q: string) => q.trim().split(/\s+/).filter(Boolean).length;
const distinctYears = (q: string) => new Set(q.match(/\b(?:19|20)\d{2}\b/g) ?? []).size;

/** Distinct capitalised words, acronyms and #numbers that are not the first word: the "many named things" signal. */
function namedThings(q: string): number {
  const toks = q.replace(/[(),.]/g, " ").split(/\s+/).filter(Boolean).slice(1);
  return new Set(toks.filter((w) => /^[A-Z][A-Za-z]+$/.test(w) || /^[A-Z]{2,}$/.test(w) || /^#\d+/.test(w))).size;
}

export function detectSynthesisIntent(question: string): SynthesisIntent {
  const q = question.trim();
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, why: string) => {
    score += points;
    reasons.push(`+${points} ${why}`);
  };

  if (!q) return { synthesis: false, level: "none", score: 0, reasons: [], blockedBy: null };

  // the main signals (any ONE of these is the heart of an EDS question)
  if (ANALYTIC_VERB.test(q)) add(3, "an analytic task verb (trace / compare / contrast / synthesize / cross-reference / briefing ...)");
  if (VERSION_RELATION.test(q)) add(3, "a relation between versions or documents (change between / original / first announced / earlier circular ...)");
  if (AGGREGATE.test(q)) add(5, "an aggregate across a period (list the ... events ... in <month year>)");
  if (DISCOVERY_STRONG.test(q)) add(5, "discovery language (correlate / hidden / overlooked / inconsistencies / implications / insights ...)");
  const mediumCues = DISCOVERY_MEDIUM.filter((re) => re.test(q)).length;
  if (mediumCues > 0) add(2 * Math.min(mediumCues, 3), `${mediumCues} pattern-finding cue(s) (patterns / trends / recurring themes / how often / across all ...)`);

  // supporting shape
  if (REPORT_VERB.test(q)) add(1, "a report verb (detail / provide / outline ...)");
  const analyticVerbs = new Set((q.match(new RegExp(ANALYTIC_VERB.source, "gi")) ?? []).map((v) => v.toLowerCase()));
  if (analyticVerbs.size >= 2) add(1, "a second analytic verb");
  if (distinctYears(q) >= 2) add(2, "two or more different years named (a span, or a before and after)");
  if (TWO_QUESTIONS.test(q)) add(2, "two questions joined by 'and which / and what'");
  const named = namedThings(q);
  if (named >= 3) add(1, `${named} named things`);
  const words = wordsOf(q);
  if (words >= 38) add(2, `${words} words`);
  else if (words >= 28) add(1, `${words} words`);

  // guard: a people-data question is never EDS
  let blockedBy: string | null = null;
  const ops = q.match(PEOPLE_OPS);
  if (ops) blockedBy = `people-data word "${ops[0]}"`;
  else if (ID_LIKE.test(q)) blockedBy = "a ticket-like number";

  const level: SynthesisLevel = blockedBy ? "none" : score >= SYNTHESIS_THRESHOLD ? "synthesis" : score >= BORDERLINE_THRESHOLD ? "borderline" : "none";
  return { synthesis: level === "synthesis", level, score, reasons, blockedBy };
}

/**
 * ON by default (step 41a): the Enter key sends an EDS-type question from a logged-in executive to Executive Deep Synthesis by itself (the
 * screen decides, OmnibarModal.tsx; the server still verifies the executive from the login session). There is no button any more. The kill
 * switch is NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=false (also 0, off, no, in any case). It is a NEXT_PUBLIC_ variable because the browser reads it,
 * so a change needs a new deployment. The browser must pass the value in explicitly, because Next only replaces the literal
 * process.env.NEXT_PUBLIC_... in client code.
 */
export function autoEdsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_FRONT_PATH_AUTO_EDS: process.env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS }): boolean {
  return !["false", "0", "off", "no"].includes((env.NEXT_PUBLIC_FRONT_PATH_AUTO_EDS ?? "").trim().toLowerCase());
}
