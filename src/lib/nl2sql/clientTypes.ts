// src/lib/nl2sql/clientTypes.ts
//
// Types shared by the server (omnibar.ts) and the browser (Nl2SqlAnswerExtras.tsx, useOmniSearch.ts).
// Deliberately free of any server-only import so the browser bundle can use it.

import type { ResolvedDisplay } from "./display";

export interface Nl2SqlTable {
  columns: string[];
  rows: Record<string, unknown>[];
  /** True number of rows the query produces (rows may be capped for display). */
  total: number;
  truncated: boolean;
}

/** Extra information that travels with an answer written by the language model. */
export interface Nl2SqlExtras {
  /** Row in public.nl2sql_log, used by the tick/cross. */
  logId: number | null;
  /** The asker (ticket number) the log row belongs to; echoed back with the tick/cross. */
  userKey: string | null;
  /** The exact SQL the model wrote (shown collapsed, so a reader can check it). */
  sql: string;
  confidence: string;
  attempts: number;
  /** How long the whole answer took (model call(s) + database), in milliseconds. */
  elapsedMs?: number;
  /** Departments the answer's department filter really matched (computed from the SQL by the system). */
  scope: { departments: string[]; total: number } | null;
  /** The rows and columns the SQL returned, present for every answer except a single plain number. */
  table?: Nl2SqlTable;
  /** True when more rows exist beyond the ones sent and "Show more" can fetch them (a signed-in person, 100 at a time). */
  canPage?: boolean;
  /** How to present them: the model's suggestion VERIFIED against the real result (display.ts), or a layout chosen from the data's shape. */
  display?: ResolvedDisplay | null;
  /** Set when the answer is a VERIFIED answer: how many confirmations it has (the model was not called). */
  verifiedBy?: number;
  /** 2, 3 ... when this is another attempt after a "No". */
  retryAttempt?: number;
}
