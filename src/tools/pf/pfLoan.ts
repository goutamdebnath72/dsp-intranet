// src/tools/pf/pfLoan.ts
//
// THE REFUNDABLE PF LOAN OF DSP: the monthly instalment (EMI), the interest, the month-by-month schedule and the yearly summary. Pure: what a person types is used in the browser and is never stored, logged or sent.
// DSP has two kinds of PF loan: the NON-REFUNDABLE one (NRL), which is not paid back (the PF page shows it as "Less N.R.Loan"), so it has no instalment; and the REFUNDABLE one, which this file works out.
// THE THREE RULES of the refundable loan, as the owner (HOD of C&IT) gave them:
//   1. the loan's interest is always 1 percentage point more than the interest the PF deposit earns (8.25% on the deposit gives 9.25% on the loan);
//   2. the period is at most 10 years, and never longer than the employee's service still to run (the loan has to be paid back before retirement: "provided the employee has equal or more length of service");
//   3. the interest is worked on the balance that is still owed, month by month (reducing balance), in equal monthly instalments.
// Not checked here, and said so on the screen: how much an employee may borrow (that is for the PF rules and the trust to decide). The deposit rate is an input with a default (it is declared each year), not a hidden constant.
// The service left is counted in whole months from the current month to the month of retirement, the retirement month included (the instalment is taken from that month's pay as well, as its PF contribution is).

import { inRange, type Problem } from "@/lib/tools/money";
import { PF_DEFAULTS } from "./pf";

/** the rules in one place */
export const PF_LOAN = {
  /** the loan's rate is the deposit's rate plus this many percentage points */
  spreadPct: 1,
  maxYears: 10,
  maxMonths: 120,
  /** the deposit rate the form starts with (the rate the PF page shows: 8.25) */
  defaultDepositPct: PF_DEFAULTS.interestPct,
} as const;

export interface YMD { day: number; month: number; year: number }

/** the loan's yearly rate in percent for a deposit rate in percent (always one point more) */
export const loanRatePct = (depositPct: number): number => Number((depositPct + PF_LOAN.spreadPct).toFixed(4));

/** whole months from the current month to the month of retirement, the retirement month included (0 or less: no service left to repay in) */
export const monthsOfService = (retire: YMD, today: YMD): number => retire.year * 12 + retire.month - (today.year * 12 + today.month);

export interface TenureLimit {
  /** the longest period this employee may take, in months */
  maxMonths: number;
  /** the months of service left */
  monthsLeft: number;
  /** what sets the limit: the ten years of the rule, or the service left */
  bound: "ten-years" | "service";
}

/** the longest period for an employee who retires on that date: 10 years, or the service left if that is less; or a problem when there is no service left */
export function tenureLimit(retire: YMD | null, today: YMD): TenureLimit | Problem {
  if (!retire) return { error: "Enter your date of retirement: the loan cannot run beyond it." };
  const left = monthsOfService(retire, today);
  if (left < 1) return { error: "Your retirement month is this month or past: there is no service left to repay a loan in." };
  return left < PF_LOAN.maxMonths ? { maxMonths: left, monthsLeft: left, bound: "service" } : { maxMonths: PF_LOAN.maxMonths, monthsLeft: left, bound: "ten-years" };
}

export interface PfLoanInput {
  principal: number;
  /** the interest the PF deposit earns, in percent a year */
  depositPct: number;
  months: number;
  retire: YMD | null;
  today: YMD;
}
export interface LoanRow { month: number; opening: number; interest: number; principal: number; closing: number }
export interface PfLoanResult {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  /** interest as a share of everything paid, in percent */
  interestSharePct: number;
  schedule: LoanRow[];
  yearly: Array<{ year: number; principal: number; interest: number; closing: number }>;
  depositPct: number;
  /** the rate of the loan: the deposit's plus one */
  loanPct: number;
  limit: TenureLimit;
}

const ymd = (x: YMD): string => `${String(x.day).padStart(2, "0")}/${String(x.month).padStart(2, "0")}/${x.year}`;

export function pfLoanEmi(i: PfLoanInput): PfLoanResult | Problem {
  if (!inRange(i.principal, 1, 1e11)) return { error: "Enter the loan amount (more than 0)." };
  if (!inRange(i.depositPct, 0, 30)) return { error: "Enter the interest the PF deposit earns, a yearly rate between 0 and 30." };
  const limit = tenureLimit(i.retire, i.today);
  if ("error" in limit) return limit;
  if (!Number.isInteger(i.months) || !inRange(i.months, 1, 1200)) return { error: "Enter the period as a whole number of months or years, from 1 month." };
  if (i.months > limit.maxMonths) {
    return {
      error: limit.bound === "service"
        ? `The loan cannot run beyond your retirement: you have ${limit.monthsLeft} months of service left (to ${i.retire ? ymd(i.retire) : ""}), so the longest period is ${limit.maxMonths} months.`
        : `A refundable PF loan runs for at most ${PF_LOAN.maxYears} years (${PF_LOAN.maxMonths} months).`,
    };
  }
  const depositPct = i.depositPct;
  const loanPct = loanRatePct(depositPct);
  const n = i.months, P = i.principal, r = loanPct / 1200;
  // equal monthly instalments on the balance still owed: the first month's interest is a month of the rate on the whole loan; the last month clears what is left
  const emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const schedule: LoanRow[] = [];
  let open = P;
  for (let k = 1; k <= n; k++) {
    const interest = open * r;
    const pr = k === n ? open : emi - interest;
    const close = k === n ? 0 : Math.max(0, open - pr);
    schedule.push({ month: k, opening: open, interest, principal: pr, closing: close });
    open = close;
  }
  const totalInterest = schedule.reduce((s, x) => s + x.interest, 0);
  const totalPayment = P + totalInterest;
  const yearly: PfLoanResult["yearly"] = [];
  for (let y = 0; y * 12 < n; y++) {
    const rows = schedule.slice(y * 12, y * 12 + 12);
    yearly.push({ year: y + 1, principal: rows.reduce((s, x) => s + x.principal, 0), interest: rows.reduce((s, x) => s + x.interest, 0), closing: rows[rows.length - 1].closing });
  }
  return { emi, totalInterest, totalPayment, interestSharePct: (totalInterest / totalPayment) * 100, schedule, yearly, depositPct, loanPct, limit };
}
