// Run: npx tsx --tsconfig tsconfig.json src/lib/holidays/compareView.selftest.ts
// Pure checks (no database, no browser) for the comparison card's data and the year-list wording.
import { buildHolidayCompareView } from "./compareView";
import { formatYearList } from "./yearList";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
};

// ---- year list wording
eq("one run", formatYearList([2020, 2021, 2022, 2023, 2024, 2025, 2026]), "2020 to 2026");
eq("a gap", formatYearList([2020, 2021, 2022, 2024]), "2020 to 2022, 2024");
eq("two in a row", formatYearList([2021, 2022]), "2021 to 2022");
eq("single", formatYearList([2026]), "2026");
eq("unsorted and duplicated", formatYearList([2026, 2024, 2025, 2024]), "2024 to 2026");
eq("empty", formatYearList([]), "");

// ---- all-types comparison (the real 2024 vs 2025 numbers)
const byType = [
  { type: "CH", label: "Closed", a: 5, b: 5 },
  { type: "FH", label: "Festival", a: 14, b: 14 },
  { type: "RH", label: "Restricted", a: 35, b: 33 },
];
const v = buildHolidayCompareView({ yearA: 2024, yearB: 2025, totalA: 40, totalB: 38, byType, nowYear: 2026 });
eq("title", v.title, "Holidays: 2024 vs 2025");
eq("unit", v.unit, "holidays");
eq("totals", v.years.map((y) => y.total), [40, 38]);
eq("past years have no caption", v.years.map((y) => y.caption), ["", ""]);
eq("change in words", v.change, "2 fewer in 2025");
eq("direction", v.direction, "fewer");
eq("row changes", v.rows?.map((r) => r.change), ["no change", "no change", "2 fewer in 2025"]);
eq("row directions", v.rows?.map((r) => r.direction), ["same", "same", "fewer"]);
eq("footnote explains the double counting", v.footnote, "A day that is both a Festival and a Restricted holiday counts once in the totals, so the types add up to more (54 entries in 2024, 52 in 2025).");

// ---- captions for the current and a future year, and a rise
const v2 = buildHolidayCompareView({ yearA: 2025, yearB: 2026, totalA: 38, totalB: 39, byType: byType.map((t) => ({ ...t })), nowYear: 2026 });
eq("current-year caption", v2.years.map((y) => y.caption), ["", "this year"]);
eq("rise in words", v2.change, "1 more in 2026");
eq("rise direction", v2.direction, "more");
const v3 = buildHolidayCompareView({ yearA: 2026, yearB: 2027, totalA: 39, totalB: 39, byType, nowYear: 2026 });
eq("future caption", v3.years[1].caption, "upcoming");
eq("no change", v3.change, "no change");
eq("same direction", v3.direction, "same");

// ---- no footnote when nothing is double counted
const clean = buildHolidayCompareView({ yearA: 2024, yearB: 2025, totalA: 7, totalB: 6, byType: [{ type: "CH", label: "Closed", a: 5, b: 4 }, { type: "FH", label: "Festival", a: 2, b: 2 }], nowYear: 2026 });
eq("no footnote when the types add up to the total", clean.footnote, undefined);

// ---- one type only: tiles show that type, no rows, no footnote
const t = buildHolidayCompareView({ yearA: 2025, yearB: 2026, totalA: 38, totalB: 39, byType, type: "FH", nowYear: 2026 });
eq("typed title", t.title, "Festival holidays: 2025 vs 2026");
eq("typed unit", t.unit, "festival holidays");
eq("typed totals are that type's counts", t.years.map((y) => y.total), [14, 14]);
eq("typed has no rows", t.rows, undefined);
eq("typed has no footnote", t.footnote, undefined);
eq("typed change", t.change, "no change");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
