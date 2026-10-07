// src/lib/search/topicGate.ts
//
// Two small, pure helpers shared by circular search. No DB, no model, no state.
//
// 1. contentTokens(): the words of a query that actually carry meaning. The
//    lexical scoring in api/ai-search/route.ts used to count EVERY word longer
//    than 2 letters, including "what", "the", "for", "how", "does". Almost any
//    chunk contains two of those, so almost every chunk looked like a "perfect
//    lexical match" (82-93%) whatever the topic. Counting only content words
//    makes the lexical signal mean something.
//
// 2. isHolidayTopic(): does the question concern holidays / leave-day rules?
//    The holiday-list circulars (no body text, found by headline embedding) and
//    the holiday-policy notes should compete in the results ONLY for such
//    questions. For every other question they were pure filler (50-89% on
//    unrelated queries, in 30 of 46 battery questions).

export const QUERY_STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "in", "on", "at", "by", "from", "into", "onto", "with", "within",
  "without", "about", "over", "under", "per", "via", "and", "or", "nor", "but", "not", "no", "so",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "done", "doing",
  "have", "has", "had", "having", "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "what", "which", "who", "whom", "whose", "how", "why", "when", "where", "whether",
  "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours", "he", "him", "his", "she", "her",
  "it", "its", "they", "them", "their", "this", "that", "these", "those", "there", "here",
  "any", "all", "some", "each", "every", "such", "than", "then", "also", "very", "just", "get", "gets", "got",
  "if", "as", "up", "out", "off", "tell", "give", "show", "find", "list", "please",
]);

/** Meaningful words of a query (lower-case, edge punctuation removed, stopwords dropped, length > 2). */
export function contentTokens(cleanLowerQuery: string): string[] {
  return cleanLowerQuery
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 2 && !QUERY_STOPWORDS.has(t));
}

const HOLIDAY_TOPIC_RE = new RegExp(
  "\\b(" +
    [
      "holidays?", "festivals?", "festive", "closed", "restricted", "rh", "ch", "fh",
      "compensatory", "comp[\\s-]?off", "weekly[\\s-]?offs?", "week[\\s-]?offs?", "gazetted",
      "public holidays?", "bank holidays?", "calendar", "reclassif\\w*", "extra holidays?",
      "puja", "pujas", "pooja", "diwali", "deepavali", "dussehra", "dasara", "durga[\\s-]?(?:puja|pooja)", "durgapuja", "holi", "eid", "id[\\s-]?ul[\\s-]?\\w+",
      "muharram", "christmas", "xmas", "republic day", "independence day", "gandhi jayanti", "may day",
      "good friday", "buddha purnima", "janmashtami", "janmasthami", "rakhi", "raksha bandhan", "ram navami",
      "shivratri", "shivaratri", "bhai dooj", "bhatridwitiya", "chhath", "chhat", "pongal", "pongol", "onam",
      "makar sankranti", "netaji", "foundation day", "guru nanak", "mahalaya", "vishwakarma", "saraswati puja",
      "basanta panchami", "sri panchami", "rath yatra", "milad", "bakrid", "kali puja", "laxmi puja", "lakshmi puja",
    ].join("|") +
    ")\\b",
  "i",
);

export function isHolidayTopic(q: string): boolean {
  return HOLIDAY_TOPIC_RE.test(q || "");
}

/** Words that name WHO a circular is for (or the organisation), not WHAT it is about. */
export const AUDIENCE_WORDS = new Set([
  "contract", "contractor", "contractors", "worker", "workers", "employee", "employees", "executive", "executives",
  "non", "staff", "officer", "officers", "trainee", "trainees", "people", "person", "persons",
  "dsp", "sail", "plant", "steel", "durgapur", "circular", "notice",
]);

/** The words of a query that say WHAT it is about (content words minus audience/organisation words). */
export function topicTokens(contentOnly: string[]): string[] {
  return contentOnly.filter((t) => !AUDIENCE_WORDS.has(t));
}
