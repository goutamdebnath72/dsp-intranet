// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/gratuity/gratuity.selftest.ts
import { gratuityCalc, type GratuityResult } from "./gratuity";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ---- gratuity
const g = (o: Partial<Parameters<typeof gratuityCalc>[0]>) => gratuityCalc({ lastDrawn: 100000, years: 20, months: 3, actCovered: true, ceiling: 2000000, deathOrDisability: false, ...o }) as GratuityResult;
ok("20 years 3 months at 1,00,000: 15/26 of a month's pay for 20 years", near(g({}).amount, 100000 * 15 / 26 * 20, 0.01) && g({}).completedYears === 20);
ok("six months or more of the last year count as a year", g({ months: 6 }).completedYears === 21 && near(g({ months: 7 }).amount, 100000 * 15 / 26 * 21, 0.01) && g({ months: 5 }).completedYears === 20);
ok("a worker outside the Act is paid 15/30", near(g({ actCovered: false }).amount, 100000 * 15 / 30 * 20, 0.01));
ok("the upper limit is applied and said", (() => { const x = g({ years: 35, months: 0 }); return x.capped && x.amount === 2000000 && near(x.uncapped, 100000 * 15 / 26 * 35, 0.01) && /limit/.test(x.message); })());
ok("under five years nothing is payable, except on death or disability", g({ years: 4, months: 11 }).amount === 0 && !g({ years: 4, months: 11 }).eligible && g({ years: 4, months: 11, deathOrDisability: true }).amount > 0 && g({ years: 5, months: 0 }).eligible);
ok("impossible gratuity inputs are told", isProblem(gratuityCalc({ lastDrawn: 0, years: 5, months: 0, actCovered: true, ceiling: 1, deathOrDisability: false })) && isProblem(gratuityCalc({ lastDrawn: 1, years: 5.5, months: 0, actCovered: true, ceiling: 1, deathOrDisability: false })) && isProblem(gratuityCalc({ lastDrawn: 1, years: 5, months: 12, actCovered: true, ceiling: 1, deathOrDisability: false })));

console.log(`gratuity selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
