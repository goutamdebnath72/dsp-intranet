// src/tools/steel/mosAnnual.ts
//
// THE YEARLY AND CUMULATIVE FIGURES of the steel card, kept by hand: they come from the Ministry of Steel's "An Overview of Steel Sector" (September 2026) and from Annexure I and III of its September 2026
// Monthly Economic Report, not from the ten monthly reports that scripts/steel/refresh-mos.py reads (those are in mos.ts, which that script rewrites). When a newer Overview or report comes out, copy its tables here.

/** India's steel, million tonnes, by financial year (Joint Plant Committee, in the Ministry's Overview of September 2026, Table 2); the last row is April to September 2026, provisional */
export interface IndiaYear { fy: string; crude: number; finished: number; consumption: number; partial?: boolean }
export const INDIA_ANNUAL: readonly IndiaYear[] = [
  { fy: "2021-22", crude: 120.29, finished: 113.6, consumption: 105.75 },
  { fy: "2022-23", crude: 127.2, finished: 123.2, consumption: 119.89 },
  { fy: "2023-24", crude: 144.3, finished: 139.15, consumption: 136.29 },
  { fy: "2024-25", crude: 152.18, finished: 146.69, consumption: 152.13 },
  { fy: "2025-26", crude: 170.15, finished: 162.47, consumption: 164.36 },
  { fy: "Apr-Sep 2026", crude: 85.11, finished: 81.79, consumption: 84.94, partial: true },
];
/** April to September of each year, million tonnes (Annexure I of the September 2026 report; 2026-27 provisional) */
export const INDIA_HALF: ReadonlyArray<{ fy: string; crude: number; finished: number; consumption: number }> = [
  { fy: "2023-24", crude: 70.23, finished: 67.42, consumption: 64.07 },
  { fy: "2024-25", crude: 73.23, finished: 70.72, consumption: 72.8 },
  { fy: "2025-26", crude: 82.69, finished: 78.85, consumption: 79.01 },
  { fy: "2026-27", crude: 85.11, finished: 81.79, consumption: 84.94 },
];
/** finished steel exports and imports, thousand tonnes, by financial year (Overview, Table 3); the last is April to September 2026, provisional */
export const INDIA_TRADE: ReadonlyArray<{ fy: string; exports: number; imports: number; partial?: boolean }> = [
  { fy: "2020-21", exports: 10784, imports: 4752 },
  { fy: "2021-22", exports: 13494, imports: 4669 },
  { fy: "2022-23", exports: 6716, imports: 6021 },
  { fy: "2023-24", exports: 7487, imports: 8320 },
  { fy: "2024-25", exports: 4858, imports: 9551 },
  { fy: "2025-26", exports: 6601, imports: 6524 },
  { fy: "Apr-Sep 2026", exports: 3548, imports: 4142, partial: true },
];
/** crude steel by country for a whole year, million tonnes (World Steel Association, in Annexure II of the September 2026 report; 2025 provisional) */
export const WSA_ANNUAL: ReadonlyArray<{ country: string; y2024: number; y2025: number }> = [
  { country: "China", y2024: 1005.09, y2025: 960.81 },
  { country: "India", y2024: 149.42, y2025: 164.89 },
  { country: "United States", y2024: 79.46, y2025: 81.94 },
  { country: "Japan", y2024: 84.01, y2025: 80.67 },
  { country: "Russia", y2024: 71.01, y2025: 67.9 },
  { country: "South Korea", y2024: 63.61, y2025: 62.23 },
  { country: "World", y2024: 1886.76, y2025: 1848.9 },
];
/** facts the Overview of September 2026 states in words */
export const INDIA_FACTS = {
  capacityMt: 220.4, capacityYear: "2025-26",
  perCapitaIndiaKg: 115.7, perCapitaYear: "2025-26", perCapitaWorldKg: 209, perCapitaChinaKg: 562.1,
} as const;

/** SAIL's cumulative figures for April to September as the September 2026 report states them (million tonnes, MT; the Ministry states them in lakh tonnes), this year against last: shown as the Ministry gives them, not added up from the months (which differ in the second decimal by revisions) */
export const SAIL_CUMULATIVE = {
  label: "April to September", year: "2026-27", prevYear: "2025-26", lastMonth: "2026-09",
  crude: { now: 9.605, prev: 9.505 }, saleable: { now: 9.403, prev: 9.567 }, sales: { now: 9.415, prev: 9.518 }, hotMetal: { now: 10.203, prev: 10.032 },
} as const;
