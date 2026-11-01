// Run (from the project root): npx tsx --tsconfig tsconfig.json src/components/employeeFormModel.selftest.ts
// Step 66e: THE ORDER OF THE FORM: which section is open when, and why the button is off. Pure.

import { EMPTY_FORM, reasonFor, unlockedSections, type FormValues } from "./employeeFormModel";
import { validateEmployee } from "@/lib/employees/admin/validate";
import { rawOf } from "./employeeFormModel";
import { DateTime } from "luxon";
import type { FieldErrors, Lookups } from "@/lib/employees/admin/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const TODAY = DateTime.fromISO("2026-11-01T10:00:00", { zone: "Asia/Kolkata" });
const L: Lookups = {
  grades: [{ id: 5, code: 221, title: "General Manager", track: "managerial", rankOrder: 4 }, { id: 20, code: 415, title: "S-11", track: "nonexec", rankOrder: 14 }],
  departments: [{ id: 2, code: 107, name: "L & D", scope: "executive" }, { id: 4, code: 40017, name: "FIRE SERVICE", scope: "shared" }],
};
const errorsOf = (v: FormValues, o: { mode?: "add" | "modify"; datesVisible?: boolean; hasMobile?: boolean } = {}): FieldErrors => {
  const r = validateEmployee(rawOf(v, L, null), L, { today: TODAY, canEditDates: o.datesVisible ?? true, requirePno: (o.mode ?? "add") === "add", hasMobile: o.hasMobile });
  return r.ok ? {} : r.errors;
};
const open = (v: FormValues, o: { mode?: "add" | "modify"; datesVisible?: boolean } = {}) => unlockedSections(v, L, errorsOf(v, o), { mode: o.mode ?? "add", datesVisible: o.datesVisible ?? true, loaded: true });
const id: FormValues = { ...EMPTY_FORM, ticketNo: "412399", sailPno: "D200200", name: "ravi kumar" };
const posting: FormValues = { ...id, gradeId: "5", departmentCode: "107" };
const dates: FormValues = { ...posting, dateOfBirth: "1990-03-10", dateOfJoining: "2015-07-01" };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- the order: from top to bottom, each section opens when the one above is complete ----
ok("an empty form: everything below the Identity is locked", eq(open(EMPTY_FORM), { posting: false, dates: false, contact: false }));
ok("the Identity needs ALL THREE: the ticket, the SAIL P.No. and the name (one missing keeps Posting locked)", !open({ ...id, name: "" }).posting && !open({ ...id, sailPno: "" }).posting && !open({ ...id, ticketNo: "" }).posting && open(id).posting);
ok("...and they must be RIGHT: a ticket starting with 0, a short ticket, a P.No. with a space keep Posting locked", ["012345", "41234", "4123456"].every((t) => !open({ ...id, ticketNo: t }).posting) && !open({ ...id, sailPno: "D 1" }).posting);
ok("with the Identity complete, Posting is open and the dates are STILL locked", eq(open(id), { posting: true, dates: false, contact: false }));
ok("Posting needs a designation code AND a department code that exists", !open({ ...id, gradeId: "5" }).dates && !open({ ...id, departmentCode: "107" }).dates && !open({ ...id, gradeId: "5", departmentCode: "999" }).dates && !open({ ...id, gradeId: "5", departmentCode: "abc" }).dates);
ok("...and they must fit the ticket: an executive cannot take a non-executive designation, nor a department of the non-executives", !open({ ...id, gradeId: "20", departmentCode: "107" }).dates && !open({ ...posting, gradeId: "20" }).dates && !open({ ...id, ticketNo: "123456", gradeId: "20", departmentCode: "107" }).dates);
ok("with Posting complete the dates are open and Contact is STILL locked", eq(open(posting), { posting: true, dates: true, contact: false }));
ok("the dates need BOTH, and valid: one missing, a future date, a joining before 23 for a direct recruit keep Contact locked", !open({ ...posting, dateOfBirth: "1990-03-10" }).contact && !open({ ...posting, dateOfJoining: "2015-07-01" }).contact && !open({ ...dates, dateOfJoining: "2099-01-01" }).contact && !open({ ...dates, ticketNo: "498880", dateOfJoining: "2011-01-01" }).contact);
ok("with the dates complete, Contact is open: all four sections are open", eq(open(dates), { posting: true, dates: true, contact: true }));
ok("a section does not stay open if what is above it is broken again: clearing the name locks everything below", eq(open({ ...dates, name: "" }), { posting: false, dates: false, contact: false }));
ok("for anybody but the HOD there are no dates to fill: Contact opens as soon as Posting is complete", eq(open(posting, { datesVisible: false }), { posting: true, dates: true, contact: true }) && !open(id, { datesVisible: false }).contact);
ok("changing a person: the SAIL P.No. is not needed to open Posting (an old record may have none); the rest is the same", open({ ...id, sailPno: "" }, { mode: "modify" }).posting && !open({ ...id, sailPno: "" }).posting);
ok("nothing is open before the codes have been loaded", !unlockedSections(id, L, {}, { mode: "add", datesVisible: true, loaded: false }).posting);

// ---- why the button is off: the first thing missing, in the order of the form ----
const why = (v: FormValues, o: { mode?: "add" | "modify"; datesVisible?: boolean; valid?: boolean; changes?: number } = {}) => {
  const e = errorsOf(v, o), u = unlockedSections(v, L, e, { mode: o.mode ?? "add", datesVisible: o.datesVisible ?? true, loaded: true });
  return reasonFor(e, u, { loaded: true, valid: Object.keys(e).length === 0, mode: o.mode ?? "add", changes: o.changes ?? 1 });
};
ok("before the codes load: 'Loading…'", reasonFor({}, { posting: false, dates: false, contact: false }, { loaded: false, valid: false, mode: "add", changes: 0 }) === "Loading…");
ok("an empty form says what is wrong with the TICKET first", /6 digits/.test(why(EMPTY_FORM) ?? ""));
ok("with the Identity right it asks for the designation, then the department", /designation/i.test(why(id) ?? "") && /department/i.test(why({ ...id, gradeId: "5" }) ?? ""));
ok("with Posting right and the dates empty it says to fill in BOTH DATES (not the mobile that is not open yet)", why(posting) === "Fill in both service dates to continue.");
ok("a wrong date is named before anything of the contact", /joins at 23 or later/.test(why({ ...dates, ticketNo: "498880", dateOfBirth: "2001-03-10", dateOfJoining: "2022-03-09" }) ?? ""));
ok("with the dates right, an executive is asked for the CUG mobile", /CUG mobile/.test(why(dates) ?? ""));
ok("...a wrong NIC mail is named before the missing mobile (form order: the mails are above the mobile)", /@sail\.in/.test(why({ ...dates, emailNic: "x@gmail.com" }) ?? ""));
ok("a complete record has no reason; a change with nothing changed says so", why({ ...dates, mobile: "9434791234" }) === undefined && why({ ...dates, mobile: "9434791234" }, { mode: "modify", changes: 0 }) === "Change something to save.");
ok("a delegate (no dates) with Posting done is not asked for dates", !/dates/.test(why(posting, { datesVisible: false }) ?? ""));

console.log(`employeeFormModel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
