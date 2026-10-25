// src/lib/hospital/types.ts
// What the hospital route sends to the screen (step 51a). The same shape is used by the backend payload and by the card.

export interface HospitalTable {
  columns: string[];
  rows: string[][];
}

export interface HospitalAnswer {
  title: string;
  /** The one-line verdict: open / closed / not known / information. */
  status?: { tone: "open" | "closed" | "unknown" | "info"; text: string };
  lines?: string[];
  /** A helpful pointer shown in its own box, for example the Emergency Department when the OPD is closed. */
  suggestion?: string;
  table?: HospitalTable;
  /** Caveats shown in small amber text (out-of-date list, incomplete closure list ...). */
  notes?: string[];
}

/** What the engine returns: a plain-text summary (the payload's `answer`) and the card. */
export interface HospitalResult {
  summary: string;
  card: HospitalAnswer;
}
