// src/lib/ingestion/schedule/ingest.ts
//
// Reading a health check-up schedule, checking it against HR and storing it: ONE definition, used by the circular UPLOAD (so a schedule is ready the
// moment its circular is saved, with nobody running anything) and by scripts/import-health-checkups.ts (dry runs, reports, a re-import by hand).
// They cannot disagree, because they are the same code.
//
// Everything outside the logic (the OCR engines, the database) is passed in, so it is tested without a network or a browser.
//
// THE RULES (the same whoever calls):
//   * A schedule is STORED only if nothing looked wrong: no problems at all (a row without a date, a group of an odd size, dates out of order, a month
//     that could not be read, no rows). Anything else is reported and left for a person (the import tool shows why); the circular itself is never affected.
//   * Storing REPLACES the circular's rows (delete + insert), so reading the same circular again gives the same result, never doubled rows.
//   * Running out of time is not a failure of the circular: the caller saves the circular and the schedule is read later by the tool.

import { extractSchedule, ScheduleTimeBudgetError, type ExtractedSchedule, type ScheduleDeps } from "./extractSchedule";
import { fixCodesByDepartment, verifyAgainstHr, type DeptPair, type HrEmployee, type VerifiedRow } from "./importSchedule";

/** Runs one SQL statement and returns its rows. (An EntityManager, a pg client or a test double can all be adapted to this.) */
export type Sql = (text: string, params?: unknown[]) => Promise<any[]>;

/** Runs `fn` in one database transaction (BEGIN ... COMMIT; ROLLBACK if it throws). */
export type InTransaction = <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;

// ----------------------------------------------------------------------------------------------------------------------------------- the OCR

export interface ScheduleOcr {
  deps: ScheduleDeps;
  close(): Promise<void>;
}

/**
 * The four English OCR engines the reading uses: a whole page, one line of digits (the printed date), a column of digits, and one number cell.
 * Each is its own engine on purpose: an engine learns from the pages it reads, and these are the settings the accuracy was measured with.
 * `workerOptions` is for tests only (a local language-data folder).
 */
export async function createScheduleOcr(workerOptions?: Record<string, unknown>): Promise<ScheduleOcr> {
  const mod: any = await import("tesseract.js");
  const Tesseract: any = mod.default ?? mod;
  const made: any[] = [];
  const make = async (params: Record<string, string>) => {
    const w = workerOptions ? await Tesseract.createWorker("eng", 1, workerOptions) : await Tesseract.createWorker("eng");
    made.push(w);
    await w.setParameters(params);
    return w;
  };
  const close = async () => {
    await Promise.all(made.map((w) => Promise.resolve(w.terminate()).catch(() => undefined)));
  };
  try {
    const page = await make({ tessedit_pageseg_mode: "3" });
    const date = await make({ tessedit_char_whitelist: "0123456789-./ ", tessedit_pageseg_mode: "7" });
    const digits = await make({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "6" });
    const cell = await make({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7" });
    return {
      deps: {
        ocrPageTsv: async (png) => ((await page.recognize(png, {}, { text: false, tsv: true })).data.tsv as string) || "",
        ocrDateText: async (png) => ((await date.recognize(png)).data.text as string) || "",
        ocrDigitsTsv: async (png) => ((await digits.recognize(png, {}, { text: false, tsv: true })).data.tsv as string) || "",
        ocrDigitCell: async (png) => ((await cell.recognize(png)).data.text as string) || "",
      },
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}

// -------------------------------------------------------------------------------------------------------------------------------------- HR

export interface HrContext {
  hr: HrEmployee[];
  deptPairs: DeptPair[];
}

/** The HR directory (EVERYONE, not only non-executives: a person on an old roster may have been promoted since and is still the same person) and
 *  which department code belongs to which department name (used to check the codes read from the pages). */
export async function loadHrContext(sql: Sql): Promise<HrContext> {
  const hrRows = await sql(`SELECT ticket_no, name, name_codes, department_code FROM nlq.employees`);
  const hr: HrEmployee[] = hrRows.map((r: any) => ({
    ticket: String(r.ticket_no).trim(),
    name: String(r.name),
    codes: (r.name_codes ?? []).map(String),
    departmentCode: r.department_code == null ? null : String(r.department_code),
  }));
  const pairRows = await sql(`SELECT DISTINCT department_code::text AS code, department AS name FROM nlq.employees WHERE department_code IS NOT NULL AND department IS NOT NULL`);
  const deptPairs: DeptPair[] = pairRows.map((r: any) => ({ code: String(r.code), name: String(r.name) }));
  return { hr, deptPairs };
}

// ------------------------------------------------------------------------------------------------------------------------- prepare, decide

export interface PreparedSchedule {
  month: { month: number; year: number } | null;
  rows: VerifiedRow[];
  groups: Array<{ date: string | null; rows: number }>;
  /** rows whose department code was changed because it did not belong to the department printed on the row */
  codeFixes: VerifiedRow[];
  /** anything that looked wrong: the schedule is NOT stored while this is not empty */
  problems: string[];
  counts: { verified: number; corrected: number; unverified: number };
}

/** Checks every row: the department code against the printed department, then the people against HR. Reads the HR phonetic codes of the printed names from the database. */
export async function prepareSchedule(extracted: ExtractedSchedule, ctx: HrContext, sql: Sql): Promise<PreparedSchedule> {
  const names = extracted.rows.map((r) => r.name);
  const codeRows = names.length ? await sql(`SELECT nlq.name_codes_of(n) AS codes FROM unnest($1::text[]) WITH ORDINALITY AS t(n, i) ORDER BY i`, [names]) : [];
  const printed: string[][] = codeRows.map((r: any) => (r.codes ?? []).map(String));
  const withCodes = fixCodesByDepartment(extracted.rows, ctx.deptPairs);
  const codeFixes = withCodes.filter((r) => r.codeNote);
  const rows = verifyAgainstHr(withCodes, printed, ctx.hr);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const problems = [...extracted.warnings];
  if (rows.length === 0) problems.push("no employee rows were read");
  if (!extracted.scheduleMonth) problems.push("the month this schedule is for could not be read from the page title");
  return {
    month: extracted.scheduleMonth,
    rows,
    groups: extracted.groups,
    codeFixes: codeFixes as VerifiedRow[],
    problems,
    counts: { verified: count("verified"), corrected: count("corrected"), unverified: count("unverified") },
  };
}

/** The one rule for storing: only a schedule with no problems at all. */
export function scheduleVerdict(p: PreparedSchedule): { apply: boolean; problems: string[] } {
  return { apply: p.problems.length === 0 && p.month !== null && p.rows.length > 0, problems: p.problems };
}

// ------------------------------------------------------------------------------------------------------------------------------------ store

/** Replaces the circular's rows in public.health_checkup_schedule (delete, then insert in batches). The caller owns the transaction. */
export async function storeSchedule(sql: Sql, circularId: number, p: PreparedSchedule): Promise<void> {
  if (!p.month) throw new Error("cannot store a schedule whose month is unknown");
  const sm = p.month;
  await sql(`DELETE FROM public.health_checkup_schedule WHERE circular_id = $1`, [circularId]);
  for (let i = 0; i < p.rows.length; i += 150) {
    const batch = p.rows.slice(i, i + 150);
    const vals: unknown[] = [];
    const ph = batch.map((r, k) => {
      const b = k * 15;
      const note = [r.codeNote, r.statusNote].filter(Boolean).join("; ") || null;
      vals.push(circularId, sm.year, sm.month, r.seq, r.page, r.ticket, r.ticketNo, r.name, r.departmentCode == null ? null : parseInt(r.departmentCode, 10), r.department, r.checkupDate, r.datePrinted, r.dateNote, r.status, note);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15})`;
    });
    await sql(
      `INSERT INTO public.health_checkup_schedule (circular_id, schedule_year, schedule_month, seq, page_number, ticket_printed, ticket_no, name_printed, department_code_printed, department_printed, checkup_date, date_printed, date_note, status, status_note) VALUES ${ph.join(",")}`,
      vals,
    );
  }
}

// ----------------------------------------------------------------------------------------------------------------------------- the upload's stage

export type StageStatus = "ready" | "needs-review" | "timeout" | "failed";

export interface ScheduleStage {
  status: StageStatus;
  /** present when the pages were read and checked (status ready or needs-review) */
  prepared: PreparedSchedule | null;
  problems: string[];
  seconds: number;
  error?: string;
}

/**
 * Reads the schedule from the circular's pages and checks it, WITHOUT storing anything. Never throws: whatever happens, the caller gets a status
 * (ready / needs-review / timeout / failed) and saves the circular regardless.
 *   pages       every page image of the circular, in order (so page numbers are the circular's real page numbers; pages that are not rosters are skipped)
 *   deadlineAt  Date.now() value after which the reading stops with status "timeout"
 *   ocr         the engines; created (and closed) here when not given
 */
export async function runScheduleStage(args: {
  pages: Buffer[];
  sql: Sql;
  deadlineAt: number;
  ocr?: ScheduleOcr;
  hr?: HrContext;
  workerOptions?: Record<string, unknown>;
  /** for tests: replaces the real page reading */
  extract?: typeof extractSchedule;
}): Promise<ScheduleStage> {
  const t0 = Date.now();
  const seconds = () => Math.round((Date.now() - t0) / 100) / 10;
  let own: ScheduleOcr | null = null;
  try {
    const ocr = args.ocr ?? (own = await createScheduleOcr(args.workerOptions));
    const extracted = await (args.extract ?? extractSchedule)(args.pages, { ...ocr.deps, shouldStop: () => Date.now() > args.deadlineAt });
    const ctx = args.hr ?? (await loadHrContext(args.sql));
    const prepared = await prepareSchedule(extracted, ctx, args.sql);
    const verdict = scheduleVerdict(prepared);
    return { status: verdict.apply ? "ready" : "needs-review", prepared, problems: verdict.problems, seconds: seconds() };
  } catch (e) {
    if (e instanceof ScheduleTimeBudgetError) return { status: "timeout", prepared: null, problems: [e.message], seconds: seconds() };
    return { status: "failed", prepared: null, problems: [], seconds: seconds(), error: String((e as Error)?.message ?? e).split("\n")[0] };
  } finally {
    if (own) await own.close();
  }
}

/** Stores a ready schedule in its own transaction. Throws if the stage is not ready or the database refuses (the caller logs it; the circular stays). */
export async function applyScheduleStage(inTransaction: InTransaction, circularId: number, stage: ScheduleStage): Promise<{ stored: number }> {
  if (stage.status !== "ready" || !stage.prepared) throw new Error(`only a schedule that is ready is stored (this one is ${stage.status})`);
  const prepared = stage.prepared;
  await inTransaction(async (sql) => storeSchedule(sql, circularId, prepared));
  return { stored: prepared.rows.length };
}

// -------------------------------------------------------------------------------------------------------------------------------------- the log

export type IngestKind = "health-schedule" | "holiday-list" | "general";
export type IngestStatus = "applied" | "needs-review" | "timeout" | "failed" | "saved";

/** What a stage found, in a form for the log (small: never the rows themselves). */
export function stageDetail(stage: ScheduleStage, rosterPages: number[]): Record<string, unknown> {
  const p = stage.prepared;
  return {
    rosterPages,
    seconds: stage.seconds,
    ...(p
      ? {
          month: p.month ? `${p.month.year}-${String(p.month.month).padStart(2, "0")}` : null,
          rows: p.rows.length,
          days: p.groups.length,
          ...p.counts,
          departmentCodesChanged: p.codeFixes.length,
        }
      : {}),
    problems: stage.problems.slice(0, 12),
    ...(stage.error ? { error: stage.error } : {}),
  };
}

/** Writes what the upload decided. Best effort: the log must never be the reason an upload fails (the table may not exist yet). Returns whether it was written. */
export async function logIngest(sql: Sql, circularId: number, kind: IngestKind, status: IngestStatus, detail: Record<string, unknown>): Promise<boolean> {
  try {
    await sql(`INSERT INTO public.circular_ingest_log (circular_id, kind, status, detail) VALUES ($1, $2, $3, $4::jsonb)`, [circularId, kind, status, JSON.stringify(detail)]);
    return true;
  } catch (e) {
    console.warn(`INGEST LOG: not written (${String((e as Error)?.message ?? e).split("\n")[0]}); run src/lib/nl2sql/sql/09_circular_ingest_log.sql to keep this history`);
    return false;
  }
}
