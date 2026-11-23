// How to run it (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/pfLoan.selftest.ts
// The refundable PF loan of DSP: the interest is the deposit's plus one point, the period is at most 10 years and never beyond the service left, and the interest is on the balance still owed, month by month.
import { PF_LOAN, loanRatePct, monthsOfService, pfLoanEmi, tenureLimit, type PfLoanResult, type YMD } from "./pfLoan";
import { PF_DEFAULTS } from "./pf";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const TODAY: YMD = { day: 20, month: 11, year: 2026 };
const FAR: YMD = { day: 30, month: 3, year: 2040 }; // 160 months to go: the ten years are the limit
const SOON: YMD = { day: 30, month: 3, year: 2032 }; // 64 months to go
const run = (o: Partial<{ principal: number; depositPct: number; months: number; retire: YMD | null }>) => pfLoanEmi({ principal: 1000000, depositPct: 8.25, months: 120, retire: FAR, today: TODAY, ...o });

// RULE 1: the loan's interest is the deposit's plus one point.
ok("the loan's rate is the deposit's rate plus 1 point: 8.25 -> 9.25, 8 -> 9, 7.1 -> 8.1, 0 -> 1", loanRatePct(8.25) === 9.25 && loanRatePct(8) === 9 && loanRatePct(7.1) === 8.1 && loanRatePct(0) === 1 && PF_LOAN.spreadPct === 1);
ok("the form's default deposit rate is the PF page's rate, 8.25, so the loan starts at 9.25", PF_LOAN.defaultDepositPct === PF_DEFAULTS.interestPct && PF_LOAN.defaultDepositPct === 8.25);
const a = run({}) as PfLoanResult;
ok("the loan is worked at the deposit's rate plus one: 8.25 gives 9.25, and the result says both", a.loanPct === 9.25 && a.depositPct === 8.25);
ok("a different deposit rate moves the loan's rate with it (9%: 10%), and the EMI changes", (run({ depositPct: 9 }) as PfLoanResult).loanPct === 10 && (run({ depositPct: 9 }) as PfLoanResult).emi > a.emi);

// RULE 3: the interest is on the balance still owed, in equal monthly instalments.
ok("EMI of 10 lakh at 9.25% for 10 years is 12,803.27 (worked separately); for 5 years 20,879.90", near(a.emi, 12803.2722, 0.01) && near((run({ months: 60 }) as PfLoanResult).emi, 20879.8983, 0.01), String(a.emi));
ok("the total interest is the instalments less the loan: 5,36,392.66", near(a.totalInterest, 536392.66, 0.5) && near(a.totalPayment, 1000000 + a.totalInterest, 0.001) && near(a.totalPayment, a.emi * 120, 0.5));
ok("the first month's interest is a month of 9.25% on the WHOLE loan (the balance owed)", near(a.schedule[0].interest, 1000000 * 0.0925 / 12, 0.001) && near(a.schedule[0].principal, a.emi - a.schedule[0].interest, 0.001));
ok("each month's interest is on the balance that is left (it falls month by month), and principal + interest is the EMI in every month but the last", a.schedule.every((r, k) => k === 0 || (r.interest < a.schedule[k - 1].interest && near(r.opening, a.schedule[k - 1].closing, 0.001))) && near(a.schedule[60].interest, a.schedule[60].opening * 0.0925 / 12, 0.001) && near(a.schedule[60].principal + a.schedule[60].interest, a.emi, 0.01));
ok("the schedule has one row for each month and ends at exactly zero", a.schedule.length === 120 && a.schedule[119].closing === 0 && near(a.schedule.reduce((s, r) => s + r.principal, 0), 1000000, 0.01));
ok("the yearly rows add up to the schedule: 10 years, principal 10 lakh, balance zero at the end", a.yearly.length === 10 && near(a.yearly.reduce((s, y) => s + y.principal, 0), 1000000, 0.01) && near(a.yearly.reduce((s, y) => s + y.interest, 0), a.totalInterest, 0.01) && a.yearly[9].closing === 0);
ok("part of a year at the end gives one more yearly row (30 months: 3 rows)", (run({ months: 30 }) as PfLoanResult).yearly.length === 3);

// RULE 2: at most 10 years, and never beyond the service left.
const L1 = tenureLimit(FAR, TODAY), L2 = tenureLimit(SOON, TODAY);
ok("months of service: Nov 2026 to Mar 2032 is 64 (Dec 2026 to Mar 2032, the retirement month included); to Mar 2040 is 160", monthsOfService(SOON, TODAY) === 64 && monthsOfService(FAR, TODAY) === 160 && monthsOfService({ day: 1, month: 11, year: 2026 }, TODAY) === 0);
ok("with more than 10 years to go the limit is 120 months, set by the ten years", !isProblem(L1) && (L1 as { maxMonths: number }).maxMonths === 120 && (L1 as { bound: string }).bound === "ten-years");
ok("with 64 months to go the limit is 64, set by the service left", !isProblem(L2) && (L2 as { maxMonths: number }).maxMonths === 64 && (L2 as { bound: string }).bound === "service" && (L2 as { monthsLeft: number }).monthsLeft === 64);
ok("exactly 10 years of service left is allowed: 120 months", (tenureLimit({ day: 30, month: 11, year: 2036 }, TODAY) as { maxMonths: number; bound: string }).maxMonths === 120);
ok("10 years exactly is allowed; 121 months is refused with the rule", !isProblem(run({ months: 120 })) && isProblem(run({ months: 121 })) && /at most 10 years/.test((run({ months: 121 }) as { error: string }).error));
ok("a period equal to the service left is allowed (64 months with 64 left); one month more is refused and says how much service is left", !isProblem(run({ months: 64, retire: SOON })) && isProblem(run({ months: 65, retire: SOON })) && /64 months of service left/.test((run({ months: 65, retire: SOON }) as { error: string }).error) && /longest period is 64 months/.test((run({ months: 65, retire: SOON }) as { error: string }).error));
ok("10 years with 9 years of service left is refused (service, not the ten years, is the limit)", isProblem(run({ months: 120, retire: { day: 30, month: 11, year: 2035 } })));
ok("no retirement date: nothing is calculated, and it asks for the date (the rule needs it)", isProblem(run({ retire: null })) && /date of retirement/i.test((run({ retire: null }) as { error: string }).error));
ok("a retirement this month or past: no service left to repay in", isProblem(run({ retire: { day: 30, month: 11, year: 2026 } })) && isProblem(run({ retire: { day: 1, month: 1, year: 2026 } })) && /no service left/.test((run({ retire: { day: 1, month: 1, year: 2026 } }) as { error: string }).error));

// Bad inputs are told to the user, not calculated.
ok("impossible figures are told: no amount, a negative rate, a rate over 30, a fraction of a month, zero months", [{ principal: NaN }, { principal: 0 }, { depositPct: -1 }, { depositPct: 31 }, { months: 12.5 }, { months: 0 }].every((o) => isProblem(run(o))));
ok("a loan with a zero deposit rate carries 1%, not zero", near((run({ depositPct: 0, months: 12, principal: 120000 }) as PfLoanResult).loanPct, 1, 0));
ok("the same inputs always give the same answer (pure)", JSON.stringify(run({})) === JSON.stringify(run({})));

console.log(`pfLoan selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
