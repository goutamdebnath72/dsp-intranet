// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/EmployeeAdminPanel.selftest.tsx
// Step 66a/66b: the employee manager's panel as it is drawn. (The clicks, the requests and StrictMode are covered by the click-through described in STATUS.)

import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";
import { EMPTY_FORM, EmployeeAdminHeader, EmployeeAdminPanel, EmployeeForm, EmployeeHistory, EmployeeList, EmployeePreviewCard, ReviewView, TabBar, changesOf, formFromRecord, gradeLabel, initialsOf, rawOf, resolveDepartment, type FormValues } from "./EmployeeAdminPanel";
import type { AuditView, EmployeeRecord, Lookups } from "@/lib/employees/admin/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;
const TODAY = DateTime.fromISO("2026-11-01T10:00:00", { zone: "Asia/Kolkata" });
const L: Lookups = {
  grades: [
    { id: 1, code: 222, title: "Chief General Manager", track: "managerial", rankOrder: 3 }, { id: 9, code: 204, title: "Asst. Manager", track: "managerial", rankOrder: 12 },
    { id: 10, code: 204, title: "Medical Officer", track: "medical", rankOrder: 12 }, { id: 20, code: 409, title: "S-11", track: "nonexec", rankOrder: 14 },
  ],
  departments: [
    { id: 1, code: 100, name: "C & IT", scope: "shared" }, { id: 2, code: 107, name: "L & D", scope: "executive" }, { id: 3, code: 9003, name: "L & D OFFICE", scope: "nonexecutive" }, { id: 5, code: 107, name: "L & D (NON-EXEC)", scope: "nonexecutive" },
  ],
};
const REC: EmployeeRecord = { id: 7, ticketNo: "412345", sailPno: "D107659", name: "RAKESH OJHA", cohort: "executive", gradeId: 1, gradeTitle: "Chief General Manager", departmentId: 1, departmentName: "C & IT", position: 2, address: "Sector 2", emailNic: "xxxxxx@sail.in", webmail: "", mobileMasked: "943479xxxx", emailMasked: "xxxxxx@sail.in", doctor: null, dateOfBirth: "1966-10-14", dateOfJoining: "2001-10-12", datesVisible: true, hasLogin: true };
const form = (values: FormValues, over: Partial<React.ComponentProps<typeof EmployeeForm>> = {}) => h(<EmployeeForm mode="add" idPrefix="emp-add" values={values} lookups={L} errors={{}} warnings={[]} datesVisible={true} identityOk={true} original={null} today={TODAY} busy={false} submitLabel="Review and save" submitDisabled={false} onChange={noop} onSubmit={noop} {...over} />);
const disabledField = (html: string, field: string) => new RegExp(`<(?:input|select|textarea)[^>]*data-emp-field="${field}"[^>]*disabled=""`).test(html) || new RegExp(`<(?:input|select|textarea)[^>]*disabled=""[^>]*data-emp-field="${field}"`).test(html);
const hasField = (html: string, field: string) => html.includes(`data-emp-field="${field}"`);

// ---- the header ----
const head = h(<EmployeeAdminHeader authority="delegate" name="RAKESH OJHA" />);
ok("the header: Employee manager, then the person's NAME, then 'Authorised executive', one row with one gap", head.indexOf("Employee manager") > 0 && head.indexOf("Employee manager") < head.indexOf("RAKESH OJHA") && head.indexOf("RAKESH OJHA") < head.indexOf("Authorised executive") && (head.match(/gap-x-3/g) ?? []).length === 1 && /data-role="delegate"/.test(head));
ok("the HOD's header says 'HOD of C&IT'; until the name arrives there is no empty element; the name is escaped", h(<EmployeeAdminHeader authority="hod" name="X" />).includes("HOD of C&amp;IT") && !h(<EmployeeAdminHeader authority="hod" name={null} />).includes("data-emp-actor") && !h(<EmployeeAdminHeader authority="hod" name="<img src=x onerror=alert(1)>" />).includes("<img"));

// ---- tabs by role ----
const tabsHod = h(<TabBar tab="add" authority="hod" onTab={noop} />), tabsDel = h(<TabBar tab="add" authority="delegate" onTab={noop} />);
ok("the HOD has five tabs: Add, Change, Delete, Authorised people, Recent changes", ["add", "modify", "delete", "people", "history"].every((t) => tabsHod.includes(`data-emp-tab="${t}"`)));
ok("a delegate has THREE: Add, Change, Recent changes (no Delete, no Authorised people)", ["add", "modify", "history"].every((t) => tabsDel.includes(`data-emp-tab="${t}"`)) && !tabsDel.includes('data-emp-tab="delete"') && !tabsDel.includes('data-emp-tab="people"'));

// ---- the form: sections and fields ----
const f0 = form(EMPTY_FORM, { identityOk: false });
ok("the form has its four sections: Identity, Posting, Service dates, Contact; and the live card", ["Identity", "Posting", "Service dates", "Contact"].every((s) => f0.includes(`data-emp-section="${s}"`)) && f0.includes('data-emp-preview="true"'));
ok("the fields: ticket, SAIL P.No., name, DESIGNATION CODE, DEPARTMENT CODE, dates, mobile, address (and NO 'position in the grade' field: the server places him last)", ["Ticket number", "SAIL P.No.", "Name", "Designation code", "Department code", "Date of birth", "Date of joining", "Address"].every((l) => f0.includes(`>${l}<`)) && !f0.includes("Position in the grade") && !hasField(f0, "position") && !/<label[^>]*>Designation<\/label>/.test(f0) && !/<label[^>]*>Department<\/label>/.test(f0));

// ---- THE GATE: the posting fields wait for the Identity ----
ok("until the Identity is right the designation code and the department code are INACTIVE, offer nothing, and the section says what to do first", disabledField(f0, "gradeId") && disabledField(f0, "departmentCode") && f0.includes("Fill in the ticket number, the SAIL P.No. and the name first.") && (f0.match(/<option /g) ?? []).length === 1 && !f0.includes("<datalist") && !f0.includes("Chief General Manager") && !f0.includes(">S-11<"));
const fx = form({ ...EMPTY_FORM, ticketNo: "412345", sailPno: "D1", name: "RAKESH" });
ok("once the Identity is right (an executive ticket) they are ACTIVE and offer only the executive codes, as 'code · title' in groups: no non-executive code is there", !disabledField(fx, "gradeId") && !disabledField(fx, "departmentCode") && fx.includes("222 · Chief General Manager") && fx.includes("204 · Asst. Manager") && fx.includes("204 · Medical Officer") && !fx.includes("409") && !fx.includes("S-11") && fx.includes('label="Managerial"') && fx.includes('label="Medical"') && !fx.includes('label="Non-executive"'));
const fn = form({ ...EMPTY_FORM, ticketNo: "123456", sailPno: "D1", name: "A B C" });
ok("a ticket that is not an executive's (and does not start with 0) offers only the non-executive codes", fn.includes("409 · S-11") && !fn.includes("222 · Chief General Manager") && !fn.includes("Medical Officer") && fn.includes('label="Non-executive"'));
ok("the department codes are a list of the VALID codes of that cohort, each with its name: an executive is offered 100 and 107 (executive), never the codes reserved to non-executives", (() => { const list = fx.slice(fx.indexOf("<datalist"), fx.indexOf("</datalist>")); const opts = list.match(/<option [^>]*>/g) ?? []; return opts.length === 2 && list.includes('value="100"') && list.includes('label="C &amp; IT"') && list.includes('value="107"') && list.includes('label="L &amp; D"') && !list.includes("9003") && !list.includes("NON-EXEC"); })());
ok("...a non-executive is offered 100 (shared), 9003 and 107 (his own), with his own names", (() => { const list = fn.slice(fn.indexOf("<datalist"), fn.indexOf("</datalist>")); return list.includes('value="100"') && list.includes('value="9003"') && list.includes('label="L &amp; D (NON-EXEC)"') && !list.includes('label="L &amp; D"'); })());
ok("a chosen designation code shows its title and kind under it; a typed department code shows the department's name", form({ ...EMPTY_FORM, ticketNo: "412345", sailPno: "D1", name: "RAKESH", gradeId: "1", departmentCode: "107" }).includes("Chief General Manager · managerial") && form({ ...EMPTY_FORM, ticketNo: "412345", sailPno: "D1", name: "RAKESH", gradeId: "1", departmentCode: "107" }).includes(">L &amp; D<"));
ok("under the ticket the form says what he is: non-executive, executive promoted, executive direct recruit (Management Trainee)", form({ ...EMPTY_FORM, ticketNo: "123456" }).includes("Non-executive") && fx.includes("promoted from the non-executives") && form({ ...EMPTY_FORM, ticketNo: "498880" }).includes("direct recruit (Management Trainee)") && form(EMPTY_FORM).includes("Type the 6-digit ticket number"));
ok("changing a person: the ticket field is locked and says so", (() => { const m = form(formFromRecord(REC, L), { mode: "modify", idPrefix: "emp-modify", original: REC }); return /<input[^>]*id="emp-modify-ticketNo"[^>]*disabled=""/.test(m) && m.includes("The ticket cannot be changed here."); })());

// ---- the CONTACT section by cohort ----
ok("with no valid ticket yet the contact fields are inactive, and say 'Type the ticket number first.'", form(EMPTY_FORM, { identityOk: false }).includes("Type the ticket number first.") && disabledField(form(EMPTY_FORM, { identityOk: false }), "mobile") && disabledField(form(EMPTY_FORM, { identityOk: false }), "email"));
ok("an EXECUTIVE: the NIC mail field (@sail.in) and the web-mail field (@saildsp.co.in) are active, the general E-mail field is shown but COMPLETELY INACTIVE ('Not used for an executive')", hasField(fx, "emailNic") && hasField(fx, "webmail") && !disabledField(fx, "emailNic") && !disabledField(fx, "webmail") && disabledField(fx, "email") && fx.includes("NIC mail (@sail.in)") && fx.includes("Web-mail (@saildsp.co.in)") && fx.includes("Not used for an executive."));
ok("...the web-mail domain is the right one (@saildsp.co.in), and the wrong 'sail-dsp.in' appears nowhere", fx.includes("@saildsp.co.in") && !fx.includes("sail-dsp"));
ok("...the executive's mobile is the CUG number: labelled so, with the rule (94347 and then 9, 2 or 3)", fx.includes(">CUG mobile number<") && fx.includes("94347 and then 9 (or 2, 3)"));
ok("a NON-EXECUTIVE: ONE e-mail field, any address, optional; NO NIC mail and NO web-mail field; a plain optional mobile", hasField(fn, "email") && !disabledField(fn, "email") && !hasField(fn, "emailNic") && !hasField(fn, "webmail") && fn.includes("Optional; any address.") && fn.includes(">Mobile number<") && fn.includes("Optional: 10 digits.") && !disabledField(fn, "mobile"));
const modForm = form(formFromRecord(REC, L), { mode: "modify", idPrefix: "emp-modify", original: REC });
ok("in a change the mobile and the e-mails start EMPTY and show what is there MASKED: 'Now 943479xxxx. Type a new one to replace it.' (never a whole number or address)", /id="emp-modify-mobile"[^>]*value=""/.test(modForm) && modForm.includes("Now 943479xxxx. Type a new one to replace it.") && modForm.includes("Now xxxxxx@sail.in. Type a new one to replace it.") && !/\d{10}/.test(modForm.replace(/943479xxxx/g, "")));

// ---- the dates card ----
const withDates = form({ ...formFromRecord(REC, L), dateOfBirth: "1966-10-14", dateOfJoining: "2001-10-12" });
ok("the HOD sees the two dates, with the live line under them: age, the farewell day, service, the jubilee day", withDates.includes('type="date"') && withDates.includes("Age 60 years 0 months · retires on 31 Oct 2026") && withDates.includes("Service 25 years 0 months · 25 years on 12 Oct 2026"));
const locked = form(formFromRecord({ ...REC, dateOfBirth: "", dateOfJoining: "" }, L), { datesVisible: false });
ok("a delegate sees NO date field: a locked card says the dates are the HOD's alone (and no date appears anywhere in what is drawn)", locked.includes('data-emp-dates-locked="true"') && !locked.includes('type="date"') && !locked.includes("Date of birth") && !/\d{4}-\d{2}-\d{2}/.test(locked));
ok("a warning (joined after 32) is drawn in the dates card; the date pickers stop at today and at 1930", form(formFromRecord(REC, L), { warnings: ["He joined at more than 32 years of age"] }).includes('data-emp-warning="true"') && withDates.includes('min="1930-01-01"') && withDates.includes('max="2026-11-01"'));

// ---- button, errors, escaping ----
const off = form(EMPTY_FORM, { submitDisabled: true, submitHint: "Type the name." });
ok("the button is OFF (greyed) with the reason in words; ON without a hint", /<button[^>]*data-emp-submit="add"[^>]*disabled=""/.test(off) && off.includes('data-submit-hint="true"') && off.includes("Type the name.") && !/<button[^>]*data-emp-submit="add"[^>]*disabled=""/.test(form(EMPTY_FORM)) && !form(EMPTY_FORM).includes("data-submit-hint"));
const errs = form(EMPTY_FORM, { errors: { name: "Type the name.", departmentId: "Choose the department.", mobile: "Type the CUG mobile number (every executive has one)." } });
ok("an error is shown under its field, in red, announced; the field is marked invalid", errs.includes('role="alert"') && errs.includes("Type the name.") && errs.includes("Choose the department.") && errs.includes("every executive has one") && /aria-invalid="true"/.test(errs));
ok("everything typed is escaped", !form({ ...EMPTY_FORM, ticketNo: "412345", name: "<img src=x onerror=alert(1)>", address: "<script>x</script>", emailNic: "\"><b>" }).match(/<img src=x|<script>x|<b>/));

// ---- the live card ----
const card = h(<EmployeePreviewCard values={{ ...EMPTY_FORM, name: "  rakesh   ojha ", ticketNo: "412345" }} gradeTitle="Chief General Manager" departmentName="C & IT" />);
ok("the live card: capitals, initials, designation, department and the origin", card.includes("RAKESH OJHA") && card.includes(">RO<") && card.includes("Chief General Manager") && card.includes("C &amp; IT") && card.includes("promoted"));
ok("an empty card shows placeholders; initials: one letter for one word, a question mark for none", h(<EmployeePreviewCard values={EMPTY_FORM} gradeTitle="" departmentName="" />).includes(">NAME<") && initialsOf("Madonna") === "M" && initialsOf("") === "?" && initialsOf("MOHD ANWAR ULLAH") === "MU");

// ---- the review step ----
const rv = h(<ReviewView mode="modify" title="Review" changes={[{ label: "Name", from: "A", to: "B" }]} summary={[]} warnings={[]} conflicts={[]} busy={false} onConfirm={noop} onBack={noop} />);
ok("the review of a change lists what changes: what, now, will become", rv.includes('data-emp-changes="true"') && rv.includes(">Name<") && rv.includes(">A<") && rv.includes(">B<") && rv.includes("Save the changes"));
const rvAdd = h(<ReviewView mode="add" title="Review" changes={[]} summary={[["Name", "RAVI KUMAR"], ["Address", ""]]} warnings={[]} conflicts={[]} busy={false} onConfirm={noop} onBack={noop} />);
ok("the review of a new employee is a summary (an empty field reads a dash)", rvAdd.includes('data-emp-summary="true"') && rvAdd.includes("RAVI KUMAR") && rvAdd.includes("—") && rvAdd.includes("Save the employee"));
const rvC = h(<ReviewView mode="add" title="Review" changes={[]} summary={[]} warnings={[]} conflicts={[{ kind: "same-name", text: "ANIL DAS (412346) is already in C & IT.", with: { id: 1, ticketNo: "412346", name: "ANIL DAS", departmentName: "C & IT" } }]} busy={false} onConfirm={noop} onBack={noop} />);
ok("a same-name clash asks 'Is this a different person?' with Yes and No, naming the other person", rvC.includes('data-emp-conflict="true"') && rvC.includes("Is this a different person?") && rvC.includes("ANIL DAS (412346)") && rvC.includes("Yes, a different person: save") && rvC.includes("No: go back"));
ok("a busy review cannot be confirmed twice", /<button[^>]*data-emp-confirm="true"[^>]*disabled=""/.test(h(<ReviewView mode="add" title="R" changes={[]} summary={[]} warnings={[]} conflicts={[]} busy={true} onConfirm={noop} onBack={noop} />)));

// ---- the list and the history ----
const lst = h(<EmployeeList employees={[REC]} canDelete={true} onEdit={noop} onDelete={noop} />);
ok("the list shows name, ticket, designation, department, and a Change button; Delete only for the HOD", lst.includes("RAKESH OJHA") && lst.includes("412345") && lst.includes("data-emp-edit=\"7\"") && lst.includes("data-emp-delete=\"7\"") && !h(<EmployeeList employees={[REC]} canDelete={false} onEdit={noop} onDelete={noop} />).includes("data-emp-delete"));
ok("an empty search says so", h(<EmployeeList employees={[]} canDelete={false} onEdit={noop} onDelete={noop} />).includes("No employee matches."));
const A = (o: Partial<AuditView>): AuditView => ({ at: "2026-11-01T10:00:00.000Z", actorName: "MOHD ANWAR ULLAH", actorTicket: "498301", actorRole: "hod", actorDesignation: "General Manager", action: "modify", targetTicket: "412345", targetName: "RAKESH OJHA", changes: [], summary: "Changed RAKESH OJHA (412345)", ...o });
const hs = h(<EmployeeHistory history={[A({ changes: [{ field: "name", label: "Name", from: "RAKESH", to: "RAKESH K" }, { field: "dateOfBirth", label: "Date of birth", from: "hidden", to: "hidden" }] }), A({ action: "delete", summary: "Deleted ANIL DAS (412346)", actorRole: "delegate", actorName: "X", actorTicket: "412399" })]} />);
ok("the history is a table: When, What, Details, Done by; a change shows field by field old to new; a hidden date stays 'hidden'", ["When", "What", "Details", "Done by"].every((c) => hs.includes(`>${c}<`)) && hs.includes("Name: <span") && hs.includes("RAKESH K") && (hs.match(/hidden/g) ?? []).length >= 2 && hs.includes("Changed RAKESH OJHA (412345)") && hs.includes("Deleted ANIL DAS (412346)"));
ok("...who did it: name, ticket, post and role; the time in India", hs.includes("MOHD ANWAR ULLAH") && hs.includes("(498301)") && hs.includes("General Manager · HOD of C&amp;IT") && hs.includes("authorised executive") && hs.includes("1 Nov 2026, 3:30 pm"));
ok("history text is escaped", !h(<EmployeeHistory history={[A({ summary: "<img src=x onerror=1>", targetName: "<b>" })]} />).match(/<img src=x|<b>/));

// ---- pure helpers ----
ok("resolveDepartment: by CODE, among the departments that fit the ticket's cohort (107 is two departments: the executives' and the non-executives')", resolveDepartment("100", L, "412345")?.id === 1 && resolveDepartment("107", L, "412345")?.id === 2 && resolveDepartment("107", L, "123456")?.id === 5 && resolveDepartment("9003", L, "412345") === null && resolveDepartment("abc", L, "412345") === null && resolveDepartment("", L, "412345") === null && resolveDepartment("999", L, "412345") === null);
ok("gradeLabel: 'code · title'", gradeLabel({ code: 222, title: "Chief General Manager" }) === "222 · Chief General Manager");
ok("rawOf: the department code becomes its id, the designation a number, the position is NEVER sent, the contact fields go as typed, the doctor flag true / false (was a doctor, box cleared) / null", (() => { const r = rawOf({ ...formFromRecord(REC, L), mobile: "9434791234", doctor: false }, L, { ...REC, doctor: true }); return r.departmentId === 1 && r.gradeId === 1 && r.position === null && r.mobile === "9434791234" && r.doctor === false && rawOf(EMPTY_FORM, L, null).doctor === null && rawOf({ ...EMPTY_FORM, doctor: true }, L, null).doctor === true; })());
const ch = changesOf(REC, { ...formFromRecord(REC, L), name: "rakesh k ojha", departmentCode: "107", gradeId: "9", dateOfBirth: "1966-11-14", mobile: "+91 94347 21111", emailNic: "r.k@sail.in" }, L, true);
ok("changesOf: field by field, only what differs (the name tidied, the designation by title, a new grade says 'last in the new grade'), and a typed mobile or mail shown MASKED and marked as replacing", ch.map((c) => c.label).join() === "Name,Designation,Department,Position in grade,Date of birth,Mobile,NIC mail" && ch[0].to === "RAKESH K OJHA" && ch[1].to === "Asst. Manager" && ch[3].to === "last in the new grade" && ch[4].from === "1966-10-14" && ch[5].to === "943472xxxx (replaces it)" && ch[6].to === "xxxxxx@sail.in (replaces it)" && !JSON.stringify(ch).includes("9434721111"), JSON.stringify(ch));
ok("changesOf: nothing differs, nothing listed; the dates are left out when the person may not see them", changesOf(REC, formFromRecord(REC, L), L, true).length === 0 && changesOf(REC, { ...formFromRecord(REC, L), dateOfBirth: "1999-01-01" }, L, false).length === 0);
ok("changesOf: a non-executive's typed e-mail is listed as 'E-mail', not as a NIC mail", changesOf({ ...REC, cohort: "nonexecutive", ticketNo: "123456", emailMasked: "" }, { ...formFromRecord({ ...REC, cohort: "nonexecutive", ticketNo: "123456" }, L), email: "me@gmail.com" }, L, true).some((c) => c.label === "E-mail" && c.to === "xxxxxx@gmail.com (replaces it)"));

// ---- the panel as first drawn ----
const first = h(<EmployeeAdminPanel open={{ op: "add", role: "hod" }} />);
ok("the panel first shows the header, the tabs and the Add form with the posting fields INACTIVE; the button is off ('Loading…' until the codes arrive)", first.includes('data-emp-panel="true"') && first.includes('data-emp-tab="add"') && first.includes('data-emp-form="add"') && first.includes("Loading…") && /<button[^>]*data-emp-submit="add"[^>]*disabled=""/.test(first) && disabledField(first, "gradeId") && disabledField(first, "departmentCode"));
ok("a request to change opens on the search; to delete (the HOD) on the search for the delete; to delegate on the people tab; a delegate asking to delete is put on Add", h(<EmployeeAdminPanel open={{ op: "modify", role: "hod" }} />).includes('data-emp-search="true"') && h(<EmployeeAdminPanel open={{ op: "delete", role: "hod" }} />).includes("Find the employee to delete") && h(<EmployeeAdminPanel open={{ op: "delegate", role: "hod" }} />).includes('data-emp-people="true"') && h(<EmployeeAdminPanel open={{ op: "delete", role: "delegate" }} />).includes('data-emp-form="add"'));
ok("the name or ticket the sentence carried is already in the Add form; the search text in the search box", h(<EmployeeAdminPanel open={{ op: "add", role: "hod", prefill: { name: "RAVI KUMAR" } }} />).includes('value="RAVI KUMAR"') && h(<EmployeeAdminPanel open={{ op: "modify", role: "hod", prefill: { query: "goutam debnath" } }} />).includes('value="goutam debnath"'));

// ---- guards on the source ----
const src = readFileSync("src/components/EmployeeAdminPanel.tsx", "utf8");
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
ok("no <form> tag in the code (the search modal holds a text area; forms must not nest)", !/<form[\s>]/.test(code));
ok("ADDING and CHANGING have SEPARATE states (two form blocks): what was loaded or typed in one never shows in the other; switching tabs does not reset either", /const addB = useFormBlock\(/.test(src) && /const modB = useFormBlock\(/.test(src) && /const B = mode === "modify" \? modB : addB/.test(src) && /const onTab = \(t: Tab\) => \{ setTab\(t\); setMessage\(null\); \};/.test(src) && !/setValues\(formFromRecord/.test(src));
ok("a saved CHANGE refills only the Change form; a saved ADD empties only the Add form", /modB\.reset\(formFromRecord\(res\.employee, lk\)\)/.test(src) && /else addB\.reset\(\)/.test(src));
ok("the Identity gate: designation, department and contact stay inactive until a ticket of 6 digits, the SAIL P.No. and the name are right", /const identityOk = !!lookups && idFilled && !liveErrors\.ticketNo && !liveErrors\.sailPno && !liveErrors\.name/.test(src));
ok("the 'still mounted' flag is switched ON again at every mount (StrictMode)", /useEffect\(\(\) => \{ alive\.current = true; return/.test(src));
ok("every request has a time limit, and a failing one becomes a sentence, never a hang", /AbortController/.test(src) && /TIMEOUT_MS = 20000/.test(src) && /did not answer in time/.test(src));
ok("the panel never decides who may do what: no ticket, no role is sent, only the fields", !/ticket:\s*me|role:\s*role|actor/.test(src.slice(src.indexOf("const save = async"), src.indexOf("// ---- the search"))));
ok("dates are drawn with Luxon only (no built-in Date)", !/new Date\(|toLocaleDateString|getFullYear/.test(src));
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the search modal draws the manager from analytics.employeeAdmin, after the PAX editor and before the hospital card", modal.includes('import { EmployeeAdminPanel } from "@/components/EmployeeAdminPanel";') && modal.indexOf("analytics.employeeAdmin ? (") > modal.indexOf("analytics.paxAdmin ? (") && modal.indexOf("analytics.employeeAdmin ? (") < modal.indexOf("analytics.hospital ? ("));

console.log(`EmployeeAdminPanel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
