// src/lib/search/tableColumns.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/lib/search/tableColumns.selftest.ts)
// The "derived column" safeguard of buildTable must not take the columns of a holiday list for copies of each other. Real case (G01, 10 Nov 2026): the closed/public holidays fall on
// the same DATE every year and a different weekday, and the 2025 and 2026 columns were dropped, so the reply showed 2024 only.
import { buildTable } from "./executiveSynthesis";

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") { if (ok) passed++; else { failed++; console.log(`  FAIL  ${name}${detail ? " -- " + detail : ""}`); } }

const holidays = {
  columns: ["Holiday", "2024", "2025", "2026"],
  rows: [
    ["SAIL Foundation Day", "24th January [Wednesday]", "24th January [Friday]", "24th January [Saturday]"],
    ["Republic Day", "26th January [Friday]", "26th January [Sunday]", "26th January [Monday]"],
    ["May Day", "1st May [Wednesday]", "1st May [Thursday]", "1st May [Friday]"],
    ["Independence Day", "15th August [Thursday]", "15th August [Friday]", "15th August [Saturday]"],
    ["Mahatma Gandhi's Birthday", "2nd October [Wednesday]", "2nd October [Thursday]", "2nd October [Friday]"],
  ],
};
const t = buildTable(holidays as any);
check("the three years of a holiday list are all kept (same date, different weekday)", !!t && t.columns.length === 4 && t.columns.join("|") === "Holiday|2024|2025|2026", JSON.stringify(t?.columns));
check("every row keeps its three values", !!t && t.rows.every((r) => r.length === 4));

// the safeguard still works for numbers: a column that is a copy of another with one component zeroed is dropped
const amounts = {
  columns: ["Component", "Works", "Projects"],
  rows: [["Basic", "1000", "1000"], ["Allowance", "500", "500"], ["Bonus", "300", "0"], ["Total", "1800", "1500"]],
};
const a = buildTable(amounts as any);
check("a manufactured numeric column (a copy with a zeroed component) is still dropped", !!a && a.columns.join("|") === "Component|Works", JSON.stringify(a?.columns));
const same = { columns: ["Item", "A", "B"], rows: [["x", "10", "10"], ["y", "20", "20"], ["z", "30", "30"]] };
check("an identical numeric copy is still dropped", buildTable(same as any)?.columns.length === 2);
const real = { columns: ["Item", "A", "B"], rows: [["x", "10", "11"], ["y", "20", "25"], ["z", "30", "35"]] };
check("a genuine second column of numbers is kept", buildTable(real as any)?.columns.length === 3);

console.log(`table columns selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
