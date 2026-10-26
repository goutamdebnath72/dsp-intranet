// src/lib/hospital/types.ts
// What the hospital route sends to the screen (step 51a). The same shape is used by the backend payload and by the card.

export interface HospitalTable {
  columns: string[];
  rows: string[][];
}

import type { DepartmentAsk } from "../nl2sql/departmentAsk";

export interface HospitalAnswer {
  title: string;
  /** The small badge beside the title of an answer about a DATE: Open (green), Closed (red), Not known (amber). */
  badge?: { tone: "open" | "closed" | "unknown"; text: string };
  /** The ONE clean answer, shown FIRST, big and bold (step 57b): the value asked for ("DNB(MEDICINE)"), a Yes (green) or a No (red), a name, a count. The title under it becomes a small caption. */
  headline?: { text: string; tone: "yes" | "no" | "info" | "unknown" };
  /** The one-line verdict: open / closed / not known / information. */
  status?: { tone: "open" | "closed" | "unknown" | "info"; text: string };
  /** The ONE thing the person most wants to see after a No (when is he available / when does the unit sit): an eye-catching banner right under the verdict. */
  highlight?: string;
  /** The question that the buttons under the card answer (shown last, above the buttons). */
  prompt?: string;
  /** Short points, shown as bullets under the table (the important words only). */
  lines?: string[];
  /** A helpful pointer shown in its own box, for example the Emergency Department when the OPD is closed; one point per line (separated by a line break). */
  suggestion?: string;
  table?: HospitalTable;
  /** More tables under the first, each with a caption (for example "Sitting on Tuesday, 27 October 2026"). */
  extraTables?: { title: string; table: HospitalTable }[];
  /** Longer explanations folded away until the person asks (one <details> line each): the rule behind an answer, a long list of names (step 57b). */
  details?: { summary: string; text: string }[];
  /** Points shown in red bullets at the foot: the OPD and card registration hours, a doctor who has retired ... */
  notes?: string[];
}

/** What the engine returns: a plain-text summary (the payload's `answer`) and the card. */
export interface HospitalResult {
  summary: string;
  card: HospitalAnswer;
  /** Set when the name fits several doctors: the app ASKS which one (radio buttons, mode "one") instead of showing the card. The same ask the department question uses. */
  ask?: DepartmentAsk;
}
