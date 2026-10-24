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

/** A column that REPEATS the grand total on every row of a list of people ("Total count 16"): it is noise on a card and on a table row (the headline says it), so it is removed.
 *  Only a list with a ticket column, at least two rows, a name like total / count / cnt / ..._count and ONE value in every row; a count that differs per row is never touched. */
const TOTAL_COLUMN = /^(total|grand)|(^|_)(count|cnt)$/i;
export function dropRepeatedTotals(columns: string[], rows: Array<Record<string, any>>): { columns: string[]; rows: Array<Record<string, any>> } {
  if (rows.length < 2 || !columns.includes("ticket_no")) return { columns, rows };
  const drop = new Set(columns.filter((c) => TOTAL_COLUMN.test(c) && rows.every((r) => String(r[c]) === String(rows[0][c]))));
  if (drop.size === 0) return { columns, rows };
  return {
    columns: columns.filter((c) => !drop.has(c)),
    rows: rows.map((r) => {
      const o = { ...r };
      for (const c of drop) delete o[c];
      return o;
    }),
  };
}

/** Everything a list of people needs before it is shown or exported: no internal rank, and a cohort column. */
export function presentPeople(
  columns: string[],
  rows: Array<Record<string, any>>,
  people: PersonLike[] | null | undefined,
): { columns: string[]; rows: Array<Record<string, any>> } {
  const a = humanizeSeniority(columns, rows, people);
  const c = addCohortColumn(a.columns, a.rows, people);
  return dropRepeatedTotals(c.columns, c.rows);
}

/**
 * When the model lists the columns it wants (a display hint), that order wins and any column it did not mention is added at the
 * END. The cohort column is added by the system, so it would always land last. This slips it into the hint right after
 * "designation" (else after "name"), where it reads naturally. A hint that already mentions cohort, or names neither, is untouched.
 */
export function withCohortInHint(hint: unknown, columns: string[]): unknown {
  if (!hint || typeof hint !== "object" || Array.isArray(hint)) return hint;
  const h: any = hint;
  if (!Array.isArray(h.columns) || !columns.includes("cohort")) return hint;
  const keyOf = (e: unknown) => String(typeof e === "string" ? e : (e as any)?.key ?? "").toLowerCase();
  if (h.columns.some((e: unknown) => keyOf(e) === "cohort")) return hint;
  let at = h.columns.findIndex((e: unknown) => keyOf(e) === "designation");
  if (at < 0) at = h.columns.findIndex((e: unknown) => keyOf(e) === "name");
  if (at < 0) return hint;
  return { ...h, columns: [...h.columns.slice(0, at + 1), { key: "cohort", label: "Cohort" }, ...h.columns.slice(at + 1)] };
}
