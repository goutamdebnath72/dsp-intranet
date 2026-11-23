// src/lib/nl2sql/types.ts
//
// EXPERIMENT (29 Sep 2026): natural-language -> read-only SQL, written by the
// LLM itself. Everything under src/lib/nl2sql, src/app/api/nl2sql and
// src/app/nl2sql-lab is NEW and ISOLATED: it imports nothing from the
// omnibar's employee-query engine and nothing imports it. I left the existing files
// (parser.ts, namePredicate.ts, queryOrchestrator.ts ...) untouched; they are
// dormant with respect to this feature.

/**
 * The minimal DB client the executor needs. It is injected, so tests can use a plain
 *  `pg` Client and production can use a dedicated connection.
 */
export interface SqlClient {
  query(text: string, params?: any[]): Promise<{ rows: any[]; fields?: { name: string }[] }>;
}

/** This is what I require the LLM to return. */
export interface LlmPlan {
  /** One read-only SELECT; null means the question can't be answered. */
  sql: string | null;
  /** A plain-English restatement shown to the person ("Understood as"). */
  understood_as: string;
  confidence: "high" | "medium" | "low";
  /** I set this when the question is too ambiguous to answer safely. */
  needs_clarification?: string | null;
  /** Set when sql is null, to say why the data can't answer this. */
  unanswerable_reason?: string | null;
  /** Set to true when the question is not about employees at all (circulars, policies, holidays ...). */
  out_of_scope?: boolean;
  /** Only the model's optional SUGGESTION for presenting the result: display.ts verifies it, since anything may be in here. */
  display?: unknown;
}

export interface QueryResultData {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Total rows the query produces; the rows I show may be capped for display. */
  total: number;
  /** True when more rows exist beyond this page. */
  truncated: boolean;
  /** True when the query has a total order, so I can fetch a further page consistently (paging.ts). */
  pageable?: boolean;
}

/** The departments an answer's department filter matched; the system computes them from the SQL. */
export interface DepartmentScope {
  departments: { code: number; name: string }[];
  total: number;
}

export type PipelineResult =
  | {
      ok: true;
      question: string;
      sql: string;
      understoodAs: string;
      confidence: LlmPlan["confidence"];
      data: QueryResultData;
      /** Departments covered by the answer, or null when none or unknown. */
      scope: DepartmentScope | null;
      /** The model's unverified presentation suggestion (absent for verified answers); see display.ts. */
      display?: unknown;
      /** 'nl2sql' = the model wrote the SQL just now; 'cache' = a VERIFIED answer that I re-ran without the model. */
      source: "nl2sql" | "cache";
      /** For source 'cache': how many confirmations this answer has. */
      verifiedBy?: number;
      /** Set when nobody was found and I replaced the name words with the nearest real spellings (nameSpelling.ts): the sentence that says so. */
      spellingNote?: string;
      attempts: number;
      elapsedMs: number;
      logId: number | null;
    }
  | {
      ok: false;
      kind: "clarify" | "unanswerable" | "out_of_scope" | "error";
      question: string;
      message: string;
      sql?: string | null;
      understoodAs?: string;
      attempts: number;
      elapsedMs: number;
      logId: number | null;
    };

/** LLM adapter: takes the full prompt text and returns the raw model text. */
export type LlmFn = (prompt: string) => Promise<string>;
