// src/lib/search/loginHints.ts
//
// Pure helpers for the omni search page. No DB, no network, no React.
//
// 1. decideLoginHint(): when should the page SUGGEST signing in / using the Executive Deep
//    Synthesis button? Only for an explanatory question ("why ...", "explain ...", "policy on ...")
//    that was answered with plain circular cards. Executive Deep Synthesis gives a written summary
//    with sources for such questions, so a signed-out visitor is told to sign in first if they are
//    an executive, and a signed-in executive who pressed Enter is told the button exists.
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
  kind: "synthesis";
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

export function decideLoginHint(i: HintInput): LoginHint | null {
  if (i.mode === "intellectual") return null;

  if (i.circularShown && !i.answerCardShown && looksAnalytical(i.query)) {
    if (!i.authenticated) {
      return {
        kind: "synthesis",
        text:
          "This kind of question gets a fuller answer from Executive Deep Synthesis: a written summary with sources. " +
          "If you are an executive, sign in first and use that button.",
      };
    }
    if (i.isExecutive) {
      return {
        kind: "synthesis",
        text: "Tip: for a written summary with sources on this question, use the Executive Deep Synthesis button.",
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
