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
  /** The one-line verdict: open / closed / not known / information. */
  status?: { tone: "open" | "closed" | "unknown" | "info"; text: string };
  /** Short points, shown as bullets under the table (the important words only). */
  lines?: string[];
  /** A helpful pointer shown in its own box, for example the Emergency Department when the OPD is closed; one point per line (separated by a line break). */
  suggestion?: string;
  table?: HospitalTable;
  /** More tables under the first, each with a caption (for example "Sitting on Tuesday, 27 October 2026"). */
  extraTables?: { title: string; table: HospitalTable }[];
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
