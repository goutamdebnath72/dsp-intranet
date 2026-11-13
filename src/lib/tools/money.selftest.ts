// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/money.selftest.ts
import { num, rupees } from "./money";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ---- helpers
ok("typed numbers", num("1,00,000") === 100000 && num(" 8.5 ") === 8.5 && num("₹ 5,000") === 5000 && Number.isNaN(num("")) && Number.isNaN(num("abc")) && num(7) === 7);
ok("rupees in Indian grouping", rupees(1234567) === "₹ 12,34,567" && rupees(999) === "₹ 999" && rupees(100000) === "₹ 1,00,000" && rupees(-2500) === "-₹ 2,500" && rupees(0.4) === "₹ 0");

console.log(`money selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
