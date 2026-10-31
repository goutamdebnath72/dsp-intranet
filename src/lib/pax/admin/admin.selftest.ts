// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/pax/admin/admin.selftest.ts
// Step 64a: the rules of the PAX admin panel: what a line may hold, when it clashes with a saved one, and which sentences open the editor. PURE: no database.

import { acknowledgementCovers, describeLine, findConflicts, placeKey, savedLines } from "./conflicts";
import { detectPaxAdminIntent } from "./intent";
import { cleanInput, composeLabel, PAX_NUMBER_RULE, validateEntry } from "./validate";
import type { PaxArea, PaxRow } from "../matcher";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ---- the rules of a line ----
const v = (department: string, location: string, number: string) => validateEntry({ department, location, number });
ok("a good line passes and is tidied (spaces joined, ends trimmed)", (() => { const r = v("  Stores   Dept ", " Main  Gate ", " 42555 "); return r.ok && r.value.department === "Stores Dept" && r.value.location === "Main Gate" && r.value.number === "42555"; })());
ok("the location may be empty", v("Stores", "", "42555").ok);
ok("a PAX number is five digits starting with 4: 42046, 40000, 49999 pass", v("A1", "", "42046").ok && v("A1", "", "40000").ok && v("A1", "", "49999").ok);
for (const bad of ["52046", "4204", "420460", "4204a", "42 046", "42-046", "04204", "", "abcde", "4.2046", "42046 ", "４２０４６", "٤٢٠٤٦"]) {
  const r = v("Stores", "", bad);
  // "42046 " is tidied to 42046 and passes (a trailing space is not the number's fault); full-width digits are made plain by NFKC and pass; other scripts' digits are refused (safer)
  const shouldPass = bad === "42046 " || bad === "４２０４６";
  ok(`number "${bad}" ${shouldPass ? "is tidied and passes" : "is refused"}`, r.ok === shouldPass, JSON.stringify(r));
}
ok("the message names the rule in words the HOD can follow", (() => { const r = v("Stores", "", "52046"); return !r.ok && r.errors.number === PAX_NUMBER_RULE && /5 digits/.test(PAX_NUMBER_RULE) && /starts with 4/.test(PAX_NUMBER_RULE); })());
ok("a department is required, needs letters, and has a sane length", !v("", "", "42046").ok && !v("A", "", "42046").ok && !v("12345", "", "42046").ok && !v("x".repeat(81), "", "42046").ok && v("x".repeat(80), "", "42046").ok);
ok("every wrong field is reported at once (department, location, number)", (() => { const r = v("", "x".repeat(81), "1"); return !r.ok && !!r.errors.department && !!r.errors.location && !!r.errors.number; })());
for (const bad of ["<script>alert(1)</script>", "Stores; DROP TABLE pax_directory", "Stores\u0000", "Stores\nMain", "a@b"]) {
  const r = v(bad, "", "42046");
  ok(`department "${JSON.stringify(bad).slice(0, 30)}" is judged without harm`, bad === "Stores\nMain" ? r.ok : !r.ok, JSON.stringify(r));
}
ok("accepted marks: & - – ( ) . , / ' in a name", v("C & IT", "Gate No. 2A (Opp. Admin)", "42046").ok && v("O'Neil / Sons", "A – Zone", "42046").ok);
ok("cleanInput never throws on odd values", (() => { try { return cleanInput({ department: null, location: undefined, number: 42046 as unknown }).number === "42046"; } catch { return false; } })());
ok("composeLabel: a bracket keeps the two parts apart; no location, no bracket", composeLabel("Stores", "Main Gate") === "Stores (Main Gate)" && composeLabel("Stores", "") === "Stores");

// ---- when a line clashes with a saved one ----
const areaOf = (n: string): PaxArea => (/^4[0-2]\d{3}$/.test(n) ? "plant" : "outside");
const row = (id: number, label: string, number: string, curated?: { department: string; location: string }): PaxRow => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label);
  return { id, label, deptName: curated?.department ?? (m ? m[1] : label), location: curated?.location ?? (m ? m[2] : ""), number, note: "", area: areaOf(number), curated: !!curated };
};
const SAVED: PaxRow[] = [
  row(1, "CISF Admin Gate", "40384"), row(2, "CISF Gate No. 2A", "42384"), row(3, "CISF Gate No. 5", "42748"), row(4, "CISF Tumla Gate", "40926"), row(5, "CISF Tumla Gate", "42043"),
  row(6, "Weigh Bridge – 60T", "40173"), row(7, "Weigh Bridge – 80T", "40273"), row(8, "Weigh Bridge – North End", "41241"), row(9, "Weigh Bridge – South End", "40591"), row(10, "Weigh Bridge – Tumla Gate", "42043"),
  row(11, "Fire Service", "42050"), row(12, "Plant Medical (PMU)", "41301"), row(13, "Water Supply (A – Zone)", "45622"), row(14, "Water Supply (B – Zone)", "45109"),
];
const find = (d: string, l: string, n: string, o = {}) => findConflicts(SAVED, { department: d, location: l, number: n }, o);
const kinds = (c: ReturnType<typeof find>) => c.map((x) => x.kind).sort().join(",");

ok("a new place with a new number: no clash", find("Stores", "Main", "42555").length === 0);
ok("same NUMBER as a saved line: 'same-number', and it names the line (department - location (number))", (() => { const c = find("Stores", "Main", "41241"); return kinds(c) === "same-number" && describeLine(c[0].existing[0]) === "Weigh Bridge - North End (41241)"; })(), kinds(find("Stores", "Main", "41241")));
ok("42043 stands on TWO saved lines: both are named", (() => { const c = find("Stores", "Main", "42043"); return c.length === 1 && c[0].kind === "same-number" && c[0].existing.length === 2; })());
ok("same PLACE with another number: 'same-place', all numbers of the place are named (CISF Tumla Gate has two)", (() => { const c = find("CISF", "Tumla Gate", "42777"); return kinds(c) === "same-place" && c[0].existing.map((e) => e.number).sort().join() === "40926,42043"; })(), kinds(find("CISF", "Tumla Gate", "42777")));
ok("same place, written in other case and spaces: still the same place", kinds(find("cisf", "  tumla   GATE ", "42777")) === "same-place");
ok("an empty location and 'Office' are the same place (the table shows Office for none)", (() => { const r = [row(1, "Fire Service", "42050")]; return findConflicts(r, { department: "Fire Service", location: "Office", number: "42999" }).map((c) => c.kind).join() === "same-place" && findConflicts(r, { department: "Fire Service", location: "", number: "42999" }).map((c) => c.kind).join() === "same-place"; })());
ok("same place AND same number (an exact duplicate): the number clash is there, so there is no way through", (() => { const c = find("CISF", "Admin Gate", "40384"); return c.some((x) => x.kind === "same-number") && !acknowledgementCovers(c, ["second-number", "different"]); })());
ok("a spelling slip is a SIMILAR place: 'Fire Servise', 'Weigh Bridge – Nort End'", kinds(find("Fire Servise", "", "42999")) === "similar-place" && kinds(find("Weigh Bridge", "Nort End", "42999")) === "similar-place");
ok("'Gate No. 2' is read like 'Gate No. 2A' (the same gate): similar", kinds(find("CISF", "Gate No. 2", "42999")) === "similar-place");
ok("a whole name as the department (no location) reads like the same name split in two: 'CISF' / 'Tumla Gate' against a saved 'CISF Tumla Gate'", (() => { const rows = [row(1, "CISF Tumla Gate", "40926"), row(2, "Fire Service", "42050")]; return findConflicts(rows, { department: "CISF", location: "Tumla Gate", number: "42777" }).map((c) => c.kind).join() === "similar-place" && findConflicts(rows, { department: "CISF Tumla Gate", location: "", number: "42777" }).map((c) => c.kind).join() === "same-place"; })());
ok("...and the other way round: 'CISF Tumla Gate' typed whole against saved 'CISF' / 'Tumla Gate'", findConflicts([row(1, "x", "40926", { department: "CISF", location: "Tumla Gate" })], { department: "CISF Tumla Gate", location: "", number: "42777" }).map((c) => c.kind).join() === "similar-place");
ok("the words in another order read alike: 'Gate Tumla' for 'Tumla Gate'", kinds(find("CISF", "Gate Tumla", "42999")).includes("similar-place"));
ok("a DIFFERENT place is not a clash: Gate 6 vs Gate 5, 90T vs 60T, South End vs North End, Zone C vs Zone A", find("CISF", "Gate No. 6", "42999").length === 0 && find("Weigh Bridge", "90T", "42999").length === 0 && find("Weigh Bridge", "Mid End", "42999").length === 0 && find("Water Supply", "C – Zone", "42999").length === 0);
ok("a different department with the same location is not a clash: 'Stores' / 'Tumla Gate'", find("Stores", "Tumla Gate", "42999").length === 0);
ok("a clash can have more than one kind at once: same number AND a similar place", (() => { const c = find("Fire Servise", "", "42050"); return kinds(c) === "same-number,similar-place"; })(), kinds(find("Fire Servise", "", "42050")));
// changing a saved line
ok("a line never clashes with itself: changing the location of Fire Service (id 11) keeping its number", findConflicts(SAVED, { department: "Fire Service", location: "Gate", number: "42050" }, { ignoreId: 11, keepsNumber: true }).length === 0);
ok("...but its NEW number is checked: 41241 belongs to the North End weigh bridge", kinds(findConflicts(SAVED, { department: "Fire Service", location: "", number: "41241" }, { ignoreId: 11 })) === "same-number");
ok("42043 is on two lines already: changing only the location of one of them (keeping the number) is possible", findConflicts(SAVED, { department: "CISF", location: "Tumla Gate No. 3", number: "42043" }, { ignoreId: 5, keepsNumber: true }).filter((c) => c.kind === "same-number").length === 0);
ok("...and its name still clashes when it is the place of another line (id 10 renamed to CISF Tumla Gate)", findConflicts(SAVED, { department: "CISF", location: "Tumla Gate", number: "42043" }, { ignoreId: 10, keepsNumber: true }).some((c) => c.kind === "same-place"));
// what a line made in the panel looks like
const withPortal = [...SAVED, row(20, "Stores (Main Gate)", "42555", { department: "Stores", location: "Main Gate" })];
ok("a line made in the panel is read exactly as typed (its own two parts), also for the clash message", (() => { const l = savedLines(withPortal).find((x) => x.id === 20)!; return l.department === "Stores" && l.location === "Main Gate"; })());
ok("a line is written 'department - location (number)', and a department with no location alone: 'Fire Service (42050)'", describeLine({ id: 1, department: "Weigh Bridge", location: "60T", number: "40173" }) === "Weigh Bridge - 60T (40173)" && describeLine({ id: 2, department: "Fire Service", location: "", number: "42050" }) === "Fire Service (42050)");
ok("placeKey equal for the same words", placeKey("CISF", "Tumla Gate") === placeKey(" cisf ", "tumla  gate"));
// the answers
const c1 = find("CISF", "Tumla Gate", "42777"), c2 = find("Fire Servise", "", "42999"), c3 = find("Stores", "Main", "41241");
ok("acknowledging: 'second-number' covers a same-place clash only; 'different' covers a similar-place clash only; a number clash is never covered", acknowledgementCovers(c1, ["second-number"]) && !acknowledgementCovers(c1, ["different"]) && !acknowledgementCovers(c1, []) && acknowledgementCovers(c2, ["different"]) && !acknowledgementCovers(c2, ["second-number"]) && !acknowledgementCovers(c3, ["second-number", "different"]) && acknowledgementCovers([], []));

// ---- which sentences open the editor ----
const intent = (q: string) => detectPaxAdminIntent(q);
const add = ["add new pax number", "add a new pax number", "Add pax number", "new pax number", "new pax entry", "new pax", "I want to add a new pax number", "I would like to add new pax numbers", "please add a new pax", "kindly add pax number for stores", "create a new pax entry", "create pax number", "register new pax number", "register a pax extension for stores", "insert a new pax number", "enter a new pax number", "enter pax 42555 for Garage", "include a new pax number in the directory", "append new pax numbers", "pax addition", "adding a new pax number", "add new pax numbers to the directory", "How do I add a new pax number", "how to add pax", "can I add a new pax number", "need to add new pax numbers", "add pax 42555", "add new extension number", "add a new intercom number"];
for (const q of add) ok(`ADD: "${q}"`, intent(q)?.op === "add", JSON.stringify(intent(q)));
const modify = ["edit pax number", "edit an existing pax number", "modify pax number", "modify the pax of fire service", "update pax number of fire service", "change pax 42046", "change a pax number", "correct a pax entry", "correct pax number", "pax modification", "I want to change a pax number", "please update the pax number for stores", "revise pax number", "amend pax entry", "fix a pax number"];
for (const q of modify) ok(`MODIFY: "${q}"`, intent(q)?.op === "modify", JSON.stringify(intent(q)));
const del = ["delete pax number", "delete pax 42046", "remove a pax number", "remove pax 42046", "remove the pax number of fire service", "pax deletion", "erase pax number", "I want to delete a pax entry"];
for (const q of del) ok(`DELETE: "${q}"`, intent(q)?.op === "delete", JSON.stringify(intent(q)));
const delegate = ["delegate pax to Rakesh Ojha", "delegate pax authority", "delegate pax number editing to another executive", "give pax access to Rakesh Ojha", "give access for pax to another executive", "authorise Rakesh Ojha for pax", "authorize someone to edit pax numbers", "grant pax permission", "pax delegation", "revoke pax delegation", "revoke pax access of Rakesh Ojha", "withdraw pax permission", "remove pax access from Rakesh Ojha", "take back pax access", "cancel pax delegation", "who can edit pax numbers", "who has pax access", "which executives can edit pax"];
for (const q of delegate) ok(`DELEGATE/REVOKE: "${q}"`, intent(q)?.op === "delegate", JSON.stringify(intent(q)));
const manage = ["manage pax directory", "pax admin", "update pax directory", "maintain pax directory", "administer pax"];
for (const q of manage) ok(`MANAGE: "${q}"`, intent(q)?.op === "manage", JSON.stringify(intent(q)));
// what must NOT open the editor
const notAdmin = ["pax number of fire service", "who has 42043", "how many pax numbers", "pax", "pax directory", "list all pax numbers", "show new pax numbers", "which pax numbers were added recently", "what is the pax number of the new gate", "pax number of change room", "phone number of Rakesh Ojha", "contact number of departments", "pax not working", "pax complaint", "pax numbers outside plant", "pax of edit section", "add", "new", "add new number", "delete my account", "remove the circular", "update the leave policy", "add a holiday", "extension of mediclaim policy", "the extension of the circular is deleted", "where can I add a pax", "", "   "];
for (const q of notAdmin) ok(`NOT an admin intent: "${q}"`, intent(q) === null, JSON.stringify(intent(q)));
ok("the number typed is picked out to save typing: 'add pax 42555 for Garage' -> number 42555, department Garage", (() => { const i = intent("add pax 42555 for Garage"); return i?.op === "add" && i.prefill?.number === "42555" && i.prefill?.department === "garage"; })(), JSON.stringify(intent("add pax 42555 for Garage")));
ok("a number that is not a PAX number is NOT picked out (52555)", intent("add pax 52555")?.prefill?.number === undefined);
ok("modify and delete get a search word, not a department: 'edit the pax of fire service' -> query 'fire service'", intent("edit the pax of fire service")?.prefill?.query === "fire service" && intent("delete pax 42046")?.prefill?.number === "42046");
ok("a plain 'add new pax number' prefills nothing", JSON.stringify(intent("add new pax number")) === JSON.stringify({ op: "add" }));

console.log(`pax admin selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
