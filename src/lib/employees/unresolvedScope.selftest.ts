// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/unresolvedScope.selftest.ts
// A department the question names but nobody can find must not turn into "everybody" (the live answer to "executives in heavy maintenance" was 1,169, all of them).

import { unresolvedDepartmentPhrase, withoutBlindScope } from "./unresolvedScope";
import type { AnalyticsPayload } from "./analytics";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ---- the phrase
eq("the owner's question: heavy maintenance", unresolvedDepartmentPhrase("how many executives are there in heavy maintenance, list them?"), "heavy maintenance");
eq("the short form: hm", unresolvedDepartmentPhrase("how many executives are there in hm, list them?"), "hm");
eq("the, and a trailing word like department, are not part of the name", [unresolvedDepartmentPhrase("executives in the heavy maintenance department"), unresolvedDepartmentPhrase("how many executives are in the stores section, list them")], ["heavy maintenance", "stores"]);
eq("other words: at, under, within, inside, from", ["how many staff at heavy maintenance", "people under heavy maintenance", "within heavy maintenance", "inside heavy maintenance", "executives from heavy maintenance"].map(unresolvedDepartmentPhrase), Array(5).fill("heavy maintenance"));
eq("the phrase stops at list / and / with / who", [unresolvedDepartmentPhrase("executives in heavy maintenance list them"), unresolvedDepartmentPhrase("executives in heavy maintenance and their designations"), unresolvedDepartmentPhrase("executives in heavy maintenance who have no NIC mail")], Array(3).fill("heavy maintenance"));
eq("the first non-generic phrase is the one: grade first, department second", unresolvedDepartmentPhrase("how many executives in grade E5 in heavy maintenance"), "heavy maintenance");

// ---- generic wording is not a department
for (const q of ["how many executives are there in DSP", "how many executives are there in the plant", "how many executives are there in total", "how many executives are there in each department", "how many executives are there in the whole plant, list them", "how many executives are there in SAIL", "how many executives are there in grade E-5", "how many executives are there", "list executives", "how many executives in 2026", "executives in the company", "how many GMs are there in the organisation", "how many executives in the Durgapur Steel Plant"]) {
  eq(`not a department: ${q}`, unresolvedDepartmentPhrase(q), null);
}

// ---- the guard on the older engine's answer
const company: AnalyticsPayload = { kind: "count", label: "Executives", count: 1169, answer: "DSP currently has 1,169 executives." };
const guarded = withoutBlindScope("how many executives are there in heavy maintenance, list them?", company);
ok("the company-wide count for a question that names an unknown department becomes an honest question", guarded?.kind === "clarify" && /could not find a department called "heavy maintenance"/.test(guarded.answer) && /not counted anyone/.test(guarded.answer), JSON.stringify(guarded));
ok("...and carries no count and no people", guarded?.count === undefined && guarded?.people === undefined);
eq("a company-wide count for a question that names no department stays", withoutBlindScope("how many executives are there in DSP", company), company);
eq("... and so does one with only generic wording", withoutBlindScope("how many executives are there in the plant, list them", company), company);
const scoped: AnalyticsPayload = { kind: "count", label: "Executives", count: 16, answer: "C & I T has 16 executives." };
eq("a department's own count is never touched, whatever the wording", withoutBlindScope("how many executives are there in c&it, list them?", scoped), scoped);
const designation: AnalyticsPayload = { kind: "count", label: "General Managers", count: 233, answer: "DSP currently has 233 General Managers." };
ok("a designation count for an unknown department is blocked too", withoutBlindScope("how many GMs are there in heavy maintenance", designation)?.kind === "clarify");
const breakdown: AnalyticsPayload = { kind: "breakdown", answer: "x", rows: [] };
eq("a breakdown, a holiday or any other kind is never touched", withoutBlindScope("executives in heavy maintenance", breakdown), breakdown);
eq("no answer stays no answer", withoutBlindScope("executives in heavy maintenance", null), null);
const nameQuery: AnalyticsPayload = { kind: "count", label: "People", count: 1132, answer: "1,132 people matching kumar." };
eq("a name search with 'at any position' is not touched (the September fix stays)", withoutBlindScope("list the employees whose name has kumar as a word at any position", nameQuery), nameQuery);

console.log(`unresolvedScope selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
