// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/pf.selftest.ts
import { pfMaturity, PF_DEFAULTS, type PfResult } from "./pf";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ---- PF maturity
const base = { currentAge: 59, retirementAge: 60, monthlyWage: 10000, incrementPct: 0, employeePct: 10, employerPct: 0, vpfPct: 0, currentBalance: 0, interestPct: 12 };
const p1 = pfMaturity(base) as PfResult;
ok("one year, 10% of 10,000 a month, 12% interest on the monthly balance, credited at the year end: 12,000 + 660", near(p1.maturity, 12660, 0.001) && near(p1.interestTotal, 660, 0.001) && near(p1.employeeTotal, 12000, 0.001));
ok("with no interest the maturity is the opening balance and the contributions", near((pfMaturity({ ...base, interestPct: 0, currentBalance: 5000, employerPct: 3.67 }) as PfResult).maturity, 5000 + 10000 * 13.67 / 100 * 12, 0.001));
const p3 = pfMaturity({ ...base, currentAge: 30, retirementAge: 60, monthlyWage: 50000, incrementPct: 5, employeePct: 12, employerPct: 3.67, interestPct: 8.25, currentBalance: 200000 }) as PfResult;
ok("thirty years: the parts add up to the maturity", near(p3.maturity, p3.opening + p3.employeeTotal + p3.employerTotal + p3.vpfTotal + p3.interestTotal, 0.01) && p3.years.length === 30 && p3.years[29].age === 60);
ok("the wage rises by the increment each year", near(p3.years[1].monthlyWage / p3.years[0].monthlyWage, 1.05, 1e-9) && near(p3.years[0].monthlyWage, 50000, 1e-9));
ok("a longer career or a higher rate gives more", (pfMaturity({ ...base, currentAge: 30, retirementAge: 60 }) as PfResult).maturity > (pfMaturity({ ...base, currentAge: 40, retirementAge: 60 }) as PfResult).maturity && (pfMaturity({ ...base, currentAge: 30, interestPct: 9 }) as PfResult).maturity > (pfMaturity({ ...base, currentAge: 30, interestPct: 8 }) as PfResult).maturity);
ok("a voluntary extra adds to the contribution", near((pfMaturity({ ...base, interestPct: 0, vpfPct: 5 }) as PfResult).maturity, 10000 * 0.15 * 12, 0.001));
ok("impossible PF inputs are told", isProblem(pfMaturity({ ...base, retirementAge: 59 })) && isProblem(pfMaturity({ ...base, monthlyWage: 0 })) && isProblem(pfMaturity({ ...base, interestPct: 50 })) && isProblem(pfMaturity({ ...base, currentAge: 17 })) && isProblem(pfMaturity({ ...base, currentAge: 30.5 })));
ok("the defaults are named", PF_DEFAULTS.employeePct === 12 && PF_DEFAULTS.employerPct === 3.67 && PF_DEFAULTS.retirementAge === 60);

console.log(`pf selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
