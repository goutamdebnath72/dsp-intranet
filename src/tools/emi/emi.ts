// src/tools/emi/emi.ts
//
// LOAN EMI (bank, PF and co-operative society loans): the monthly instalment, the total interest, the month-by-month schedule and the yearly summary.
// Pure function: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
// These are APPROXIMATIONS and the screen says so. Every rate is an input with a default, not a hidden constant: the rules change, and the person knows the figures of his own case.

import { inRange, type Problem } from "@/lib/tools/money";

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
