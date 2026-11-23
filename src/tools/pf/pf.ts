// src/tools/pf/pf.ts
//
// PROBABLE PF AT SUPERANNUATION, WORKED OUT FROM THE DSP PROVIDENT FUND PAGE AND THE PAYSLIP.
// An employee of DSP can see only these figures: on the PF page of the legacy intranet (Provident Fund Statement of the financial year: the opening balance, the interest on it, the monthly contributions so far, the
// interest on them and the closing balance, each for PF (Emp), PF (Comp) and V.P.F), on the yearly PF statement (the taxable balance) and on the payslip (the monthly PF and VPF). My calculator takes exactly those figures
// and carries them forward month by month to the retirement date. It is a pure function: the numbers a person types are used in the browser and are never stored, logged or sent anywhere.
//
// THE METHOD IS THE PF TRUST'S OWN, read from a DSP yearly statement (the sums were checked against every line of one: the interest on the opening balance, on the monthly contributions, the taxable part, the TDS and the closing balance):
//   * Interest on the OPENING balance of a year = opening x rate x months / 12 (a whole year: opening x rate).
//   * Interest on a MONTH'S CONTRIBUTION runs from the month of the contribution itself: April's earns 12 months of the year, March's earns 1 month (so a month's interest is worked out on the running balance
//     INCLUDING that month's contribution). It is not compounded within the year; the interest is added to the balance at the end of the year (31 March) or at retirement.
//   * The company's share in the PF account = the employee's 12% less the pension part (EPS, Rs 1,250 a month: 8.33% of Rs 15,000).
//   * TAXABLE INTEREST: what the employee puts in (PF and VPF together) beyond Rs 2,50,000 in a financial year is taxable, and so is the interest on it and on the taxable balance carried from earlier years. The trust
//     deducts 10% TDS on that interest from the employee's column when the year is closed (the rest of the income tax is recovered from the pay and is not part of the PF).
// These are APPROXIMATIONS and the screen says so: the rate of each future year is declared later, and pay, DA and increments change. I made every rate and limit an input with a default, not a hidden constant.

import { DateTime } from "luxon";
import { inRange, type Problem } from "@/lib/tools/money";

export interface Trio { emp: number; comp: number; vpf: number }
export const total = (t: Trio): number => t.emp + t.comp + t.vpf;

export interface PfInput {
  /** The month and year the PF page says "Monthly Recovery Posted upto" (10 and 2026 for "10/2026 Paybill"). */
  postedMonth: number;
  postedYear: number;
  /** The retirement date's month and year (March 2032 for 30 March 2032). */
  retireMonth: number;
  retireYear: number;
  /** (a) opening balance as on 1 April, from the PF page. */
  opening: Trio;
  /** (e) the monthly contributions of the current financial year so far, from the PF page. */
  contributions: Trio;
  /** (f) the interest on those monthly contributions so far, from the PF page. */
  contributionInterest: Trio;
  /** The yearly rate in percent for the months still to come (the page's own rate, 8.25, until a new one is declared). */
  interestPct: number;
  /** The rate the page used for the months already posted (the page prints it: "Interest Rate : 8.25%"). It does not change when you try another rate for the future. */
  pageRatePct: number;
  /** The employee's monthly PF as the payslip prints it (CPF PC). */
  monthlyEmp: number;
  /** The pension part taken out of the company's share each month (1,250). */
  epsPart: number;
  /** The VPF you will pay each month from now, in rupees, and the ceiling on it (30,000 a month). */
  monthlyVpf: number;
  vpfCeiling: number;
  /** A yearly rise in the PF wage (basic + DA), in percent, applied from the next April; I leave the rest of this year at today's figure. */
  risePct: number;
  /** The taxable balance of the last yearly statement ("TAXBL CB"), or null if you do not have it; then I take no tax on interest off. */
  taxableOpening: number | null;
  /** What the employee may put in before interest turns taxable (2,50,000 a year) and the TDS the trust deducts (10%). */
  taxFreeLimit: number;
  tdsPct: number;
}

export interface PfYear {
  /** "2026-27" */
  fy: string;
  /** The months of this year that are carried (12, or fewer in the first year and in the retirement year). */
  months: number;
  /** The contributions added in this year (from now, in the first year). */
  added: Trio;
  /** The interest of the whole year, and the TDS taken off it. */
  interest: number;
  tds: number;
  /** The balance at the close of the year (or on retirement). */
  closing: Trio;
  closingTotal: number;
  monthlyEmp: number;
}
export interface PfResult {
  /** The balance as the PF page shows it now: a + b + e + f (b = a x rate x months / 12). */
  now: Trio;
  nowTotal: number;
  /** The months already posted in the current year, and the months still to come until retirement. */
  postedMonths: number;
  monthsToGo: number;
  years: PfYear[];
  final: Trio;
  finalTotal: number;
  /** From now to retirement: what is added by contributions and by interest (before TDS), and the TDS. */
  futureContributions: number;
  futureInterest: number;
  tdsTotal: number;
  /** The taxable balance at retirement, if the opening one was given. */
  taxableClosing: number | null;
  retireLabel: string;
}

/** Returns the financial year (April to March) a month belongs to, as its first year; the month's place in it runs April = 1 ... March = 12. */
export const fyOf = (year: number, month: number): number => (month >= 4 ? year : year - 1);
export const slotOf = (month: number): number => (month >= 4 ? month - 3 : month + 9);
export const fyLabel = (f: number): string => `${f}-${String((f + 1) % 100).padStart(2, "0")}`;

/** "10/2026" (also 10-2026, 10.2026) */
export function parseMonthYear(s: string): { month: number; year: number } | null {
  const m = /^\s*(\d{1,2})\s*[/\-. ]\s*(\d{4})\s*$/.exec(s ?? "");
  if (!m) return null;
  const month = Number(m[1]), year = Number(m[2]);
  return month >= 1 && month <= 12 && year >= 1990 && year <= 2100 ? { month, year } : null;
}
/** "30/03/2032" (also 30-03-2032, 30.03.2032): I check the day against the month. */
export function parseDate(s: string): { day: number; month: number; year: number } | null {
  const m = /^\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})\s*$/.exec(s ?? "");
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (month < 1 || month > 12 || year < 1990 || year > 2100) return null;
  return DateTime.fromObject({ year, month, day }, { zone: "utc" }).isValid ? { day, month, year } : null;
}

const trio = (e = 0, c = 0, v = 0): Trio => ({ emp: e, comp: c, vpf: v });
const add = (a: Trio, b: Trio): Trio => trio(a.emp + b.emp, a.comp + b.comp, a.vpf + b.vpf);

export function pfAtRetirement(i: PfInput): PfResult | Problem {
  if (!Number.isInteger(i.postedMonth) || !inRange(i.postedMonth, 1, 12) || !inRange(i.postedYear, 1990, 2100)) return { error: "Enter the month the PF page says the monthly recovery is posted up to, as month/year (for example 10/2026)." };
  if (!Number.isInteger(i.retireMonth) || !inRange(i.retireMonth, 1, 12) || !inRange(i.retireYear, 1990, 2100)) return { error: "Enter your retirement date as day/month/year (for example 30/03/2032)." };
  const F0 = fyOf(i.postedYear, i.postedMonth), n = slotOf(i.postedMonth);
  const FR = fyOf(i.retireYear, i.retireMonth), kR = slotOf(i.retireMonth);
  if (FR < F0 || (FR === F0 && kR <= n)) return { error: "The retirement date must be after the month the PF page is posted up to." };
  if (FR - F0 > 45) return { error: "The retirement date is too far away for an estimate." };
  for (const [t, w] of [[i.opening, "the opening balance"], [i.contributions, "the monthly contributions"], [i.contributionInterest, "the interest on the monthly contributions"]] as const) {
    for (const v of [t.emp, t.comp, t.vpf]) if (!inRange(v, 0, 1e11)) return { error: `Enter ${w} of PF (Emp), PF (Comp) and V.P.F as on the PF page (0 where the page shows 0).` };
  }
  if (!inRange(i.interestPct, 0, 30) || !inRange(i.pageRatePct, 0, 30)) return { error: "Enter the yearly interest rate between 0 and 30." };
  if (!inRange(i.monthlyEmp, 0, 1e8)) return { error: "Enter your monthly PF (CPF) from the payslip." };
  if (!inRange(i.epsPart, 0, 1e6)) return { error: "Enter the pension part of the company's share (1,250 a month)." };
  if (!inRange(i.monthlyVpf, 0, 1e8) || !inRange(i.vpfCeiling, 0, 1e8)) return { error: "Enter the VPF you will pay each month (0 if none) and its ceiling." };
  if (!inRange(i.risePct, 0, 50)) return { error: "Enter the yearly rise in basic pay plus DA between 0 and 50." };
  if (i.taxableOpening !== null && !inRange(i.taxableOpening, 0, 1e11)) return { error: "Enter the taxable balance of the yearly statement (leave it empty if you do not have it)." };
  if (!inRange(i.taxFreeLimit, 0, 1e9) || !inRange(i.tdsPct, 0, 100)) return { error: "Enter the yearly limit before interest is taxable and the TDS in percent." };

  const r = i.interestPct / 100;
  const vpfMonthly = Math.min(i.monthlyVpf, i.vpfCeiling);
  // Where the PF page stands now: closing = a + b + e + f, with b = a x the page's rate x months posted / 12.
  const rp = i.pageRatePct / 100;
  const accNow = trio(i.opening.emp * rp * n / 12 + i.contributionInterest.emp, i.opening.comp * rp * n / 12 + i.contributionInterest.comp, i.opening.vpf * rp * n / 12 + i.contributionInterest.vpf);
  const now = add(add(i.opening, i.contributions), accNow);

  const years: PfYear[] = [];
  let ob = i.opening;
  let taxable = i.taxableOpening;
  let futureContributions = 0, futureInterest = 0, tdsTotal = 0, monthsToGo = 0;
  for (let F = F0; F <= FR; F++) {
    const H = F === FR ? kR : 12; // months carried in this year
    const first = F === F0 ? n + 1 : 1;
    const g = Math.pow(1 + i.risePct / 100, F - F0);
    const monthlyEmp = i.monthlyEmp * g;
    const monthlyComp = Math.max(0, monthlyEmp - i.epsPart);
    let p = F === F0 ? i.contributions : trio();
    let acc = F === F0 ? accNow : trio();
    const added = trio();
    // What the employee puts in each month of this year (PF and VPF), for the taxable part. I take months already posted as equal parts of what the page shows.
    const empByMonth: number[] = [];
    for (let k = 1; k <= H; k++) empByMonth.push(F === F0 && k <= n ? (i.contributions.emp + i.contributions.vpf) / n : monthlyEmp + vpfMonthly);
    for (let k = first; k <= H; k++) {
      p = add(p, trio(monthlyEmp, monthlyComp, vpfMonthly));
      added.emp += monthlyEmp; added.comp += monthlyComp; added.vpf += vpfMonthly;
      acc = add(acc, trio((ob.emp + p.emp) * r / 12, (ob.comp + p.comp) * r / 12, (ob.vpf + p.vpf) * r / 12));
    }
    // (The interest of the months already posted in the first year is inside accNow; every later month adds the running balance's share, the opening balance included.)
    monthsToGo += H - first + 1;
    let tds = 0;
    if (taxable !== null) {
      const intOb = taxable * r * H / 12;
      let cum = 0, tm = 0, intTm = 0;
      for (let k = 1; k <= H; k++) {
        const before = Math.max(0, cum - i.taxFreeLimit);
        cum += empByMonth[k - 1];
        const t = Math.max(0, cum - i.taxFreeLimit) - before;
        tm += t;
        intTm += t * (H - k + 1) / 12 * r;
      }
      tds = (i.tdsPct / 100) * (intOb + intTm);
      taxable = taxable + intOb + tm + intTm - tds;
    }
    const interestYear = total(acc);
    const closing = trio(ob.emp + p.emp + acc.emp - tds, ob.comp + p.comp + acc.comp, ob.vpf + p.vpf + acc.vpf);
    futureContributions += total(added);
    futureInterest += interestYear - (F === F0 ? total(accNow) : 0);
    tdsTotal += tds;
    years.push({ fy: fyLabel(F), months: H, added, interest: interestYear, tds, closing, closingTotal: total(closing), monthlyEmp });
    ob = closing;
  }
  const final = years[years.length - 1].closing;
  return { now, nowTotal: total(now), postedMonths: n, monthsToGo, years, final, finalTotal: total(final), futureContributions, futureInterest, tdsTotal, taxableClosing: taxable, retireLabel: `${String(i.retireMonth).padStart(2, "0")}/${i.retireYear}` };
}

/** The final balance for several yearly rises of pay and several interest rates, for a "what if" table. */
export function pfWhatIf(i: PfInput, rises: number[], rates: number[]): Array<{ risePct: number; cells: Array<{ ratePct: number; total: number | null }> }> {
  return rises.map((risePct) => ({ risePct, cells: rates.map((ratePct) => { const r = pfAtRetirement({ ...i, risePct, interestPct: ratePct }); return { ratePct, total: "error" in r ? null : r.finalTotal }; }) }));
}

/** What the form starts with: figures the PF trust and the Company publish, not the person's own. */
export const PF_DEFAULTS = { interestPct: 8.25, pageRatePct: 8.25, epsPart: 1250, vpfCeiling: 30000, monthlyVpf: 30000, risePct: 5, taxFreeLimit: 250000, tdsPct: 10 };
