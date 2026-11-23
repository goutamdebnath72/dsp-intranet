// src/lib/search/loginHints.ts
//
// Pure helpers for the omni search page. I keep them free of DB, network and React.
//
// 1. decideLoginHint(): decides when the page should SUGGEST signing in / asking for a written summary.
//    I suggest it only for an explanatory question ("why ...", "explain ...", "policy on ...") that was answered
//    with plain circular cards. Executive Deep Synthesis gives a written summary with sources for
//    questions that compare or trace circulars; there is no button (step 41a): the Enter key sends
//    such a question from a signed-in executive there by itself. So a signed-out visitor is told to
//    sign in first if they are an executive, and a signed-in executive whose question was NOT sent
//    there is told how to ask for a summary.
//    I suggest nothing for names, counts, holiday dates, quoted exact phrases, or when the
//    synthesis was already used. I deliberately do NOT handle masked mobile numbers / email IDs
//    here: clicking a masked value already opens the login page. This is a rule of thumb.
//
// 2. excludeShownPeople(): the page prints people from two independent searches (the answer card
//    and the directory name search). I make sure a person already shown in the first list is not
//    printed again in the second.

import { detectSynthesisIntent } from "./synthesisIntent";

// The page also has a "title" mode, so I keep this a plain string. Only "intellectual" matters here.
export type SearchModeLike = string | null;

export interface HintInput {
  query: string;
  authenticated: boolean;
  isExecutive: boolean;
  mode: SearchModeLike;
  circularShown: boolean;
  answerCardShown: boolean;
  /**
   * The state of the session. I give the EDS sign-in advice only to a visitor who is DEFINITELY signed out ("unauthenticated"), never while the session is still being checked ("loading").
   *  When it is not passed, it is derived from `authenticated`.
   */
  authStatus?: "authenticated" | "unauthenticated" | "loading";
  /** The kill switch of the automatic EDS route (autoEdsEnabled). When EDS is switched off, I tell nobody to sign in for it. Default: on. */
  edsEnabled?: boolean;
  /** The visitor was ASKED "Are you an executive?" for this very question and answered No. The simple answer is then what was asked for, so I do not repeat the sign-in advice above it. */
  executiveAskAnsweredNo?: boolean;
}

export interface LoginHint {
  /** "eds-signin" is for the case where the question is an Executive Deep Synthesis question and the visitor is signed out. */
  kind: "synthesis" | "plain" | "eds-signin";
  text: string;
  /** "signin": the bar shows a button that opens the sign-in window. */
  action?: "signin";
}

/**
 * The advice given to a SIGNED-OUT visitor whose question belongs to Executive Deep Synthesis. I let ONE detector decide which questions those are, the same one that routes a signed-in
 * executive's question (synthesisIntent.ts: level "synthesis", never the weaker "borderline"), so the advice and the route can never disagree.
 */
export const EDS_SIGNIN_TEXT =
  "This looks like an Executive Deep Synthesis (EDS) question: the answer has to be built from several circulars into one written summary, with sources. " +
  "EDS is available to executives. If you are an executive, sign in with your credentials and ask this question again.";

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

/** I call a question analytical when it is explanatory, as opposed to a lookup (name, count, date, id). */
export function looksAnalytical(query: string): boolean {
  const raw = (query || "").trim();
  if (!raw) return false;
  if (/["\u201c\u201d]/.test(raw)) return false; // a quoted exact phrase counts as a lookup
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return ANALYTICAL_RE.test(raw);
}

// These are the shapes the plain search answers directly from the records (employee counts and lists, seniority,
// contact lookups, a ticket number, a holiday with a year). I keep this deliberately NARROW: when unsure, say
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

/** I call it a direct lookup when it is a name, count, seniority, contact, ticket or holiday-with-year, and not an explanation. */
export function looksLikeLookup(query: string): boolean {
  const raw = (query || "").trim();
  if (!raw) return false;
  if (/["\u201c\u201d]/.test(raw)) return true; // a quoted exact phrase counts as a lookup
  if (ANALYTICAL_RE.test(raw)) return false; // an explanatory word wins, and I never redirect
  if (LOOKUP_RE.test(raw)) return true;
  // I count a holiday + year as a calendar lookup only when the query is short and does not talk about a
  // circular, a contractor or a policy document (those are answered from circulars).
  const words = raw.split(/\s+/).filter(Boolean).length;
  return words <= 12 && !CIRCULAR_WORDS_RE.test(raw) && HOLIDAY_YEAR_RE.test(raw);
}

export function decideLoginHint(i: HintInput): LoginHint | null {
  // Executive Deep Synthesis has no button any more (step 41a): the Enter key sends an executive's question there by itself, so once it has
  // run there is nothing left for me to advise.
  if (i.mode === "intellectual") return null;

  // A signed-out visitor who fired an EDS-category question: I say so, and say what to do (sign in as an executive, ask again). I do this only for a visitor who is definitely signed out.
  const status = i.authStatus ?? (i.authenticated ? "authenticated" : "unauthenticated");
  if (status === "unauthenticated" && i.edsEnabled !== false && !i.executiveAskAnsweredNo && detectSynthesisIntent(i.query || "").synthesis) {
    return { kind: "eds-signin", text: EDS_SIGNIN_TEXT, action: "signin" };
  }

  if (i.circularShown && !i.answerCardShown && looksAnalytical(i.query)) {
    if (!i.authenticated) {
      if (i.executiveAskAnsweredNo) return null; // he was asked "Are you an executive?" and said No, so I do not repeat the same advice above the simple answer
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

type WithTicket = { ticketNo?: string | null; id?: string | null };

/** I drop from `others` anyone whose ticket number is already present in `shown`. Rows with no ticket are kept. */
/**
 * After the "sign in" advice: the visitor signs in as an executive WHILE the EDS question is still on the screen. I want the question to then run by itself
 * through EDS (what the Enter key would have done for an executive), not stay as the plain circular answer the signed-out visit got.
 * True only for a visit that went from not-an-executive to executive, with the window open, the answer on screen being the plain search (not EDS already)
 * of a question that cleanly falls in the EDS group (same detector as the advice), and the box still holding that question (not edited since).
 */
export function resumeAsEds(i: { wasExecutive: boolean; isExecutive: boolean; isOpen: boolean; mode: SearchModeLike; query: string; submittedQuery: string; edsEnabled?: boolean }): boolean {
  if (i.wasExecutive || !i.isExecutive || !i.isOpen) return false;
  if (i.edsEnabled === false) return false;
  if (i.mode !== "semantic") return false;
  const sent = (i.submittedQuery || "").trim();
  if (sent.length < 3 || (i.query || "").trim() !== sent) return false;
  return detectSynthesisIntent(sent).synthesis;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// THE QUESTION "ARE YOU AN EXECUTIVE?" (my decision, 17 Nov 2026). When a line is clearly an EDS-category question (the same detector that routes an executive's question: level "synthesis") and the visitor is DEFINITELY signed out,
// nothing is searched yet: the bar first asks whether he is an executive.
//   Yes -> he is told that EDS replies come to executives who are signed in, and offered the Sign in button; when he has signed in as an executive with the same question still in the box, it runs by itself through EDS.
//   No  -> the simple reply (the normal search) is shown, as for any other question, and the sign-in advice is not repeated.
// While the session is still being checked ("loading"), and for a signed-in person (an executive goes to EDS, anyone else to the normal search), I ask nothing.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export interface ExecutiveAsk {
  /** the question as typed (trimmed) */
  query: string;
  /** "yes" means he said he is an executive and was told to sign in; null means not answered yet */
  said: "yes" | null;
}

/** I return true when the Enter key must ask "Are you an executive?" instead of searching: an EDS-category question from a visitor who is definitely signed out. */
export function shouldAskExecutive(i: { authStatus: string; query: string; edsEnabled?: boolean }): boolean {
  if (i.authStatus !== "unauthenticated" || i.edsEnabled === false) return false;
  const q = (i.query || "").trim();
  return q.length >= 3 && detectSynthesisIntent(q).synthesis;
}

/** True when a visitor who said "Yes, I am an executive" has now signed in as an executive, with the window open and the same question still in the box: I then run the question through EDS by itself. */
export function resumeAskedEds(i: { ask: ExecutiveAsk | null; wasExecutive: boolean; isExecutive: boolean; isOpen: boolean; query: string; edsEnabled?: boolean }): boolean {
  if (!i.ask || i.ask.said !== "yes") return false;
  if (i.wasExecutive || !i.isExecutive || !i.isOpen || i.edsEnabled === false) return false;
  return (i.query || "").trim() === i.ask.query && detectSynthesisIntent(i.ask.query).synthesis;
}

export function excludeShownPeople<T extends WithTicket>(
  shown: WithTicket[] | null | undefined,
  others: T[],
): T[] {
  // I treat a person as the same person when the record id matches, or when the ticket number matches. A ticket number counts only when it is a whole number: the cards carry it MASKED ("4••••0"),
  // and many people share a mask, so a masked ticket must never make one person hide another.
  const whole = (t: string) => /^\d+$/.test(t);
  const tickets = new Set((shown || []).map((p) => String(p?.ticketNo ?? "").trim()).filter((t) => t.length > 0 && whole(t)));
  const ids = new Set((shown || []).map((p) => String(p?.id ?? "").trim()).filter((t) => t.length > 0));
  if (tickets.size === 0 && ids.size === 0) return others;
  return others.filter((p) => {
    const t = String(p?.ticketNo ?? "").trim();
    const i = String(p?.id ?? "").trim();
    return !((t.length > 0 && whole(t) && tickets.has(t)) || (i.length > 0 && ids.has(i)));
  });
}
