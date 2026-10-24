// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/nl2sql/departmentAliases.selftest.ts
// The alias file against the 300 REAL department rows (a saved copy in __fixtures__/departments.real.json): no entry may match nothing, no alias may belong to two DIFFERENT groups,
// the row counts are what the real list holds, and the questions the owner named find the rows they should.

import real from "./__fixtures__/departments.real.json";
import { DEPARTMENT_GROUPS } from "./departmentAliases";
import { DEPARTMENT_SHORT_FORMS } from "./aliasHints";
import { departmentFamilies, formatFamilies, selectRelevantDepartments, type DepartmentRow } from "./context";
import { buildPrompt } from "./prompt";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const eq = (name: string, got: unknown, want: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const all = real as DepartmentRow[];
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
ok("the saved copy holds the 300 real rows, 300 different ids", all.length === 300 && new Set(all.map((d) => d.id)).size === 300);
const rowsOf = (q: string) => departmentFamilies(q, all).flatMap((f) => f.rows.map((r) => r.id)).sort((a, b) => a - b);
const namesOf = (q: string) => departmentFamilies(q, all).flatMap((f) => f.rows.map((r) => r.name));

// ---- the file itself
const seenAlias = new Map<string, string>();
for (const g of DEPARTMENT_GROUPS) {
  ok(`${g.name}: has aliases`, g.aliases.length > 0);
  const hits = all.filter((d) => g.prefixes.some((p) => norm(d.name) === p || norm(d.name).startsWith(p + " ")) || (g.stems ?? []).some((s) => norm(d.name).startsWith(s)));
  ok(`${g.name}: matches at least one real row (no dead entry)`, hits.length > 0, "matches nothing");
  for (const a of g.aliases) {
    const k = norm(a);
    ok(`alias "${a}" of ${g.name} is not also claimed by another group (${seenAlias.get(k)})`, !seenAlias.has(k) || seenAlias.get(k) === g.name, `claimed by two groups`);
    seenAlias.set(k, g.name);
  }
}
ok("group names are unique", new Set(DEPARTMENT_GROUPS.map((g) => g.name)).size === DEPARTMENT_GROUPS.length);

// ---- the row counts of the real list (the saved copy of 24 Oct 2026)
const EXPECT: [string, number][] = [
  ["CO & CC", 8],
  ["BLAST FURNACE (BF)", 12],
  ["SMS (STEEL MELTING SHOP, with CCP)", 15],
  ["CCP (CONTINUOUS CASTING PLANT, part of SMS)", 3],
  ["WHEEL & AXLE (W&A)", 7],
  ["MERCHANT MILL", 6],
  ["SECTION MILL", 4],
  ["HEAVY MAINTENANCE (HM)", 2],
  ["MAIN HOSPITAL (M&HS)", 6],
  ["FIRE SERVICES", 3],
  ["MTB (HYDRAULIC LAB)", 2],
  ["R & C LABORATORY (RCL)", 3],
  ["ELECTRICAL TECHNICAL LAB (ETL)", 3],
  ["CSR", 2],
  ["F&A (FINANCE & ACCOUNTS)", 25],
  ["HR", 11],
  ["ED (WORKS)", 4],
  ["TOWN ADMINISTRATION (TA BUILDING)", 1],
];
for (const [name, n] of EXPECT) {
  const g = DEPARTMENT_GROUPS.find((x) => x.name === name)!;
  const hits = all.filter((d) => g.prefixes.some((p) => norm(d.name) === p || norm(d.name).startsWith(p + " ")) || (g.stems ?? []).some((s) => norm(d.name).startsWith(s)));
  eq(`${name}: ${n} rows`, hits.length, n);
}

// ---- no old short form points to nothing
for (const [name] of DEPARTMENT_SHORT_FORMS) {
  const n = norm(name);
  ok(`short form ${name} points to a real row`, all.some((d) => norm(d.name) === n || norm(d.name).startsWith(n + " ")));
}
ok("the dead short forms are gone (CHRD INDUSTRIAL 2, MANAGEMENT TRAINEE) and plant medical no longer points to IPU", !DEPARTMENT_SHORT_FORMS.some(([n, al]) => /CHRD INDUSTRIAL|MANAGEMENT TRAINEE/.test(n) || al.includes("plant medical")));

// ---- the questions the owner named
const ids = (re: RegExp) => all.filter((d) => re.test(d.name)).map((d) => d.id).sort((a, b) => a - b);
eq("cocc: all 8 CO & CC rows, the two COAL CHEMICALS rows of the same name included", rowsOf("how many executives are there in cocc, list them?"), ids(/^CO & CC/));
ok("...both rows named CO & CC (COAL CHEMICALS)", [63, 115].every((i) => rowsOf("executives in cocc").includes(i)));
eq("heavy maintenance, hm: the 2 rows (92500 and 92530; the name of the second is cut at '(OFFICE')", [rowsOf("executives in heavy maintenance"), rowsOf("executives in hm")], [ids(/^HEAVY MAINT/), ids(/^HEAVY MAINT/)]);
eq("main hospital, m&hs, pmu, plant medical, health centres, public health, hospital: the 6 medical rows", ["main hospital", "m&hs", "pmu", "plant medical", "health centres", "public health", "hospital"].map((a) => rowsOf(`executives in ${a}`)), Array(7).fill(ids(/^(M&HS|MEDICAL|HOSPITAL)/)));
eq("fire, fire services, fire brigade: FIRE SERVICE, FIRE SERVICES and FIRE SERVICES (TECH)", ["fire", "fire services", "fire brigade"].map((a) => rowsOf(`staff in ${a}`)), Array(3).fill(ids(/^FIRE SERVICE/)));
eq("mtb, hydraulic lab, hydraulic: MTB and MTB (TECH)", ["mtb", "hydraulic lab", "hydraulic"].map((a) => rowsOf(`staff in ${a}`)), Array(3).fill(ids(/^MTB/)));
eq("ccp alone, or continuous casting plant: only the 3 SMS-CCP rows (CCP is part of SMS, but asking for CCP is not asking for the whole of SMS)", [rowsOf("executives in ccp"), rowsOf("executives in continuous casting plant")], Array(2).fill(ids(/^SMS-CCP/)));
eq("sms-ccp names both: the SMS family and the CCP rows", [...new Set(rowsOf("executives in sms-ccp"))].sort((a, b) => a - b), [...new Set([...ids(/^(SMS|S M S|S\.M\.S\.)/), ...ids(/^SMS-CCP/)])].sort((a, b) => a - b));
eq("rcl: the 3 R & C LABORATORY rows", rowsOf("executives in rcl"), ids(/^R & C LABORATORY/));
eq("etl: ELECTRICAL TECHNICAL LAB. (2 rows) and ETL (TECH)", rowsOf("executives in etl"), [...ids(/^ELECTRICAL TECHNICAL LAB/), ...ids(/^ETL/)].sort((a, b) => a - b));
eq("csr: CORPORATE SOCIAL RESPONSIBILITY and CSR (TECH)", rowsOf("executives in csr"), ids(/^(CSR|CORPORATE SOCIAL)/));
eq("f&a: every F&A- row and FINANCE & A/C BRANCH", rowsOf("executives in f&a"), ids(/^(F&A|FINANCE & A\/C)/));
eq("hr: the 11 HR rows", rowsOf("executives in hr"), ids(/^HR( |$)/));
eq("ed works: the 4 ED (WORKS) rows, and ed alone is not a department (it is Executive Director)", [rowsOf("executives in ed works"), rowsOf("how many ED are there")], [ids(/^ED( |$)/), []]);
eq("town administration, ta building: TOWNSHIP MAINTENANCE (650)", [rowsOf("executives in town administration"), rowsOf("executives in ta building")], [ids(/^TOWNSHIP MAINTENANCE/), ids(/^TOWNSHIP MAINTENANCE/)]);
ok("ta building also reaches it through the old short form", selectRelevantDepartments("executives in ta building", all).some((d) => d.code === 650));

// ---- the other departments, by their own name (automatic)
eq("acvs: ACVS (executive), ACVS and ACVS - OFFICE", rowsOf("executives in acvs"), ids(/^ACVS/));
eq("l & d, l&d: all 5 L & D rows", [rowsOf("executives in l & d"), rowsOf("executives in l&d")], Array(2).fill(ids(/^L & D/)));
eq("foundry: all 13 rows", rowsOf("executives in foundry"), ids(/^FOUNDRY/));
eq("cem: all 10 rows", rowsOf("executives in cem"), ids(/^CEM/));
eq("traffic, vigilance, spu, instrumentation, law, power plant", [rowsOf("staff in traffic"), rowsOf("staff in vigilance"), rowsOf("staff in spu"), rowsOf("staff in instrumentation"), rowsOf("staff in law"), rowsOf("staff in power plant")], [ids(/^TRAFFIC/), ids(/^VIGILANCE/), ids(/^SPU/), ids(/^INSTRUMENTATION/), ids(/^LAW/), ids(/^POWER PLANT/)]);
eq("a duplicate name keeps BOTH rows: INTERNAL AUDIT (202 and 6026), TRAFFIC (84000 and 84101)", [rowsOf("staff in internal audit").length, rowsOf("staff in traffic").filter((i) => [84000, 84101].includes(all.find((d) => d.id === i)!.code)).length], [2, 2]);
eq("plant garage and c&it are not repeated as families (they are listed by code in every prompt)", [rowsOf("how many non executives are in plant garage"), rowsOf("executives in c&it"), rowsOf("staff in mhemd")], [[], [], []]);
eq("a question naming no department gets no family", rowsOf("how many executives have no NIC email"), []);
eq("the designation ED does not start a department", namesOf("list all ED and GM"), []);

// ---- what the model is told
const block = formatFamilies(departmentFamilies("executives in main hospital", all));
ok("the block carries the 6 ids of the main hospital and says ALL of its rows", /department_id IN \(([0-9]+, ){5}[0-9]+\)/.test(block) && /ALL of its rows/.test(block), block.slice(0, 160));
const biggest = Math.max(...["executives in f&a", "executives in foundry", "executives in blast furnace", "executives in sms"].map((q) => formatFamilies(departmentFamilies(q, all)).length));
ok("even the largest family adds a modest amount to the prompt (under 1500 characters)", biggest < 1500, String(biggest));
const prompt = buildPrompt({ question: "how many executives are there in cocc, list them?", context: { designations: [], departments: all } as never, examples: [] });
ok("the prompt of the cocc question names all 8 ids", /department_id IN \(([0-9]+, ){7}[0-9]+\)/.test(prompt));

console.log(`departmentAliases selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
