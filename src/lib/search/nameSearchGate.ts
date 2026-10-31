// src/lib/search/nameSearchGate.ts
//
// WHEN THE PEOPLE NAME SEARCH IS WORTH RUNNING (step 61a; ledger item 32).
// On every Enter the box also fired GET /api/employees/search?mode=name&q=<the whole text>, a fuzzy and phonetic search of NAMES. For a sentence ("list the employees of chrd",
// "how many people work in learning and development") it can only burn 1 to 7 seconds of database time and return nothing useful: the question is answered by the other routes.
// The name search is for what can BE a name: one to four words ("kumar", "sanjay debnath", "mohd anwar ullah", "soumit c&it", "c&it roy"), not a question and not a command.
// Pure (no server code): the query modal calls it before it starts the name search.

/** The first word of a question or a command: such a text is never a name. */
const OPENS_A_SENTENCE = new Set([
  "list", "lists", "show", "give", "find", "how", "who", "whom", "whose", "what", "whats", "which", "when", "where", "why", "is", "are", "was", "were", "do", "does", "did", "can", "could", "will", "would", "should",
  "tell", "count", "number", "total", "display", "names", "get", "many", "much", "any", "all", "every", "please", "kindly", "enlist", "provide", "search", "name", "type", "open", "check", "compare", "explain", "describe", "summarise", "summarize",
]);

/** A word that names a TOPIC (people in general, a list, a holiday, a degree ...): a short text that holds one ("super speciality doctors", "holiday list 2024") is a topic, not a name. */
const TOPIC_WORDS = new Set([
  "doctor", "doctors", "employee", "employees", "people", "staff", "executive", "executives", "officers", "holiday", "holidays", "list", "lists", "circular", "circulars", "policy", "policies", "department", "departments",
  "section", "sections", "salary", "leave", "opd", "degree", "degrees", "qualification", "qualifications", "specialisation", "speciality", "specialty", "hospital", "announcement", "announcements", "schedule", "checkup", "health",
]);

export const MAX_NAME_WORDS = 4;

export function looksLikeNameSearch(text: string): boolean {
  const s = String(text ?? "").trim();
  if (s.length < 2 || s.includes("?")) return false;
  const words = s.split(/\s+/);
  if (words.length > MAX_NAME_WORDS) return false;
  const first = words[0].toLowerCase().replace(/[^a-z]/g, "");
  if (OPENS_A_SENTENCE.has(first)) return false;
  return !words.some((w) => TOPIC_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
}
