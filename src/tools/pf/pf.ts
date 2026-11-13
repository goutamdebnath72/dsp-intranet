// src/tools/pf/pf.ts
//
// PROBABLE PF MATURITY: what a provident fund may grow to by retirement from the monthly pay, the shares, the interest and the yearly rise.
// Pure function: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
// These are APPROXIMATIONS and the screen says so. Every rate is an input with a default, not a hidden constant: the rules change, and the person knows the figures of his own case.

import { inRange, type Problem } from "@/lib/tools/money";

/* ------------------------------ PF maturity ------------------------------ */

export interface PfInput {
  currentAge: number;
  retirementAge: number;
  /** monthly basic + DA today, the wage the contribution is a percentage of */
  monthlyWage: number;
  /** a yearly rise in that wage, in percent */
  incrementPct: number;
  /** the employee's share, in percent of the wage (12 by default) */
  employeePct: number;
  /** the employer's share that goes into the PF account, in percent of the wage (3.67 by default: 12 less the 8.33 that goes to the pension) */
  employerPct: number;
  /** a voluntary extra, in percent of the wage */
  vpfPct: number;
  currentBalance: number;
  /** the yearly interest rate, in percent */
  interestPct: number;
}
export interface PfYear {
  year: number;
  age: number;
  monthlyWage: number;
  contribution: number;
  interest: number;
  closing: number;
}
export interface PfResult {
  maturity: number;
  opening: number;
  employeeTotal: number;
  employerTotal: number;
  vpfTotal: number;
  interestTotal: number;
  years: PfYear[];
}

/**
 * The method of the provident fund: interest is worked out every month on that month's opening balance and is ADDED TO THE BALANCE AT THE END OF THE YEAR; each month's
 * contribution is added at the end of that month. The wage rises by the increment once a year.
 */
export function pfMaturity(i: PfInput): PfResult | Problem {
  if (!inRange(i.currentAge, 18, 70) || !Number.isInteger(i.currentAge)) return { error: "Enter your age today (18 to 70, in whole years)." };
  if (!inRange(i.retirementAge, 19, 75) || !Number.isInteger(i.retirementAge) || i.retirementAge <= i.currentAge) return { error: "Enter a retirement age higher than your age today." };
  if (!inRange(i.monthlyWage, 1, 1e8)) return { error: "Enter your monthly basic pay plus DA." };
  if (!inRange(i.incrementPct, 0, 50)) return { error: "Enter the yearly increase of pay between 0 and 50." };
  for (const [v, w] of [[i.employeePct, "employee"], [i.employerPct, "employer"], [i.vpfPct, "voluntary"]] as const) if (!inRange(v, 0, 100)) return { error: `Enter the ${w} contribution between 0 and 100.` };
  if (!inRange(i.currentBalance, 0, 1e11)) return { error: "Enter your PF balance today (0 if you do not know)." };
  if (!inRange(i.interestPct, 0, 30)) return { error: "Enter the yearly interest rate between 0 and 30." };

  const yearsToGo = i.retirementAge - i.currentAge;
  let balance = i.currentBalance;
  let employeeTotal = 0, employerTotal = 0, vpfTotal = 0, interestTotal = 0;
  const years: PfYear[] = [];
  for (let y = 0; y < yearsToGo; y++) {
    const wage = i.monthlyWage * Math.pow(1 + i.incrementPct / 100, y);
    let accrued = 0;
    let contribution = 0;
    for (let m = 0; m < 12; m++) {
      accrued += (balance * i.interestPct) / 1200;
      const e = (wage * i.employeePct) / 100, r = (wage * i.employerPct) / 100, v = (wage * i.vpfPct) / 100;
      balance += e + r + v;
      contribution += e + r + v;
      employeeTotal += e;
      employerTotal += r;
      vpfTotal += v;
    }
    balance += accrued;
    interestTotal += accrued;
    years.push({ year: y + 1, age: i.currentAge + y + 1, monthlyWage: wage, contribution, interest: accrued, closing: balance });
  }
  return { maturity: balance, opening: i.currentBalance, employeeTotal, employerTotal, vpfTotal, interestTotal, years };
}

/** The PF rate and shares the form starts with (the person changes them). */
export const PF_DEFAULTS = { employeePct: 12, employerPct: 3.67, vpfPct: 0, interestPct: 8.25, incrementPct: 5, retirementAge: 60 };
