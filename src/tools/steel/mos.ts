// src/tools/steel/mos.ts
//
// THE OFFICIAL FIGURES OF THE STEEL CARD: everything here is copied from the Ministry of Steel's "Monthly Economic Report" (one PDF a month, https://steel.gov.in/monthly-summary) and its "An Overview of Steel
// Sector" (September 2026). I fetch nothing while the card is open: this is a reviewed file with its sources. Generated from the ten reports of December 2025 to September 2026 and checked:
//   * RETAIL: the month-end retail prices in Mumbai (Rs per tonne, GST included) that each report states in words (TMT 10 mm, HR coil 2.50 mm, CR coil 0.63 mm). The month-on-month changes the reports state agree with the
//     figures for every month except July 2026 hot-rolled coil (the July report says -0.3%; its own figures, and the August report's +0.6%, give +1.2%: I keep the figure 68,990, and the slip is in the report's percentage).
//   * IRON_ORE: NMDC lump ore price (Rs per tonne) as the reports say it; the April 2026 report does not say it in words, so April is empty.
//   * CPSE: SAIL, RINL and NMDC Steel (NSL), in million tonnes (MT; the Ministry's table is in lakh tonnes and the script divides by 10), month by month: each report gives its month, the month before and the same month a year earlier. Where a month
//     appears in two reports I keep the NEWER report's figure (it is the revised one); the differences are in the second decimal.
//   * WSA: crude steel production by country (million tonnes) from the World Steel Association's figures as the reports quote them (a month behind the report); I keep the newest report's figure.
//   * ANNUAL: the Joint Plant Committee's figures in the Overview and in Annexure I of the September 2026 report.
// The reports are provisional ("P") and are revised: the card says so. Important: this file is written by scripts/steel/refresh-mos.py, so do not edit it by hand.

export interface Report { month: string; url: string }
export const MOS_REPORTS: Report[] = [
  { month: "2025-12", url: "https://steel.gov.in/sites/default/files/2026-03/Monthly%20Ecomnomic%20Report%20for%20the%20month%20of%20Dec%202025.pdf" },
  { month: "2026-01", url: "https://steel.gov.in/sites/default/files/2026-03/Monthly%20Economic%20Report-%20January%202026%20%286%29.pdf" },
  { month: "2026-02", url: "https://steel.gov.in/sites/default/files/2026-03/Monthly%20Economic%20Report%20for%20the%20month%20of%20February%202026.pdf" },
  { month: "2026-03", url: "https://steel.gov.in/sites/default/files/2026-04/Monthly%20Economic%20Report-%20March%202026%20%285%29.pdf" },
  { month: "2026-04", url: "https://steel.gov.in/sites/default/files/2026-05/Monthly%20Economic%20Report%20for%20the%20month%20of%20April%2C%202026.pdf" },
  { month: "2026-05", url: "https://steel.gov.in/sites/default/files/2026-06/Monthly%20Economic%20Report%20for%20the%20month%20of%20May%2C%202026.pdf" },
  { month: "2026-06", url: "https://steel.gov.in/sites/default/files/2026-07/Monthly%20Economic%20Report-%20June%202026%20%281%29.pdf" },
  { month: "2026-07", url: "https://steel.gov.in/sites/default/files/2026-10/Monthly%20Economic%20Report%20July%2C%202026.pdf" },
  { month: "2026-08", url: "https://steel.gov.in/sites/default/files/2026-10/Monthly%20Economic%20Report-%20August%202026.pdf" },
  { month: "2026-09", url: "https://steel.gov.in/sites/default/files/2026-10/Monthly%20Economic%20Report-%20September%202026%20V1.pdf" },
];
export const MOS_SITE = "https://steel.gov.in/monthly-summary";
export const MOS_OVERVIEW = "https://steel.gov.in/overview-steel-sector";

/** I store the month-end retail prices in Mumbai, Rs per tonne including GST: TMT 10 mm, HR coil 2.50 mm, CR coil 0.63 mm */
export interface RetailPoint { month: string; tmt: number; hrc: number; crc: number }
export const RETAIL: readonly RetailPoint[] = [
  { month: "2025-12", tmt: 52700, hrc: 54760, crc: 64970 },
  { month: "2026-01", tmt: 61240, hrc: 62350, crc: 69750 },
  { month: "2026-02", tmt: 63950, hrc: 64500, crc: 71720 },
  { month: "2026-03", tmt: 64750, hrc: 66940, crc: 75960 },
  { month: "2026-04", tmt: 65890, hrc: 71990, crc: 80100 },
  { month: "2026-05", tmt: 62140, hrc: 68990, crc: 78120 },
  { month: "2026-06", tmt: 57950, hrc: 68170, crc: 78020 },
  { month: "2026-07", tmt: 54790, hrc: 68990, crc: 78740 },
  { month: "2026-08", tmt: 56920, hrc: 69410, crc: 78680 },
  { month: "2026-09", tmt: 65750, hrc: 76900, crc: 89670 },
];

/** NMDC lump iron ore (Chhattisgarh, 6-40 mm, Fe 65.5%), Rs per tonne; I leave it null where the report does not say it in words */
export const IRON_ORE: ReadonlyArray<{ month: string; lumps: number | null }> = [
  { month: "2025-12", lumps: 5500 },
  { month: "2026-01", lumps: 4600 },
  { month: "2026-02", lumps: 4700 },
  { month: "2026-03", lumps: 4800 },
  { month: "2026-04", lumps: null },
  { month: "2026-05", lumps: 5500 },
  { month: "2026-06", lumps: 5700 },
  { month: "2026-07", lumps: 5450 },
  { month: "2026-08", lumps: 5250 },
  { month: "2026-09", lumps: 5400 },
];

/** I keep the steel CPSEs in million tonnes (MT), month by month */
export interface CpseMonth { month: string; crude: number | null; saleable: number | null; sales: number | null; hotMetal: number | null }
export const SAIL_MONTHLY: readonly CpseMonth[] = [
  { month: "2024-12", crude: 1.691, saleable: 1.557, sales: 1.544, hotMetal: 1.764 },
  { month: "2025-01", crude: 1.749, saleable: 1.604, sales: 1.677, hotMetal: 1.821 },
  { month: "2025-02", crude: 1.563, saleable: 1.44, sales: 1.623, hotMetal: 1.636 },
  { month: "2025-03", crude: 1.779, saleable: 1.678, sales: 2.087, hotMetal: 1.872 },
  { month: "2025-04", crude: 1.531, saleable: 1.543, sales: 1.502, hotMetal: 1.611 },
  { month: "2025-05", crude: 1.709, saleable: 1.594, sales: 1.571, hotMetal: 1.81 },
  { month: "2025-06", crude: 1.614, saleable: 1.575, sales: 1.51, hotMetal: 1.707 },
  { month: "2025-07", crude: 1.592, saleable: 1.611, sales: 1.646, hotMetal: 1.661 },
  { month: "2025-08", crude: 1.555, saleable: 1.667, sales: 1.654, hotMetal: 1.637 },
  { month: "2025-09", crude: 1.505, saleable: 1.578, sales: 1.632, hotMetal: 1.605 },
  { month: "2025-11", crude: 1.601, saleable: 1.517, sales: 1.65, hotMetal: 1.681 },
  { month: "2025-12", crude: 1.675, saleable: 1.602, sales: 2.04, hotMetal: 1.762 },
  { month: "2026-01", crude: 1.719, saleable: 1.668, sales: 1.844, hotMetal: 1.806 },
  { month: "2026-02", crude: 1.549, saleable: 1.536, sales: 1.581, hotMetal: 1.632 },
  { month: "2026-03", crude: 1.815, saleable: 1.732, sales: 1.91, hotMetal: 1.903 },
  { month: "2026-04", crude: 1.615, saleable: 1.554, sales: 1.362, hotMetal: 1.706 },
  { month: "2026-05", crude: 1.476, saleable: 1.377, sales: 1.252, hotMetal: 1.58 },
  { month: "2026-06", crude: 1.666, saleable: 1.584, sales: 1.523, hotMetal: 1.765 },
  { month: "2026-07", crude: 1.673, saleable: 1.704, sales: 1.71, hotMetal: 1.777 },
  { month: "2026-08", crude: 1.684, saleable: 1.692, sales: 1.871, hotMetal: 1.781 },
  { month: "2026-09", crude: 1.492, saleable: 1.491, sales: 1.693, hotMetal: 1.594 },
];
/** RINL: crude steel and saleable steel */
export const RINL_MONTHLY: ReadonlyArray<{ month: string; crude: number | null; second: number | null }> = [
  { month: "2024-12", crude: 0.389, second: 0.366 },
  { month: "2025-01", crude: 0.386, second: 0.364 },
  { month: "2025-02", crude: 0.351, second: 0.349 },
  { month: "2025-03", crude: 0.393, second: 0.372 },
  { month: "2025-04", crude: 0.386, second: 0.368 },
  { month: "2025-05", crude: 0.392, second: 0.339 },
  { month: "2025-06", crude: 0.393, second: 0.377 },
  { month: "2025-07", crude: 0.455, second: 0.409 },
  { month: "2025-08", crude: 0.455, second: 0.39 },
  { month: "2025-09", crude: 0.439, second: 0.387 },
  { month: "2025-11", crude: 0.424, second: 0.323 },
  { month: "2025-12", crude: 0.539, second: 0.375 },
  { month: "2026-01", crude: 0.538, second: 0.482 },
  { month: "2026-02", crude: 0.439, second: 0.356 },
  { month: "2026-03", crude: 0.518, second: 0.367 },
  { month: "2026-04", crude: 0.455, second: 0.328 },
  { month: "2026-05", crude: 0.427, second: 0.295 },
  { month: "2026-06", crude: 0.347, second: 0.301 },
  { month: "2026-07", crude: 0.368, second: 0.353 },
  { month: "2026-08", crude: 0.351, second: 0.337 },
  { month: "2026-09", crude: 0.338, second: 0.325 },
];
/** NMDC Steel (NSL): crude steel and hot-rolled coil */
export const NSL_MONTHLY: ReadonlyArray<{ month: string; crude: number | null; second: number | null }> = [
  { month: "2024-12", crude: 0.15, second: 0.147 },
  { month: "2025-01", crude: 0.148, second: 0.144 },
  { month: "2025-02", crude: 0.129, second: 0.126 },
  { month: "2025-03", crude: 0.176, second: 0.173 },
  { month: "2025-04", crude: 0.189, second: 0.185 },
  { month: "2025-05", crude: 0.198, second: 0.192 },
  { month: "2025-06", crude: 0.199, second: 0.194 },
  { month: "2025-07", crude: 0.145, second: 0.142 },
  { month: "2025-08", crude: 0.205, second: 0.2 },
  { month: "2025-09", crude: 0.195, second: 0.19 },
  { month: "2025-11", crude: 0.209, second: 0.203 },
  { month: "2025-12", crude: 0.193, second: 0.189 },
  { month: "2026-01", crude: 0.216, second: 0.211 },
  { month: "2026-02", crude: 0.19, second: 0.187 },
  { month: "2026-03", crude: 0.249, second: 0.244 },
  { month: "2026-04", crude: 0.215, second: 0.211 },
  { month: "2026-05", crude: 0.218, second: 0.213 },
  { month: "2026-06", crude: 0.195, second: 0.191 },
  { month: "2026-07", crude: 0.236, second: 0.231 },
  { month: "2026-08", crude: 0.198, second: 0.194 },
  { month: "2026-09", crude: 0.234, second: 0.229 },
];

/** Crude steel production by country in million tonnes, month by month, from the World Steel Association */
export const WSA_MONTHLY: Readonly<Record<string, ReadonlyArray<readonly [month: string, mt: number]>>> = {
  "China": [["2024-11", 78.42], ["2024-12", 76.01], ["2025-01", 87.38], ["2025-02", 78.94], ["2025-03", 92.89], ["2025-04", 86.04], ["2025-05", 86.7], ["2025-06", 83.34], ["2025-07", 79.8], ["2025-08", 77.48], ["2025-10", 72.0], ["2025-11", 69.87], ["2025-12", 68.18], ["2026-01", 84.25], ["2026-02", 76.09], ["2026-03", 87.04], ["2026-04", 83.63], ["2026-05", 84.36], ["2026-06", 83.67], ["2026-07", 76.93], ["2026-08", 74.61]],
  "India": [["2024-11", 12.38], ["2024-12", 13.43], ["2025-01", 13.71], ["2025-02", 12.63], ["2025-03", 14.0], ["2025-04", 13.31], ["2025-05", 13.82], ["2025-06", 13.54], ["2025-07", 14.08], ["2025-08", 14.12], ["2025-10", 13.95], ["2025-11", 13.76], ["2025-12", 14.88], ["2026-01", 15.29], ["2026-02", 14.07], ["2026-03", 15.49], ["2026-04", 13.92], ["2026-05", 14.02], ["2026-06", 13.92], ["2026-07", 14.37], ["2026-08", 14.77]],
  "United States": [["2024-11", 6.27], ["2024-12", 6.69], ["2025-01", 6.83], ["2025-02", 6.19], ["2025-03", 6.84], ["2025-04", 6.55], ["2025-05", 6.91], ["2025-06", 6.97], ["2025-07", 7.12], ["2025-08", 7.09], ["2025-10", 6.92], ["2025-11", 6.72], ["2025-12", 6.91], ["2026-01", 7.11], ["2026-02", 6.68], ["2026-03", 7.19], ["2026-04", 7.04], ["2026-05", 7.57], ["2026-06", 7.22], ["2026-07", 7.39], ["2026-08", 7.3]],
  "Japan": [["2024-11", 6.89], ["2024-12", 6.91], ["2025-01", 6.79], ["2025-02", 6.4], ["2025-03", 7.21], ["2025-04", 6.6], ["2025-05", 6.84], ["2025-06", 6.71], ["2025-07", 6.92], ["2025-08", 6.63], ["2025-10", 6.85], ["2025-11", 6.78], ["2025-12", 6.57], ["2026-01", 6.75], ["2026-02", 6.39], ["2026-03", 6.91], ["2026-04", 6.61], ["2026-05", 6.94], ["2026-06", 6.79], ["2026-07", 6.93], ["2026-08", 6.66]],
  "Russia": [["2024-11", 5.56], ["2024-12", 6.01], ["2025-01", 5.36], ["2025-02", 5.6], ["2025-03", 5.34], ["2025-04", 5.0], ["2025-05", 5.92], ["2025-06", 5.78], ["2025-07", 5.37], ["2025-08", 5.52], ["2025-10", 5.3], ["2025-11", 5.49], ["2025-12", 5.26], ["2026-01", 5.48], ["2026-02", 4.78], ["2026-03", 5.42], ["2026-04", 5.22], ["2026-05", 5.76], ["2026-06", 5.29], ["2026-07", 5.85], ["2026-08", 5.5]],
  "South Korea": [["2024-11", 5.21], ["2024-12", 5.36], ["2025-01", 5.94], ["2025-02", 4.81], ["2025-03", 6.11], ["2025-04", 5.73], ["2025-05", 5.21], ["2025-06", 5.33], ["2025-07", 5.52], ["2025-08", 5.22], ["2025-10", 5.09], ["2025-11", 5.04], ["2025-12", 5.78], ["2026-01", 5.61], ["2026-02", 4.88], ["2026-03", 5.19], ["2026-04", 5.25], ["2026-05", 5.38], ["2026-06", 5.88], ["2026-07", 5.71], ["2026-08", 5.35]],
  "World": [["2024-11", 146.92], ["2024-12", 144.99], ["2025-01", 157.6], ["2025-02", 144.98], ["2025-03", 166.97], ["2025-04", 156.45], ["2025-05", 158.43], ["2025-06", 153.12], ["2025-07", 149.74], ["2025-08", 145.94], ["2025-10", 143.84], ["2025-11", 140.6], ["2025-12", 139.54], ["2026-01", 156.4], ["2026-02", 142.47], ["2026-03", 160.63], ["2026-04", 154.34], ["2026-05", 158.06], ["2026-06", 155.75], ["2026-07", 148.83], ["2026-08", 144.22]],
};
