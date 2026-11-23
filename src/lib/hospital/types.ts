// src/lib/hospital/types.ts
// What the hospital route sends to the screen (step 51a). The backend payload and the card use the same shape.

export interface HospitalTable {
  columns: string[];
  rows: string[][];
  /** Optional, one per row: I ask this question when the FIRST cell of that row is pressed (a department of the list opens its own OPD). null = not pressable. */
  asks?: (string | null)[];
}

import type { DepartmentAsk } from "../nl2sql/departmentAsk";

export interface HospitalAnswer {
  title: string;
  /** I show a small badge beside the title of an answer about a DATE: Open (green), Closed (red), Not known (amber). */
  badge?: { tone: "open" | "closed" | "unknown"; text: string };
  /** The ONE clean answer, shown FIRST, big and bold (step 57b): the value asked for ("DNB(MEDICINE)"), a Yes (green) or a No (red), a name, a count. I turn the title under it into a small caption. */
  headline?: { text: string; tone: "yes" | "no" | "info" | "unknown" };
  /** I keep the verdict to one line: open / closed / not known / information. */
  status?: { tone: "open" | "closed" | "unknown" | "info"; text: string };
  /** The ONE thing the person most wants to see after a No (when is he available / when does the unit sit): I show an eye-catching banner for it right under the verdict. */
  highlight?: string;
  /** The question that the buttons under the card answer (I show it last, above the buttons). */
  prompt?: string;
  /** Short points, shown as bullets under the table; I keep only the important words. */
  lines?: string[];
  /** A helpful pointer that I show in its own box, for example the Emergency Department when the OPD is closed; one point per line (separated by a line break). */
  suggestion?: string;
  table?: HospitalTable;
  /** I can add more tables under the first, each with a caption (for example "Sitting on Tuesday, 27 October 2026"). */
  extraTables?: { title: string; table: HospitalTable }[];
  /** Longer explanations that I fold away until the person asks (one <details> line each): the rule behind an answer, a long list of names (step 57b). */
  details?: { summary: string; text: string }[];
  /** Points that I show in red bullets at the foot: the OPD and card registration hours, a doctor who has retired ... */
  notes?: string[];
}

/** The engine returns a plain-text summary (the payload's `answer`) and the card. */
export interface HospitalResult {
  summary: string;
  card: HospitalAnswer;
  /** I set this when the name fits several doctors: the app ASKS which one (radio buttons, mode "one") instead of showing the card. It is the same ask the department question uses. */
  ask?: DepartmentAsk;
}
