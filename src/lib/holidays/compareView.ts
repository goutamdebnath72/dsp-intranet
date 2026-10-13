// src/lib/holidays/compareView.ts
//
// Pure: turns a year comparison ("holidays 2024 vs 2025", "festival holidays 2025 vs 2026") into the structured
// data the screen draws as a card (src/components/HolidayCompareCard.tsx), instead of one long sentence.
// No database, no React: shared by the server (analytics.ts) and the screen (type only), and unit-tested on its own
// by compareView.selftest.ts.
//
// Totals count each real day ONCE (a day that is both a Festival and a Restricted holiday is one holiday, the same
// rule as the Holiday List); the per-type rows count every entry, so they can add up to more. The footnote says so
// whenever that happens.

import { diffInWords } from "@/lib/employees/compareSentence";

export type CompareDirection = "more" | "fewer" | "same";

export interface HolidayCompareYear {
  year: number;
  total: number;
  /** "this year" / "upcoming" / "" (a past year needs no caption). */
  caption: string;
}

export interface HolidayCompareRow {
  type: string;
  label: string;
  a: number;
  b: number;
  change: string;
  direction: CompareDirection;
}

export interface HolidayCompareView {
  title: string;
  /** What the big numbers count, e.g. "holidays" or "festival holidays". */
  unit: string;
  years: [HolidayCompareYear, HolidayCompareYear];
  /** The difference in words, e.g. "2 fewer in 2025" / "no change". */
  change: string;
  direction: CompareDirection;
  /** One row per type; only for an all-types comparison. */
  rows?: HolidayCompareRow[];
  footnote?: string;
}

export interface CompareInput {
  yearA: number;
  yearB: number;
  totalA: number;
  totalB: number;
  byType: { type: string; label: string; a: number; b: number }[];
  /** Set when only one type was asked for ("festival holidays 2025 vs 2026"). */
  type?: string | null;
  nowYear: number;
}

const direction = (a: number, b: number): CompareDirection => (b > a ? "more" : b < a ? "fewer" : "same");
const caption = (year: number, nowYear: number): string => (year === nowYear ? "this year" : year > nowYear ? "upcoming" : "");

export function buildHolidayCompareView(i: CompareInput): HolidayCompareView {
  const { yearA, yearB, nowYear } = i;

  if (i.type) {
    const row = i.byType.find((t) => t.type === i.type);
    if (row) {
      const unit = `${row.label.toLowerCase()} holidays`;
      return {
        title: `${row.label} holidays: ${yearA} vs ${yearB}`,
        unit,
        years: [
          { year: yearA, total: row.a, caption: caption(yearA, nowYear) },
          { year: yearB, total: row.b, caption: caption(yearB, nowYear) },
        ],
        change: diffInWords(row.a, row.b, yearB),
        direction: direction(row.a, row.b),
      };
    }
  }

  const entriesA = i.byType.reduce((s, t) => s + t.a, 0);
  const entriesB = i.byType.reduce((s, t) => s + t.b, 0);
  const view: HolidayCompareView = {
    title: `Holidays: ${yearA} vs ${yearB}`,
    unit: "holidays",
    years: [
      { year: yearA, total: i.totalA, caption: caption(yearA, nowYear) },
      { year: yearB, total: i.totalB, caption: caption(yearB, nowYear) },
    ],
    change: diffInWords(i.totalA, i.totalB, yearB),
    direction: direction(i.totalA, i.totalB),
    rows: i.byType.map((t) => ({
      type: t.type,
      label: t.label,
      a: t.a,
      b: t.b,
      change: diffInWords(t.a, t.b, yearB),
      direction: direction(t.a, t.b),
    })),
  };
  if (entriesA > i.totalA || entriesB > i.totalB) {
    view.footnote = `A day that is both a Festival and a Restricted holiday counts once in the totals, so the types add up to more (${entriesA} entries in ${yearA}, ${entriesB} in ${yearB}).`;
  }
  return view;
}
