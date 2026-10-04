// src/lib/nl2sql/clientTypes.ts
//
// Types shared by the server (omnibar.ts) and the browser (Nl2SqlAnswerExtras.tsx, useOmniSearch.ts).
// Deliberately free of any server-only import so the browser bundle can use it.

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
  /** Departments the answer's department filter really matched (computed from the SQL by the system). */
  scope: { departments: string[]; total: number } | null;
  /** Tabular result, present for breakdowns and any answer that is not a plain count or list of people. */
  table?: Nl2SqlTable;
  /** Set when the answer is a VERIFIED answer: how many different people confirmed it (the model was not called). */
  verifiedBy?: number;
  /** 2, 3 ... when this is another attempt after a "No". */
  retryAttempt?: number;
}
