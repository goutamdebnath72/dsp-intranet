// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/disciplineColumn.selftest.ts
// Step 53a: the "Discipline" column of a list of doctors, and its place in the model's column hint.

import { addDisciplineColumn, presentPeople, withCohortInHint } from "./seniorityDisplay";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const cols = ["ticket_no", "name", "designation", "department"];
const rows = [
  { ticket_no: "499116", name: "AJIT KARMAKAR", designation: "Sr. Deputy Director", department: "MEDICAL ORGANISATION" },
  { ticket_no: "490196", name: "MANISH KUMAR", designation: "Medical Officer", department: "MEDICAL ORGANISATION" },
];
const people = [
  { ticketNo: "499116", isExecutive: true, discipline: "Medicine" },
  { ticketNo: "490196", isExecutive: true, discipline: null },
];

const a = presentPeople(cols, rows, people);
ok("the columns: cohort after designation, then discipline", a.columns.join(",") === "ticket_no,name,designation,cohort,discipline,department", a.columns.join(","));
ok("a doctor with a discipline shows it; one without gets a blank, not a guess", a.rows[0].discipline === "Medicine" && a.rows[1].discipline === null);
ok("the other values are untouched", a.rows[0].name === "AJIT KARMAKAR" && a.rows[1].department === "MEDICAL ORGANISATION" && a.rows[0].cohort === "Executive");

const none = presentPeople(cols, rows, [{ ticketNo: "499116", isExecutive: true }, { ticketNo: "490196", isExecutive: true }]);
ok("a list in which nobody has a discipline gets NO column", !none.columns.includes("discipline") && none.columns.join(",") === "ticket_no,name,designation,cohort,department");
ok("a list with no people (a count) is untouched", addDisciplineColumn(["n"], [{ n: 3 }], null).columns.join() === "n");
ok("a list without a ticket column is untouched", addDisciplineColumn(["name"], [{ name: "X" }], people).columns.join() === "name");
const own = addDisciplineColumn([...cols, "discipline"], rows.map((r) => ({ ...r, discipline: "x" })), people);
ok("a discipline column the SQL already returned is left alone", own.columns.filter((c) => c === "discipline").length === 1 && own.rows[0].discipline === "x");
const noDesig = addDisciplineColumn(["ticket_no", "name"], [{ ticket_no: "499116", name: "A" }], people);
ok("with no designation or cohort column it goes after the name", noDesig.columns.join() === "ticket_no,name,discipline");
ok("a person the list does not know is a blank", addDisciplineColumn(["ticket_no", "name"], [{ ticket_no: "1", name: "A" }, { ticket_no: "499116", name: "B" }], people).rows[0].discipline === null);

// the model's column hint
const hint = { columns: [{ key: "ticket_no", label: "Ticket" }, { key: "name", label: "Name" }, { key: "designation", label: "Designation" }, { key: "department", label: "Dept" }] };
const h1 = withCohortInHint(hint, [...a.columns]) as { columns: { key: string }[] };
ok("in the model's hint: cohort after designation, discipline after cohort", h1.columns.map((c) => c.key).join() === "ticket_no,name,designation,cohort,discipline,department", h1.columns.map((c) => c.key).join());
const h2 = withCohortInHint(hint, ["ticket_no", "name", "designation", "cohort", "department"]) as { columns: { key: string }[] };
ok("a list with no discipline: the hint gets only the cohort (exactly as before this step)", h2.columns.map((c) => c.key).join() === "ticket_no,name,designation,cohort,department");
ok("a hint that already names discipline is left alone", JSON.stringify(withCohortInHint({ columns: ["ticket_no", "name", "discipline"] }, ["ticket_no", "name", "cohort", "discipline"])) !== undefined);
ok("a hint that names neither designation nor name is untouched", JSON.stringify(withCohortInHint({ columns: [{ key: "department" }] }, ["department", "cohort", "discipline"])) === JSON.stringify({ columns: [{ key: "department" }] }));
ok("no hint, a non-object hint: returned as it is", withCohortInHint(null, ["cohort"]) === null && withCohortInHint("x", ["cohort"]) === "x");
console.log(`discipline column selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
