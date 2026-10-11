// src/lib/nl2sql/circularSources.ts
//
// The "Source" line under a health check-up answer: which circular(s) the rows were read from, and on which page each listed person stands, so that
// a click opens the circular in the viewer at that page. The question-answering model is not asked for any of this (it would be one more thing for it
// to forget); the SYSTEM looks it up from what the answer returned: the circular label is a column of every check-up answer, and the page comes
// from the same view. Anything that goes wrong gives NO source line; the answer itself is never affected.
import type { CircularSource } from "./clientTypes";

export type RunQuery = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : v == null ? null : String(v));

export async function buildCircularSources(columns: string[], rows: Array<Record<string, unknown>>, run: RunQuery): Promise<CircularSource[]> {
  try {
    if (!columns.includes("circular") || rows.length === 0) return [];
    // the circulars in the answer, in the order they first appear
    const labels: string[] = [];
    for (const r of rows) {
      const l = str(r.circular);
      if (l && !labels.includes(l)) labels.push(l);
    }
    if (labels.length === 0) return [];

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
        `SELECT circular, ticket_no, name, page_number FROM nlq.health_checkups WHERE circular = ANY($1::text[]) AND page_number IS NOT NULL AND (ticket_no = ANY($2::text[]) OR name = ANY($3::text[]))`,
        [labels, tickets, names],
      );
    }
    const pagesOf = new Map<string, Set<number>>();
    for (const r of rows) {
      const label = str(r.circular);
      if (!label) continue;
      const t = str(r.ticket_no);
      const n = str(r.name);
      for (const f of found) {
        if (str(f.circular) !== label) continue;
        const same = t ? str(f.ticket_no) === t : n ? str(f.name) === n : false;
        const p = Number(f.page_number);
        if (same && Number.isInteger(p) && p > 0) {
          if (!pagesOf.has(label)) pagesOf.set(label, new Set());
          pagesOf.get(label)!.add(p);
        }
      }
    }

    const out: CircularSource[] = [];
    for (const label of labels) {
      const m = byLabel.get(label);
      if (!m) continue;
      out.push({ circularId: m.id, label, title: m.title, pages: [...(pagesOf.get(label) ?? [])].sort((a, b) => a - b) });
    }
    return out;
  } catch {
    return [];
  }
}
