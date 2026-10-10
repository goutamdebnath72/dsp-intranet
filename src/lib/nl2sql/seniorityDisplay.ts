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

/**
 * A list of people gets a "cohort" column (Executive / Non-executive) when the SQL did not return one: without it a table or CSV
 * cannot tell the two groups apart (a designation such as "S-9" is not self-explanatory). It goes right after "designation"
 * (else after "name", else last). A person who cannot be identified gets a blank, never a guess.
 */
export function addCohortColumn(
  columns: string[],
  rows: Array<Record<string, any>>,
  people: PersonLike[] | null | undefined,
): { columns: string[]; rows: Array<Record<string, any>> } {
  if (!people || !columns.includes("ticket_no") || columns.includes("cohort")) return { columns, rows };
  const byTicket = new Map<string, PersonLike>();
  for (const p of people) byTicket.set(String(p?.ticketNo ?? "").trim(), p);
  const at = columns.includes("designation") ? columns.indexOf("designation") + 1 : columns.includes("name") ? columns.indexOf("name") + 1 : columns.length;
  const outColumns = [...columns.slice(0, at), "cohort", ...columns.slice(at)];
  const outRows = rows.map((r) => {
    const p = byTicket.get(String(r.ticket_no ?? "").trim());
    const cohort = p?.isExecutive === true ? "Executive" : p?.isExecutive === false ? "Non-executive" : null;
    const out: Record<string, any> = {};
    for (const k of outColumns) out[k] = k === "cohort" ? cohort : r[k];
    return out;
  });
  return { columns: outColumns, rows: outRows };
}

/** Everything a list of people needs before it is shown or exported: no internal rank, and a cohort column. */
export function presentPeople(
  columns: string[],
  rows: Array<Record<string, any>>,
  people: PersonLike[] | null | undefined,
): { columns: string[]; rows: Array<Record<string, any>> } {
  const a = humanizeSeniority(columns, rows, people);
  return addCohortColumn(a.columns, a.rows, people);
}
