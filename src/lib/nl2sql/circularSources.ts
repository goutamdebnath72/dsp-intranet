// src/lib/nl2sql/circularSources.ts
//
// The "Source" line under a health check-up answer: which circular(s) the rows were read from, and on which page each listed person stands, so that
// a click opens the circular in the viewer at that page. The question-answering model is not asked for any of this (it would be one more thing for it
// to forget); the SYSTEM looks it up from what the answer returned: the circular label is a column of every check-up answer, and the page comes
// from the same view. Anything that goes wrong gives NO source line; the answer itself is never affected.
import type { CircularSource } from "./clientTypes";
import { circularLabel } from "../search/circularLabels";

export type RunQuery = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface SourceInfo {
  sources: CircularSource[];
  /** names of the people in the answer that HR does not know (their ticket is shown as printed), in the order of the answer */
  unconfirmed: string[];
}

/** The sentence under the Source line when someone listed is not confirmed against HR; null when everybody is. */
export function unconfirmedNote(unconfirmed: string[], listed: number): string | null {
  const n = unconfirmed.length;
  if (n === 0) return null;
  if (listed === 1) return "This person is not in the HR directory; the ticket shown is as printed in the circular.";
  const shown = unconfirmed.slice(0, 5).join(", ");
  const more = n > 5 ? ` and ${n - 5} more` : "";
  return `${n} of the ${listed} people listed ${n === 1 ? "is" : "are"} not in the HR directory (the ticket shown is as printed in the circular): ${shown}${more}.`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : v == null ? null : String(v));

export async function buildCircularSources(columns: string[], rows: Array<Record<string, unknown>>, run: RunQuery): Promise<CircularSource[]> {
  return (await buildSourceInfo(columns, rows, run)).sources;
}

export async function buildSourceInfo(columns: string[], rows: Array<Record<string, unknown>>, run: RunQuery): Promise<SourceInfo> {
  const none: SourceInfo = { sources: [], unconfirmed: [] };
  try {
    if (!columns.includes("circular") || rows.length === 0) return none;
    // the circulars in the answer, in the order they first appear
    const labels: string[] = [];
    for (const r of rows) {
      const l = str(r.circular);
      if (l && !labels.includes(l)) labels.push(l);
    }
    if (labels.length === 0) return none;

    const meta = await run(
      `SELECT DISTINCT circular, circular_id, circular_title FROM nlq.health_checkups WHERE circular = ANY($1::text[])`,
      [labels],
    );
    const byLabel = new Map<string, { id: number; title: string }>();
    for (const m of meta) {
      const label = str(m.circular);
      const id = Number(m.circular_id);
      if (label && Number.isInteger(id) && id > 0 && !byLabel.has(label)) byLabel.set(label, { id, title: str(m.circular_title) ?? label });
    }

    // the page of each person in the answer: found by ticket when the answer has one, else by name
    const tickets = [...new Set(rows.map((r) => str(r.ticket_no)).filter((x): x is string => !!x))];
    const names = [...new Set(rows.map((r) => str(r.name)).filter((x): x is string => !!x))];
    let found: Array<Record<string, unknown>> = [];
    if (tickets.length || names.length) {
      found = await run(
        `SELECT circular, ticket_no, name, page_number, verified FROM nlq.health_checkups WHERE circular = ANY($1::text[]) AND (ticket_no = ANY($2::text[]) OR name = ANY($3::text[]))`,
        [labels, tickets, names],
      );
    }
    const pagesOf = new Map<string, Set<number>>();
    const unconfirmed: string[] = [];
    for (const r of rows) {
      const label = str(r.circular);
      if (!label) continue;
      const t = str(r.ticket_no);
      const n = str(r.name);
      let notConfirmed = false;
      for (const f of found) {
        if (str(f.circular) !== label) continue;
        const same = t ? str(f.ticket_no) === t : n ? str(f.name) === n : false;
        if (!same) continue;
        if (f.verified === false) notConfirmed = true;
        const p = Number(f.page_number);
        if (Number.isInteger(p) && p > 0) {
          if (!pagesOf.has(label)) pagesOf.set(label, new Set());
          pagesOf.get(label)!.add(p);
        }
      }
      if (notConfirmed) unconfirmed.push(n ?? t ?? "(unnamed)");
    }

    const out: CircularSource[] = [];
    for (const label of labels) {
      const m = byLabel.get(label);
      if (!m) continue;
      out.push({ circularId: m.id, label, title: m.title, pages: [...(pagesOf.get(label) ?? [])].sort((a, b) => a - b) });
    }
    return { sources: out, unconfirmed };
  } catch {
    return none;
  }
}

/**
 * A sentence for when an answer is empty: health check-up schedules whose circular was uploaded but whose rows are NOT in the system (the upload
 * could not finish reading them, see circular_ingest_log), so a person is told why instead of being left to wonder. null when there are none, and when
 * anything goes wrong (the log table may not exist yet).
 */
export async function pendingScheduleNote(run: RunQuery): Promise<string | null> {
  try {
    const rows = await run(
      `SELECT DISTINCT ON (l.circular_id) l.circular_id, c."serialNumber" AS serial, EXTRACT(YEAR FROM c."publishedAt")::int AS year, c.headline
       FROM public.circular_ingest_log l JOIN public.circulars c ON c.id = l.circular_id
       WHERE l.kind = 'health-schedule' AND l.status IN ('needs-review', 'timeout', 'failed')
         AND NOT EXISTS (SELECT 1 FROM public.health_checkup_schedule h WHERE h.circular_id = l.circular_id)
       ORDER BY l.circular_id, l.id DESC`,
      [],
    );
    const labels = rows.map((r) => circularLabel(r.serial as number | null, r.year as number | null) ?? `"${String(r.headline ?? "").slice(0, 60)}"`);
    if (labels.length === 0) return null;
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    return labels.length === 1
      ? `The health check-up schedule of ${list} has not been read yet, so it is not included.`
      : `The health check-up schedules of ${list} have not been read yet, so they are not included.`;
  } catch {
    return null;
  }
}

/**
 * The ticket numbers a health check-up question is about: the ones the SQL that ran filters on (ticket_no = '228757', or an IN list), and, when the
 * SQL has none, six-digit numbers in the question itself. At most three.
 */
export function ticketsAsked(question: string, sql: string): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const m of (sql || "").matchAll(/ticket_no\s*(?:=|IN)\s*\(?\s*((?:'\d{6}'\s*,?\s*)+)/gi)) for (const t of m[1].match(/\d{6}/g) ?? []) add(t);
  if (out.length === 0) for (const t of (question || "").match(/\b\d{6}\b/g) ?? []) add(t);
  return out.slice(0, 3);
}

const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The schedule a question asked about, as the schedules are named ("January 2025"), read from the SQL that ran; null when the SQL does not name one. */
export function scheduleAsked(sql: string): string | null {
  const text = sql || "";
  const named = /\bschedule\s*=\s*'([A-Za-z]+ \d{4})'/i.exec(text);
  if (named) return named[1];
  const y = /schedule_year\s*=\s*(\d{4})/i.exec(text);
  const m = /schedule_month_no\s*=\s*(\d{1,2})/i.exec(text);
  if (!y || !m) return null;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 ? `${MONTH_FULL[month - 1]} ${y[1]}` : null;
}

/**
 * For an EMPTY health check-up answer about a ticket: said the way a person would say it. What was asked comes first ("Ticket 228757 is not on the
 * January 2025 health check-up list."), then who the ticket belongs to (the HR directory) and every list it IS on, so that an empty answer is never a
 * dead end. null when there is nothing to say or anything goes wrong (the reason is written to the server log; the answer then stays as it was).
 */
export async function ticketLookupNote(run: RunQuery, tickets: string[], askedLabel: string | null = null): Promise<string | null> {
  try {
    const parts: string[] = [];
    for (const t of tickets) {
      const hr = await run(`SELECT name, department FROM nlq.employees WHERE ticket_no = $1 LIMIT 1`, [t]);
      const on = await run(
        `SELECT schedule, to_char(checkup_date::date, 'DD Mon YYYY') AS d, circular, name FROM nlq.health_checkups WHERE ticket_no = $1 ORDER BY schedule_year, schedule_month_no, checkup_date`,
        [t],
      );
      const lead = `Ticket ${t} is not on ${askedLabel ? `the ${askedLabel} health check-up list` : "that health check-up list"}.`;
      const items = on.map((r) => `the ${String(r.schedule)} list, on ${String(r.d)} (${String(r.circular)})`);
      const where = items.join("; ");
      const who = hr[0] ? `${String(hr[0].name)}${hr[0].department ? `, department ${String(hr[0].department)}` : ""}` : null;
      if (who && items.length) parts.push(`${lead} It belongs to ${who}. This ticket is on ${where}.`);
      else if (who) parts.push(`${lead} It belongs to ${who}, but it is not on any health check-up list in the system.`);
      else if (items.length) parts.push(`${lead} The name printed for it is ${String(on[0].name)}. This ticket is on ${where}. It is not in the HR directory.`);
      else parts.push(`${lead} It is not in the HR directory and is not on any other health check-up list in the system.`);
    }
    return parts.length ? parts.join(" ") : null;
  } catch (e) {
    // The answer stays as it was, but the reason is written to the server log: a silent failure here once hid a wrong query.
    console.warn(`TICKET LOOKUP: could not add who the ticket belongs to (${String((e as Error)?.message ?? e).split("\n")[0]})`);
    return null;
  }
}

/**
 * The whole text of an EMPTY health check-up answer. `person` is the ticket sentence (or null), `askedLabel` the schedule the question named (or null),
 * `have` the schedules that exist. The list of schedules is given only when it helps: when the month asked about does not exist, or when nothing
 * else can be said.
 */
export function emptyScheduleAnswer(args: { person: string | null; askedLabel: string | null; have: string[] }): string {
  const { person, askedLabel, have } = args;
  if (have.length === 0) return `No health check-up list has been loaded yet.${person ? ` ${person}` : ""}`;
  const lists = have.join(", ");
  const missing = askedLabel && !have.includes(askedLabel) ? `There is no health check-up list for ${askedLabel} in the system.` : "";
  if (person) return missing ? `${person} ${missing} The lists in the system are: ${lists}.` : person;
  return `Nothing was found. ${missing ? `${missing} ` : ""}The health check-up lists in the system are: ${lists}.`;
}
