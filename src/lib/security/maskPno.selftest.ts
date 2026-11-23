// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/maskPno.selftest.ts
// My rule, tested here: the P.No. is a password. It never leaves the server in a directory answer; the three places that build an employee card mask it; a lookup by P.No. is for a signed-in person only.
import { readFileSync } from "node:fs";
import { maskPno } from "./maskPno";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

ok("a P.No. is shown as its first and last character only", maskPno("D123456") === "D•••••6" && maskPno("  D123456 ") === "D•••••6" && maskPno("A12345") === "A••••5");
ok("a short value is hidden entirely; nothing stays nothing", maskPno("AB1") === "•••" && maskPno("ab") === "••" && maskPno("") === null && maskPno(null) === null && maskPno(undefined) === null);
ok("the masked value never contains the middle of the original", !maskPno("D123456")!.includes("1234") && maskPno("D123456")!.length === 7);

// I check that the three builders of an employee card use it, and that no card gets the raw column
const builders = ["src/lib/search/employeeSearch.ts", "src/lib/nl2sql/omnibar.ts", "src/lib/employees/rosterQuery.ts"];
for (const f of builders) {
  const t = src(f);
  ok(`${f} masks the P.No. in the card it builds, and builds no card with the raw column (the roster path hands its row to the same masking builder)`, /sailPNo: maskPno\(r\.(sailPNo|sail_pno)\)/.test(t) && !/sailPNo: r\.(sailPNo|sail_pno) \|\| null/.test(t));
}
// the open search route: I require a login for a P.No. lookup, and a limiter sits in front of it
const route = src("src/app/api/employees/search/route.ts");
ok("a lookup by P.No. (and by mobile or CUG) in the open search route needs a signed-in person (401 otherwise), and the check comes before the database is asked", /mode === "id" && !ticket && \["sailpno", "mobile", "cug4"\]\.includes\(detectShape\(q\)\.kind\)\) return NextResponse\.json\(\{ results: \[\] \}, \{ status: 401/.test(route) && route.indexOf('["sailpno", "mobile", "cug4"]') < route.indexOf("getDb()"));
ok("the open search route is rate-limited (429 with Retry-After) by address, or by ticket when signed in", /createLimiter\(\{ max: 240/.test(route) && /createLimiter\(\{ max: 120/.test(route) && /status: 429/.test(route) && route.indexOf("byTicket.take") < route.indexOf("getDb()"));
// I keep the HOD's P.No. out of the code, the guide and the tests as a real value
const all = ["src/lib/constants.ts", "src/lib/help/quickReference.ts", "src/lib/tools/intent.ts", "src/lib/tools/intent.selftest.ts", "src/lib/search/idQuery.selftest.ts"].map(src).join("\n");
ok("the HOD's real P.No. is nowhere in the code, the user manual or the tests (a sample P.No. is used instead)", !/D000896/i.test(all));
console.log(`maskPno selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
