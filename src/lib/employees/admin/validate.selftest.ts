// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/admin/validate.selftest.ts
// Step 66a: the rules of an employee record. PURE.

import { DateTime } from "luxon";
import { cleanText, cohortOfTicket, departmentFitsCohort, describeDates, gradeFitsCohort, isTicket, seniorityRank, validateEmployee } from "./validate";
import { maskEmail, maskMobile, normalizeMobile } from "./contact";
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
const GOOD = { ticketNo: "412345", name: "rakesh  ojha", gradeId: 1, departmentId: 1, sailPno: "d107659", address: "", emailNic: "R.Ojha@SAIL.in", webmail: "", mobile: "9434791234", email: "", doctor: null, dateOfBirth: "1975-06-30", dateOfJoining: "2001-10-12" };
const v = (over: Record<string, unknown> = {}, o: Partial<{ canEditDates: boolean; fixedTicket: string; requirePno: boolean; hasMobile: boolean }> = {}) => validateEmployee({ ...GOOD, ...over }, L, { today: TODAY, canEditDates: true, ...o });
const err = (over: Record<string, unknown> = {}, o = {}) => { const r = v(over, o); return r.ok ? {} : r.errors; };

// ---- the whole record ----
const good = v();
ok("a good record is accepted and tidied: the name in capitals with single spaces, the P.No. in capitals, e-mail in lower case", good.ok && good.value.name === "RAKESH OJHA" && good.value.sailPno === "D107659" && good.value.emailNic === "r.ojha@sail.in" && good.value.ticketNo === "412345");
ok("the cohort follows from the ticket (never typed): 4xxxxx executive, anything else not", cohortOfTicket("412345") === "executive" && cohortOfTicket("498880") === "executive" && cohortOfTicket("342461") === "nonexecutive" && cohortOfTicket("123456") === "nonexecutive" && cohortOfTicket("41234") === "nonexecutive");

// ---- ticket ----
for (const bad of ["", "41234", "4123456", "41234a", "abcdef", " 4123 45 ", "012345", "000000"]) ok(`ticket "${bad}" is refused (exactly 6 digits)`, !!err({ ticketNo: bad }).ticketNo, JSON.stringify(err({ ticketNo: bad })));
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

// ---- the ticket: six digits, never a leading 0 ----
ok("isTicket: six digits not starting with 0", isTicket("412345") && isTicket("100000") && isTicket("999999") && !isTicket("012345") && !isTicket("41234") && !isTicket("4123456") && !isTicket("41234x") && !isTicket(""));

// ---- the SAIL P.No. is required for a new employee (his first password), optional in a change when he has none ----
ok("a new employee must have a SAIL P.No.: empty is refused in words; in a change it is not required", !!err({ sailPno: "" }, { requirePno: true }).sailPno && /first password/.test(err({ sailPno: "" }, { requirePno: true }).sailPno ?? "") && !err({ sailPno: "" }).sailPno && !err({ sailPno: "d111086" }, { requirePno: true }).sailPno);

// ---- contact: an EXECUTIVE ----
ok("an executive's NIC mail must end with @sail.in (any case), the web-mail with @saildsp.co.in; each other domain is refused in words", !err({ emailNic: "a.b@sail.in" }).emailNic && !err({ webmail: "a.b@SAILDSP.CO.IN" }).webmail && !!err({ emailNic: "a@gmail.com" }).emailNic && /@sail\.in/.test(err({ emailNic: "a@gmail.com" }).emailNic ?? "") && !!err({ webmail: "a@sail.in" }).webmail && /@saildsp\.co\.in/.test(err({ webmail: "a@sail.in" }).webmail ?? "") && !!err({ emailNic: "a@sail.inx" }).emailNic && !!err({ emailNic: "sail.in" }).emailNic);
ok("both mail fields are optional for an executive", !err({ emailNic: "", webmail: "" }).emailNic && !err({ emailNic: "", webmail: "" }).webmail);
ok("an executive's CUG mobile: 94347 then 9 (usual), 2 or 3 (exceptions) then four digits are accepted", ["9434791234", "9434721234", "9434731234"].every((m) => !err({ mobile: m }).mobile));
ok("...anything else is refused in words: 94347 then 4, another prefix, nine or eleven digits, letters", ["9434741234", "9434601234", "943479123", "94347912345", "9876543210", "abc"].every((m) => !!err({ mobile: m }).mobile) && /CUG/.test(err({ mobile: "9876543210" }).mobile ?? ""));
ok("...the usual ways of writing a number are understood (+91, 0, spaces, dashes)", ["+91 94347 91234", "094347-91234", "91 9434791234", "94347 91234"].every((m) => { const r = v({ mobile: m }); return r.ok && r.value.mobile === "9434791234"; }));
ok("an executive's mobile is REQUIRED (every executive has one): empty is refused; in a change it may stay empty only when he already has one", !!err({ mobile: "" }).mobile && /every executive has one/.test(err({ mobile: "" }).mobile ?? "") && !err({ mobile: "" }, { hasMobile: true }).mobile);
ok("the general e-mail field is not an executive's: whatever is in it is ignored (nothing carried)", (() => { const r = v({ email: "x@gmail.com" }); return r.ok && r.value.email === ""; })());

// ---- contact: a NON-EXECUTIVE ----
const NE = { ticketNo: "123456", gradeId: 20, departmentId: 1, emailNic: "", webmail: "", mobile: "", email: "" };
ok("a non-executive: one e-mail, ANY domain (gmail, hotmail, sail.in ...), optional", !err({ ...NE, email: "a@gmail.com" }).email && !err({ ...NE, email: "a@hotmail.com" }).email && !err({ ...NE, email: "a@sail.in" }).email && !err({ ...NE, email: "" }).email && !!err({ ...NE, email: "not an email" }).email);
ok("a non-executive's mobile: optional; any 10 digits not starting with 0; the CUG pattern is not required of him", !err({ ...NE, mobile: "" }).mobile && !err({ ...NE, mobile: "9876543210" }).mobile && !err({ ...NE, mobile: "9434791234" }).mobile && !!err({ ...NE, mobile: "0123456789" }).mobile && !!err({ ...NE, mobile: "98765" }).mobile);
ok("a non-executive has no NIC or web-mail field: if the browser sends them they are ignored (nothing carried)", (() => { const r = v({ ...NE, emailNic: "x@gmail.com", webmail: "bad" }); return r.ok && r.value.emailNic === "" && r.value.webmail === ""; })());
ok("a non-executive's record is complete without any contact at all", v({ ...NE }).ok);

// ---- the masks (the same as the search cards) ----
ok("masks: a mobile as its first six digits and x; an e-mail as xxxxxx and the domain; nothing for nothing", maskMobile("9434791234") === "943479xxxx" && maskMobile("") === "" && maskMobile(null) === "" && maskMobile("123") === "xxxx" && maskEmail("abc@sail.in") === "xxxxxx@sail.in" && maskEmail("") === "" && maskEmail("nodomain") === "xxxxxx");
ok("normalizeMobile: digits only, +91 and a leading 0 removed", normalizeMobile("+91 94347-91234") === "9434791234" && normalizeMobile("094347 91234") === "9434791234" && normalizeMobile("abc") === "" && normalizeMobile(null) === "");

// ---- helpers ----
ok("the HR formula for seniority: the grade's order x 10000 + the position", seniorityRank({ rankOrder: 3 }, 17) === 30017 && seniorityRank({ rankOrder: 14 }, 1853) === 141853);
ok("cleanText: control characters and runs of spaces go, the length is limited", cleanText("  a\u0000b \t c  ") === "a b c" && cleanText("x".repeat(500), 10).length === 10 && cleanText(null) === "");
const dd = describeDates("1966-10-14", "2001-10-12", TODAY);
ok("the live line under the dates: age, service, the farewell day, the jubilee day", dd.age === "60 years 0 months" && dd.service === "25 years 0 months" && dd.retiresOn === "31 Oct 2026" && dd.jubileeOn === "12 Oct 2026", JSON.stringify(dd));
ok("...empty for a missing or impossible date", describeDates(null, undefined, TODAY).age === "" && describeDates("nonsense", "", TODAY).retiresOn === "" && describeDates("2030-01-01", null, TODAY).age === "");

console.log(`employee admin validate selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
