// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/departmentFamilies.selftest.ts
// A large department (CO & CC, BF, SMS with CCP, W&A, Merchant Mill, Section Mill) means ALL of its section rows: the people sit in the sections, so
// "executives in cocc" must not look for a department called exactly CO & CC.

import { departmentFamilies, formatFamilies, selectRelevantDepartments, type DepartmentRow } from "./context";
import { buildPrompt } from "./prompt";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const names = ["CO & CC (BATTERY)", "CO & CC (OPRN)", "CO & CC (ELECT)", "COKE OVEN REFRACTORY", "SMS-BOF (OPRN)", "SMS-CCP (OPRN)", "S.M.S. ELECT.MAINT.", "CCP (MECH)", "BLAST FURNACE (ELECT)", "BF (OPRN)", "C & IT", "WHEEL & AXLE PLANT", "MERCHANT MILL (OPRN)", "SECTION MILL", "MATERIAL MANAGEMENT", "BFR STORE", "SMSX", "HEAVY MAINTENANCE (MECH)", "HEAVY MAINT. (ELECT)", "HM (OPRN)", "HMD (OFFICE)", "HOME MAINTENANCE"];
const all: DepartmentRow[] = names.map((name, i) => ({ id: i + 1, code: 1000 + i, name, cohort_scope: "shared" }));
const ids = (q: string, family?: string) => departmentFamilies(q, all).filter((f) => !family || f.name.startsWith(family)).flatMap((f) => f.rows.map((r) => r.id));

eq("cocc (the owner's question) finds the three CO & CC sections, not the Coke Oven Refractory", ids("how many executives are there in cocc, list them."), [1, 2, 3]);
eq("co&cc, CO & CC and co and cc ask for the same family", [ids("list executives of co&cc"), ids("list executives of CO & CC"), ids("co and cc people")], [[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
eq("sms: SMS, S.M.S. and CCP are all SMS", ids("how many executives in sms"), [5, 6, 7, 8]);
eq("ccp alone, or continuous casting plant: the CCP rows only (SMS-CCP and CCP (MECH)); SMS itself still includes them", [ids("executives in ccp"), ids("continuous casting plant people")], [[6, 8], [6, 8]]);
eq("bf and blast furnace: the BF and the Blast Furnace rows, not BFR STORE", [ids("non executives in bf"), ids("blast furnace employees")], [[9, 10], [9, 10]]);
eq("w&a, wheel and axle", [ids("people in w&a"), ids("wheel and axle")], [[12], [12]]);
eq("merchant mill, section mill", [ids("merchant mill staff"), ids("section mill staff")], [[13], [14]]);
eq("mm is Material Management, not the Merchant Mill", ids("people in mm"), []);
eq("heavy maintenance (the full word AND the abbreviated one) and hm, hmd: all the Heavy Maintenance rows, not Home Maintenance", [ids("how many executives are there in heavy maintenance, list them?"), ids("how many executives are there in hm, list them?"), ids("executives of hmd")], [[18, 19, 20, 21], [18, 19, 20, 21], [18, 19, 20, 21]]);
eq("a question naming no large department gets no family", ids("how many executives have no NIC email"), []);
eq("two families in one question", ids("compare bf and sms").sort((a, b) => a - b), [5, 6, 7, 8, 9, 10]);

const text = formatFamilies(departmentFamilies("executives in cocc", all));
ok("the model is told to use ALL the ids", /department_id IN \(1, 2, 3\)/.test(text) && /ALL of its rows/.test(text), text);
ok("...and that one named section is the only exception", /names one section/.test(text));
eq("nothing is added for a question without a family", formatFamilies([]), "");

// the short form cocc now also brings its rows into the list of relevant departments (it used to bring none: the name has no word of 3 letters)
eq("cocc: the relevant departments are the CO & CC sections", selectRelevantDepartments("how many executives are there in cocc, list them.", all).map((d) => d.id).sort((a, b) => a - b), [1, 2, 3]);
ok("a question naming no department still shows none", selectRelevantDepartments("how many executives have no NIC email", all).length === 0);

const prompt = buildPrompt({ question: "how many executives are there in cocc, list them.", context: { designations: [], departments: all } as never, examples: [] });
ok("the prompt of that question carries the family with its ids", prompt.includes("department_id IN (1, 2, 3)") && prompt.includes("CO & CC (BATTERY)"));
const plain = buildPrompt({ question: "how many executives have no NIC email", context: { designations: [], departments: all } as never, examples: [] });
ok("the prompt of an ordinary question carries no family (the prompt has a size limit)", !plain.includes("THAT HAVE SECTIONS"));

console.log(`departmentFamilies selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
