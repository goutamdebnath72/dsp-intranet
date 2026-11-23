// src/lib/nl2sql/departmentAsk.ts
//
// This is the clarifying question with CHECKBOXES (departments) or RADIO buttons (one doctor, one unit): the types, the rewriting of the person's own question by the ticked option(s), and the test of
// whether a question is about people. The hospital route uses it (which doctor? which department? which unit?), and so would any future department word that really has to be asked about.
// I no longer ask about the words "garage" and "refractory": step 55a resolves them (departmentWords.ts).
// The question that is searched for is the SAME question with the ticked options named, and it must always pass the rules that decide whether to ask, so ticking can never ask again.

export interface AskOption {
  id: string;
  /** I show this next to the checkbox */
  label: string;
  /** The words the rewritten question uses to name this department */
  phrase: string;
  /** A second line under the label (a doctor's discipline and unit) */
  detail?: string;
}
export interface DepartmentAsk {
  /** The question I put to the person: it names the word, says what the list holds, and tells what to do */
  message: string;
  /** The bare word that is replaced in the question */
  word: string;
  /** The question as the person typed it */
  question: string;
  options: AskOption[];
  /** For "None of these": nothing can be searched, so I show this sentence */
  none: { label: string; reply: string };
  /** Set only when the person typed just the word; it offers a search of the circulars instead */
  documents?: { label: string; query: string };
  /** What a screen reader hears for the group; the default is "Choose the doctor you mean" for radio buttons and "Tick the department or departments you mean" for checkboxes */
  legend?: string;
  /** "one" gives RADIO buttons, exactly one option (a doctor); the default "many" gives checkboxes (departments) */
  mode?: "one" | "many";
  /** A regular expression (source) that finds the words to replace, when they are not one plain word ("a mukherjee") */
  pattern?: string;
  /** Another search the person may want instead (all employees of that name) */
  alternative?: { label: string; query: string };
}

const PEOPLE = /\b(executives?|non[- ]?executives?|employees?|people|persons?|staff|officers?|managers?|workers?|engineers?|doctors?|personnel|working|work|posted|employed|serving)\b/i;
export const HAS_CODE = /\(\s*code\s+\d{3,5}\s*\)/i;

/** True for a question about people, or for just a word or two ("garage", "garage staff", "central stores department"). */
export const isAboutPeopleOrBare = (q: string): boolean => {
  const words = q.trim().split(/\s+/).filter(Boolean).length;
  // I count "central stores department" (3 words) as a bare department name; a LONG question that merely contains the word
  // ("circular on central stores department tender") is about documents and must not be turned into a people list.
  return PEOPLE.test(q) || words <= 2 || (words <= 4 && /\b(departments?|deptt?|sections?)\b/i.test(q));
};

const joinPhrases = (p: string[]): string => (p.length <= 1 ? (p[0] ?? "") : `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`);

/** Builds the question to search for when these options are ticked; returns "" when none is. */
export function queryFor(ask: DepartmentAsk, ticked: string[]): string {
  const phrases = ask.options.filter((o) => ticked.includes(o.id)).map((o) => o.phrase);
  if (!phrases.length) return "";
  const re = new RegExp(ask.pattern ?? `\\b${ask.word}\\b`, "i");
  return re.test(ask.question) ? ask.question.replace(re, joinPhrases(phrases)) : `${ask.question} ${joinPhrases(phrases)}`;
}
