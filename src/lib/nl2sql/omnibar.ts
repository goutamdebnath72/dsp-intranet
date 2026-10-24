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
import { buildSourceInfo, emptyScheduleAnswer, pendingScheduleNote, scheduleAsked, ticketLookupNote, ticketsAsked, unconfirmedNote } from "./circularSources";
import { comparisonVerdict } from "./rankingCheck";
import { peopleHeadline } from "./medicalCadre";
import { askWhichDepartment } from "./departmentAsk";
import { isDoctorPerson, isPhdHolder, titleFor, withTitlesInRows } from "@/lib/employees/honorific";
import { presentPeople, withCohortInHint } from "./seniorityDisplay";
import { withoutBlindScope } from "@/lib/employees/unresolvedScope";
import { resolveDisplay, formatCell, type ResolvedDisplay } from "./display";
import { PAGE_SIZE } from "./paging";
import type { QueryResultData } from "./types";
import { answerFromVerified, answerQuestion, type PipelineExtra } from "./pipeline";
import { loadLogRow } from "./log";
import { isReasonCode, retryHint, verifiedMinConfirms, type AnswerSource, type ReasonCode } from "./learning";
import { friendlyUnanswerable } from "@/lib/search/dataGapRule";

export type OmnibarPayload = AnalyticsPayload & {
  nl2sql?: Nl2SqlExtras;
  /** Which route produced this answer (the footer's Yes/No is recorded against it). */
  source?: AnswerSource;
  /** 1 for the first answer, 2 for the second attempt after a "No" ... */
  attempt?: number;
  /** The nl2sql_log row to rate, also for explanations / clarifying questions that carry no SQL. */
  feedbackLogId?: number | null;
  /** The structured data cannot answer this ("unanswerable"): the route may try the circulars before showing the explanation (step 38c). */
  unanswerable?: boolean;
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
  /** Front-path gate (src/lib/search/frontGate.ts): the question cannot be an employee question, so skip the model (and the
   *  old engine) and let the app continue with circular search. The holiday parser and verified answers still go first. */
  skipModel?: boolean;
}

// Columns the person card already shows (the codes appear in brackets after the designation / department).
const CARD_SHOWS = new Set(["ticket_no", "name", "designation", "department", "sail_pno", "cohort", "id", "department_code", "designation_code"]);

/** Every OTHER column the answer returned goes on the person's card as a labelled chip, so nothing the SQL returned is lost on the cards. */
export function withExtraFields(people: EmployeeResult[], display: ResolvedDisplay | null, rows: any[]): EmployeeResult[] {
  if (!display) return people;
  const extra = display.columns.filter((c) => !CARD_SHOWS.has(c.key));
  if (!extra.length) return people;
  const byTicket = new Map<string, any>();
  for (const r of rows) byTicket.set(String(r?.ticket_no ?? "").trim(), r);
  return people.map((p) => {
    const r = byTicket.get(String(p.ticketNo ?? "").trim());
    if (!r) return p;
    const fields = extra
      .filter((c) => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== "")
      .map((c) => ({ label: c.label, value: formatCell(r[c.key], c.kind) }));
    return fields.length ? { ...p, extraFields: fields } : p;
  });
}

/**
 * The person cards for one page of an answer's rows ("Show more"): same cards as the first page (codes, extra-field chips).
 * `labelColumns` is the column titles the page already shows, [{key, label}]; display.ts sanitises it like any other hint.
 */
export async function peoplePage(client: SqlClient, data: QueryResultData, labelColumns?: unknown): Promise<EmployeeResult[]> {
  let people = await peopleFor(client, data.rows.map((r) => String(r.ticket_no)));
  people = withDisplayCodes(people, data.columns, data.rows);
  const hz = presentPeople(data.columns, data.rows, people);
  const display = resolveDisplay({ columns: labelColumns }, hz.columns, hz.rows, true);
  return withExtraFields(people, display, hz.rows);
}

/** When the answer includes the department / designation CODE (the person asked for it), put the code on that person's card. */
export function withDisplayCodes(people: EmployeeResult[], columns: string[], rows: any[]): EmployeeResult[] {
  const wantDept = columns.includes("department_code");
  const wantDesig = columns.includes("designation_code");
  if (!wantDept && !wantDesig) return people;
  const byTicket = new Map<string, any>();
  for (const r of rows) byTicket.set(String(r?.ticket_no ?? "").trim(), r);
  return people.map((p) => {
    const r = byTicket.get(String(p.ticketNo ?? "").trim());
    if (!r) return p;
    const out: EmployeeResult = { ...p };
    if (wantDept && r.department_code != null) out.departmentCode = String(r.department_code);
    if (wantDesig && r.designation_code != null) out.designationCode = String(r.designation_code);
    return out;
  });
}

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
    designationTrack: r.designation_track || null,
    isDoctor: isDoctorPerson(r.designation_track, r.doctor_override) || undefined,
    title: titleFor(r.ticket_no, r.designation_track, r.doctor_override),
    phd: isPhdHolder(r.ticket_no, r.designation_track, r.doctor_override) || undefined,
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
            dg.title AS designation_title, dg.track AS designation_track, (to_jsonb(er) ->> 'doctor_override')::boolean AS doctor_override, sd.name AS dept_name, u."contactNo" AS "contactNo", u.email
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
  const { total, truncated } = res.data;
  const rawRows = res.data.rows;
  // The internal rank never reaches a screen, table or CSV: it becomes "Position in grade" (executives) or blank (see seniorityDisplay.ts).
  const presented = presentPeople(res.data.columns, rawRows, people);
  const columns = presented.columns;
  // a doctor's name is shown with "Dr." before it (the stored name has none): in the table and the CSV as well as on the card
  const rows = withTitlesInRows(presented.rows, people);
  const extras: Nl2SqlExtras = {
    logId: res.logId,
    userKey,
    sql: res.sql,
    confidence: res.confidence,
    attempts: res.attempts,
    elapsedMs: res.elapsedMs,
    scope: res.scope && res.scope.total > 0 ? { departments: res.scope.departments.map((d) => d.name), total: res.scope.total } : null,
    ...(res.source === "cache" ? { verifiedBy: res.verifiedBy } : {}),
    ...(attempt > 1 ? { retryAttempt: attempt } : {}),
  };
  const tag = { source: res.source as AnswerSource, attempt, feedbackLogId: res.logId };
  const table = { columns, rows, total, truncated };
  // How to show it: the model's suggestion, verified against the real result (or a layout chosen from the data's shape).
  // Every column the SQL returned stays visible. A single plain number needs no table.
  const hasPeopleList = columns.includes("ticket_no") && !!people;
  const tableRequested = /\b(table|tabular|spreadsheet|grid)\b/i.test(String((res as any).question ?? ""));
  const display = resolveDisplay(withCohortInHint((res as any).display, columns), columns, rows, hasPeopleList, { tableRequested });
  extras.display = display;
  if (display) extras.table = table;
  if (res.data.pageable && truncated && res.logId != null) extras.canPage = true;

  // a list of people
  if (columns.includes("ticket_no") && people) {
    const verdictText = comparisonVerdict(String((res as any).question ?? ""), rawRows as any, people);
    return {
      kind: "count",
      count: verdictText ? undefined : total,
      // A comparison ("who is more senior, A or B") STATES its answer, computed from the data (never by the model). The sentence
      // is then the whole headline: a bare row count above it ("2") would be a number with nothing to say what it counts.
      answer: verdictText ?? peopleHeadline(total, truncated, people),
      people: withExtraFields(people, display, rows),
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

  // anything else: a table (or a chart)
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

    // 1b. a department word that means more than one thing ("garage", "refractory"): ASK which, with checkboxes, instead of guessing: no model call (step 49a)
    const ask = askWhichDepartment(q);
    if (ask) return { kind: "clarify", answer: ask.message, ask, source: "nl2sql", attempt };

    // 2. a VERIFIED answer (confirmed at least once, never rejected): re-run it, no model call
    const verified = await answerFromVerified(q, userKey, { llm: deps.llm, withClient: deps.withClient, exec: { rowLimit: PAGE_SIZE } }, deps.verifiedMin).catch(() => null);
    if (verified) return okToPayload(verified, userKey, deps, attempt);
  }

  // 2b. front-path gate: not an employee question, so do not spend a model call on it (the app continues with circular search)
  if (deps.skipModel && !retry) return null;

  // 3. the model writes the SQL (on a retry: told what was rejected and why)
  let extra: PipelineExtra | undefined;
  if (retry) {
    const prior = retry.logId ? await deps.withClient((c) => loadLogRow(c, retry.logId as number)).catch(() => null) : null;
    extra = { retryOf: retry.logId, rejectedSql: prior?.sql ? [prior.sql] : [], hint: retryHint(retry.reason, retry.note) };
  }
  const res = await answerQuestion(q, userKey, { llm: deps.llm, withClient: deps.withClient, exec: { rowLimit: PAGE_SIZE } }, extra);

  if (res.ok) return okToPayload(res, userKey, deps, attempt);

  switch (res.kind) {
    case "out_of_scope":
      return null; // not an employee question: the app continues with circular search
    case "clarify":
    case "unanswerable":
      return {
        kind: "clarify",
        answer: res.kind === "unanswerable" ? friendlyUnanswerable(res.message) : res.message,
        ...(res.kind === "unanswerable" ? { unanswerable: true } : {}),
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
  // A health check-up SCHEDULE (nlq.health_checkups) is shown as the table it is -- ticket, name, department, DATE, circular -- not as person
  // cards (which would show who, but not when).
  const isSchedule = /\bhealth_checkups\b/i.test(String(res.sql ?? ""));
  if (res.data.columns.includes("ticket_no") && !isSchedule) {
    const tickets = res.data.rows.map((r) => String(r.ticket_no));
    people = await deps.withClient((c) => peopleFor(c, tickets)).catch(() => null);
    if (people) people = withDisplayCodes(people, res.data.columns, res.data.rows);
  }
  const payload = toPayload(res, people, userKey, attempt);
  // A schedule question with NO row ("ticket 228757 in the January 2025 schedule" when that ticket is only in January 2026) is not just "0 rows":
  // it says which schedules exist, so the person can see whether the month was wrong or the person is not on the list.
  if (isSchedule && res.data.total === 0) {
    const have = await deps
      .withClient(async (c) => (await c.query(`SELECT DISTINCT schedule, schedule_year, schedule_month_no FROM nlq.health_checkups ORDER BY schedule_year, schedule_month_no`)).rows as Array<{ schedule: string }>)
      .catch(() => null);
    // A question about a TICKET that matches nothing is never a dead end: say who the ticket belongs to and which schedules it IS on.
    const asked = ticketsAsked(String((res as { question?: unknown }).question ?? ""), String(res.sql ?? ""));
    const askedLabel = scheduleAsked(String(res.sql ?? ""));
    const person = asked.length ? await ticketLookupNote((sql, params) => deps.withClient(async (c) => (await c.query(sql, params)).rows as Array<Record<string, unknown>>), asked, askedLabel) : null;
    if (have) {
      payload.answer = emptyScheduleAnswer({ person, askedLabel, have: have.map((h) => h.schedule) });
      if (payload.nl2sql) payload.nl2sql.plainAnswer = true; // a sentence, not a count: the screen does not draw its big "0" above it
    }
    // a schedule whose circular was uploaded but could not be read yet: say so, so the person knows why it is missing
    const pending = await pendingScheduleNote((sql, params) => deps.withClient(async (c) => (await c.query(sql, params)).rows as Array<Record<string, unknown>>));
    if (have && pending) payload.answer += ` ${pending}`;
  }
  // The circular(s) the answer was read from, for the "Source" line (a click opens the circular at the page of the people listed). Looked up by the
  // system, not asked of the model; if anything goes wrong there is simply no source line.
  if (isSchedule && res.data.total > 0 && payload.nl2sql) {
    const info = await buildSourceInfo(res.data.columns, res.data.rows as Array<Record<string, unknown>>, (sql, params) => deps.withClient(async (c) => (await c.query(sql, params)).rows as Array<Record<string, unknown>>)).catch(() => ({ sources: [], unconfirmed: [] as string[] }));
    if (info.sources.length) {
      payload.nl2sql.sources = info.sources;
      // Who is not confirmed against HR is said ONLY when it applies (a column of "Yes" on every row would be noise for nearly every answer)
      const note = unconfirmedNote(info.unconfirmed, res.data.rows.length);
      if (note) payload.nl2sql.sourceNote = note;
    }
  }
  return payload;
}

/** Entry point used by the search route: wires the real model, database and existing engines. */
export async function answerOmnibar(q: string, userKey: string | null, retry: RetryInfo | null = null, opts: { skipModel?: boolean } = {}): Promise<OmnibarPayload | null> {
  const { groqLlm } = await import("./llm");
  const { withDefaultClient } = await import("./db");
  return runOmnibar(q, userKey, {
    enabled: process.env.NL2SQL_OMNIBAR_ENABLED !== "false",
    verifiedMin: verifiedMinConfirms(),
    skipModel: opts.skipModel,
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
      // a department the question names but nobody can find must not become "everybody" (step 44d)
      return withoutBlindScope(qq, await answerEmployeeQuery(qq));
    },
  }, retry);
}
