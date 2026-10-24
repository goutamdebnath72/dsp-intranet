// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/honorific.selftest.ts
// "Dr." before a name, only when it is shown: who gets it, never twice, a typed "Dr." is ignored when searching, the table says what the card says. With TEST_DATABASE_URL set it also
// runs the real people queries on the scratch database.

import { DR_TICKETS, isPhdHolder, makePhdHolder, makeTitleFor, stripDoctorTitle, titleFor, withTitle, withTitlesInRows } from "./honorific";
import { isDoctorQuestion, DOCTOR_DOC } from "../nl2sql/medicalCadre";
import { buildPrompt } from "../nl2sql/prompt";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---- who gets the title
eq("a person on the medical track", titleFor("499930", "medical"), "Dr.");
eq("a person on the managerial track", titleFor("499930", "managerial"), null);
eq("a non-executive (track nonexec)", titleFor("240203", "nonexec"), null);
eq("a person whose track is not known", [titleFor("499930", null), titleFor("499930", undefined), titleFor(null, "")], [null, null, null]);
const t2 = makeTitleFor(["441772", " 240203 "]);
eq("a listed ticket (a non-medical PhD holder) gets it, whatever the track", [t2("441772", "managerial"), t2("240203", "nonexec"), t2(441772, null)], ["Dr.", "Dr.", "Dr."]);
eq("an unlisted ticket does not", [t2("441773", "managerial"), t2(undefined, null)], [null, null]);
eq("a doctor listed as well is still just one title", t2("441772", "medical"), "Dr.");
ok("the real list is well formed: six digits, no ticket twice", DR_TICKETS.every((t) => /^\d{6}$/.test(t)) && new Set(DR_TICKETS).size === DR_TICKETS.length, JSON.stringify(DR_TICKETS));

eq("the owner's confirmed PhD holder (a non-medical executive) gets the title; the other Partha (235067, Mukherjee) does not", [titleFor("440480", "managerial"), titleFor("235067", "nonexec")], ["Dr.", null]);
eq("...and is shown as the owner expects", withTitle("PARTHA MUKHOPADHYAY", titleFor("440480", "managerial")), "Dr. PARTHA MUKHOPADHYAY");

// ---- the PhD badge (only the listed non-medical people)
const ph = makePhdHolder(["441772", " 240203 "]);
eq("a listed ticket: the badge", [ph("441772", "managerial"), ph("240203", "nonexec"), ph(441772, null)], [true, true, true]);
eq("an unlisted ticket: none", [ph("441773", "managerial"), ph(undefined, null), ph("", "managerial")], [false, false, false]);
eq("a doctor needs no badge, even if listed (the Dr. and the designation say it)", ph("441772", "medical"), false);
eq("every one of the 40 doctors has the title but no PhD badge", [titleFor("499930", "medical"), isPhdHolder("499930", "medical")], ["Dr.", false]);
eq("the owner's confirmed PhD holder has both the title and the badge; the other Partha neither", [[titleFor("440480", "managerial"), isPhdHolder("440480", "managerial")], [titleFor("235067", "nonexec"), isPhdHolder("235067", "nonexec")]], [["Dr.", true], [null, false]]);
eq("whoever is on the list has the badge, and the title: the two always agree for a non-doctor", DR_TICKETS.map((x) => [titleFor(x, "managerial"), isPhdHolder(x, "managerial")]), DR_TICKETS.map(() => ["Dr.", true]));

// ---- showing it
eq("the name with the title", withTitle("ARIJIT CHAKRABORTY", "Dr."), "Dr. ARIJIT CHAKRABORTY");
eq("no title, no change", [withTitle("ARIJIT CHAKRABORTY", null), withTitle("ARIJIT CHAKRABORTY"), withTitle("ARIJIT CHAKRABORTY", "")], Array(3).fill("ARIJIT CHAKRABORTY"));
eq("never twice: a name that already starts with Dr is left alone", ["Dr. A SEN", "DR A SEN", "dr. a sen", "Doctor A Sen", " DR.A SEN"].map((n) => withTitle(n, "Dr.")), ["Dr. A SEN", "DR A SEN", "dr. a sen", "Doctor A Sen", " DR.A SEN"]);
eq("a name that only STARTS with the letters dr is a real name: DRONA gets the title", withTitle("DRONA ACHARYA", "Dr."), "Dr. DRONA ACHARYA");
eq("a missing name stays empty", [withTitle(undefined, "Dr."), withTitle(null, "Dr."), withTitle("", "Dr.")], ["", "", ""]);

// ---- a typed Dr. is ignored when searching
eq("Dr. Anil Kumar means Anil Kumar", [stripDoctorTitle("Dr. Anil Kumar"), stripDoctorTitle("dr anil kumar"), stripDoctorTitle("DR.ANIL KUMAR"), stripDoctorTitle("Doctor Roy")], ["Anil Kumar", "anil kumar", "ANIL KUMAR", "Roy"]);
eq("only a LEADING title is removed; real names are untouched", [stripDoctorTitle("Drona Acharya"), stripDoctorTitle("Andrew Dr Smith"), stripDoctorTitle("dr"), stripDoctorTitle("Dr."), stripDoctorTitle("driver"), stripDoctorTitle("")], ["Drona Acharya", "Andrew Dr Smith", "dr", "Dr.", "driver", ""]);

// ---- the table and the CSV say what the card says
const people = [{ ticketNo: "499930", title: "Dr.", name: "A" }, { ticketNo: "490093", title: null, name: "B" }];
const rows = [{ ticket_no: "499930", name: "ARIJIT CHAKRABORTY", designation: "Joint Director" }, { ticket_no: "490093", name: "VINAYAK SHARMA", designation: "General Manager" }, { ticket_no: "111111", name: "NOBODY", designation: "x" }];
eq("only the doctor's row gets the title; other columns and rows untouched", withTitlesInRows(rows, people), [{ ticket_no: "499930", name: "Dr. ARIJIT CHAKRABORTY", designation: "Joint Director" }, rows[1], rows[2]]);
ok("the original rows are not changed (no side effect)", rows[0].name === "ARIJIT CHAKRABORTY");
ok("no people, or nobody with a title: the very same rows come back", withTitlesInRows(rows, null) === rows && withTitlesInRows(rows, [{ ticketNo: "1", title: null }]) === rows && withTitlesInRows(rows, []) === rows);
eq("a table without a name column is left alone", withTitlesInRows([{ ticket_no: "499930", count: 3 }], people), [{ ticket_no: "499930", count: 3 }]);

// ---- the search model: a typed Dr. is a title, not a name word
for (const q of ["who is Dr. Anil Kumar", "Dr Sanjay Roy", "executives like dr. mukherjee in M&HS"]) ok(`the doctor rule is added for: ${q}`, isDoctorQuestion(q));
for (const q of ["how many executives are there in main hospital, list them?", "how many executives work in each section of C&IT", "who is more senior, Mohd Anwar Ullah or Rana Saha", "list the employees whose name has kumar as a word", "drive to the plant gate"]) ok(`an ordinary question is not: ${q}`, !isDoctorQuestion(q));
ok("the rule tells the model that names are stored without the title", /names are stored WITHOUT it/.test(DOCTOR_DOC));
const context = { designations: [], departments: [] } as never;
const withDoc = buildPrompt({ question: "how many doctors are there in main hospital", context, examples: [] });
const without = buildPrompt({ question: "how many executives are there in main hospital", context, examples: [] });
ok("the doctor rule stays modest (under 1800 characters), only for those questions", withDoc.length - without.length > 400 && withDoc.length - without.length < 1800, `${withDoc.length - without.length}`);

// ---- the real queries on the scratch database (skipped without TEST_DATABASE_URL)
async function db() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) { console.log("  (database checks skipped: TEST_DATABASE_URL is not set)"); return; }
  const { Client } = await import("pg");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const { peopleFor } = await import("../nl2sql/omnibar");
    const t = await c.query(`SELECT er.ticket_no, dg.track FROM public.employee_roster er JOIN public.designation_grade dg ON dg.id = er.designation_grade_id WHERE er.cohort = 'executive' ORDER BY er.id LIMIT 100`);
    const got = await peopleFor(c as never, t.rows.map((r: { ticket_no: string }) => r.ticket_no));
    const trackOf = new Map<string, string>(t.rows.map((r: { ticket_no: string; track: string }) => [String(r.ticket_no).trim(), r.track]));
    const wrong = (got as unknown as { ticketNo: string; title?: string | null }[]).filter((p) => (p.title === "Dr.") !== (trackOf.get(p.ticketNo) === "medical"));
    ok("peopleFor: the title is exactly the medical track (100 people)", got.length === 100 && wrong.length === 0, `${wrong.length} wrong of ${got.length}`);
    ok("peopleFor: both kinds are in the sample", got.some((p) => (p as { title?: string | null }).title === "Dr.") && got.some((p) => !(p as { title?: string | null }).title));

    const probe = (await c.query(`SELECT to_regclass('public.departments') AS d, to_regprocedure('public.phonetic_subseq_match(text,text)') AS f`)).rows[0] as { d: string | null; f: string | null };
    if (!probe.d || !probe.f) {
      console.log("  (directory-search checks skipped: this scratch database has no public.departments or no phonetic functions)");
    } else {
      const es = await import("../search/employeeSearch");
      const ds = { query: async (sql: string, params?: unknown[]) => (await c.query(sql, params as never[])).rows } as never;
      const med = t.rows.find((r: { track: string }) => r.track === "medical");
      const other = t.rows.find((r: { track: string }) => r.track !== "medical");
      for (const [label, row, want] of [["a doctor", med, "Dr."], ["a non-doctor", other, null]] as const) {
        if (!row) continue;
        const r = await es.searchEmployeesById(ds, { kind: "ticket", value: row.ticket_no });
        ok(`employeeSearch by ticket: ${label} ${want ? "comes back with the title" : "comes back without one"}`, r.length === 1 && ((r[0] as { title?: string | null }).title ?? null) === want, JSON.stringify(r[0]));
      }
      const inDept = await es.searchEmployeesByNameInDept(ds, "a", (await c.query(`SELECT id FROM public.sail_department LIMIT 40`)).rows.map((r: { id: number }) => r.id), 20);
      ok("employeeSearch in a department: the query runs and the people carry the title field", Array.isArray(inDept) && inDept.every((p) => "title" in p));
      const typed = await es.searchEmployeesByNameInDept(ds, "Dr. a", (await c.query(`SELECT id FROM public.sail_department LIMIT 40`)).rows.map((r: { id: number }) => r.id), 20);
      ok("a typed Dr. is ignored: 'Dr. a' finds what 'a' finds", typed.length === inDept.length, `${typed.length} vs ${inDept.length}`);
    }
  } finally {
    await c.end();
  }
}
db().then(() => { console.log(`honorific selftest: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }).catch((e) => { console.log("FAIL database checks crashed:", e instanceof Error ? e.message : e); console.log(`honorific selftest: ${pass} passed, ${fail + 1} failed`); process.exit(1); });
