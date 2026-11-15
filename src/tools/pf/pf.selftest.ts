// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/pf/pf.selftest.ts
// The probable PF at superannuation. Every figure below is made up for the test (round numbers whose answers can be worked by hand); no real person's PF is used.
// The method is the DSP PF trust's own (read from a DSP yearly statement): interest on the opening balance = balance x rate; a month's contribution earns from its own month to the year's end (April 12 months,
// March 1 month); interest is added at the year's end; the company's share is the employee's less the EPS part; taxable interest is what is put in beyond the yearly limit, with 10% TDS in the employee's column.
import { PF_DEFAULTS, fyLabel, fyOf, parseDate, parseMonthYear, pfAtRetirement, pfWhatIf, slotOf, total, type PfInput, type PfResult } from "./pf";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const zero = { emp: 0, comp: 0, vpf: 0 };
// the base case: the page posted up to April 2026 (month 1 of the year, the page showing April's contribution and its interest for that one month), eleven months and 2026-27 to complete, no pay rise, no tax.
// "run" builds that page from the monthly figures, so a whole year is April's contribution (12 months of interest) down to March's (1 month): the sums below are worked by hand.
const base: PfInput = {
  postedMonth: 4, postedYear: 2026, retireMonth: 3, retireYear: 2027,
  opening: { emp: 1_000_000, comp: 500_000, vpf: 200_000 }, contributions: zero, contributionInterest: zero,
  interestPct: 8, pageRatePct: 8, monthlyEmp: 10_000, epsPart: 1_250, monthlyVpf: 0, vpfCeiling: 30_000, risePct: 0,
  taxableOpening: null, taxFreeLimit: 250_000, tdsPct: 10,
};
const pageOf = (o: Partial<PfInput>): PfInput => {
  const m = { ...base, ...o };
  const c = m.monthlyEmp, e = Math.max(0, c - m.epsPart), v = Math.min(m.monthlyVpf, m.vpfCeiling), k = m.interestPct / 1200;
  return { ...m, contributions: o.contributions ?? { emp: c, comp: e, vpf: v }, contributionInterest: o.contributionInterest ?? { emp: c * k, comp: e * k, vpf: v * k } };
};
const run = (o: Partial<PfInput>): PfResult => { const r = pfAtRetirement(pageOf(o)); if (isProblem(r)) throw new Error(r.error); return r; };

// ---- dates and years
ok("a month's place in the financial year: April 1 ... March 12; the year of January 2027 is 2026-27", slotOf(4) === 1 && slotOf(3) === 12 && slotOf(10) === 7 && fyOf(2027, 1) === 2026 && fyOf(2026, 4) === 2026 && fyLabel(2026) === "2026-27" && fyLabel(2099) === "2099-00");
ok("the month and the date are read as typed (10/2026, 30/03/2032) and refused when impossible", JSON.stringify(parseMonthYear("10/2026")) === '{"month":10,"year":2026}' && parseMonthYear("10-2026")?.month === 10 && parseMonthYear("13/2026") === null && parseMonthYear("10/26") === null && JSON.stringify(parseDate("30/03/2032")) === '{"day":30,"month":3,"year":2032}' && parseDate("31/04/2032") === null && parseDate("29/02/2031") === null && parseDate("29/02/2032")?.day === 29);

// ---- one whole year, worked by hand
// opening 1,000,000 at 8%: 80,000. Ten thousand a month earns 10,000 x 8% x (12+11+...+1)/12 = 10,000 x 0.08 x 6.5 = 5,200. Closing 1,000,000 + 120,000 + 80,000 + 5,200 = 1,205,200.
const y1 = run({});
ok("one whole year (eleven months after April): the employee column is 1,205,200 (opening + 12 months + interest on the opening balance + interest from each month's own month)", near(y1.final.emp, 1_205_200) && near(y1.years[0].interest, total({ emp: 85_200, comp: 500_000 * 0.08 + 8_750 * 0.08 * 6.5, vpf: 16_000 })) && y1.years.length === 1 && y1.years[0].months === 12);
ok("the company's share is the employee's CPF less the pension part (10,000 - 1,250 = 8,750 a month): 500,000 + 105,000 + 40,000 + 4,550", near(y1.final.comp, 500_000 + 8_750 * 12 + 40_000 + 8_750 * 0.08 * 6.5));
ok("the voluntary part: none gives only the opening balance and its interest (200,000 + 16,000)", near(y1.final.vpf, 216_000));
const v = run({ monthlyVpf: 30_000 });
ok("a monthly VPF of 30,000 adds 360,000 and 30,000 x 8% x 6.5 = 15,600 of interest", near(v.final.vpf, 200_000 + 16_000 + 360_000 + 15_600));
ok("a VPF above the ceiling is cut to the ceiling (50,000 is taken as 30,000)", near(run({ monthlyVpf: 50_000 }).final.vpf, v.final.vpf));
ok("the parts add up: the closing balance = opening + added + interest (- TDS)", near(y1.finalTotal, total(base.opening) + (10_000 + 8_750) + y1.futureContributions + y1.years[0].interest - y1.tdsTotal));

// ---- the page's own identity, and a year begun
// posted up to October (7 months): the page says closing = a + b + e + f with b = a x rate x 7 / 12
const mid = run({ postedMonth: 10, postedYear: 2026, retireMonth: 3, retireYear: 2027, contributions: { emp: 70_000, comp: 61_250, vpf: 0 }, contributionInterest: { emp: 1_400, comp: 1_200, vpf: 0 } });
ok("where the page stands now: a + a x 8% x 7/12 + e + f for each column", near(mid.now.emp, 1_000_000 + 1_000_000 * 0.08 * 7 / 12 + 70_000 + 1_400) && near(mid.now.comp, 500_000 + 500_000 * 0.08 * 7 / 12 + 61_250 + 1_200) && mid.postedMonths === 7 && mid.monthsToGo === 5);
// to March: opening 1,000,000 x 8% = 80,000; posted 70,000 earns 70,000 x 8% x 5/12 more = 2,333.33 on top of the 1,400 posted; five more months of 10,000 earn 10,000 x 8% x (5+4+3+2+1)/12 = 1,000
ok("to the end of the year: the page's interest on the posted months, the posted months' remaining months, and each coming month from its own month", near(mid.final.emp, 1_000_000 + 70_000 + 50_000 + 80_000 + 1_400 + 70_000 * 0.08 * 5 / 12 + 1_000));
ok("five months are still to be paid, and 50,000 + 43,750 are added by the employee and the company", mid.monthsToGo === 5 && near(mid.futureContributions, 5 * 10_000 + 5 * 8_750));

// ---- more years, the rise, a retirement inside a year
const five = run({ retireYear: 2031, risePct: 5 });
ok("five years: five rows, 2026-27 to 2030-31, each 12 months", five.years.length === 5 && five.years.map((y) => y.fy).join(" ") === "2026-27 2027-28 2028-29 2029-30 2030-31" && five.years.every((y) => y.months === 12));
ok("the first coming year stays at today's CPF and the pay rise starts the April after (10,000, 10,500, 11,025)", near(five.years[0].monthlyEmp, 10_000) && near(five.years[1].monthlyEmp, 10_500) && near(five.years[2].monthlyEmp, 11_025));
ok("each year closes at the last year's close + what was added + the interest - the TDS", five.years.every((y, i) => i === 0 || near(y.closingTotal, five.years[i - 1].closingTotal + total(y.added) + y.interest - y.tds, 0.01)) && near(five.final.emp, five.years[4].closing.emp));
const part = run({ retireMonth: 9, retireYear: 2026 });
// retiring in September 2026: months April..September (6): interest 1,000,000 x 8% x 6/12 = 40,000; 10,000 x 8% x (6+5+4+3+2+1)/12 = 1,400
ok("a retirement inside the year: only the months up to the retirement month, interest for those months (40,000 + 1,400)", near(part.final.emp, 1_000_000 + 60_000 + 40_000 + 1_400) && part.years[0].months === 6 && part.monthsToGo === 5);
ok("another rate for the future leaves the page's own interest on the posted months alone (the balance now is the page's, whatever rate is tried)", (() => { const f = { emp: 66.67, comp: 58.33, vpf: 0 }; return near(run({ interestPct: 7, contributionInterest: f }).nowTotal, run({ interestPct: 9, contributionInterest: f }).nowTotal, 0.001); })());
ok("a higher rate, a higher rise and a longer career each give more", run({ retireYear: 2031, interestPct: 9 }).finalTotal > run({ retireYear: 2031 }).finalTotal && run({ retireYear: 2031, risePct: 5 }).finalTotal > run({ retireYear: 2031, risePct: 0 }).finalTotal && run({ retireYear: 2032 }).finalTotal > run({ retireYear: 2031 }).finalTotal);

// ---- the tax on interest
// 10,000 PF + 20,000 VPF a month = 30,000: the 250,000 limit is crossed in the 9th month (cumulative 270,000): 20,000 taxable then, and 30,000 in each of months 10, 11 and 12 = 110,000 in all.
// interest on it: 20,000 x 8% x 4/12 + 30,000 x 8% x (3+2+1)/12 = 533.33 + 1,200 = 1,733.33; TDS 10% = 173.33; taxable balance 0 + 110,000 + 1,733.33 - 173.33 = 111,560.
const tx = run({ monthlyVpf: 20_000, taxableOpening: 0 });
ok("the taxable part: 110,000 beyond the limit, interest 1,733.33, TDS 173.33, taxable balance 111,560", near(tx.tdsTotal, 173.33, 0.02) && near(tx.taxableClosing!, 111_560, 0.05));
ok("the TDS is taken from the employee's column only, and the other columns are as without tax", near(tx.final.emp, run({ monthlyVpf: 20_000 }).final.emp - tx.tdsTotal, 0.001) && near(tx.final.comp, run({ monthlyVpf: 20_000 }).final.comp) && near(tx.final.vpf, run({ monthlyVpf: 20_000 }).final.vpf));
ok("a taxable balance carried in earns taxable interest too: 100,000 at 8% adds 8,000 of taxable interest and 800 of TDS", near(run({ monthlyVpf: 20_000, taxableOpening: 100_000 }).tdsTotal - tx.tdsTotal, 800, 0.02));
ok("under the limit nothing is taxable: 10,000 a month (120,000 in a year) and no taxable balance gives no TDS", near(run({ taxableOpening: 0 }).tdsTotal, 0));
ok("with no taxable balance given, no TDS is taken off and the result says so (taxableClosing is null)", run({ monthlyVpf: 20_000 }).tdsTotal === 0 && run({ monthlyVpf: 20_000 }).taxableClosing === null);
ok("the months of the page already posted count as equal parts of what the page shows: 436,920 posted in 7 months crosses the limit", run({ postedMonth: 10, postedYear: 2026, contributions: { emp: 133_920, comp: 122_699, vpf: 303_000 }, contributionInterest: zero, taxableOpening: 300_000 }).tdsTotal > 0);

// ---- what if
const grid = pfWhatIf(pageOf({ retireYear: 2031 }), [0, 5], [7.5, 8, 8.5]);
ok("the what-if table has a row for each rise and a cell for each rate, and a higher rate or rise gives a higher figure", grid.length === 2 && grid[0].cells.length === 3 && grid[0].cells[2].total! > grid[0].cells[0].total! && grid[1].cells[1].total! > grid[0].cells[1].total! && near(grid[0].cells[1].total!, run({ retireYear: 2031, risePct: 0 }).finalTotal, 0.001));

// ---- refusals
ok("impossible inputs are told, never worked out", isProblem(pfAtRetirement({ ...base, retireYear: 2026 })) && isProblem(pfAtRetirement({ ...base, retireMonth: 4, retireYear: 2026 })) && isProblem(pfAtRetirement({ ...base, postedMonth: 13 })) && isProblem(pfAtRetirement({ ...base, interestPct: 40 })) && isProblem(pfAtRetirement({ ...base, opening: { emp: NaN, comp: 0, vpf: 0 } })) && isProblem(pfAtRetirement({ ...base, monthlyEmp: NaN })) && isProblem(pfAtRetirement({ ...base, retireYear: 2090 })) && isProblem(pfAtRetirement({ ...base, risePct: 90 })) && isProblem(pfAtRetirement({ ...base, taxableOpening: -5 })));
ok("the defaults are the published ones: 8.25% rate, EPS part 1,250, VPF ceiling 30,000, limit 2,50,000, TDS 10%", PF_DEFAULTS.interestPct === 8.25 && PF_DEFAULTS.epsPart === 1250 && PF_DEFAULTS.vpfCeiling === 30000 && PF_DEFAULTS.taxFreeLimit === 250000 && PF_DEFAULTS.tdsPct === 10);

console.log(`pf selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
