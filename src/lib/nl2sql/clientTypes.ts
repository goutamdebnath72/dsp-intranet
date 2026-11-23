// src/lib/nl2sql/clientTypes.ts
//
// Types shared by the server (omnibar.ts) and the browser (Nl2SqlAnswerExtras.tsx, useOmniSearch.ts).
// I keep this file free of any server-only import so that the browser bundle can use it.

import type { ResolvedDisplay } from "./display";

export interface Nl2SqlTable {
  columns: string[];
  rows: Record<string, unknown>[];
  /** The true number of rows the query produces; the rows themselves may be capped for display. */
  total: number;
  truncated: boolean;
}

/** This holds the extra information that travels with an answer written by the language model. */
/** A circular an answer was read from, for the "Source" line under the answer; a click opens it in the circular viewer. */
export interface CircularSource {
  /** public.circulars.id: what the viewer opens */
  circularId: number;
  /** Looks like "Circular 003 (2024)": the number the archive shows, and its year */
  label: string;
  /** the circular's headline */
  title: string;
  /** 1-based pages of the circular on which the people in the answer are listed: the viewer scrolls to the first and marks them all. Empty means unknown. */
  pages: number[];
}

export interface Nl2SqlExtras {
  /** The row in public.nl2sql_log that the tick/cross uses. */
  logId: number | null;
  /** The asker (ticket number) the log row belongs to; I echo it back with the tick/cross. */
  userKey: string | null;
  /** The exact SQL the model wrote; I show it collapsed, so a reader can check it. */
  sql: string;
  confidence: string;
  attempts: number;
  /** How long the whole answer took, in milliseconds: model call(s) plus database. */
  elapsedMs?: number;
  /** The departments the answer's department filter really matched, computed from the SQL by the system. */
  scope: { departments: string[]; total: number } | null;
  /** The rows and columns the SQL returned; present for every answer except a single plain number. */
  table?: Nl2SqlTable;
  /** True when more rows exist beyond the ones sent and "Show more" can fetch them: this is for a signed-in person, 100 at a time. */
  canPage?: boolean;
  /** How to present them: the model's suggestion VERIFIED against the real result (display.ts), or a layout I choose from the data's shape. */
  display?: ResolvedDisplay | null;
  /** Set only when the answer is a VERIFIED answer; it holds how many confirmations it has. In that case I do not call the model. */
  verifiedBy?: number;
  /** Holds 2, 3 ... when this is another attempt after a "No". */
  retryAttempt?: number;
  /** The circular(s) a health check-up answer was read from: one per circular, in the order they appear in the answer. */
  sources?: CircularSource[];
  /** True when `answer` is a sentence written for this question (an empty health check-up answer), not a row count; the screen then leaves out the big number above it. */
  plainAnswer?: boolean;
  /** I show this with the Source line when someone listed is not in the HR directory (their ticket is as printed in the circular). Absent when everybody is. */
  sourceNote?: string;
  /** What I took a department word in the question to mean ("Refractory" = all three Refractory departments ...); shown under "Departments covered" (step 55a). */
  departmentNote?: string;
  /** I set this when nobody was found and the name words were replaced by the nearest real spellings: "No name is spelled “Gosyami” (nearest: Goswami): ..." (step 55b). */
  spellingNote?: string;
}
