// src/lib/search/loginHints.ts
//
// Pure helpers for the omni search page. No DB, no network, no React.
//
// 1. decideLoginHint(): when should the page SUGGEST signing in / asking for a written summary?
//    Only for an explanatory question ("why ...", "explain ...", "policy on ...") that was answered
//    with plain circular cards. Executive Deep Synthesis gives a written summary with sources for
//    questions that compare or trace circulars; there is no button (step 41a): the Enter key sends
//    such a question from a signed-in executive there by itself. So a signed-out visitor is told to
//    sign in first if they are an executive, and a signed-in executive whose question was NOT sent
//    there is told how to ask for a summary.
//    Nothing is suggested for names, counts, holiday dates, quoted exact phrases, or when the
//    synthesis was already used. Masked mobile numbers / email IDs are deliberately NOT handled
//    here: clicking a masked value already opens the login page. This is a rule of thumb.
//
// 2. excludeShownPeople(): the page prints people from two independent searches (the answer card
//    and the directory name search). A person already shown in the first list must not be
//    printed again in the second.

// The page also has a "title" mode, so this is a plain string. Only "intellectual" matters here.
export type SearchModeLike = string | null;

export interface HintInput {
  query: string;
  authenticated: boolean;
  isExecutive: boolean;
  mode: SearchModeLike;
  circularShown: boolean;
  answerCardShown: boolean;
}

export interface LoginHint {
  kind: "synthesis" | "plain";
  text: string;
}

const ANALYTICAL_RE = new RegExp(
  "\\b(" +
    [
      "why",
      "how (?:does|do|did|is|are|can|should|will|would)",
      "explain",
      "compare",
      "comparison",
      "differences?",
      "differ",
      "summari[sz]e",
      "summary",
      "reasons?",
      "rationale",
      "implications?",
      "impact",
      "procedures?",
      "process",
      "eligib\\w*",
      "entitle\\w*",
      "polic(?:y|ies)",
      "rules?",
      "guidelines?",
      "what happens",
      "can i",
      "should i",
      "am i",
      "tell me about",
    ].join("|") +
    ")\\b",
  "i",
);

/** An explanatory / analytical question, as opposed to a lookup (name, count, date, id). */
export function looksAnalytical(query: string): boolean {
  const raw = (query || "").trim();
  if (!raw) return false;
  if (/["\u201c\u201d]/.test(raw)) return false; // quoted exact phrase = lookup
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return ANALYTICAL_RE.test(raw);
}

// Shapes the plain search answers directly from the records (employee counts and lists, seniority,
// contact lookups, a ticket number, a holiday with a year). Deliberately NARROW: when unsure, say
// nothing, because a wrong "use plain search" tip on a circular question is worse than no tip.
const PEOPLE_NOUN = "(?:employees|executives|non-?executives|officers|staff|people)";
const LOOKUP_RE = new RegExp(
  "\\b(?:" +
    [
      "how many (?:" + PEOPLE_NOUN.slice(3, -1) + "|holidays|restricted|festival|closed)",
      "number of (?:" + PEOPLE_NOUN.slice(3, -1) + "|holidays)",
      "list (?:all )?(?:the )?(?:[a-z]+ )?" + PEOPLE_NOUN,
      "(?:phone|mobile|email|contact) (?:number|no|of|for)",
      "(?:more|most|less|least) (?:senior|junior)",
      "(?:senior|junior) to",
    ].join("|") +
    ")\\b|\\b\\d{6}\\b",
  "i",
);
const CIRCULAR_WORDS_RE = /\b(circulars?|contract(?:or|ors)?|polic(?:y|ies)|notice|letter|order|leaves?)\b/i;
const HOLIDAY_YEAR_RE = /\bholidays?\b[^]*\b20\d\d\b|\b20\d\d\b[^]*\bholidays?\b/i;

/** A direct lookup (name, count, seniority, contact, ticket, holiday-with-year), not an explanation. */
export function looksLikeLookup(query: string): boolean {
  const raw = (query || "").trim();
  if (!raw) return false;
  if (/["\u201c\u201d]/.test(raw)) return true; // quoted exact phrase = lookup
  if (ANALYTICAL_RE.test(raw)) return false; // an explanatory word wins: never redirect
  if (LOOKUP_RE.test(raw)) return true;
  // A holiday + year is a calendar lookup only when the query is short and does not talk about a
  // circular, a contractor or a policy document (those are answered from circulars).
  const words = raw.split(/\s+/).filter(Boolean).length;
  return words <= 12 && !CIRCULAR_WORDS_RE.test(raw) && HOLIDAY_YEAR_RE.test(raw);
}

export function decideLoginHint(i: HintInput): LoginHint | null {
  // Executive Deep Synthesis has no button any more (step 41a): the Enter key sends an executive's question there by itself, so once it has
  // run there is nothing to advise.
  if (i.mode === "intellectual") return null;

  if (i.circularShown && !i.answerCardShown && looksAnalytical(i.query)) {
    if (!i.authenticated) {
      return {
        kind: "synthesis",
        text:
          "Signed-in executives can get a written summary across the circulars, with sources, for questions that compare or trace circulars. " +
          "If you are an executive, sign in and ask again.",
      };
    }
    if (i.isExecutive) {
      return {
        kind: "synthesis",
        text: "Tip: for a written summary across several circulars, ask for it directly, for example \u201ccompare \u2026\u201d, \u201cwhat changed between \u2026\u201d or \u201csummarise \u2026\u201d.",
      };
    }
  }
  return null;
}

type WithTicket = { ticketNo?: string | null };

/** Drop from `others` anyone whose ticket number is already present in `shown`. Rows with no ticket are kept. */
export function excludeShownPeople<T extends WithTicket>(
  shown: WithTicket[] | null | undefined,
  others: T[],
): T[] {
  const seen = new Set(
    (shown || []).map((p) => String(p?.ticketNo ?? "").trim()).filter((t) => t.length > 0),
  );
  if (seen.size === 0) return others;
  return others.filter((p) => {
    const t = String(p?.ticketNo ?? "").trim();
    return t.length === 0 || !seen.has(t);
  });
}
