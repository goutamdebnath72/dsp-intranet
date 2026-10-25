// src/lib/nl2sql/departmentAsk.ts
//
// The clarifying question with CHECKBOXES (departments) or RADIO buttons (one doctor, one unit): the types, the rewriting of the person's own question by the ticked option(s), and the test of
// whether a question is about people. It is used by the hospital route (which doctor? which department? which unit?) and by any future department word that really has to be asked about.
// The words "garage" and "refractory" are no longer asked about: step 55a resolves them (departmentWords.ts).
// The question that is searched for is the SAME question with the ticked options named, and it must always pass the rules that decide whether to ask, so ticking can never ask again.

export interface AskOption {
  id: string;
  /** shown next to the checkbox */
  label: string;
  /** how the rewritten question names this department */
  phrase: string;
  /** a second line under the label (a doctor's discipline and unit) */
  detail?: string;
}
export interface DepartmentAsk {
  /** the question to the person: names the word, says what the list holds, tells what to do */
  message: string;
  /** the bare word that is replaced in the question */
  word: string;
  /** the question as the person typed it */
  question: string;
  options: AskOption[];
  /** "None of these": nothing can be searched, this sentence is shown */
  none: { label: string; reply: string };
  /** only when the person typed just the word: a search of the circulars instead */
  documents?: { label: string; query: string };
  /** what a screen reader hears for the group (default: "Choose the doctor you mean" for radio buttons, "Tick the department or departments you mean" for checkboxes) */
  legend?: string;
  /** "one": RADIO buttons, exactly one option (a doctor); default "many": checkboxes (departments) */
  mode?: "one" | "many";
  /** a regular expression (source) that finds the words to replace, when they are not one plain word ("a mukherjee") */
  pattern?: string;
  /** another search the person may want instead (all employees of that name) */
  alternative?: { label: string; query: string };
}

const PEOPLE = /\b(executives?|non[- ]?executives?|employees?|people|persons?|staff|officers?|managers?|workers?|engineers?|doctors?|personnel|working|work|posted|employed|serving)\b/i;
export const HAS_CODE = /\(\s*code\s+\d{3,5}\s*\)/i;

/** The question about people, or just a word or two ("garage", "garage staff"). */
export const isAboutPeopleOrBare = (q: string): boolean => PEOPLE.test(q) || q.trim().split(/\s+/).filter(Boolean).length <= 2;

const joinPhrases = (p: string[]): string => (p.length <= 1 ? (p[0] ?? "") : `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`);

/** The question to search for when these options are ticked ("" when none is). */
export function queryFor(ask: DepartmentAsk, ticked: string[]): string {
  const phrases = ask.options.filter((o) => ticked.includes(o.id)).map((o) => o.phrase);
  if (!phrases.length) return "";
  const re = new RegExp(ask.pattern ?? `\\b${ask.word}\\b`, "i");
  return re.test(ask.question) ? ask.question.replace(re, joinPhrases(phrases)) : `${ask.question} ${joinPhrases(phrases)}`;
}
