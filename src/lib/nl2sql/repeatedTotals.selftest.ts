// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/repeatedTotals.selftest.ts
// The model often adds a column that repeats the grand total on every row of a list of people ("Total count 16"): it is removed from the cards and the table.

import { dropRepeatedTotals, presentPeople } from "./seniorityDisplay";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const people = (n: number, extra: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => ({ ticket_no: `49${String(1000 + i)}`, name: `P${i}`, designation: "General Manager", department_code: 98500, department: "C & I T", ...extra(i) }));
const cols = (...more: string[]) => ["ticket_no", "name", "designation", "department_code", "department", ...more];

let r = dropRepeatedTotals(cols("total_count"), people(16, () => ({ total_count: 16 })));
eq("a total repeated on every row is removed (columns)", r.columns, cols());
ok("...and from every row", r.rows.every((x) => !("total_count" in x)) && r.rows.length === 16);
for (const name of ["count", "total", "Total", "total_count", "cnt", "exec_count", "total_executives", "grand_total"]) {
  r = dropRepeatedTotals(cols(name), people(5, () => ({ [name]: 5 })));
  ok(`a repeated column called ${name} is removed`, !r.columns.includes(name), JSON.stringify(r.columns));
}
r = dropRepeatedTotals(cols("count"), people(5, (i) => ({ count: i })));
ok("a count that DIFFERS from row to row is kept", r.columns.includes("count"));
r = dropRepeatedTotals(cols("rank_in_dept"), people(5, () => ({ rank_in_dept: 3 })));
ok("a column that is not a count or a total is kept even when its value repeats", r.columns.includes("rank_in_dept"));
r = dropRepeatedTotals(["department_code", "department", "count"], [{ department_code: 1, department: "A", count: 4 }, { department_code: 2, department: "B", count: 4 }]);
ok("a breakdown (no ticket column) is never touched", r.columns.includes("count") && r.rows.length === 2);
r = dropRepeatedTotals(cols("total_count"), people(1, () => ({ total_count: 1 })));
ok("a single person keeps its columns", r.columns.includes("total_count"));
const same = people(3, () => ({ total_count: 3 }));
ok("with nothing to drop the same objects come back", dropRepeatedTotals(cols(), people(3, () => ({}))).columns.length === 5 && Array.isArray(same));

// the common step for the first page and "Show more"
const p = presentPeople(cols("total_count"), people(4, () => ({ total_count: 4 })), []);
ok("presentPeople removes it too (so cards and table lose it together)", !p.columns.includes("total_count") && p.rows.every((x) => !("total_count" in x)), JSON.stringify(p.columns));

console.log(`repeatedTotals selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
