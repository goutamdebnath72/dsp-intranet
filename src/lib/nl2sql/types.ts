// src/lib/nl2sql/types.ts
//
// EXPERIMENT (29 Sep 2026): natural-language -> read-only SQL, written by the
// LLM itself. Everything under src/lib/nl2sql, src/app/api/nl2sql and
// src/app/nl2sql-lab is NEW and ISOLATED: it imports nothing from the
// omnibar's employee-query engine and nothing imports it. The existing files
// (parser.ts, namePredicate.ts, queryOrchestrator.ts ...) are untouched and
// dormant with respect to this feature.

/** Minimal DB client the executor needs -- injected, so tests can use a plain
 *  `pg` Client and production can use a dedicated connection. */
export interface SqlClient {
  query(text: string, params?: any[]): Promise<{ rows: any[]; fields?: { name: string }[] }>;
}

/** What the LLM must return. */
export interface LlmPlan {
  /** One read-only SELECT, or null when the question can't be answered. */
  sql: string | null;
  /** Plain-English restatement shown to the person ("Understood as"). */
  understood_as: string;
  confidence: "high" | "medium" | "low";
  /** Set when the question is too ambiguous to answer safely. */
  needs_clarification?: string | null;
  /** Set when sql is null: why the data can't answer this. */
  unanswerable_reason?: string | null;
}

export interface QueryResultData {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Total rows the query produces (rows may be capped for display). */
  total: number;
  truncated: boolean;
}

export type PipelineResult =
  | {
      ok: true;
      question: string;
      sql: string;
      understoodAs: string;
      confidence: LlmPlan["confidence"];
      data: QueryResultData;
      attempts: number;
      elapsedMs: number;
      logId: number | null;
    }
  | {
      ok: false;
      kind: "clarify" | "unanswerable" | "error";
      question: string;
      message: string;
      sql?: string | null;
      understoodAs?: string;
      attempts: number;
      elapsedMs: number;
      logId: number | null;
    };

/** LLM adapter: takes the full prompt text, returns the raw model text. */
export type LlmFn = (prompt: string) => Promise<string>;
