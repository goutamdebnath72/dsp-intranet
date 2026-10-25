// src/lib/nl2sql/departmentAsk.ts
//
// A department word that means more than one thing: ASK which, with CHECKBOXES, instead of guessing (step 49a). No model call, no SQL: the question comes at once.
//   "garage"      the HR list has ONE garage department (PLANT GARAGE, six rows); the TOWNSHIP garage is a different department that has no row of its own. The bare word used to
//                 mean Plant Garage, so a question about the township garage would have returned Plant Garage people.
//   "refractory"  three rows: REFRACTORY (86000), REFRACTORY (OFFICE) (86030) and COKE OVEN REFRACTORY (86600): what the bare word means is for the owner to decide, so each time the
//                 person ticks the ones meant.
// Why checkboxes and not radio buttons: the options are real department rows and a person may mean any combination of them (three refractory rows = seven possible choices; radio buttons
// could offer only the few combinations we thought of). "All" is therefore not an option of its own: it is a Select all shortcut in the component. "None of these" and "documents" are
// not departments and cannot be ticked together with one, so they are separate buttons.
// A rule fires only when (a) the question carries the bare word, (b) it does not already say which one (plant garage, township garage, M.H.E.M.D. ... / coke oven refractory,
// refractory office, "(code 86000)" ...), and (c) it is about people (executives, employees, staff ...) or is just one or two words. The question that is searched for is the SAME
// question with the ticked rows named (by name and code), and it always passes (b), so ticking can never ask again. To add a word, add a rule here: it is the only place.

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
  /** "one": RADIO buttons, exactly one option (a doctor); default "many": checkboxes (departments) */
  mode?: "one" | "many";
  /** a regular expression (source) that finds the words to replace, when they are not one plain word ("a mukherjee") */
  pattern?: string;
  /** another search the person may want instead (all employees of that name) */
  alternative?: { label: string; query: string };
}

const PEOPLE = /\b(executives?|non[- ]?executives?|employees?|people|persons?|staff|officers?|managers?|workers?|engineers?|doctors?|personnel|working|work|posted|employed|serving)\b/i;
const HAS_CODE = /\(\s*code\s+\d{3,5}\s*\)/i;

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

interface Rule {
  word: string;
  /** the question already says which one */
  unless: RegExp;
  message: string;
  options: AskOption[];
  none: { label: string; reply: string };
}

const RULES: Rule[] = [
  {
    word: "garage",
    unless: /\b(plant|township|town)\s+garage\b|\bm\.?\s*h\.?\s*e\.?\s*[mo]\.?\s*d\b/i,
    message: "Which department do you mean by \u201Cgarage\u201D? The HR list has one garage department, the Plant Garage (six sections). Tick the one you mean, then press Continue.",
    options: [{ id: "plant", label: "Plant Garage (all its sections)", phrase: "plant garage" }],
    none: {
      label: "None of these",
      reply: "The HR list has no other garage department, so I cannot count the township garage (it has no row of its own). If you mean another department, please type its full name.",
    },
  },
  {
    word: "refractory",
    unless: /\bcoke\s+oven\s+refractory\b|\brefractory\s*\(?\s*office\b/i,
    message: "Which department do you mean by \u201Crefractory\u201D? The HR list has three. Tick one or more, then press Continue.",
    options: [
      { id: "refractory", label: "REFRACTORY (code 86000)", phrase: "REFRACTORY (code 86000)" },
      { id: "office", label: "REFRACTORY (OFFICE) (code 86030)", phrase: "REFRACTORY (OFFICE) (code 86030)" },
      { id: "coke", label: "COKE OVEN REFRACTORY (code 86600)", phrase: "COKE OVEN REFRACTORY (code 86600)" },
    ],
    none: { label: "None of these", reply: "Please type the department's full name, or its code." },
  },
];

/** The question to ask the person, or null when the question needs no asking. */
export function askWhichDepartment(question: string): DepartmentAsk | null {
  const q = String(question ?? "");
  if (!isAboutPeopleOrBare(q) || HAS_CODE.test(q)) return null;
  for (const r of RULES) {
    if (!new RegExp(`\\b${r.word}\\b`, "i").test(q) || r.unless.test(q)) continue;
    const ask: DepartmentAsk = { message: r.message, word: r.word, question: q, options: r.options, none: r.none };
    if (!PEOPLE.test(q)) ask.documents = { label: `I am looking for documents (circulars) about \u201C${r.word}\u201D instead`, query: `circular about ${q.trim()}` };
    return ask;
  }
  return null;
}
