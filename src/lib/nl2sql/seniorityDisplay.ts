// src/lib/nl2sql/seniorityDisplay.ts
//
// global_seniority_rank is an INTERNAL sort key: grade level x 10,000 + the person's position within that grade.
// "40,121" means nothing to a reader, so it never reaches a screen, a table or a CSV. Wherever a list of people carries
// it, the column is replaced -- before anything is displayed or exported -- by what it MEANS:
//   executives      -> position_in_grade  (the order within the grade is real: earlier in HR's list = more senior)
//   non-executives  -> blank              (only the GRADE order is meaningful, never the order inside one grade)
// The rows are still SORTED by the real rank (the SQL does that); only the number is hidden.

export const POSITION_KEY = "position_in_grade";

interface PersonLike {
  ticketNo?: string | null;
  isExecutive?: boolean | null;
}

export function humanizeSeniority(
  columns: string[],
  rows: Array<Record<string, any>>,
  people: PersonLike[] | null | undefined,
): { columns: string[]; rows: Array<Record<string, any>> } {
  if (!people || !columns.includes("global_seniority_rank") || !columns.includes("ticket_no") || columns.includes(POSITION_KEY)) {
    return { columns, rows };
  }
  const byTicket = new Map<string, PersonLike>();
  for (const p of people) byTicket.set(String(p?.ticketNo ?? "").trim(), p);
  return {
    columns: columns.map((c) => (c === "global_seniority_rank" ? POSITION_KEY : c)),
    rows: rows.map((r) => {
      const out: Record<string, any> = {};
      for (const k of columns) {
        if (k === "global_seniority_rank") {
          const n = Number(r[k]);
          const p = byTicket.get(String(r.ticket_no ?? "").trim());
          out[POSITION_KEY] = p?.isExecutive === true && Number.isFinite(n) ? n % 10000 : null;
        } else {
          out[k] = r[k];
        }
      }
      return out;
    }),
  };
}
