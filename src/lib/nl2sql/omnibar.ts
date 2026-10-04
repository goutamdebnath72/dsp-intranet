// src/lib/nl2sql/omnibar.ts
//
// THE OMNIBAR'S EMPLOYEE QUESTIONS NOW GO THROUGH THE LANGUAGE MODEL (it writes the read-only SQL).
//
// Order of events for a question typed in the omnibar (semantic mode):
//   1. Holiday questions that the existing deterministic holiday parser recognises are answered by it,
//      exactly as before (a separate, verified feature; it is not a filter on employee questions).
//   2. EVERYTHING else is handed to the model, with no keyword gate. The model decides:
//        - an employee question  -> SQL -> answer (count / people cards / table), with "Understood as",
//          the SQL, the departments covered and a tick/cross;
//        - not about employees (circulars, policies ...) -> the app falls through to circular search;
//        - about employees but needs data we do not hold (salary ...) -> a plain explanation;
//        - ambiguous -> a clarifying question.
//   3. Safety net: if the model path is unavailable (provider limit or outage) or cannot produce a working
//      query, the previous rule-based employee engine answers instead, so the omnibar never goes dark.
//
// Kill switch: NL2SQL_OMNIBAR_ENABLED=false sends employee questions to the previous engine only.

import type { AnalyticsPayload } from "@/lib/employees/analytics";
import type { EmployeeResult } from "@/lib/search/employeeSearch";
import type { LlmFn, PipelineResult, SqlClient } from "./types";
import type { Nl2SqlExtras } from "./clientTypes";
import { answerFromVerified, answerQuestion, type PipelineExtra } from "./pipeline";
import { loadLogRow } from "./log";
import { isReasonCode, retryHint, verifiedMinConfirms, type AnswerSource, type ReasonCode } from "./learning";

export type OmnibarPayload = AnalyticsPayload & {
  nl2sql?: Nl2SqlExtras;
  /** Which route produced this answer (the footer's Yes/No is recorded against it). */
  source?: AnswerSource;
  /** 1 for the first answer, 2 for the second attempt after a "No" ... */
  attempt?: number;
  /** The nl2sql_log row to rate, also for explanations / clarifying questions that carry no SQL. */
  feedbackLogId?: number | null;
};

/** A "No" on an earlier answer, asking for another attempt. */
export interface RetryInfo {
  /** nl2sql_log row of the rejected answer (null when it was not model-written: holiday, old engine, circular). */
  logId: number | null;
  reason: ReasonCode | null;
  note: string | null;
  /** The attempt number of the answer that was rejected (1 = the first answer). */
  attempt: number;
}

/**
 * Reads a retry request from the search URL: ra = attempt number of the rejected answer (presence of ra means
 * "this is a retry"), rl = its nl2sql_log id, rr = the reason code, rn = the person's own words.
 */
export function parseRetry(sp: URLSearchParams): RetryInfo | null {
  const attempt = Number(sp.get("ra"));
  if (!sp.has("ra") || !Number.isInteger(attempt) || attempt < 1 || attempt > 9) return null;
  const logId = Number(sp.get("rl"));
  const reason = sp.get("rr");
  const note = (sp.get("rn") || "").trim().slice(0, 300);
  return {
    logId: Number.isInteger(logId) && logId > 0 ? logId : null,
    reason: isReasonCode(reason) ? reason : null,
    note: note || null,
    attempt,
  };
}

/** After this many attempts the system stops and records the case for review. */
export const MAX_ATTEMPTS = 3;

export interface OmnibarDeps {
  enabled: boolean;
  llm: LlmFn;
  withClient: <T>(fn: (c: SqlClient) => Promise<T>) => Promise<T>;
  /** The existing deterministic holiday answer, or null when the question is not a holiday question. */
  holiday: (q: string) => Promise<AnalyticsPayload | null>;
  /** The previous rule-based employee engine (safety net). */
  legacy: (q: string) => Promise<AnalyticsPayload | null>;
  /** Different people who must confirm an answer before it is served without the model. */
  verifiedMin: number;
}

const PERSON_COLUMNS = new Set([
  "ticket_no", "name", "designation", "department", "sail_pno", "cohort", "id",
  "department_code", "designation_code", "designation_track", "rank_order", "grade_id",
  "department_id", "global_seniority_rank", "within_grade_position",
]);

// ---- people cards ------------------------------------------------------------------------------

function maskMobile(m: string | null): string | null {
  if (!m) return null;
  const digits = m.replace(/\D/g, "");
  if (digits.length < 4) return "xxxx";
  return `${digits.slice(0, 6)}${"x".repeat(Math.max(0, digits.length - 6))}`;
}
function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at <= 0) return "xxxxxx";
  return `xxxxxx${e.slice(at)}`;
}

function rowToEmployee(r: any): EmployeeResult {
  return {
    id: r.user_id || `roster:${r.id}`,
    type: "employee",
    name: r.name,
    ticketNo: String(r.ticket_no || "").trim(),
    sailPNo: r.sail_pno || null,
    designation: r.designation_title || null,
    department: r.dept_name || null,
    mobileMasked: maskMobile(r.contactNo || null),
    emailMasked: maskEmail(r.email || null),
    hasMobile: !!r.contactNo,
    hasEmail: !!r.email,
    isExecutive: r.cohort === "executive",
    matchKind: "id",
    score: 0,
  } as EmployeeResult;
}

/**
 * The omnibar's people cards need more than the four columns the model selects (P.No, contact flags,
 * the executive badge, the id used by the masked "reveal" button). They are looked up here, by ticket
 * number, in the order the model's SQL returned them (its seniority order). Contact values are masked
 * exactly as the existing search masks them; the real values still come only through the existing
 * reveal endpoint. This runs with the application's normal database role, not the model's read-only one.
 */
export async function peopleFor(client: SqlClient, tickets: string[]): Promise<EmployeeResult[]> {
  const unique = Array.from(new Set(tickets.map((t) => String(t).trim()).filter(Boolean))).slice(0, 100);
  if (!unique.length) return [];
  const res = await client.query(
    `SELECT er.id, er.ticket_no, er.sail_pno, er.name, er.cohort, er.user_id,
            dg.title AS designation_title, sd.name AS dept_name, u."contactNo" AS "contactNo", u.email
       FROM public.employee_roster er
       JOIN public.designation_grade dg ON dg.id = er.designation_grade_id
       LEFT JOIN public.sail_department sd ON sd.id = er.sail_department_id
       LEFT JOIN public."user" u ON u.id = er.user_id
      WHERE er.ticket_no = ANY($1::text[])
      ORDER BY array_position($1::text[], er.ticket_no::text)`,
    [unique],
  );
  return res.rows.map(rowToEmployee);
}

// ---- mapping a model answer onto the shapes the omnibar already renders -----------------------------

type Ok = Extract<PipelineResult, { ok: true }>;

export function toPayload(res: Ok, people: EmployeeResult[] | null, userKey: string | null, attempt = 1): OmnibarPayload {
  const { columns, rows, total, truncated } = res.data;
  const extras: Nl2SqlExtras = {
    logId: res.logId,
    userKey,
    sql: res.sql,
    confidence: res.confidence,
    attempts: res.attempts,
    scope: res.scope && res.scope.total > 0 ? { departments: res.scope.departments.map((d) => d.name), total: res.scope.total } : null,
    ...(res.source === "cache" ? { verifiedBy: res.verifiedBy } : {}),
    ...(attempt > 1 ? { retryAttempt: attempt } : {}),
  };
  const tag = { source: res.source as AnswerSource, attempt, feedbackLogId: res.logId };
  const table = { columns, rows, total, truncated };

  // a list of people
  if (columns.includes("ticket_no") && people) {
    if (columns.some((c) => !PERSON_COLUMNS.has(c))) extras.table = table; // extra columns: show them too
    return {
      kind: "count",
      count: total,
      answer: `${total.toLocaleString()} ${total === 1 ? "person" : "people"} found.`,
      people,
      listTruncated: truncated,
      interpretation: res.understoodAs,
      nl2sql: extras,
      ...tag,
    };
  }

  // a single number
  if (rows.length === 1 && columns.length === 1) {
    const v = Number(rows[0][columns[0]]);
    if (Number.isFinite(v)) {
      return { kind: "count", count: v, answer: res.understoodAs, nl2sql: extras, ...tag };
    }
  }

  // anything else: a table
  extras.table = table;
  return {
    kind: "total",
    count: total,
    answer: `${total.toLocaleString()} ${total === 1 ? "row" : "rows"}.`,
    interpretation: res.understoodAs,
    nl2sql: extras,
    ...tag,
  };
}

const isInfrastructureFailure = (msg: string) => /could not be reached|could not prepare/i.test(msg);

// ---- the flow ------------------------------------------------------------------------------------

const GIVE_UP_MESSAGE =
  "I still could not get this right after a few tries. Your feedback has been saved for the team. Try rephrasing the question, or search the documents instead.";

export async function runOmnibar(q: string, userKey: string | null, deps: OmnibarDeps, retry: RetryInfo | null = null): Promise<OmnibarPayload | null> {
  const attempt = retry ? retry.attempt + 1 : 1;
  const tagLegacy = (p: AnalyticsPayload | null): OmnibarPayload | null => (p ? { ...p, source: "legacy", attempt } : null);

  if (!deps.enabled) return tagLegacy(await deps.legacy(q).catch(() => null));

  // ---- a "No" on an earlier answer: choose a DIFFERENT way to answer, from the person's reason ----
  if (retry) {
    if (retry.reason === "wanted_documents") return null; // different route: the app continues with circular search
    if (retry.attempt >= MAX_ATTEMPTS) return { kind: "clarify", answer: GIVE_UP_MESSAGE, source: "none", attempt };
  }

  if (!retry) {
    // 1. holiday questions keep their deterministic answer
    const holiday = await deps.holiday(q).catch(() => null);
    if (holiday) return { ...holiday, source: "holiday", attempt };

    // 2. a VERIFIED answer (confirmed by enough different people, never rejected): re-run it, no model call
    const verified = await answerFromVerified(q, userKey, { llm: deps.llm, withClient: deps.withClient, exec: { rowLimit: 100 } }, deps.verifiedMin).catch(() => null);
    if (verified) return okToPayload(verified, userKey, deps, attempt);
  }

  // 3. the model writes the SQL (on a retry: told what was rejected and why)
  let extra: PipelineExtra | undefined;
  if (retry) {
    const prior = retry.logId ? await deps.withClient((c) => loadLogRow(c, retry.logId as number)).catch(() => null) : null;
    extra = { retryOf: retry.logId, rejectedSql: prior?.sql ? [prior.sql] : [], hint: retryHint(retry.reason, retry.note) };
  }
  const res = await answerQuestion(q, userKey, { llm: deps.llm, withClient: deps.withClient, exec: { rowLimit: 100 } }, extra);

  if (res.ok) return okToPayload(res, userKey, deps, attempt);

  switch (res.kind) {
    case "out_of_scope":
      return null; // not an employee question: the app continues with circular search
    case "clarify":
    case "unanswerable":
      return {
        kind: "clarify",
        answer: res.message,
        ...(res.understoodAs && res.kind === "unanswerable" ? { interpretation: res.understoodAs } : {}),
        source: "nl2sql",
        attempt,
        feedbackLogId: res.logId,
      };
    default: {
      const old = tagLegacy(await deps.legacy(q).catch(() => null));
      if (old) return old;
      if (isInfrastructureFailure(res.message)) return null; // provider down: let circular search still work
      return { kind: "clarify", answer: res.message, source: "nl2sql", attempt, feedbackLogId: res.logId };
    }
  }
}

async function okToPayload(res: Ok, userKey: string | null, deps: OmnibarDeps, attempt: number): Promise<OmnibarPayload> {
  let people: EmployeeResult[] | null = null;
  if (res.data.columns.includes("ticket_no")) {
    const tickets = res.data.rows.map((r) => String(r.ticket_no));
    people = await deps.withClient((c) => peopleFor(c, tickets)).catch(() => null);
  }
  return toPayload(res, people, userKey, attempt);
}

/** Entry point used by the search route: wires the real model, database and existing engines. */
export async function answerOmnibar(q: string, userKey: string | null, retry: RetryInfo | null = null): Promise<OmnibarPayload | null> {
  const { groqLlm } = await import("./llm");
  const { withDefaultClient } = await import("./db");
  return runOmnibar(q, userKey, {
    enabled: process.env.NL2SQL_OMNIBAR_ENABLED !== "false",
    verifiedMin: verifiedMinConfirms(),
    llm: groqLlm(),
    withClient: withDefaultClient,
    holiday: async (qq) => {
      const { parseHolidayIntent } = await import("@/lib/holidays/parser");
      const { DateTime } = await import("luxon");
      const intent = await parseHolidayIntent(qq, DateTime.now());
      if (!intent) return null;
      const { answerAnalytics } = await import("@/lib/employees/analytics");
      return answerAnalytics(qq);
    },
    legacy: async (qq) => {
      const { answerEmployeeQuery } = await import("@/lib/employees/queryOrchestrator");
      return answerEmployeeQuery(qq);
    },
  }, retry);
}
