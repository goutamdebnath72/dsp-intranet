// src/lib/employees/admin/validate.ts
//
// THE RULES OF AN EMPLOYEE RECORD (step 66a; owner, 1 Nov 2026). PURE: the same function runs in the panel (so a mistake is shown as it is typed) and on the server (so nothing depends on the panel).
//   Ticket          six digits, not starting with 0. An executive's ticket starts with 4 (and the cohort follows from it: it is never typed); 49xxxx is a direct recruit (a Management Trainee); any other digit after the 4 is promoted.
//   Name            letters, spaces and . ' - only; kept in capitals, one space between words (as the roster has it).
//   Designation     must exist, and must fit the ticket: a non-executive grade (S-1 ... S-11) for a non-executive, a managerial or medical grade for an executive.
//   Department      must exist, and must fit the cohort (a department reserved to executives is not for a non-executive, and the other way round).
//   SAIL P.No.      required for a new employee (it is the first password of his login account); letters and digits.
//   Contact         (contact.ts) an executive: NIC mail @sail.in, web-mail @saildsp.co.in, a CUG mobile (94347 + 9, 2 or 3), OPTIONAL; a non-executive: one e-mail (any domain) and an optional mobile.
//   Dates           (only the HOD of C&IT sees and sets them) a real calendar day; born not before 1930 and not in the future; joined not in the future; joined at 18 or later, at 23 or later for a direct recruit;
//                   not past the retirement day (the last day of the month in which 60 is reached). Joining after 32 is allowed but WARNED (an age relaxation may be real).
// Luxon only.

import { DateTime } from "luxon";
import { IST } from "@/lib/dates";
import { isMtTicket, minJoiningAge, parseDay, retirementDate, jubileeDate, ZONE } from "@/lib/peopleEvents/rules";
import { CUG_RE, CUG_RULE, MOBILE_RE, NIC_DOMAIN, WEBMAIL_DOMAIN, endsWithDomain, isEmail, normalizeMobile } from "./contact";
import type { Cohort, DepartmentRef, EmployeeInput, FieldErrors, GradeRef, Lookups } from "./types";

/** A ticket number: six digits, never starting with 0. */
export const isTicket = (t: string): boolean => /^[1-9]\d{5}$/.test(String(t).trim());
export const cohortOfTicket = (ticketNo: string): Cohort => (/^4\d{5}$/.test(String(ticketNo).trim()) ? "executive" : "nonexecutive");

export const cleanText = (v: unknown, max = 300): string =>
  String(v ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const NAME_OK = /^[A-Za-z][A-Za-z .'\-]*[A-Za-z.]$/;
const PNO_OK = /^[A-Za-z0-9]{1,15}$/;
export const MAX_JOINING_AGE_ADVERTISED = 32;
export const MIN_BIRTH = "1930-01-01";

export interface ValidateOptions {
  today: DateTime;
  /** Only the HOD of C&IT sees and sets the two dates: for anybody else they are ignored (the stored ones are kept). */
  canEditDates: boolean;
  /** In a change the ticket is fixed: it is not an input. */
  fixedTicket?: string;
  /** A new employee must have a SAIL P.No.; in a change it is required only when he has one already. */
  requirePno?: boolean;
  /** The person already has a mobile number in his login account: an executive's mobile may then stay empty (unchanged). */
}

export type Validated = { ok: true; value: EmployeeInput; warnings: string[] } | { ok: false; errors: FieldErrors };

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) ? n : NaN;
};

export function gradeFitsCohort(grade: Pick<GradeRef, "track">, cohort: Cohort): boolean {
  return cohort === "nonexecutive" ? grade.track === "nonexec" : grade.track !== "nonexec";
}
export function departmentFitsCohort(d: Pick<DepartmentRef, "scope">, cohort: Cohort): boolean {
  return d.scope === "shared" || d.scope === cohort;
}

export function validateEmployee(raw: Record<string, unknown>, lookups: Lookups, opts: ValidateOptions): Validated {
  const errors: FieldErrors = {};
  const warnings: string[] = [];
  const today = opts.today.setZone(IST).startOf("day");

  const ticketNo = opts.fixedTicket ?? cleanText(raw.ticketNo, 20);
  if (!isTicket(ticketNo)) errors.ticketNo = "A ticket number is exactly 6 digits and does not start with 0.";
  const cohort = cohortOfTicket(ticketNo);

  const nameRaw = cleanText(raw.name, 80);
  const name = nameRaw.toUpperCase();
  if (!name) errors.name = "Type the name.";
  else if (name.length < 3 || !NAME_OK.test(name)) errors.name = "A name has letters, spaces and . ' - only, and at least 3 characters.";

  const sailPno = cleanText(raw.sailPno, 15).toUpperCase();
  if (!sailPno && opts.requirePno) errors.sailPno = "Type the SAIL P.No. (it is his first password).";
  else if (sailPno && !PNO_OK.test(sailPno)) errors.sailPno = "The SAIL P.No. has letters and digits only (up to 15).";

  const gradeId = intOrNull(raw.gradeId);
  const grade = gradeId === null || Number.isNaN(gradeId) ? undefined : lookups.grades.find((g) => g.id === gradeId);
  if (!grade) errors.gradeId = "Choose the designation.";
  else if (isTicket(ticketNo) && !gradeFitsCohort(grade, cohort)) {
    errors.gradeId = cohort === "executive" ? "An executive (ticket starting with 4) cannot hold a non-executive grade." : "A non-executive (ticket not starting with 4) cannot hold an executive designation.";
  }

  const departmentId = intOrNull(raw.departmentId);
  const dept = departmentId === null || Number.isNaN(departmentId) ? undefined : lookups.departments.find((d) => d.id === departmentId);
  if (!dept) errors.departmentId = "Choose the department.";
  else if (isTicket(ticketNo) && !departmentFitsCohort(dept, cohort)) {
    errors.departmentId = cohort === "executive" ? "This department is reserved for non-executives." : "This department is reserved for executives.";
  }

  const position = intOrNull(raw.position);
  if (position !== null && (Number.isNaN(position) || position < 1 || position > 9999)) errors.position = "The position in the grade is a whole number from 1 to 9999 (leave it empty to place the person last in the grade).";

  const address = cleanText(raw.address, 300);
  // contact: the rules differ by cohort (contact.ts). What does not belong to the cohort is not an input: it is ignored.
  const nicRaw = cleanText(raw.emailNic, 120).toLowerCase(), webRaw = cleanText(raw.webmail, 120).toLowerCase(), mailRaw = cleanText(raw.email, 120).toLowerCase();
  const mobileRaw = normalizeMobile(raw.mobile);
  const mobileTyped = String(raw.mobile ?? "").trim() !== ""; // something was typed: even only letters is judged (and refused), never silently dropped
  let emailNic = "", webmail = "", email = "", mobile = "";
  if (isTicket(ticketNo)) {
    if (cohort === "executive") {
      if (nicRaw) { if (!isEmail(nicRaw) || !endsWithDomain(nicRaw, NIC_DOMAIN)) errors.emailNic = `The NIC mail ends with ${NIC_DOMAIN}.`; else emailNic = nicRaw; }
      if (webRaw) { if (!isEmail(webRaw) || !endsWithDomain(webRaw, WEBMAIL_DOMAIN)) errors.webmail = `The web-mail ends with ${WEBMAIL_DOMAIN}.`; else webmail = webRaw; }
      if (mobileRaw || mobileTyped) { if (!CUG_RE.test(mobileRaw)) errors.mobile = `Not a CUG number. The CUG number: ${CUG_RULE}`; else mobile = mobileRaw; } // OPTIONAL (step 69b): added later when it arrives
    } else {
      if (mailRaw) { if (!isEmail(mailRaw)) errors.email = "This is not an e-mail address."; else email = mailRaw; }
      if (mobileRaw || mobileTyped) { if (!MOBILE_RE.test(mobileRaw)) errors.mobile = "A mobile number is 10 digits and does not start with 0."; else mobile = mobileRaw; }
    }
  }

  const doctor = raw.doctor === true || raw.doctor === "true" ? true : raw.doctor === false || raw.doctor === "false" ? false : null;

  let dateOfBirth: string | null = null, dateOfJoining: string | null = null;
  if (opts.canEditDates) {
    const dobText = cleanText(raw.dateOfBirth, 10), dojText = cleanText(raw.dateOfJoining, 10);
    const dob = dobText ? parseDay(dobText) : null, doj = dojText ? parseDay(dojText) : null;
    if (dobText && (!/^\d{4}-\d{2}-\d{2}$/.test(dobText) || !dob?.isValid)) errors.dateOfBirth = "This is not a date (write it as 1975-06-30).";
    if (dojText && (!/^\d{4}-\d{2}-\d{2}$/.test(dojText) || !doj?.isValid)) errors.dateOfJoining = "This is not a date (write it as 2001-10-12).";
    if (dob?.isValid && !errors.dateOfBirth) {
      if (dob > today) errors.dateOfBirth = "Born in the future?";
      else if (dob < parseDay(MIN_BIRTH)) errors.dateOfBirth = "Born before 1930?";
      else if (retirementDate(dobText) < today) errors.dateOfBirth = "This person has passed the retirement day (the last day of the month of the 60th birthday): he is not on the roll any more.";
      else dateOfBirth = dobText;
    }
    if (doj?.isValid && !errors.dateOfJoining) {
      if (doj > today) errors.dateOfJoining = "Joined in the future?";
      else dateOfJoining = dojText;
    }
    if (dateOfBirth && dateOfJoining && isTicket(ticketNo)) {
      const min = minJoiningAge(ticketNo, cohort);
      if (parseDay(dateOfJoining) < parseDay(dateOfBirth).plus({ years: min })) {
        errors.dateOfJoining = isMtTicket(ticketNo, cohort)
          ? "A direct recruit (a Management Trainee, ticket 49xxxx) joins at 23 or later."
          : "Nobody joins before the age of 18.";
      } else if (parseDay(dateOfJoining) > parseDay(dateOfBirth).plus({ years: MAX_JOINING_AGE_ADVERTISED, days: 0 }).endOf("day")) {
        warnings.push(`He joined at more than ${MAX_JOINING_AGE_ADVERTISED} years of age, which exceeds the upper age limit prescribed by the Government. Joining is not permitted above this age without a valid age relaxation order.`);
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    value: { ticketNo, sailPno, name, gradeId: grade!.id, departmentId: dept!.id, position, address, emailNic, webmail, mobile, email, doctor, dateOfBirth, dateOfJoining },
  };
}

/** The live line under the dates in the form: age, service, the farewell day, the jubilee day. Empty text for a missing date. PURE. */
export function describeDates(dob: string | null | undefined, doj: string | null | undefined, today: DateTime): { age: string; service: string; retiresOn: string; jubileeOn: string } {
  const t = today.setZone(ZONE).startOf("day");
  const span = (from: DateTime): string => {
    const d = t.diff(from, ["years", "months"]);
    const y = Math.floor(d.years), m = Math.floor(d.months);
    return y < 0 ? "" : `${y} years ${m} months`;
  };
  const fmt = (d: DateTime) => d.toFormat("dd LLL yyyy");
  const b = dob ? parseDay(dob) : null, j = doj ? parseDay(doj) : null;
  return {
    age: b?.isValid ? span(b) : "",
    service: j?.isValid ? span(j) : "",
    retiresOn: b?.isValid ? fmt(retirementDate(dob as string)) : "",
    jubileeOn: j?.isValid ? fmt(jubileeDate(doj as string)) : "",
  };
}

/** The global seniority rank, by the HR formula: the grade's order x 10000 + the position in the grade. */
export const seniorityRank = (grade: Pick<GradeRef, "rankOrder">, position: number): number => grade.rankOrder * 10000 + position;
