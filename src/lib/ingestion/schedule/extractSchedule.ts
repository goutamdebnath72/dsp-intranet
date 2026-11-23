// src/lib/ingestion/schedule/extractSchedule.ts
//
// Here are the shapes of a read health check-up roster (one record per employee: ticket, name, department as printed and the CHECK-UP DATE) and the two helpers every reading uses.
// I keep the reading itself in geminiSchedule.ts (Gemini).

/** Bump this number whenever the reading changes what it returns. */
export const EXTRACT_VERSION = 5; // version 5: read by Gemini (a primary and a checker model)

/** I throw this from the roster reading when deps.shouldStop() says the time is up. Nothing has been stored; the caller decides what to do (the upload saves the circular anyway). */
export class ScheduleTimeBudgetError extends Error {
  constructor() {
    super("the time budget for reading the schedule ran out");
    this.name = "ScheduleTimeBudgetError";
  }
}

export interface ScheduleRow {
  page: number; // position, counting from 1, in the `pages` given
  seq: number; // position, counting from 1, in the whole roster
  serial: number | null; // the SL.NO as printed on the row
  ticket: string | null; // 6 digits, exactly as read
  name: string;
  departmentCode: string | null;
  department: string;
  datePrinted: string | null; // the printed text of the date cell this row sits in
  checkupDate: string | null; // ISO date, or null if it could not be established
  dateNote: string | null; // set when the date was corrected or looks odd
  /** This is true when the date is printed on the other side of a page break, because the cell goes on over it. */
  dateFromOtherPage: boolean;
  /** Height of the row on the straightened page image; I keep it for looking at the row again. */
  y?: number;
  /** Other readings of the ticket (they lost the vote); the HR directory may confirm one of them. */
  ticketAlt?: string[];
  /** Other readings of the department code; they lost the vote. */
  codeAlt?: string[];
  /** Set when I changed the department code because it did not belong to the department printed on the row. */
  codeNote?: string | null;
}

export interface ExtractedSchedule {
  scheduleMonth: { month: number; year: number } | null;
  rows: ScheduleRow[];
  /** Things a person should look at: a group of an odd size, dates out of order, rows without a date ... */
  warnings: string[];
  /** Pages that are not roster pages (the covering letter). That is normal, not a problem. */
  info: string[];
  /** How many rows each date covers, in order. */
  groups: Array<{ date: string | null; rows: number }>;
}

/** I do not count the table's own heading cells ("SL.NO", "T.NO", "NAME", "DEPTT. CODE", "DEPARTMENT", "DATE") as people. */
const HEADING = /^(?:sl\.?\s*no\.?|t\.?\s*no\.?|name(?:\s+of\s+employee)?|deptt?\.?\s*code|department|date)$/i;

/**
 * Is this row an employee? I say yes when it has a readable ticket, or a name together with a department code. A row with only a serial number (the
 * digit strip can put one on the heading row) or whose "name" is a column heading is not an employee.
 */
export function isEmployeeRow(ticket: string | null, name: string, code: string | null, department: string): boolean {
  if (HEADING.test(name.trim())) return false;
  if (ticket) return true;
  return !!name && !!code && /[A-Za-z]{2}/.test(name) && !HEADING.test(department.trim());
}

/** 6 digits, or null. A rule next to the digits is often read as a 7th character ("[333787", "1318839"): I drop it when that is what it is. */
export function cleanTicket(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 6) return digits;
  if (digits.length === 7 && (/^[^0-9]/.test(t) || digits[0] === "1")) return digits.slice(1);
  return null;
}
