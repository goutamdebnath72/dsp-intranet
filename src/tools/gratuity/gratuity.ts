// src/tools/gratuity/gratuity.ts
//
// GRATUITY from the last pay and the years of service, with the upper limit.
// Pure function: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
// These are APPROXIMATIONS and the screen says so. Every rate is an input with a default, not a hidden constant: the rules change, and the person knows the figures of his own case.

import { inRange, rupees, type Problem } from "@/lib/tools/money";

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
