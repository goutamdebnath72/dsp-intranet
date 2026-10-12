// src/lib/nl2sql/circularSources.ts
//
// The "Source" line under a health check-up answer: which circular(s) the rows were read from, and on which page each listed person stands, so that
// a click opens the circular in the viewer at that page. The question-answering model is not asked for any of this (it would be one more thing for it
// to forget); the SYSTEM looks it up from what the answer returned: the circular label is a column of every check-up answer, and the page comes
// from the same view. Anything that goes wrong gives NO source line; the answer itself is never affected.
import type { CircularSource } from "./clientTypes";

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
