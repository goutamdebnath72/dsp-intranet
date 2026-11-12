// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/finance.selftest.ts
import { emiCalc, pfMaturity, gratuityCalc, encashmentCalc, num, rupees, isProblem, LOAN_PRESETS, PF_DEFAULTS, type EmiResult, type PfResult, type GratuityResult, type EncashmentResult } from "./finance";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ---- EMI
const e1 = emiCalc({ principal: 1000000, annualRatePct: 8.5, months: 240, method: "reducing" }) as EmiResult;
ok("EMI of 10 lakh at 8.5% for 20 years is about 8,678", near(e1.emi, 8678.23, 0.05), String(e1.emi));
ok("the interest and the payment add up", near(e1.totalPayment, e1.emi * 240, 1) && near(e1.totalInterest, e1.emi * 240 - 1000000, 1));
ok("the schedule runs to a zero balance and each month's principal + interest is the EMI", e1.schedule.length === 240 && near(e1.schedule[239].closing, 0, 0.001) && near(e1.schedule[0].interest + e1.schedule[0].principal, e1.emi, 0.01) && near(e1.schedule[100].interest + e1.schedule[100].principal, e1.emi, 0.01));
ok("the first month's interest is a month of the rate on the whole loan", near(e1.schedule[0].interest, 1000000 * 0.085 / 12, 0.001));
ok("yearly rows add up to the schedule", e1.yearly.length === 20 && near(e1.yearly.reduce((s, y) => s + y.principal, 0), 1000000, 0.5) && near(e1.yearly[19].closing, 0, 0.001));
const e2 = emiCalc({ principal: 100000, annualRatePct: 10, months: 24, method: "flat" }) as EmiResult;
ok("a flat-rate loan: interest on the whole amount for the whole time", near(e2.totalInterest, 20000, 0.001) && near(e2.emi, 5000, 0.001) && near(e2.schedule[23].closing, 0, 0.001));
ok("a flat rate costs more than the same rate on the reducing balance", e2.totalInterest > (emiCalc({ principal: 100000, annualRatePct: 10, months: 24, method: "reducing" }) as EmiResult).totalInterest);
ok("a loan with no interest is the amount over the months", near((emiCalc({ principal: 120000, annualRatePct: 0, months: 12, method: "reducing" }) as EmiResult).emi, 10000, 0.0001));
ok("part of a year at the end gives one more yearly row", (emiCalc({ principal: 50000, annualRatePct: 9, months: 30, method: "reducing" }) as EmiResult).yearly.length === 3);
ok("impossible loan inputs are told, not calculated", ["principal", "rate", "months"].every((k) => isProblem(emiCalc({ principal: k === "principal" ? NaN : 1000, annualRatePct: k === "rate" ? 150 : 5, months: k === "months" ? 0 : 12, method: "reducing" }))) && isProblem(emiCalc({ principal: 1000, annualRatePct: 5, months: 12.5, method: "reducing" })));
ok("three loan kinds, each with a method and a hint", LOAN_PRESETS.length === 3 && LOAN_PRESETS.every((p) => p.rate > 0 && p.months > 0 && p.hint.length > 20));

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

// ---- gratuity
const g = (o: Partial<Parameters<typeof gratuityCalc>[0]>) => gratuityCalc({ lastDrawn: 100000, years: 20, months: 3, actCovered: true, ceiling: 2000000, deathOrDisability: false, ...o }) as GratuityResult;
ok("20 years 3 months at 1,00,000: 15/26 of a month's pay for 20 years", near(g({}).amount, 100000 * 15 / 26 * 20, 0.01) && g({}).completedYears === 20);
ok("six months or more of the last year count as a year", g({ months: 6 }).completedYears === 21 && near(g({ months: 7 }).amount, 100000 * 15 / 26 * 21, 0.01) && g({ months: 5 }).completedYears === 20);
ok("a worker outside the Act is paid 15/30", near(g({ actCovered: false }).amount, 100000 * 15 / 30 * 20, 0.01));
ok("the upper limit is applied and said", (() => { const x = g({ years: 35, months: 0 }); return x.capped && x.amount === 2000000 && near(x.uncapped, 100000 * 15 / 26 * 35, 0.01) && /limit/.test(x.message); })());
ok("under five years nothing is payable, except on death or disability", g({ years: 4, months: 11 }).amount === 0 && !g({ years: 4, months: 11 }).eligible && g({ years: 4, months: 11, deathOrDisability: true }).amount > 0 && g({ years: 5, months: 0 }).eligible);
ok("impossible gratuity inputs are told", isProblem(gratuityCalc({ lastDrawn: 0, years: 5, months: 0, actCovered: true, ceiling: 1, deathOrDisability: false })) && isProblem(gratuityCalc({ lastDrawn: 1, years: 5.5, months: 0, actCovered: true, ceiling: 1, deathOrDisability: false })) && isProblem(gratuityCalc({ lastDrawn: 1, years: 5, months: 12, actCovered: true, ceiling: 1, deathOrDisability: false })));

// ---- leave encashment
const l = encashmentCalc({ basic: 80000, da: 20000, days: 100, maxDays: 300, divisor: 30 }) as EncashmentResult;
ok("leave encashment: (basic + DA) / 30 per day", near(l.perDay, 100000 / 30, 1e-9) && near(l.amount, 100000 / 30 * 100, 1e-6) && !l.capped);
ok("days beyond the limit are not paid, and it is said", (() => { const x = encashmentCalc({ basic: 80000, da: 20000, days: 320, maxDays: 300, divisor: 30 }) as EncashmentResult; return x.capped && x.daysPaid === 300 && near(x.amount, 100000 / 30 * 300, 1e-6); })());
ok("impossible encashment inputs are told", isProblem(encashmentCalc({ basic: 0, da: 0, days: 1, maxDays: 300, divisor: 30 })) && isProblem(encashmentCalc({ basic: 1, da: 0, days: -1, maxDays: 300, divisor: 30 })));

// ---- helpers
ok("typed numbers", num("1,00,000") === 100000 && num(" 8.5 ") === 8.5 && num("₹ 5,000") === 5000 && Number.isNaN(num("")) && Number.isNaN(num("abc")) && num(7) === 7);
ok("rupees in Indian grouping", rupees(1234567) === "₹ 12,34,567" && rupees(999) === "₹ 999" && rupees(100000) === "₹ 1,00,000" && rupees(-2500) === "-₹ 2,500" && rupees(0.4) === "₹ 0");

console.log(`finance selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
