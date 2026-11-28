// src/lib/live/kolkataSet.ts
//
// THE THIRD SET OF TRAINS OF THE PAID RAILRADAR MONTH: THE TRAINS THAT START AT HOWRAH, SEALDAH, SANTRAGACHI OR KOLKATA AND GO OVER NEITHER DURGAPUR NOR ASANSOL.
// The first two sets are in the database already (trains that stop at Durgapur or pass it without stopping; trains that go over Asansol but not Durgapur). The owner asked for the rest of the trains of the Kolkata terminals,
// "mutually exclusive": a train that touches two of the four stations is taken once, from its STARTING station. What I take, in the owner's words made exact:
//   * A train is IN the set when (1) it STARTS at one of the four (HWH Howrah Jn, SDAH Sealdah, SRC Santragachi Jn, KOAA Kolkata) and (2) its route does not go over Durgapur (DGR) or Asansol (ASN), whether it stops there or not.
//   * It is taken ONCE, whichever boards it is on, under its starting station (a Howrah train that stops at Santragachi is on both boards and counts as a Howrah train).
//   * A train that merely ENDS at one of the four, or passes it, starts elsewhere and is not "from" these stations: it is not in the set (its fare would be from another station).
// HOW I KNOW WHAT GOES OVER DURGAPUR AND ASANSOL, two ways that must agree: (a) the station boards of Durgapur and Asansol with includeIntermediate=true, which list the halts AND the pass-throughs; (b) the train's own full route
// (GET /v1/trains/{n}, every station it goes through, halts or not), read for every train of the set before anything is asked for its fares. A train that is on either board, or whose route has DGR or ASN, is OUT, with its reason kept.
// This file holds the pure rules (no request, no database), so that they can be tested on the real answers of 28 Nov 2026.
import { CLASSES } from "./fare";
import { UpstreamError } from "./http";

export const TERMINALS = [
  { code: "HWH", name: "Howrah Jn" },
  { code: "SDAH", name: "Sealdah" },
  { code: "SRC", name: "Santragachi Jn" },
  { code: "KOAA", name: "Kolkata" },
] as const;
export type TerminalCode = (typeof TERMINALS)[number]["code"];
export const TERMINAL_CODES: string[] = TERMINALS.map((t) => t.code);
/** The two stations whose trains the owner already has: a train that goes over either is not in this set. */
export const EXCLUDED_STATIONS = ["DGR", "ASN"] as const;

export const boardUrl = (code: string): string => `https://api.railradar.in/v1/stations/${encodeURIComponent(code)}/trains?includeIntermediate=true`;
export const trainUrl = (number: string): string => `https://api.railradar.in/v1/trains/${encodeURIComponent(number)}?haltsOnly=false`;

export interface BoardRow {
  number: string;
  name: string;
  type: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  runDays: string[];
  /** "origin", "halt", "destination" or "pass-through" at the board's station */
  stopType: string;
}

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** Reads a station board (GET /v1/stations/CODE/trains?includeIntermediate=true). Anything that is not that shape is an error: a half-read board would put wrong trains in or out of the set. */
export function parseBoard(json: unknown, code: string, minTrains = 10): BoardRow[] {
  const root = json as { success?: unknown; data?: { station?: { code?: unknown }; trains?: unknown } } | null;
  const trains = root?.success === true ? root.data?.trains : undefined;
  if (!Array.isArray(trains)) throw new UpstreamError(`RailRadar's board of ${code} is not the answer expected.`);
  const rows: BoardRow[] = [];
  for (const t of trains as Array<{ train?: Record<string, any>; stop?: Record<string, any> }>) {
    const tr = t?.train;
    const number = str(tr?.number);
    if (!/^\d{5}$/.test(number)) continue;
    rows.push({ number, name: str(tr?.name), type: str(tr?.type), from: str(tr?.source?.code), fromName: str(tr?.source?.name), to: str(tr?.destination?.code), toName: str(tr?.destination?.name), runDays: Array.isArray(tr?.runDays) ? (tr?.runDays as unknown[]).map(String) : [], stopType: str(t?.stop?.stopType) });
  }
  if (rows.length < minTrains) throw new UpstreamError(`RailRadar's board of ${code} holds only ${rows.length} trains: not believed.`);
  return rows;
}

export interface Candidate extends BoardRow {
  /** Which of the four stations' boards the train is on (it is taken once, under `from`) */
  touches: string[];
}
export interface Rejected { number: string; name: string; from: string; reason: string }

/**
 * THE SET BEFORE THE ROUTE CHECK. `boards` are the four terminals' boards, `passing` the boards of Durgapur and Asansol (with the pass-throughs). Each train that STARTS at one of the four is taken once; those on a Durgapur or
 * Asansol board are out with the reason. A train that is not for passengers (a parcel express) is out too.
 */
export function selectCandidates(boards: Record<string, BoardRow[]>, passing: Record<string, BoardRow[]>): { candidates: Candidate[]; rejected: Rejected[] } {
  const onPassing = new Map<string, string>();
  for (const [code, rows] of Object.entries(passing)) for (const r of rows) if (!onPassing.has(r.number)) onPassing.set(r.number, code);
  const seen = new Map<string, Candidate>();
  for (const code of TERMINAL_CODES) {
    for (const r of boards[code] ?? []) {
      const had = seen.get(r.number);
      if (had) { if (!had.touches.includes(code)) had.touches.push(code); continue; }
      seen.set(r.number, { ...r, touches: [code] });
    }
  }
  const candidates: Candidate[] = [];
  const rejected: Rejected[] = [];
  for (const c of [...seen.values()].sort((a, b) => a.number.localeCompare(b.number))) {
    // a train that starts elsewhere is not "from" these stations
    if (!TERMINAL_CODES.includes(c.from)) continue;
    const on = onPassing.get(c.number);
    if (on) { rejected.push({ number: c.number, name: c.name, from: c.from, reason: `on the board of ${on === "DGR" ? "Durgapur" : "Asansol"} (${on})` }); continue; }
    if (/parcel|goods/i.test(c.type)) { rejected.push({ number: c.number, name: c.name, from: c.from, reason: `not a passenger train (${c.type})` }); continue; }
    candidates.push(c);
  }
  return { candidates, rejected };
}

export interface HaltRow {
  seq: number;
  code: string;
  name: string;
  /** km from the starting station */
  km: number;
  arrival: string | null;
  arrivalDay: number | null;
  departure: string | null;
  departureDay: number | null;
}

export interface TrainFull {
  number: string;
  name: string;
  type: string;
  category: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  runDays: string[];
  distanceKm: number;
  durationMin: number | null;
  totalHalts: number | null;
  returnTrain: string | null;
  /** the classes the train has, as RailRadar lists them ("availableClasses") */
  classes: string[];
  prsBookable: boolean;
  hasReversal: boolean;
  halts: HaltRow[];
  /** every station code on the route, halts and the rest, in order (to prove it does not go over DGR or ASN) */
  route: string[];
}

const nn = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const sn = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** Reads a train's full record (GET /v1/trains/{n}?haltsOnly=false): its details, its halts with times, and every station of its route. It must be the train asked for, with a start station and a route. */
export function parseTrainFull(json: unknown, number: string): TrainFull {
  const root = json as { success?: unknown; data?: { train?: Record<string, any>; route?: unknown } } | null;
  const d = root?.success === true ? root.data : undefined;
  const t = d?.train;
  if (!d || !t || t.number !== number || !Array.isArray(d.route) || d.route.length < 2) throw new UpstreamError("RailRadar's record is not the train asked for.");
  const route = d.route as Array<Record<string, any>>;
  const halts: HaltRow[] = [];
  const codes: string[] = [];
  for (const x of route) {
    const code = str(x?.station?.code);
    if (!code) throw new UpstreamError("RailRadar's route has a station with no code.");
    codes.push(code);
    const seq = nn(x?.sequence), km = nn(x?.distance);
    if (x?.isHalt === true || x?.isReversal === true) {
      if (seq === null || km === null) throw new UpstreamError("RailRadar's route has a halt with no place or distance.");
      halts.push({ seq, code, name: str(x?.station?.name), km, arrival: sn(x?.arrival), arrivalDay: nn(x?.arrivalDay), departure: sn(x?.departure), departureDay: nn(x?.departureDay) });
    }
  }
  const km = nn(t.distance);
  if (km === null || halts.length < 2) throw new UpstreamError("RailRadar's record has no distance or no halts.");
  return {
    number,
    name: str(t.name),
    type: str(t.type),
    category: str(t.category),
    from: str(t.source?.code),
    fromName: str(t.source?.name),
    to: str(t.destination?.code),
    toName: str(t.destination?.name),
    runDays: Array.isArray(t.runDays) ? (t.runDays as unknown[]).map(String) : [],
    distanceKm: km,
    durationMin: nn(t.duration),
    totalHalts: nn(t.totalHalts),
    returnTrain: sn(t.returnTrain),
    classes: Array.isArray(t.availableClasses) ? (t.availableClasses as unknown[]).map(String) : Array.isArray(t.classes) ? (t.classes as unknown[]).map(String) : [],
    prsBookable: t.isPrsBookable === true,
    hasReversal: t.hasReversal === true,
    halts,
    route: codes,
  };
}

/** The route proof: which of Durgapur and Asansol the train goes over (empty when neither). */
export const goesOver = (t: Pick<TrainFull, "route">): string[] => EXCLUDED_STATIONS.filter((c) => t.route.includes(c));

/**
 * A train gets fares from the reservation system when it can be booked there (isPrsBookable); suburban and local trains cannot, so they keep their details and have no fare. NOTE: the classes the train's own record lists are NOT
 * enough to say which classes to ask for: checked on 28 Nov 2026, the Howrah - Barbil Jan Shatabdi (12021) lists CC only and the fare service sells 2S on it too (the other three trains tried matched). So the classes are found the way
 * the Durgapur set's were: all eight asked for the fare to the END of the run, and the halts in between are asked for the classes that answered.
 */
export const hasReservedFares = (t: Pick<TrainFull, "prsBookable">): boolean => t.prsBookable;

/** The classes the record lists, for the budget only (the real classes are found at the end station). */
export const reservedClasses = (t: Pick<TrainFull, "classes">) => CLASSES.filter((c) => t.classes.includes(c.code));

/** The halts after the starting station, as parseSchedule (fare.ts) reads them: a copy of the answer that holds only the halts (and reversals). */
export function haltsOnlyJson(json: unknown): unknown {
  const root = json as { success?: unknown; data?: { train?: unknown; route?: Array<Record<string, any>> } };
  return { success: root.success, data: { train: root.data?.train, route: (root.data?.route ?? []).filter((x) => x?.isHalt === true || x?.isReversal === true) } };
}

/** An estimate of the requests a train's fares need: all eight classes at the end station, then one per listed class (at least one) for each halt in between. A train with no reserved fares needs none. */
export function requestsFor(t: Pick<TrainFull, "classes" | "prsBookable" | "halts">): number {
  if (!hasReservedFares(t)) return 0;
  return CLASSES.length + Math.max(1, reservedClasses(t).length) * Math.max(0, t.halts.length - 2);
}
