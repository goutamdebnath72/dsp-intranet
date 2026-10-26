// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/employees/sailDepartments.cld.selftest.ts
// Step 60c: the OLDER rule-based engine (the safety net when the model is down or rate-limited) knows the CL&D names too. In the owner's check of 26 Oct 2026 the model was rate-limited, the older engine could not
// ground "centre for human resource development" and the question fell to the circular search (80 s, an unrelated circular). The test runs the REAL lookup against a small database that holds the real rows.

import { Client } from "pg";

const admin = process.env.NL2SQL_TEST_ADMIN_URL;
if (!admin) {
  console.log("sailDepartments cld selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const DB = "sail_dept_selftest";
const FIVE = [17, 138, 140, 201, 286]; // L & D (107), L & D (TECH) (10770), L & D IND (9008), L & D OFFICE (9001), L & D (9003): the owner's list
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

async function main() {
  const a = new Client({ connectionString: admin });
  await a.connect();
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const url = admin!.replace(/\/[^/]*$/, `/${DB}`);
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(`CREATE TABLE public.sail_department (id smallint PRIMARY KEY, code int NOT NULL, name text NOT NULL, cohort_scope text NOT NULL, UNIQUE(code, cohort_scope))`);
  await c.query(`INSERT INTO public.sail_department VALUES
    (17,107,'L & D','shared'),(201,9001,'L & D OFFICE','nonexecutive'),(286,9003,'L & D','nonexecutive'),(138,10770,'L & D (TECH)','nonexecutive'),(140,9008,'L & D IND','nonexecutive'),
    (50,98500,'C & IT','executive'),(51,98530,'COMPUTER and IT STAFF','nonexecutive'),(52,98540,'C & IT (TECH)','nonexecutive'),
    (60,85200,'PLANT GARAGE (M.H.E.M.D.)','shared'),(61,85110,'PLANT GARAGE (M.H.E.O.D.)','shared'),
    (70,32100,'SMS-CCP (OPRN)','nonexecutive'),(71,10143,'CHRD INDUSTRIAL 2(TRADE APPRENTICE)','nonexecutive')`);
  // the app's database layer (TypeORM and all its models) is replaced by a stand-in that runs the SAME SQL on the scratch database: the real lookup code runs unchanged
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeModule = (await import("node:module")).default as any;
  const originalLoad = NodeModule._load;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NodeModule._load = function (request: string, ...rest: any[]) {
    if (request === "@/lib/db") return { getDb: async () => ({ query: async (sql: string) => (await c.query(sql)).rows }) };
    return originalLoad.call(this, request, ...rest);
  };
  const { findSailDepartmentInText, resolveSailDepartment } = await import("./sailDepartments");
  NodeModule._load = originalLoad;

  // ---- every name of the department grounds to the five rows, as a department phrase and inside a sentence
  const names = ["cl&d", "CL & D", "cl and d", "centre for l&d", "Centre for L & D", "center for l & d", "learning and development", "Centre for Learning and Development", "chrd", "CHRD", "c.h.r.d", "centre for human resource development", "Center for Human Resource Development", "training department", "training dept", "l & d", "L and D"];
  for (const n of names) {
    const r = await resolveSailDepartment(n);
    ok(`resolveSailDepartment("${n}") = the five L & D rows`, !!r && JSON.stringify(sorted(r.ids)) === JSON.stringify(FIVE) && JSON.stringify(sorted(r.codes)) === JSON.stringify([107, 9001, 9003, 9008, 10770]), JSON.stringify(r));
    const t = await findSailDepartmentInText(`list the employees of the ${n} please`);
    ok(`findSailDepartmentInText("... ${n} ...") = the five L & D rows`, !!t && JSON.stringify(sorted(t.group.ids)) === JSON.stringify(FIVE), JSON.stringify(t));
  }
  // ---- the very question of the owner's check (model rate-limited): the older engine grounds the department text it classified
  const g = await resolveSailDepartment("centre for human resource development");
  ok("the department text the older engine classified in the owner's check ('centre for human resource development') now grounds", !!g && g.ids.length === 5);

  // ---- another plant's CHRD is NOT this department
  for (const q of ["employees of bsp chrd", "list the employees of bhilai chrd", "rourkela chrd staff", "bokaro chrd", "iisco chrd", "employees of the training department of bhilai", "sail chrd employees"]) {
    const t = await findSailDepartmentInText(q);
    ok(`another plant's CHRD: "${q}" is not the Durgapur CL&D rows`, !t || JSON.stringify(sorted(t.group.ids)) !== JSON.stringify(FIVE), JSON.stringify(t));
  }
  // ---- nothing else changed
  const cit = await resolveSailDepartment("c&it");
  ok("C & IT is still its three codes", !!cit && JSON.stringify(sorted(cit.codes)) === JSON.stringify([98500, 98530, 98540]));
  const mh = await resolveSailDepartment("mhemd");
  ok("the maintenance garage alias still gives 85200", !!mh && JSON.stringify(mh.codes) === JSON.stringify([85200]));
  const sms = await findSailDepartmentInText("how many people in sms ccp (oprn)");
  ok("a real department named in full is still found by its own name", !!sms && sms.group.codes.includes(32100));
  const other = await findSailDepartmentInText("list the employees whose name is kumar");
  ok("a question that names no department finds none", !other);

  console.log(`sailDepartments cld selftest: ${pass} passed, ${fail} failed`);
  await c.end();
  const z = new Client({ connectionString: admin });
  await z.connect();
  await z.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await z.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
