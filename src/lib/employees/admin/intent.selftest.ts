// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/admin/intent.selftest.ts
// Step 66a: which sentences ask for a CHANGE of employee data, and which are only questions. PURE.

import { detectEmployeeAdminIntent as d } from "./intent";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const op = (q: string) => d(q)?.op ?? null;

for (const [q, want] of [
  ["add new employee", "add"], ["add an employee", "add"], ["Add employee", "add"], ["new employee", "add"], ["register a new employee", "add"], ["create employee record", "add"], ["please enter a new employee", "add"], ["I want to add a new employee", "add"], ["employee addition", "add"], ["onboard new employee", "add"],
  ["edit employee record", "modify"], ["edit employee dob", "modify"], ["update employee goutam debnath", "modify"], ["modify employee 498880", "modify"], ["change dob of goutam debnath", "modify"], ["correct the date of joining of 498880", "modify"], ["employee modification", "modify"], ["update employee details", "modify"], ["change employee designation", "modify"],
  ["delete employee 498880", "delete"], ["remove employee Anil Das", "delete"], ["employee deletion", "delete"], ["delete an employee record", "delete"],
  ["delegate employee editing to Rakesh Ojha", "delegate"], ["give employee access to Rakesh Ojha", "delegate"], ["authorise Rakesh Ojha for employee records", "delegate"], ["revoke employee access", "delegate"], ["withdraw employee permission", "delegate"], ["who can edit employee records", "delegate"], ["remove employee access of Rakesh Ojha", "delegate"],
  ["manage employees", "manage"], ["employee admin", "manage"], ["employee management", "manage"],
] as const) ok(`CHANGE: "${q}" -> ${want}`, op(q) === want, String(op(q)));

for (const q of [
  "how many employees", "show employees of C&IT", "list of employees", "who is Rakesh Ojha", "employees with a birthday today", "new employees this month", "what is the dob of goutam debnath", "dob of goutam debnath", "when does 498880 retire",
  "number of employees in blast furnace", "employee of the month", "tell me about employee welfare", "which employees joined in 2020", "pax number of fire service", "holiday list 2026", "contact number of Rakesh Ojha", "", "employee", "employees",
  "age of Rakesh Ojha", "date of birth of Anil Das", "where is the employee canteen", "show me new employees",
]) ok(`QUESTION (not a change): "${q}"`, d(q) === null, JSON.stringify(d(q)));

ok("a ticket number in the sentence is carried to the panel", d("edit employee 498880")?.prefill?.ticket === "498880" && d("delete employee 412345")?.prefill?.ticket === "412345");
ok("a name in a change sentence is carried as the search text (modify, delete) or as the name to add", d("update employee goutam debnath")?.prefill?.query === "goutam debnath" && d("change dob of goutam debnath")?.prefill?.query === "goutam debnath" && d("add employee ravi kumar")?.prefill?.name === "RAVI KUMAR");
ok("no name, no ticket: no prefill (the panel opens on its search)", d("edit employee record")?.prefill === undefined && d("add new employee")?.prefill === undefined);
ok("a name that contains an action word is still a name further in the sentence (it is the FIRST word that acts)", op("edit employee anil change") === "modify" && op("who is change kumar") === null);
ok("the PAX words do not make an employee request (the PAX route has its own reading and goes first)", d("add new pax number") === null && d("delete pax 42046") === null);
ok("capital letters, punctuation and extra spaces do not matter", op("  ADD   New   Employee!! ") === "add" && op("Edit employee, record?") === "modify");

console.log(`employee admin intent selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
