// src/lib/live/fare.ts
//
// THE FARE OF A TRAIN FROM DURGAPUR TO THE END OF ITS RUN, read from RailRadar's fare service (GET https://api.railradar.in/v1/trains/{number}/fare?source=DGR&destination=CODE&journeyDate=YYYY-MM-DD&classCode=XX), which
// relays the railway's own passenger reservation system ("source": "prs" in its reply). It needs the paid plan (the free plan is refused with PLAN_UPGRADE_REQUIRED). Checked on 14 Nov 2026 with about 35 calls:
//   * ONE CLASS PER CALL. The card asks for the eight reserved classes (CLASSES below) and a class that the train does not have is answered 404 "API:DATA_NOT_AVAILABLE": that class is simply left out.
//   * THE DATE MUST BE ONE ON WHICH THE TRAIN IS AT DURGAPUR (a train that runs on Sundays at Durgapur is refused for any other date), so the date is the first day from tomorrow on which the train, by its days AT DURGAPUR, runs.
//     Fares did not change between the dates tried (a week and five weeks ahead), so an answer is kept three days.
//   * NO UNRESERVED FARE and no fare for the local (MEMU) trains: the reservation system holds none (UR, II and the MEMU numbers are all refused). The card says so; no number is made up.
//   * The reply itemises the fare: baseFare, reservationCharge, superfastCharge, goodsServiceTax (GST), cateringCharge (Shatabdi, Vande Bharat, Rajdhani...), dynamicFare, tatkalFare, otherCharge, and totalFare. The
//     total is READ, never added up by us; it is only CHECKED against the parts (the total is the parts rounded: up to 4 rupees above their sum, as non-AC totals go up to the next 5 rupees; seen 0 to +4 on 14 Nov 2026) and an answer that does not add up, or that is not the train asked, is refused.
// The general quota (GN) and the full adult fare are what is asked: no concession, no Tatkal, no other quota. A fare is the railway's figure of the day, shown as approximate with that date.
import { DateTime } from "luxon";
import { UpstreamError } from "./http";
import { DAYS, STATION, type Day } from "./railway";
import { fareHint } from "./ordinaryFare";

export const FARE_BASE_URL = "https://api.railradar.in/v1/trains";
export const FARE_KEPT_S = 3 * 24 * 60 * 60;

export interface FareClass { code: string; name: string }
/** the reserved classes asked, from the cheapest to the dearest; the unreserved class is not among them (the source has none) */
export const CLASSES: FareClass[] = [
  { code: "2S", name: "Second sitting" },
  { code: "SL", name: "Sleeper" },
  { code: "CC", name: "Chair car" },
  { code: "EC", name: "Executive chair car" },
  { code: "3E", name: "AC 3 tier economy" },
  { code: "3A", name: "AC 3 tier" },
  { code: "2A", name: "AC 2 tier" },
  { code: "1A", name: "First class AC" },
];

export interface ClassFare {
  code: string;
  name: string;
  /** the fare in rupees (for an ESTIMATE from the fare table, the lowest of its range) */
  total: number;
  /** only for an estimate whose range crosses a fare step: the highest fare of the range */
  high?: number;
  /** "table": worked out from the railway's published fare table (a hint), not read from the reservation system */
  basis?: "table";
  /** the parts the railway itemises, only those above zero, in the order they are printed */
  parts: Array<{ label: string; amount: number }>;
}

export interface FareSet {
  train: string;
  trainName: string;
  from: string;
  to: string;
  /** the day the fares were asked for ("2026-11-22"): a day on which the train is at Durgapur */
  journeyDate: string;
  distanceKm: number;
  classes: ClassFare[];
}

const PART_LABELS: Array<[string, string]> = [
  ["baseFare", "Basic fare"],
  ["reservationCharge", "Reservation"],
  ["superfastCharge", "Superfast"],
  ["cateringCharge", "Catering"],
  ["dynamicFare", "Dynamic pricing"],
  ["tatkalFare", "Tatkal"],
  ["otherCharge", "Other"],
  ["goodsServiceTax", "GST"],
];

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);

/** the first day from tomorrow (Indian time) on which a train that is at Durgapur on `days` runs, as "YYYY-MM-DD" */
export function journeyDateFor(days: Day[], now: DateTime = DateTime.now()): string | null {
  const start = now.setZone(STATION.zone).startOf("day");
  for (let i = 1; i <= 8; i++) {
    const d = start.plus({ days: i });
    if (days.includes(DAYS[d.weekday - 1])) return d.toFormat("yyyy-MM-dd");
  }
  return null;
}

export type ClassReading = { kind: "fare"; fare: ClassFare; distance: number; name: string } | { kind: "absent" };

/** Reads one class's answer. A 404 means the train has no such class. Anything else that is not a clean fare of the train asked is an error, never a guess. */
export function parseClassFare(status: number, json: unknown, number: string, cls: FareClass): ClassReading {
  if (status === 404) return { kind: "absent" };
  const root = json as { success?: unknown; data?: { trainNumber?: unknown; trainName?: unknown; distance?: unknown; breakdown?: Record<string, unknown> } } | null;
  const d = root?.success === true ? root.data : undefined;
  if (!d || d.trainNumber !== number || typeof d.trainName !== "string" || !d.breakdown) throw new UpstreamError("RailRadar's fare answer is not the one asked for.");
  const distance = num(d.distance);
  const total = num(d.breakdown.totalFare);
  if (distance === null || distance <= 0 || total === null || total <= 0 || total > 100000) throw new UpstreamError("RailRadar's fare answer has no readable distance or total.");
  const parts: ClassFare["parts"] = [];
  let sum = 0;
  for (const [key, label] of PART_LABELS) {
    const v = num(d.breakdown[key]);
    if (v === null) { if (d.breakdown[key] === undefined) continue; throw new UpstreamError("RailRadar's fare answer has an unreadable part."); }
    sum += v;
    if (v > 0) parts.push({ label, amount: v });
  }
  // the total is the parts rounded: non-AC totals go UP to the next 5 rupees (255 for parts of 251), the others differ by a rupee or two (seen 14 Nov 2026: 0 to +4); anything outside -2..+5 is not a fare we understand
  const diff = total - sum;
  if (diff < -2 || diff > 5) throw new UpstreamError("The parts of RailRadar's fare do not add up to its total.");
  return { kind: "fare", fare: { code: cls.code, name: cls.name, total, parts }, distance, name: d.trainName };
}

export type Fetcher = (url: string) => Promise<{ status: number; json: unknown }>;

/**
 * The fares of one train from Durgapur to `to` for the day `journeyDate`: every class asked, the absent ones left out. All eight are asked together (the key's limit is 30 a minute). A rate refusal, a key refusal,
 * a failure of the service or a class whose answer is unreadable makes the whole thing an error (a half list would be mistaken for the train's real classes).
 */
/** one class of one train from Durgapur to `to`: the reading, or an error for a refusal (429, 401/403), a failure, or an unreadable answer */
export async function readClass(number: string, to: string, journeyDate: string, cls: FareClass, fetcher: Fetcher): Promise<ClassReading> {
  const url = `${FARE_BASE_URL}/${number}/fare?source=${STATION.code}&destination=${encodeURIComponent(to)}&journeyDate=${journeyDate}&classCode=${cls.code}`;
  const { status, json } = await fetcher(url);
  if (status === 429) throw new UpstreamError("RailRadar's limit for the plant's key has been reached (or the minute's: try again in a moment).", 429);
  if (status === 401 || status === 403) throw new UpstreamError("RailRadar did not accept the plant's key for fares (the plan must include them).", status);
  if (status !== 200 && status !== 404) throw new UpstreamError(`railradar.in answered ${status}`, status);
  return parseClassFare(status, json, number, cls);
}

export async function askFares(number: string, to: string, journeyDate: string, fetcher: Fetcher): Promise<FareSet> {
  const readings = await Promise.all(CLASSES.map(async (cls) => ({ cls, r: await readClass(number, to, journeyDate, cls, fetcher) })));
  const found = readings.flatMap(({ r }) => (r.kind === "fare" ? [r] : []));
  if (found.length > 0 && new Set(found.map((f) => f.distance)).size !== 1) throw new UpstreamError("RailRadar gave two different distances for one train.");
  return {
    train: number,
    trainName: found[0]?.name ?? "",
    from: STATION.code,
    to,
    journeyDate,
    distanceKm: found[0]?.distance ?? 0,
    classes: found.map((f) => f.fare),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// THE LOCAL (MEMU) TRAINS: A HINT, NOT A LOOKUP. The reservation system holds no fare for a train with unreserved seats only (its schedule says so: "category": "Local", "isPrsBookable": false), so the fare of a local
// train is WORKED OUT from the railway's own published ordinary-class fare table (src/lib/live/ordinaryFare.ts) for the distance from Durgapur to the end of the run. That distance is the difference of two cumulative
// distances in RailRadar's schedule of the train (GET /v1/trains/{number}?haltsOnly=true: each stop has "distance" from the start), one request per train. It is said to be an estimate, and a range when the distance's own
// uncertainty crosses a fare step. A train that reverses on the way (cumulative distance not a straight line) gets no hint.
export const LOCAL_CLASS: FareClass = { code: "UR", name: "Unreserved second class (ordinary)" };

/** a local train for which no hint can be made (it reverses on its way): not a failure of the source, and worth remembering, so that the next click does not ask again */
export class NoHintError extends UpstreamError {}

/** the distance from Durgapur to `to` along the train's own route, in km, from RailRadar's schedule of the train; refused when the schedule is not that train's, lacks a stop, runs the other way or reverses */
export function parseLocalDistance(json: unknown, number: string, to: string): number {
  const root = json as { success?: unknown; data?: { train?: { number?: unknown; isPrsBookable?: unknown; hasReversal?: unknown }; route?: unknown } } | null;
  const d = root?.success === true ? root.data : undefined;
  if (!d || d.train?.number !== number || !Array.isArray(d.route)) throw new UpstreamError("RailRadar's schedule is not the one asked for.");
  if (d.train.hasReversal === true) throw new NoHintError("This train reverses on its way: no distance is worked out.");
  const stops = d.route as Array<{ sequence?: unknown; station?: { code?: unknown }; distance?: unknown; isReversal?: unknown }>;
  if (stops.some((x) => x?.isReversal === true)) throw new NoHintError("This train reverses on its way: no distance is worked out.");
  const at = (code: string) => stops.find((x) => x?.station?.code === code);
  const a = at(STATION.code), b = at(to);
  const da = num(a?.distance), db = num(b?.distance), sa = num(a?.sequence), sb = num(b?.sequence);
  if (da === null || db === null || sa === null || sb === null) throw new UpstreamError("RailRadar's schedule lacks Durgapur or the end station.");
  if (sb <= sa || db <= da) throw new UpstreamError("The end station is not after Durgapur on this train's route.");
  return Math.round((db - da) * 10) / 10;
}

/** the hint for a local train: one class, "UR", an estimate from the table; the distance is the rounded km used */
export async function askLocalFare(number: string, to: string, fetcher: Fetcher, today: string): Promise<FareSet> {
  const { status, json } = await fetcher(`${FARE_BASE_URL}/${number}?haltsOnly=true`);
  if (status === 429) throw new UpstreamError("RailRadar's limit for the plant's key has been reached (or the minute's: try again in a moment).", 429);
  if (status === 401 || status === 403) throw new UpstreamError("RailRadar did not accept the plant's key.", status);
  if (status !== 200) throw new UpstreamError(`railradar.in answered ${status}`, status);
  const name = ((json as { data?: { train?: { name?: unknown } } } | null)?.data?.train?.name);
  let km: number;
  try {
    km = parseLocalDistance(json, number, to);
  } catch (e) {
    // a train that reverses has no straight distance: an empty answer (saved, so that it is not asked again), not an error
    if (e instanceof NoHintError) return { train: number, trainName: typeof name === "string" ? name : "", from: STATION.code, to, journeyDate: today, distanceKm: 0, classes: [] };
    throw e;
  }
  const hint = fareHint(km);
  const base = { train: number, trainName: typeof name === "string" ? name : "", from: STATION.code, to, journeyDate: today, distanceKm: km };
  if (!hint) return { ...base, classes: [] };
  const cls: ClassFare = {
    ...LOCAL_CLASS,
    total: hint.low,
    ...(hint.high > hint.low ? { high: hint.high } : {}),
    basis: "table",
    parts: hint.slabs.map((sl) => ({ label: `Fare table, ${sl.from}\u2013${sl.to} km`, amount: sl.fare })),
  };
  return { ...base, classes: [cls] };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// THE FARE TO EVERY STOP AFTER DURGAPUR (the "legs"). The plant pays for the fare service for one month, so for each train the fares are collected not only to the end of its run but to EVERY stop after Durgapur: for each
// class the train has (the classes found for its end station), one request per stop. A class the train does not sell between Durgapur and a stop is simply absent there; a stop for which no class answers has no leg.
// For a local (MEMU) train the same stops get the table HINT (no request: the distances are in the schedule already read), up to the first reversal on its route (beyond it the cumulative distance is not a line).
export interface LegFare {
  /** the stop's station code and the name RailRadar gives it */
  to: string;
  name: string;
  /** its place in the train's route (grows along the run) */
  seq: number;
  /** from Durgapur, as the railway gives it (the fare service) or as worked out for a hint */
  distanceKm: number;
  journeyDate: string;
  classes: ClassFare[];
}

export interface ScheduleStop { code: string; name: string; seq: number; km: number }
export interface Schedule {
  trainName: string;
  /** Durgapur's distance from the start of the train's run */
  durgapurKm: number;
  /** the halts after Durgapur, in order, each with its distance from Durgapur (km along the route); cut after the first reversal (that stop is kept) */
  stops: ScheduleStop[];
  /** the train reverses on its way after Durgapur: the stops are those up to it */
  reverses: boolean;
}

/** the halts after Durgapur from RailRadar's schedule of a train (GET /v1/trains/{number}?haltsOnly=true) */
export function parseSchedule(json: unknown, number: string): Schedule {
  const root = json as { success?: unknown; data?: { train?: { number?: unknown; name?: unknown }; route?: unknown } } | null;
  const d = root?.success === true ? root.data : undefined;
  if (!d || d.train?.number !== number || !Array.isArray(d.route)) throw new UpstreamError("RailRadar's schedule is not the one asked for.");
  const route = d.route as Array<{ sequence?: unknown; station?: { code?: unknown; name?: unknown }; distance?: unknown; isReversal?: unknown }>;
  const at = route.find((x) => x?.station?.code === STATION.code);
  const dk = num(at?.distance), ds = num(at?.sequence);
  if (!at || dk === null || ds === null) throw new UpstreamError("RailRadar's schedule has no Durgapur.");
  const stops: ScheduleStop[] = [];
  let reverses = false;
  let prev = dk;
  for (const x of route) {
    const seq = num(x?.sequence), km = num(x?.distance), code = x?.station?.code, name = x?.station?.name;
    if (seq === null || seq <= ds) continue;
    if (km === null || typeof code !== "string" || typeof name !== "string") throw new UpstreamError("RailRadar's schedule has an unreadable stop.");
    if (km <= prev && !x.isReversal) break;
    stops.push({ code, name, seq, km: Math.round((km - dk) * 10) / 10 });
    prev = km;
    if (x.isReversal === true) { reverses = true; break; }
  }
  return { trainName: typeof d.train.name === "string" ? d.train.name : "", durgapurKm: dk, stops, reverses };
}

/** the fares of the classes `classes` from Durgapur to one stop, asked one after the other; null when no class answers (the train does not run, or sell, between them) */
export async function askLeg(number: string, stop: ScheduleStop, classes: FareClass[], date: string, fetcher: Fetcher): Promise<LegFare | null> {
  const found: Array<{ fare: ClassFare; distance: number }> = [];
  for (const cls of classes) {
    const r = await readClass(number, stop.code, date, cls, fetcher);
    if (r.kind === "fare") found.push({ fare: r.fare, distance: r.distance });
  }
  if (found.length === 0) return null;
  if (new Set(found.map((f) => f.distance)).size !== 1) throw new UpstreamError("RailRadar gave two different distances for one stop.");
  return { to: stop.code, name: stop.name, seq: stop.seq, distanceKm: found[0].distance, journeyDate: date, classes: found.map((f) => f.fare) };
}

/** the hints for a local train's stops after Durgapur (no request): one leg per stop that the table covers */
export function localLegs(schedule: Schedule, today: string): LegFare[] {
  const legs: LegFare[] = [];
  for (const st of schedule.stops) {
    const hint = fareHint(st.km);
    if (!hint) continue;
    legs.push({ to: st.code, name: st.name, seq: st.seq, distanceKm: st.km, journeyDate: today, classes: [{ ...LOCAL_CLASS, total: hint.low, ...(hint.high > hint.low ? { high: hint.high } : {}), basis: "table", parts: hint.slabs.map((sl) => ({ label: `Fare table, ${sl.from}\u2013${sl.to} km`, amount: sl.fare })) }] });
  }
  return legs;
}
