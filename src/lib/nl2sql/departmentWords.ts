// src/lib/nl2sql/departmentWords.ts
//
// Department words with more than one meaning, RESOLVED instead of asked (step 55a, the owner's decisions of 26 Oct 2026, after reading the old intranet's lists of both departments).
// The question used to ASK which department was meant (step 49a). Now:
//   "refractory"       = ALL THREE rows: REFRACTORY (86000), REFRACTORY (OFFICE) (86030) and COKE OVEN REFRACTORY (86600), exactly as the old intranet's Refractory page (24 people).
//                        Coke Oven Refractory also belongs to CO & CC (the 5 people of code 86600 are on both lists), and the answer says so.
//   "garage" / "plant garage" = the PLANT GARAGE: ALL SIX rows, named by name and code (85000, 85070, 85110, 85200, 85330, 85430), so the exact-rows check (namedRows.ts) forces the SQL to select them all.
//                        Before step 55d the bare word was only turned into "plant garage", which is just a hint to the model: it may select the one row called PLANT GARAGE (it did: 9 executives).
//                        (the old text:) = the PLANT GARAGE (all six rows). The TOWNSHIP garage has no employees at all (no row in the HR list, an empty department in the old intranet): it is a CLOSED department,
//                        and a question about it is answered at once ("Township Garage has no employees: it is a closed department.").
// The rewritten question names the rows by name and code ("REFRACTORY (code 86000), ..."), the form step 49b already enforces exactly, so the model cannot pick other rows.
// A rule fires only when the question is about people (or is just a word or two) and does not already say which department it means (a code, "coke oven refractory", "refractory office",
// "plant garage", "M.H.E.M.D." ...). A document question ("the tender for the new garage building") is never touched. To add a word, add a rule here: it is the only place.

import { HAS_CODE, isAboutPeopleOrBare } from "./departmentAsk";

export interface DepartmentWordResult {
  /** The question to search for instead of the one typed (the word replaced by the rows it means). */
  question?: string;
  /** A short sentence shown under the answer. May hold {{coke}}, which finishDepartmentNote fills in. */
  note?: string;
  /** Answer at once, search nothing: this department is closed. */
  closed?: string;
  /** The note needs the number of Coke Oven Refractory people (code 86600): the caller counts them and calls finishDepartmentNote. */
  cokeOven?: boolean;
}

export const COKE_OVEN_REFRACTORY_CODE = 86600;
export const TOWNSHIP_GARAGE_CLOSED = "Township Garage has no employees: it is a closed department.";
export const REFRACTORY_ROWS = "REFRACTORY (code 86000), REFRACTORY (OFFICE) (code 86030) and COKE OVEN REFRACTORY (code 86600)";
/** The six rows of the Plant Garage, by name and code, as the real department list spells them (checked against it by the tests). */
export const PLANT_GARAGE_ROWS =
  "PLANT GARAGE (code 85000), PLANT GARAGE (TECH) (code 85070), PLANT GARAGE (M.H.E.O.D.) (code 85110), PLANT GARAGE (M.H.E.M.D.) (code 85200), PLANT GARAGE (OFFICE - MAINT) (code 85330) and PLANT GARAGE (OFFICE - OPRN) (code 85430)";
const GARAGE_NOTE = `“Garage” means the Plant Garage (all its six sections). ${TOWNSHIP_GARAGE_CLOSED}`;
const PLANT_GARAGE_NOTE = "“Plant Garage” means all its six sections: 85000, 85070, 85110, 85200, 85330 and 85430.";
const REFRACTORY_NOTE =
  "“Refractory” means all three Refractory departments, as in the old intranet: REFRACTORY (86000), REFRACTORY (OFFICE) (86030) and COKE OVEN REFRACTORY (86600). Coke Oven Refractory also belongs to CO & CC: {{coke}}.";

const TOWNSHIP_GARAGE = /\b(township|town)\s+garage\b/i;
const PLANT_GARAGE_NAMED = /\bplant\s+garage\b|\bm\.?\s*h\.?\s*e\.?\s*[mo]\.?\s*d\b/i;
/** The family name "plant garage" (not one section: "plant garage (tech)"), when the question does not already name a section (M.H.E.M.D., tech, office ...). */
const PLANT_GARAGE_FAMILY = /\bplant\s+garage\b(?!\s*\()/i;
const A_SECTION_NAMED = /\bm\.?\s*h\.?\s*e\.?\s*[mo]\.?\s*d\b|\b(tech|technical|office|maint|maintenance|oprn|operation|operations)\b/i;
const REFRACTORY_NAMED = /\bcoke\s+oven\s+refractory\b|\brefractory\s*\(?\s*office\b/i;

/** Fills in the number of Coke Oven Refractory people (null when it could not be counted). */
export function finishDepartmentNote(note: string, cokeOvenPeople: number | null): string {
  const counted = cokeOvenPeople === 1 ? "its 1 person is counted in both" : cokeOvenPeople && cokeOvenPeople > 1 ? `its ${cokeOvenPeople} people are counted in both` : "its people are counted in both";
  return note.replace("{{coke}}", counted);
}

/** What a department word in the question means, or null when the question needs no resolving. */
export function resolveDepartmentWords(question: string): DepartmentWordResult | null {
  const original = String(question ?? "");
  if (!isAboutPeopleOrBare(original) || HAS_CODE.test(original)) return null;
  let q = original;
  const notes: string[] = [];
  let cokeOven = false;

  // the township garage: a closed department (unless the same question also names the Plant Garage: then that is answered, and the note says the other is closed)
  const township = TOWNSHIP_GARAGE.test(q);
  const plant = PLANT_GARAGE_NAMED.test(q);
  if (township && !plant) return { closed: TOWNSHIP_GARAGE_CLOSED };
  if (township && plant) notes.push(TOWNSHIP_GARAGE_CLOSED);
  if (!township && !plant && /\bgarage\b/i.test(q)) {
    // the bare word garage = the Plant Garage: its six rows, by name and code
    q = q.replace(/\bgarage\b/i, PLANT_GARAGE_ROWS);
    notes.push(GARAGE_NOTE);
  } else if (PLANT_GARAGE_FAMILY.test(q) && !A_SECTION_NAMED.test(q)) {
    // "plant garage" typed: the family, all six rows (a section named in the question is left to the model's alias hint)
    q = q.replace(PLANT_GARAGE_FAMILY, PLANT_GARAGE_ROWS);
    notes.push(PLANT_GARAGE_NOTE);
  }
  // the bare word refractory = all three rows
  if (/\brefractory\b/i.test(q) && !REFRACTORY_NAMED.test(q)) {
    q = q.replace(/\brefractory\b/i, REFRACTORY_ROWS);
    notes.push(REFRACTORY_NOTE);
    cokeOven = true;
  }
  if (q === original && !notes.length) return null;
  return { ...(q !== original ? { question: q } : {}), ...(notes.length ? { note: notes.join(" ") } : {}), ...(cokeOven ? { cokeOven: true } : {}) };
}
