// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/encashment/encashment.selftest.ts
import { encashmentCalc, type EncashmentResult } from "./encashment";
import { isProblem } from "@/lib/tools/money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ---- leave encashment
const l = encashmentCalc({ basic: 80000, da: 20000, days: 100, maxDays: 300, divisor: 30 }) as EncashmentResult;
ok("leave encashment: (basic + DA) / 30 per day", near(l.perDay, 100000 / 30, 1e-9) && near(l.amount, 100000 / 30 * 100, 1e-6) && !l.capped);
ok("days beyond the limit are not paid, and it is said", (() => { const x = encashmentCalc({ basic: 80000, da: 20000, days: 320, maxDays: 300, divisor: 30 }) as EncashmentResult; return x.capped && x.daysPaid === 300 && near(x.amount, 100000 / 30 * 300, 1e-6); })());
ok("impossible encashment inputs are told", isProblem(encashmentCalc({ basic: 0, da: 0, days: 1, maxDays: 300, divisor: 30 })) && isProblem(encashmentCalc({ basic: 1, da: 0, days: -1, maxDays: 300, divisor: 30 })));

console.log(`encashment selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
