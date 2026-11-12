// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/kpiFromTable.selftest.ts
// The big number cards built from a short table with one amount per row (kpiFromTable.ts). The first case is the table of the owner's query on 11 Nov 2026.
import { kpiFromTable, withKpiCards } from "./kpiFromTable";
import type { SynthesisResult, SynthesisTable } from "./executiveSynthesis";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const deposit: SynthesisTable = {
  title: "Interest-free security deposit by accommodation type",
  columns: ["Accommodation type", "Required security deposit amount", "Adjustment terms"],
  rows: [
    ["1 Bed-Room", "₹ 10 Lakh or leave salary, whichever is higher", "Adjustable from leave salary dues upon written undertaking"],
    ["2 Bed-Rooms", "₹ 15 Lakh or leave salary, whichever is higher", "Adjustable from leave salary dues upon written undertaking"],
    ["3 Bed-Rooms & above", "₹ 20 Lakh or leave salary, whichever is higher", "Adjustable from leave salary dues upon written undertaking"],
  ],
  sources: [6],
};
{ const k = kpiFromTable(deposit)!;
  ok("a one-amount-per-row table gives cards, one per row, with the figure as the circular's table gives it", k?.type === "kpi" && k.items.length === 3 && k.items.map((i) => i.value).join() === "10,15,20" && k.unit === "₹ Lakh", JSON.stringify(k));
  ok("each card keeps its row's label and the cell's own words as the detail", k.items[0].label === "1 Bed-Room" && /leave salary, whichever is higher/.test(k.items[0].detail || ""));
  ok("the cards carry the table's title, the column heading and the table's sources", k.title === deposit.title && k.subtitle === "Required security deposit amount" && k.sources?.join() === "6"); }

const rent: SynthesisTable = { columns: ["Period", "Type A", "Type B"], rows: [["Upto 2 months", "Standard HRR", "Standard HRR"], ["3rd & 4th month", "4x Standard HRR", "2x Standard HRR"]] };
ok("a table of words and multiples is not cards", kpiFromTable(rent) === null);
ok("a table whose amounts are all alike is not cards (nothing to compare)", kpiFromTable({ columns: ["Item", "Fee"], rows: [["A", "₹ 500"], ["B", "₹ 500"]] }) === null);
ok("five rows are a table, not cards", kpiFromTable({ columns: ["Item", "Fee"], rows: [["A", "₹ 1"], ["B", "₹ 2"], ["C", "₹ 3"], ["D", "₹ 4"], ["E", "₹ 5"]] }) === null);
ok("two units in one column are not drawn side by side", kpiFromTable({ columns: ["Item", "Rate"], rows: [["A", "₹ 10 Lakh"], ["B", "₹ 500"]] }) === null);
ok("a row with no figure first spoils the column", kpiFromTable({ columns: ["Item", "Rate"], rows: [["A", "₹ 100"], ["B", "As per rules"]] }) === null);
ok("one row is not a comparison", kpiFromTable({ columns: ["Item", "Rate"], rows: [["A", "₹ 100"]] }) === null);
{ const k = kpiFromTable({ columns: ["Scheme", "Rate"], rows: [["Scheme A", "12%"], ["Scheme B", "8.5%"]] })!;
  ok("percentages are cards too, in one unit", k?.unit === "%" && k.items.map((i) => i.value).join() === "12,8.5"); }
{ const k = kpiFromTable({ columns: ["Scheme", "Plain", "Award"], rows: [["A", "text", "₹ 8,000"], ["B", "text", "₹ 10,000"]] })!;
  ok("the first column that fits is used, thousands commas read, rupees without a scale are ₹", k?.unit === "₹" && k.items.map((i) => i.value).join() === "8000,10000" && k.subtitle === undefined && k.title === "Award", JSON.stringify(k)); }

const base: SynthesisResult = { overview: "x", keyFindings: [], charts: [], citations: [], table: rent, extraTable: deposit };
ok("the cards are added from the second table when the first gives none", withKpiCards(base).charts.length === 1 && withKpiCards(base).charts[0].type === "kpi");
ok("the result is not changed in place", base.charts.length === 0);
const bar = { type: "bar" as const, title: "b", items: [{ label: "a", value: 1 }] };
ok("cards join one existing chart", withKpiCards({ ...base, charts: [bar] }).charts.map((c) => c.type).join() === "bar,kpi");
ok("never a third chart", withKpiCards({ ...base, charts: [bar, { ...bar, title: "c" }] }).charts.length === 2);
ok("never a second set of cards", withKpiCards({ ...base, charts: [{ ...bar, type: "kpi" as const }] }).charts.length === 1);
ok("no table, no cards", withKpiCards({ ...base, table: null, extraTable: null }).charts.length === 0);

console.log(`kpiFromTable selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
