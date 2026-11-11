// src/lib/employees/departmentDisplay.selftest.ts
// Run with: npx tsx src/lib/employees/departmentDisplay.selftest.ts
import { formatDepartmentDisplay as f } from "./sailDepartments";
import { isAboutPeopleOrBare } from "../nl2sql/departmentAsk";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
};

ok("Central Stores shows its parent", f("CENTRAL STORES DEPTT.") === "CENTRAL STORES DEPTT. (Marketing)");
ok("a name that ends in a bracket gets the parent INSIDE it (no double brackets)", f("CENTRAL STORES (OFFICE)") === "CENTRAL STORES (OFFICE, Marketing)", String(f("CENTRAL STORES (OFFICE)")));
ok("the parent is never added twice", f("CENTRAL STORES DEPTT. (Marketing)") === "CENTRAL STORES DEPTT. (Marketing)");
ok("other departments are unchanged", f("PLANT GARAGE") === "PLANT GARAGE" && f("C & IT") === "C & IT");
ok("blank / null / undefined give null, never a crash", f("   ") === null && f(null) === null && f(undefined) === null);
ok("surrounding spaces are trimmed", f("  PLANT GARAGE  ") === "PLANT GARAGE");

ok('"central stores department" is a bare department name', isAboutPeopleOrBare("central stores department"));
ok('"garage section" is a bare department name', isAboutPeopleOrBare("garage section"));
ok("a LONG question that only contains the word department is about documents", !isAboutPeopleOrBare("circular on central stores department tender procedure"));
ok("a question about people is still about people", isAboutPeopleOrBare("how many engineers work in the refractory department"));

console.log(`departmentDisplay selftest: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
