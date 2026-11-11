// src/lib/search/idQuery.selftest.ts
// Run with: npx tsx src/lib/search/idQuery.selftest.ts
import { isIdQuery } from "./idQuery";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
};

for (const id of ["498301", "9434791234", "D000896", "d000896", "1234", "4501", "  498301  "]) ok(`"${id}" is an identifier`, isIdQuery(id));
for (const w of ["2025", "2024", "1999", "2100", "gpais premium", "dr karmakar", "", "   ", "12345", "498301 498302", "2025 holidays"]) ok(`"${w}" is not an identifier`, !isIdQuery(w));

console.log(`idQuery selftest: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
