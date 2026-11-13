// src/tools/encashment/encashment.ts
//
// LEAVE ENCASHMENT (EL / HPL): the pay for the days encashed, with the limit of days.
// Pure function: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
// These are APPROXIMATIONS and the screen says so. Every rate is an input with a default, not a hidden constant: the rules change, and the person knows the figures of his own case.

import { inRange, type Problem } from "@/lib/tools/money";

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
