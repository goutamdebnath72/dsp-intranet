// src/lib/live/ordinaryFare.ts
//
// THE RAILWAY'S OWN FARE TABLE FOR UNRESERVED SECOND-CLASS TRAVEL on ordinary (passenger) services, used to give a HINT of the fare on a local (MEMU) train, for which the reservation system holds no fare.
// SOURCE: Railway Board, Commercial Circular No. 24 of 2025 (No. TC II/2910/2025/Fare, 25 Dec 2025, "Rationalization of basic fare for passenger train services w.e.f. 26.12.2025"), its annexed Passenger Fare Table
// "Basic fare of ORDINARY SERVICES w.e.f. 26.12.2025": the columns NON-SUBURBAN, SECOND CLASS, "Basic Fare" and "Minimum Chargeable fare", for each slab of distance. The circular was read as a scanned copy
// (https://www.staffnews.in/wp-content/uploads/2026/01/CC_24_2025-Revised-Rail-Fare-26-12-2025.pdf, 14 Nov 2026), page 5 and 6 of the annex, and typed in below. Eastern Railway's Durgapur sections are not the Kolkata
// SUBURBAN system, so the non-suburban column is used. The circular says: no change for suburban fares and season tickets; rounding "as per existing principles"; GST "as applicable" (none is added to an ordinary ticket here).
// THE TICKET PRICE is the "minimum chargeable fare" column: in every row it is the basic fare rounded UP to a multiple of Rs 5, and not less than Rs 10 (the lowest ticket), which is how ordinary tickets are priced (Rs 10, 15, 20...).
// The test checks that rule on all 80 rows, so a misreading of the scan in either column shows. The table is valid from 26 Dec 2025 until the railway revises it again (ORDINARY_TABLE_EFFECTIVE): a later revision is not known here.
// The table stops at 500 km (a local train does not run farther); beyond it there is no hint. Written as [last km of the slab, basic fare, minimum chargeable fare]; slabs are 5 km wide to 300 km, then 10 km.
export const ORDINARY_TABLE_EFFECTIVE = "2025-12-26";
export const ORDINARY_TABLE_MAX_KM = 500;
export const ORDINARY_SOURCE = { name: "Railway Board Commercial Circular No. 24 of 2025 (fare table of 26 Dec 2025)", url: "https://www.staffnews.in/2026/01/rationalization-of-basic-fare-for-passenger-train-services.html" };

// [last km, basic, minimum chargeable]
const ROWS: Array<[number, number, number]> = [
  [5, 3, 10], [10, 3, 10], [15, 3, 10], [20, 6, 10], [25, 7, 10], [30, 7, 10], [35, 8, 10], [40, 9, 10], [45, 10, 10],
  [50, 14, 15], [55, 15, 15], [60, 16, 20], [65, 16, 20], [70, 17, 20], [75, 19, 20], [80, 20, 20],
  [85, 22, 25], [90, 23, 25], [95, 23, 25], [100, 24, 25], [105, 25, 25], [110, 25, 25],
  [115, 26, 30], [120, 28, 30], [125, 28, 30], [130, 30, 30], [135, 30, 30],
  [140, 31, 35], [145, 32, 35], [150, 34, 35], [155, 35, 35], [160, 35, 35],
  [165, 36, 40], [170, 37, 40], [175, 37, 40], [180, 38, 40], [185, 40, 40],
  [190, 41, 45], [195, 43, 45], [200, 43, 45], [205, 44, 45], [210, 44, 45], [215, 45, 45],
  [220, 51, 55], [225, 51, 55], [230, 51, 55], [235, 51, 55], [240, 52, 55],
  [245, 53, 55], [250, 56, 60], [255, 56, 60], [260, 56, 60], [265, 58, 60], [270, 58, 60],
  [275, 61, 65], [280, 61, 65], [285, 61, 65], [290, 61, 65], [295, 62, 65], [300, 62, 65],
  [310, 66, 70], [320, 66, 70], [330, 67, 70], [340, 71, 75], [350, 76, 80], [360, 76, 80], [370, 77, 80], [380, 78, 80],
  [390, 81, 85], [400, 81, 85], [410, 81, 85], [420, 83, 85], [430, 84, 85], [440, 86, 90], [450, 89, 90], [460, 90, 90],
  [470, 91, 95], [480, 92, 95], [490, 94, 95], [500, 96, 100],
];

export interface Slab { from: number; to: number; basic: number; fare: number }
export const SLABS: Slab[] = ROWS.map(([to, basic, fare], i) => ({ from: i === 0 ? 1 : ROWS[i - 1][0] + 1, to, basic, fare }));

/** the slab of a whole number of kilometres (1 to 500), or null outside the table */
export function slabOf(km: number): Slab | null {
  if (!Number.isInteger(km) || km < 1 || km > ORDINARY_TABLE_MAX_KM) return null;
  return SLABS.find((s) => km <= s.to) ?? null;
}

export interface FareHint {
  /** the distance used, in whole km (the source's distance, rounded) */
  km: number;
  /** the lowest and highest fare over the uncertainty of the distance; equal when no fare step lies within it */
  low: number;
  high: number;
  /** the table slabs the range touches (one, or two or more when the range crosses a step) */
  slabs: Slab[];
  /** the km either way the distance may be out by */
  tolerance: number;
}

/**
 * THE HINT for a distance in km as RailRadar gives it. RailRadar's cumulative distances differ from the railway's own tariff distances by a little (0.4 to 6.5 km on the four trains checked on 14 Nov 2026), so the
 * fare is worked out for the distance and for the distance less and more than a TOLERANCE (2 km, or 1% of the distance if more): if the fares differ, both are given (a range), never a single figure that may be a step out.
 * Null when the distance is not a usable number or the range passes the end of the table (500 km).
 */
export function fareHint(distanceKm: number): FareHint | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const tolerance = Math.max(2, Math.ceil(distanceKm * 0.01));
  const km = Math.round(distanceKm);
  const a = Math.max(1, Math.round(distanceKm - tolerance)), b = Math.round(distanceKm + tolerance);
  if (b > ORDINARY_TABLE_MAX_KM) return null;
  const slabs: Slab[] = [];
  for (let k = a; k <= b; k++) { const s = slabOf(k); if (s && !slabs.includes(s)) slabs.push(s); }
  if (slabs.length === 0) return null;
  const fares = slabs.map((s) => s.fare);
  return { km, low: Math.min(...fares), high: Math.max(...fares), slabs, tolerance };
}
