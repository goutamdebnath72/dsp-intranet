// src/lib/pax/answer.ts
//
// THE PAX ANSWER (step 63a): from the question and the rows of the directory to the card the omnibar draws.
// The owner's standing rule (26 Oct 2026): the ONE clean answer stands first as a single big bold statement (the number, the name, a count; amber "Not found" when it is not there),
// the table after it, the explanations folded away. The card is the same one the hospital answers use (HospitalAnswerCard: headline, one sentence, table, bullets, red notes, folded details),
// so the screen needs no new component. Plain text only (React escapes it).
//
// Nothing here is invented: a number is shown only when it is a row of the table; a word read through a spelling slip is SAID ("read 'servise' as 'service'");
// a name that merely shares some words is shown as "closest", never as the answer.

import type { HospitalAnswer, HospitalTable } from "@/lib/hospital/types";
import { filterByArea, matchByName, matchByNumber, planPaxQuery, sortPaxRows, uniqueRows, type PaxArea, type PaxPlan, type PaxRow } from "./matcher";

export interface PaxAnswer {
  /** The plain sentence (the payload's `answer`: copy, export, screen readers). */
  summary: string;
  card: HospitalAnswer;
  /** The "Understood as" line: how the question was read, with any spelling correction. */
  interpretation: string;
}

const AREA_CELL: Record<PaxArea, string> = { plant: "In plant", outside: "Outside plant", unclassified: "Not classified" };
const AREA_SENTENCE: Record<PaxArea, string> = { plant: "in the plant", outside: "outside the plant", unclassified: "area not classified" };
const AREA_ONLY: Record<PaxArea, string> = { plant: "in the plant", outside: "outside the plant", unclassified: "not classified" };

const WHAT_IS_PAX = {
  summary: "What is PAX?",
  text: "PAX is the land-line phone that works only inside DSP work areas. Its numbers have five digits and are kept by the Telecom department; this list is Telecom's. PAX numbers belong to departments and places, not to individual people.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const distinct = <T,>(xs: T[]): T[] => Array.from(new Set(xs));
const numbersOf = (rows: PaxRow[]) => distinct(rows.map((r) => r.number));
const labelsOf = (rows: PaxRow[]) => distinct(rows.map((r) => r.label));

function tableOf(rows: PaxRow[], areaFirst = false): HospitalTable {
  const sorted = sortPaxRows(rows, areaFirst);
  const withNote = sorted.some((r) => r.note.trim());
  return {
    columns: withNote ? ["PAX", "Name", "Area", "Note"] : ["PAX", "Name", "Area"],
    rows: sorted.map((r) => (withNote ? [r.number, r.label, AREA_CELL[r.area], r.note.trim()] : [r.number, r.label, AREA_CELL[r.area]])),
  };
}

/** Red points at the foot: a number on two names, a number whose area the rule cannot tell. Only where it applies. */
function notesFor(rows: PaxRow[]): string[] {
  const notes: string[] = [];
  for (const n of numbersOf(rows)) {
    const names = labelsOf(rows.filter((r) => r.number === n));
    if (names.length > 1) notes.push(`${n} is listed under ${names.length} names (${names.join("; ")}). Telecom can say which is current.`);
  }
  for (const n of numbersOf(rows.filter((r) => r.area === "unclassified"))) {
    notes.push(`The area of ${n} is not classified: its number fits neither the plant nor the outside-plant pattern.`);
  }
  return notes;
}

/** Up to three numbers are the headline itself; more are a count. */
const numbersHeadline = (rows: PaxRow[]): string => {
  const nums = numbersOf(sortPaxRows(rows));
  return nums.length <= 3 ? nums.join(" · ") : `${nums.length} PAX numbers`;
};

const quote = (s: string) => `“${s}”`;
const noteFromCorrections = (c: Array<[string, string]>) => (c.length ? ` Read ${c.map(([a, b]) => `${quote(a)} as ${quote(b)}`).join(", ")}.` : "");

function notFound(headline: string, title: string, sentence: string, interpretation: string, lines: string[] = [], rows: PaxRow[] = []): PaxAnswer {
  return {
    summary: sentence,
    interpretation,
    card: {
      title,
      headline: { text: headline, tone: "unknown" },
      status: { tone: "unknown", text: sentence },
      ...(rows.length ? { table: tableOf(rows) } : {}),
      ...(lines.length ? { lines } : {}),
      details: [WHAT_IS_PAX],
    },
  };
}

function found(headline: string, title: string, sentence: string, interpretation: string, rows: PaxRow[], extra: { lines?: string[]; areaFirst?: boolean } = {}): PaxAnswer {
  const notes = notesFor(rows);
  return {
    summary: sentence,
    interpretation,
    card: {
      title,
      headline: { text: headline, tone: "info" },
      status: { tone: "info", text: sentence },
      table: tableOf(rows, extra.areaFirst),
      ...(extra.lines?.length ? { lines: extra.lines } : {}),
      ...(notes.length ? { notes } : {}),
      details: [WHAT_IS_PAX],
    },
  };
}

const areaPhrase = (a: PaxArea | null) => (a ? `, ${AREA_ONLY[a]} only` : "");

/** The pure core: a plan, the rows of the directory, the words of the question. */
export function buildPaxAnswer(plan: PaxPlan, all: PaxRow[]): PaxAnswer | null {
  const rows = uniqueRows(all);

  // ---- a LIST or a COUNT of the whole directory (or one area of it) ----
  if (plan.kind === "list") {
    if (rows.length === 0) return notFound("Empty", "PAX directory", "No PAX numbers are stored in the directory yet.", "PAX directory");
    const shown = filterByArea(rows, plan.area);
    const interp = `PAX directory${areaPhrase(plan.area)}`;
    if (shown.length === 0) {
      return notFound("None", "PAX directory", `The directory holds no PAX number ${AREA_ONLY[plan.area as PaxArea]}.`, interp);
    }
    const nums = numbersOf(shown);
    const sentence = plan.area
      ? `${plural(nums.length, "PAX number", "PAX numbers")} ${AREA_ONLY[plan.area]}.`
      : `${plural(nums.length, "PAX number", "PAX numbers")} in the directory.`;
    const lines: string[] = [];
    if (!plan.area) {
      for (const a of ["plant", "outside", "unclassified"] as PaxArea[]) {
        const k = numbersOf(rows.filter((r) => r.area === a)).length;
        if (k > 0) lines.push(`${AREA_CELL[a]}: ${k}`);
      }
    }
    if (shown.length !== nums.length) lines.push(`${plural(shown.length, "entry", "entries")} in all: a number can be listed under two names.`);
    return found(plan.count ? String(nums.length) : `${nums.length} PAX numbers`, plan.count ? `PAX numbers${areaPhrase(plan.area) || " in the directory"}` : `PAX directory${areaPhrase(plan.area)}`, sentence, interp, shown, { lines, areaFirst: true });
  }

  // ---- a NUMBER: who has it ----
  if (plan.kind === "number") {
    const hits = matchByNumber(rows, plan.numbers);
    const asked = plan.numbers.join(", ");
    const interp = plan.numbers.some((n) => n.length < 5) ? `PAX numbers starting with ${asked}` : `Who has PAX ${asked}`;
    if (hits.length === 0) {
      const sentence = plan.numbers.some((n) => n.length < 5) ? `No PAX number starts with ${asked}.` : `PAX ${asked} is not in the Telecom directory.`;
      return notFound("Not found", `PAX ${asked}`, sentence, interp);
    }
    const area = filterByArea(hits, plan.area);
    if (area.length === 0) return notFound("Not found", `PAX ${asked}`, `PAX ${asked} is not ${AREA_ONLY[plan.area as PaxArea]}.`, interp, [], hits);
    const prefixAsked = plan.numbers.length === 1 && plan.numbers[0].length < 5;
    if (prefixAsked) {
      const nums = numbersOf(area);
      return found(`${nums.length} ${nums.length === 1 ? "number starts" : "numbers start"} with ${asked}`, `PAX numbers starting with ${asked}`, `${plural(nums.length, "PAX number starts", "PAX numbers start")} with ${asked}.`, interp, area);
    }
    const foundNums = numbersOf(area);
    const missing = plan.numbers.filter((n) => !foundNums.includes(n));
    const lines = missing.length ? [`Not in the directory: ${missing.join(", ")}`] : [];
    if (plan.numbers.length === 1) {
      const names = labelsOf(area);
      const r = area[0];
      const headline = names.length === 1 ? names[0] : `${names.length} names share ${asked}`;
      const sentence = names.length === 1 ? `PAX ${asked} is ${names[0]}, ${AREA_SENTENCE[r.area]}.` : `PAX ${asked} is listed under ${names.length} names: ${names.join(" and ")}.`;
      return found(headline, `Who has PAX ${asked}`, sentence, interp, area, { lines });
    }
    return found(`${foundNums.length} of ${plan.numbers.length} numbers found`, `Who has PAX ${asked}`, `${foundNums.length} of ${plan.numbers.length} numbers are in the directory.`, interp, area, { lines });
  }

  // ---- a NAME: its number ----
  // a FAULT goes to the complaint desk. The rows named "PAX Complain" come first (the "MRS Control (Electrical Complain)" line is the electrical desk, not the PAX one);
  // any other complaint row is the fallback; and words that match nothing ("not working in civil") never hide the desk: they are said as not used.
  let tokens = plan.tokens;
  let m = matchByName(rows, tokens, plan.exactOnly);
  let ignored: string[] = [];
  if (plan.fault) {
    const extra = plan.tokens;
    m = matchByName(rows, ["pax", "complain", ...extra], plan.exactOnly);
    tokens = ["pax", "complain", ...extra];
    if (m.rows.length === 0) { m = matchByName(rows, ["complain", ...extra], plan.exactOnly); tokens = ["complain", ...extra]; }
    if (m.rows.length === 0 && extra.length > 0) { m = matchByName(rows, ["pax", "complain"], plan.exactOnly); tokens = ["pax", "complain"]; ignored = extra; }
  }
  const asked = plan.fault ? plan.tokens.join(" ") || "complaint" : tokens.join(" ");
  const baseInterp = plan.fault ? "PAX complaint numbers (the Telecom complaint desk)" : `PAX number for ${quote(asked)}`;
  const interp = `${baseInterp}${areaPhrase(plan.area)}.${noteFromCorrections(m.corrections)}`.replace(/\.\./g, ".");
  const title = plan.fault ? "PAX complaint numbers" : `PAX number for ${quote(asked)}`;
  if (m.rows.length === 0) {
    const lines = m.closest.length ? [`Closest names in the directory: ${m.closest.join("; ")}`] : [];
    const sentence = plan.fault ? "The directory has no PAX complaint number." : `No PAX number matches ${quote(asked)} in the Telecom directory.`;
    return notFound("Not found", title, sentence, interp, lines);
  }
  const narrowed = filterByArea(m.rows, plan.area);
  if (narrowed.length === 0) {
    const sentence = `${plan.fault ? "The complaint desk" : labelsOf(m.rows).length === 1 ? labelsOf(m.rows)[0] : quote(asked)} has no PAX number ${AREA_ONLY[plan.area as PaxArea]}; the numbers it has are shown.`;
    return notFound("None", title, sentence, interp, [], m.rows);
  }
  const nums = numbersOf(narrowed);
  const notUsed = ignored.length ? [`Words not used: ${ignored.join(" ")}. The complaint numbers are the same for every department.`] : [];
  if (plan.count) {
    return found(String(nums.length), `PAX numbers for ${quote(asked)}${areaPhrase(plan.area)}`, `${plural(nums.length, "PAX number", "PAX numbers")} for ${quote(asked)}.`, interp, narrowed);
  }
  const sentence =
    narrowed.length === 1
      ? `${narrowed[0].label} — PAX ${narrowed[0].number}, ${AREA_SENTENCE[narrowed[0].area]}.${noteFromCorrections(m.corrections)}`
      : `${plural(narrowed.length, "entry matches", "entries match")} ${quote(asked)}${areaPhrase(plan.area)}: see the table.${noteFromCorrections(m.corrections)}`;
  return found(numbersHeadline(narrowed), title, sentence, interp, narrowed, { lines: notUsed });
}

/**
 * The entry point of the omnibar's PAX route. The question is read FIRST (pure, no database): only a question the route may take reads the table.
 * `load` reads the rows with the application's own connection (never the model's read-only role). Returns null when the question is not a PAX question.
 */
export async function answerPax(typed: string, load: () => Promise<PaxRow[]>): Promise<PaxAnswer | null> {
  const plan = planPaxQuery(typed);
  if (!plan) return null;
  let rows: PaxRow[];
  try {
    rows = await load();
  } catch {
    if (plan.claim !== "always") return null;
    return notFound("Not available", "PAX directory", "The PAX directory could not be read just now. Please try again in a moment.", "PAX directory");
  }
  const answer = buildPaxAnswer(plan, rows);
  if (!answer) return null;
  // a weak or bare-number question is ours only when it found something
  if (plan.claim === "ifFound" && answer.card.headline?.tone !== "info") return null;
  return answer;
}
