// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/emi/emi.selftest.ts
import { emiCalc, LOAN_PRESETS, type EmiResult } from "./emi";
import { isProblem } from "@/lib/tools/money";

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

console.log(`emi selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
