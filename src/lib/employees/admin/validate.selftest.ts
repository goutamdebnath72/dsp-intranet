// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/admin/validate.selftest.ts
// Step 66a: the rules of an employee record. PURE.

import { DateTime } from "luxon";
import { cleanText, cohortOfTicket, departmentFitsCohort, describeDates, gradeFitsCohort, seniorityRank, validateEmployee } from "./validate";
import type { Lookups } from "./types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const TODAY = DateTime.fromISO("2026-11-01T10:00:00", { zone: "Asia/Kolkata" });
const L: Lookups = {
  grades: [
    { id: 1, code: 222, title: "Chief General Manager", track: "managerial", rankOrder: 3 },
    { id: 9, code: 204, title: "Asst. Manager", track: "managerial", rankOrder: 12 },
    { id: 10, code: 204, title: "Medical Officer", track: "medical", rankOrder: 12 },
    { id: 20, code: 409, title: "S-11", track: "nonexec", rankOrder: 14 },
  ],
  departments: [
    { id: 1, code: 100, name: "C & IT", scope: "shared" },
    { id: 2, code: 107, name: "L & D", scope: "executive" },
    { id: 3, code: 9003, name: "L & D OFFICE", scope: "nonexecutive" },
  ],
};
const GOOD = { ticketNo: "412345", name: "rakesh  ojha", gradeId: 1, departmentId: 1, sailPno: "d107659", address: "", emailNic: "R.Ojha@nic.in", webmail: "", doctor: null, dateOfBirth: "1975-06-30", dateOfJoining: "2001-10-12" };
const v = (over: Record<string, unknown> = {}, o: Partial<{ canEditDates: boolean; fixedTicket: string }> = {}) => validateEmployee({ ...GOOD, ...over }, L, { today: TODAY, canEditDates: true, ...o });
const err = (over: Record<string, unknown> = {}, o = {}) => { const r = v(over, o); return r.ok ? {} : r.errors; };

// ---- the whole record ----
const good = v();
ok("a good record is accepted and tidied: the name in capitals with single spaces, the P.No. in capitals, e-mail in lower case", good.ok && good.value.name === "RAKESH OJHA" && good.value.sailPno === "D107659" && good.value.emailNic === "r.ojha@nic.in" && good.value.ticketNo === "412345");
ok("the cohort follows from the ticket (never typed): 4xxxxx executive, anything else not", cohortOfTicket("412345") === "executive" && cohortOfTicket("498880") === "executive" && cohortOfTicket("342461") === "nonexecutive" && cohortOfTicket("123456") === "nonexecutive" && cohortOfTicket("41234") === "nonexecutive");

// ---- ticket ----
for (const bad of ["", "41234", "4123456", "41234a", "abcdef", " 4123 45 "]) ok(`ticket "${bad}" is refused (exactly 6 digits)`, !!err({ ticketNo: bad }).ticketNo, JSON.stringify(err({ ticketNo: bad })));
ok("in a change the ticket is fixed: what is typed is ignored", (() => { const r = v({ ticketNo: "999999" }, { fixedTicket: "412345" }); return r.ok && r.value.ticketNo === "412345"; })());

// ---- name ----
for (const bad of ["", "AB", "R2D2 KUMAR", "<script>", "Ravi_Kumar", "---", "'''", "1234"]) ok(`name "${bad}" is refused`, !!err({ name: bad }).name, JSON.stringify(err({ name: bad })));
for (const good2 of ["Ravi Kumar", "S. K. Das", "Anil D'Souza", "Mary-Ann Roy", "TAPAN KUMAR DE"]) ok(`name "${good2}" is accepted`, !err({ name: good2 }).name);

// ---- designation and department fit the ticket ----
ok("an executive cannot hold a non-executive grade, a non-executive cannot hold an executive one", !!err({ gradeId: 20 }).gradeId && !!err({ ticketNo: "123456", gradeId: 1 }).gradeId && !err({ ticketNo: "123456", gradeId: 20, departmentId: 1 }).gradeId);
ok("a doctor's (medical) grade is an executive grade", !err({ gradeId: 10 }).gradeId && gradeFitsCohort({ track: "medical" }, "executive") && !gradeFitsCohort({ track: "medical" }, "nonexecutive"));
ok("a department reserved to executives is refused for a non-executive, and the other way round; a shared one fits both", !!err({ ticketNo: "123456", gradeId: 20, departmentId: 2 }).departmentId && !!err({ departmentId: 3 }).departmentId && !err({ departmentId: 2 }).departmentId && !err({ ticketNo: "123456", gradeId: 20, departmentId: 3 }).departmentId && departmentFitsCohort({ scope: "shared" }, "executive") && departmentFitsCohort({ scope: "shared" }, "nonexecutive"));
ok("an unknown or missing designation or department is refused, in words", !!err({ gradeId: 99 }).gradeId && !!err({ gradeId: null }).gradeId && !!err({ departmentId: 99 }).departmentId && !!err({ departmentId: "" }).departmentId);

// ---- position, e-mail, P.No. ----
ok("the position in the grade: empty is fine (last in the grade), 1 to 9999 is fine, 0, 10000, 2.5 and words are not", !err({ position: "" }).position && !err({ position: 1 }).position && !err({ position: 9999 }).position && !!err({ position: 0 }).position && !!err({ position: 10000 }).position && !!err({ position: 2.5 }).position && !!err({ position: "abc" }).position);
ok("an e-mail is optional but must be one; a P.No. is optional but letters and digits only", !!err({ emailNic: "not an email" }).emailNic && !!err({ webmail: "a@b" }).webmail && !err({ emailNic: "", webmail: "" }).emailNic && !!err({ sailPno: "D 107/659" }).sailPno && !err({ sailPno: "" }).sailPno);

// ---- the dates ----
ok("born 30 Jun 1975, joined 12 Oct 2001: fine", good.ok && good.value.dateOfBirth === "1975-06-30" && good.value.dateOfJoining === "2001-10-12");
ok("not a date / not a real day: refused, in words", !!err({ dateOfBirth: "30/06/1975" }).dateOfBirth && !!err({ dateOfBirth: "1975-02-30" }).dateOfBirth && !!err({ dateOfJoining: "yesterday" }).dateOfJoining && !!err({ dateOfJoining: "2001-13-01" }).dateOfJoining);
ok("born in the future or before 1930: refused; joined in the future: refused", !!err({ dateOfBirth: "2030-01-01" }).dateOfBirth && !!err({ dateOfBirth: "1929-12-31" }).dateOfBirth && !/before 1930/.test(err({ dateOfBirth: "1930-01-01", dateOfJoining: "" }).dateOfBirth ?? "") && /retirement/.test(err({ dateOfBirth: "1930-01-01", dateOfJoining: "" }).dateOfBirth ?? "") && !!err({ dateOfJoining: "2027-01-01" }).dateOfJoining);
ok("past the retirement day (60 reached in an earlier month): refused; 60 reached this month: still on the roll", !!err({ dateOfBirth: "1966-10-15", dateOfJoining: "" }).dateOfBirth && !err({ dateOfBirth: "1966-11-15", dateOfJoining: "" }).dateOfBirth && !err({ dateOfBirth: "1966-11-01", dateOfJoining: "" }).dateOfBirth);
ok("joined the day before the 18th birthday: refused; on it: fine (a promoted executive)", !!err({ dateOfBirth: "1990-06-15", dateOfJoining: "2008-06-14" }).dateOfJoining && !err({ dateOfBirth: "1990-06-15", dateOfJoining: "2008-06-15" }).dateOfJoining);
ok("a direct recruit (49xxxx) who joined at 22: refused (23 is the minimum); at exactly 23: fine", !!err({ ticketNo: "498880", dateOfBirth: "1990-06-15", dateOfJoining: "2012-06-15" }).dateOfJoining && !err({ ticketNo: "498880", dateOfBirth: "1990-06-15", dateOfJoining: "2013-06-15" }).dateOfJoining);
ok("joined after 32: accepted but WARNED (an age relaxation may be real); at 32 exactly: no warning", (() => { const a = v({ dateOfBirth: "1980-01-01", dateOfJoining: "2013-06-01" }); const b = v({ dateOfBirth: "1980-01-01", dateOfJoining: "2012-01-01" }); return a.ok && a.warnings.length === 1 && b.ok && b.warnings.length === 0; })());
ok("either date may be empty (the HOD may not have both): no error", !!v({ dateOfBirth: "", dateOfJoining: "" }).ok && !!v({ dateOfBirth: "", dateOfJoining: "2001-10-12" }).ok && !!v({ dateOfBirth: "1975-06-30", dateOfJoining: "" }).ok);
const nodates = validateEmployee({ ...GOOD, dateOfBirth: "garbage", dateOfJoining: "garbage" }, L, { today: TODAY, canEditDates: false });
ok("for anybody but the HOD the two dates are IGNORED (even rubbish raises no error, and nothing is carried)", nodates.ok && nodates.value.dateOfBirth === null && nodates.value.dateOfJoining === null);

// ---- helpers ----
ok("the HR formula for seniority: the grade's order x 10000 + the position", seniorityRank({ rankOrder: 3 }, 17) === 30017 && seniorityRank({ rankOrder: 14 }, 1853) === 141853);
ok("cleanText: control characters and runs of spaces go, the length is limited", cleanText("  a\u0000b \t c  ") === "a b c" && cleanText("x".repeat(500), 10).length === 10 && cleanText(null) === "");
const dd = describeDates("1966-10-14", "2001-10-12", TODAY);
ok("the live line under the dates: age, service, the farewell day, the jubilee day", dd.age === "60 years 0 months" && dd.service === "25 years 0 months" && dd.retiresOn === "31 Oct 2026" && dd.jubileeOn === "12 Oct 2026", JSON.stringify(dd));
ok("...empty for a missing or impossible date", describeDates(null, undefined, TODAY).age === "" && describeDates("nonsense", "", TODAY).retiresOn === "" && describeDates("2030-01-01", null, TODAY).age === "");

console.log(`employee admin validate selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
