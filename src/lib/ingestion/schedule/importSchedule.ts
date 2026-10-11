// src/lib/ingestion/schedule/importSchedule.ts
//
// Checking what the roster pages gave (ticket, name, department) against the HR directory, so that nothing wrong is stored as if it were right.
// A row is
//   verified   -- its ticket is an HR employee whose name fits (same phonetic words) and, when the fit is only partial, whose department fits too;
//   corrected  -- its ticket was misread or unknown, but exactly ONE HR employee has this name and this department: that ticket is used (noted);
//   unverified -- anything else. Stored, flagged, never shown as confirmed; the ticket as read is kept for a person to look at.
// The name comparison uses the directory's own phonetic codes (the same ones the name search uses), computed by the database.
import type { ScheduleRow } from "./extractSchedule";

export interface HrEmployee {
  ticket: string;
  name: string;
  /** phonetic code of each word of the name (initials dropped), as nlq.employees.name_codes */
  codes: string[];
  departmentCode: string | null;
}

export type RowStatus = "verified" | "corrected" | "unverified";

export interface VerifiedRow extends ScheduleRow {
  /** the ticket confirmed against HR (null = not confirmed) */
  ticketNo: string | null;
  status: RowStatus;
  statusNote: string | null;
}

export type Fit = "exact" | "partial" | "none";

/**
 * How well a printed name fits an HR name, by phonetic codes.
 *   exact   : at least two codes in common, and every code of the shorter name is among them (SANJAY ROY = SANJAY RAY = S ROY ...)
 *   partial : every code of the shorter name matches, but there is only one ("P O ROY" against "PERE PADEN OUSEPH ROY"), or all but one word of a
 *             longer name matches (a first letter spoilt by a rule mark)
 *   none    : otherwise
 */
const squash = (s: string) => (s || "").toUpperCase().replace(/[^A-Z]/g, "");

export function nameFit(printed: string[], hr: string[], printedName?: string, hrName?: string): Fit {
  // the same letters in the same order are the same name, however the spaces fall: "SATYA BRATA BOSE" = "SATYABRATA BOSE", and a name
  // whose phonetic codes are few (SARGAM KUMARI: KUMARI is dropped as a title) is still the same person when the whole name is the same
  if (printedName && hrName && squash(printedName).length >= 4 && squash(printedName) === squash(hrName)) return "exact";
  if (printed.length >= 2 && printed.join("") === hr.join("")) return "exact"; // the same codes, only cut differently ("BISHNUPADA" = "BISHNU PADA")
  const P = [...new Set(printed)];
  const H = [...new Set(hr)];
  const min = Math.min(P.length, H.length);
  if (min === 0) return "none";
  const matched = P.filter((p) => H.includes(p)).length;
  if (matched === 0) return "none";
  if (matched >= 2 && matched >= min) return "exact";
  if (matched >= min) return "partial";
  if (min >= 3 && matched >= min - 1 && matched >= 2) return "partial";
  return "none";
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && String(a).trim() === String(b).trim();

export function verifyAgainstHr(rows: ScheduleRow[], printedCodes: string[][], hr: HrEmployee[]): VerifiedRow[] {
  const byTicket = new Map(hr.map((e) => [e.ticket, e]));
  const out: VerifiedRow[] = rows.map((r, i) => {
    const base = { ...r, ticketNo: null as string | null, status: "unverified" as RowStatus, statusNote: null as string | null };
    const P = printedCodes[i] ?? [];
    const e = r.ticket ? byTicket.get(r.ticket) : undefined;
    if (e) {
      const fit = nameFit(P, e.codes, r.name, e.name);
      if (fit === "exact" || (fit === "partial" && same(r.departmentCode, e.departmentCode))) return { ...base, ticketNo: e.ticket, status: "verified" };
      // the ticket is an employee, but the name does not fit: the ticket may have been misread into someone else's. Try to find the person by name.
      base.statusNote = `ticket ${r.ticket} belongs to ${e.name} in HR, which does not fit the printed name "${r.name}"`;
    } else if (r.ticket) base.statusNote = `ticket ${r.ticket} is not in the HR directory`;
    else base.statusNote = "no readable ticket number";

    const cands = hr.filter((h) => nameFit(P, h.codes, r.name, h.name) === "exact" && same(r.departmentCode, h.departmentCode));
    if (cands.length === 1) {
      return { ...base, ticketNo: cands[0].ticket, status: "corrected", statusNote: `ticket read as ${r.ticket ?? "nothing"}; the only HR employee with this name and department is ${cands[0].name} (${cands[0].ticket})` };
    }
    if (cands.length > 1) base.statusNote += `; ${cands.length} HR employees share this name and department`;
    return base;
  });

  // one person cannot be called twice in a schedule: the better-confirmed row keeps the ticket, the other is flagged
  const seen = new Map<string, number>();
  const rank = (s: RowStatus) => (s === "verified" ? 2 : s === "corrected" ? 1 : 0);
  out.forEach((r, i) => {
    if (!r.ticketNo) return;
    const j = seen.get(r.ticketNo);
    if (j === undefined) return void seen.set(r.ticketNo, i);
    const loser = rank(out[j].status) >= rank(r.status) ? i : j;
    const winner = loser === i ? j : i;
    out[loser] = { ...out[loser], ticketNo: null, status: "unverified", statusNote: `ticket ${out[winner].ticketNo} appears twice in this schedule (rows ${out[winner].seq} and ${out[loser].seq}); this row is the weaker match` };
    seen.set(out[winner].ticketNo!, winner);
  });
  return out;
}
