// src/lib/tools/finance.ts
//
// THE MONEY CALCULATORS OF THE SEARCH BAR: loan EMI (bank, PF and co-operative society loans), provident-fund maturity, gratuity, leave encashment.
// Pure functions: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
//
// These are APPROXIMATIONS and the screen says so. Every rate (interest, DA share, gratuity ceiling) is an input with a default, not a hidden constant: the rules change, and the
// person knows the figures of his own case. Defaults carry the date they were set so a stale default is visible (RATE_DEFAULTS_AS_OF).

export const RATE_DEFAULTS_AS_OF = "November 2026";

/** a number typed by a person: "1,00,000", " 8.5 ", "" (nothing -> NaN) */
export function num(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[,\s₹]/g, "").trim();
  if (t === "") return NaN;
  return Number(t);
}

export interface Problem {
  error: string;
}
export const isProblem = (x: unknown): x is Problem => !!x && typeof x === "object" && "error" in (x as object);

const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/* ------------------------------ loan EMI ------------------------------ */

export type EmiMethod = "reducing" | "flat";

export interface EmiInput {
  principal: number;
  annualRatePct: number;
  months: number;
  method: EmiMethod;
}
export interface EmiRow {
  month: number;
  opening: number;
  interest: number;
  principal: number;
  closing: number;
}
export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  /** interest as a share of the whole payment, in percent */
  interestSharePct: number;
  schedule: EmiRow[];
  yearly: Array<{ year: number; principal: number; interest: number; closing: number }>;
}

export function emiCalc(i: EmiInput): EmiResult | Problem {
  if (!inRange(i.principal, 1, 1e11)) return { error: "Enter the loan amount (more than 0)." };
  if (!inRange(i.annualRatePct, 0, 100)) return { error: "Enter the yearly interest rate between 0 and 100." };
  if (!inRange(i.months, 1, 600) || !Number.isInteger(i.months)) return { error: "Enter the period as a whole number of months, from 1 to 600 (50 years)." };
  const n = i.months;
  const P = i.principal;
  const schedule: EmiRow[] = [];
  let emi: number;
  if (i.method === "flat") {
    const totalInterest = (P * i.annualRatePct * (n / 12)) / 100;
    emi = (P + totalInterest) / n;
    let open = P;
    for (let k = 1; k <= n; k++) {
      const pr = P / n;
      const close = Math.max(0, open - pr);
      schedule.push({ month: k, opening: open, interest: totalInterest / n, principal: pr, closing: close });
      open = close;
    }
  } else {
    const r = i.annualRatePct / 1200;
    emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    let open = P;
    for (let k = 1; k <= n; k++) {
      const interest = open * r;
      const pr = emi - interest;
      const close = k === n ? 0 : Math.max(0, open - pr);
      schedule.push({ month: k, opening: open, interest, principal: k === n ? open : pr, closing: close });
      open = close;
    }
  }
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalPayment = P + totalInterest;
  const yearly: EmiResult["yearly"] = [];
  for (let y = 0; y * 12 < n; y++) {
    const rows = schedule.slice(y * 12, y * 12 + 12);
    yearly.push({ year: y + 1, principal: rows.reduce((s, r) => s + r.principal, 0), interest: rows.reduce((s, r) => s + r.interest, 0), closing: rows[rows.length - 1].closing });
  }
  return { emi, totalInterest, totalPayment, interestSharePct: (totalInterest / totalPayment) * 100, schedule, yearly };
}

/** The loan kinds of the form: only their starting figures differ (the sum is the same). */
export const LOAN_PRESETS: Array<{ id: string; label: string; rate: number; months: number; method: EmiMethod; hint: string }> = [
  { id: "bank", label: "Bank loan (home, car, personal)", rate: 8.5, months: 240, method: "reducing", hint: "Banks charge interest on the balance still owed (reducing balance)." },
  { id: "pf", label: "Provident fund loan", rate: 8.25, months: 60, method: "reducing", hint: "Set the rate your PF loan carries; repayment months are fixed by the PF rules." },
  { id: "coop", label: "Co-operative society loan", rate: 12, months: 36, method: "reducing", hint: "Many societies charge on the reducing balance; some quote a flat rate. Choose the method your society uses." },
];

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

/* ------------------------------ gratuity ------------------------------ */

export interface GratuityInput {
  /** last drawn monthly basic pay plus DA */
  lastDrawn: number;
  years: number;
  /** months beyond the whole years */
  months: number;
  /** covered by the Payment of Gratuity Act (15 days' wages = salary x 15 / 26), or not (15 / 30) */
  actCovered: boolean;
  /** the upper limit, in rupees */
  ceiling: number;
  /** the exit is by death or disability (no five-year condition) */
  deathOrDisability: boolean;
}
export interface GratuityResult {
  completedYears: number;
  uncapped: number;
  amount: number;
  capped: boolean;
  eligible: boolean;
  message: string;
  perYear: number;
}

export function gratuityCalc(i: GratuityInput): GratuityResult | Problem {
  if (!inRange(i.lastDrawn, 1, 1e8)) return { error: "Enter your last drawn monthly basic pay plus DA." };
  if (!inRange(i.years, 0, 60) || !Number.isInteger(i.years)) return { error: "Enter the whole years of service (0 to 60)." };
  if (!inRange(i.months, 0, 11) || !Number.isInteger(i.months)) return { error: "Enter the extra months of service (0 to 11)." };
  if (!inRange(i.ceiling, 0, 1e10)) return { error: "Enter the upper limit of gratuity in rupees." };
  // a part of a year of six months or more counts as a whole year
  const completedYears = i.years + (i.months >= 6 ? 1 : 0);
  const perYear = (i.lastDrawn * 15) / (i.actCovered ? 26 : 30);
  const uncapped = perYear * completedYears;
  const eligible = i.deathOrDisability || i.years >= 5; // five whole years of continuous service
  const amount = eligible ? Math.min(uncapped, i.ceiling) : 0;
  const capped = eligible && uncapped > i.ceiling;
  const message = !eligible ? "Gratuity is payable after five years of continuous service (except on death or disability): with less than that, this comes to nothing." : capped ? "The amount reaches the upper limit, so the limit is paid." : "";
  return { completedYears, uncapped, amount, capped, eligible, message, perYear };
}
export const GRATUITY_DEFAULTS = { ceiling: 2000000 };

/* ------------------------------ leave encashment ------------------------------ */

export interface EncashmentInput {
  basic: number;
  da: number;
  days: number;
  /** the most days that may be encashed */
  maxDays: number;
  /** the divisor of a month's pay (30) */
  divisor: number;
}
export interface EncashmentResult {
  daysPaid: number;
  perDay: number;
  amount: number;
  capped: boolean;
}
export function encashmentCalc(i: EncashmentInput): EncashmentResult | Problem {
  if (!inRange(i.basic, 1, 1e8)) return { error: "Enter your basic pay." };
  if (!inRange(i.da, 0, 1e8)) return { error: "Enter your DA (0 if none)." };
  if (!inRange(i.days, 0, 10000)) return { error: "Enter the days of leave to encash." };
  if (!inRange(i.maxDays, 0, 10000)) return { error: "Enter the most days that can be encashed." };
  if (!inRange(i.divisor, 1, 31)) return { error: "Enter the number of days a month's pay is divided by (30)." };
  const perDay = (i.basic + i.da) / i.divisor;
  const daysPaid = Math.min(i.days, i.maxDays);
  return { daysPaid, perDay, amount: perDay * daysPaid, capped: i.days > i.maxDays };
}
export const ENCASHMENT_DEFAULTS = { maxDays: 300, divisor: 30 };

/** ₹ with Indian grouping and no paise unless the amount has them (an approximation does not need them) */
export function rupees(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const r = Math.round(v);
  const neg = r < 0;
  const s = Math.abs(r).toString();
  const g = s.length > 3 ? `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${s.slice(-3)}` : s;
  return `${neg ? "-" : ""}₹ ${g}`;
}
