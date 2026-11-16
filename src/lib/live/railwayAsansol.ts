// src/lib/live/railwayAsansol.ts
//
// THE TRAINS OF ASANSOL JUNCTION (ASN) THAT A PERSON AT DURGAPUR CAN ONLY HAVE FROM ASANSOL: the trains that stop at Asansol and do NOT stop at Durgapur (DGR). They are of two kinds, and the card says which:
//   * "pass"  - the train runs over Durgapur WITHOUT stopping (Durgapur is on its line, RailRadar lists it there as a pass-through), and stops at Asansol: to take it, go to Asansol;
//   * "away"  - the train does not go over Durgapur at all (it is not in Durgapur's timetable, neither as a stop nor as a pass-through) and stops at Asansol: its way is elsewhere (Gomoh, Adra, Tatanagar, Andal, Sainthia...).
// A train that stops at BOTH is left out, because it can be had at Durgapur. Nothing is guessed: the two lists come from two timetables of RailRadar's station board (GET /v1/stations/{code}/trains; with
// includeIntermediate=true the board also lists the trains that pass a station without stopping, stopType "pass-through"):
//   Asansol's board (the trains that stop: stopType halt, origin or destination), and Durgapur's board with the pass-throughs included.
// A train of Asansol's board whose number is among Durgapur's stops is dropped; one among Durgapur's pass-throughs is "pass"; any other is "away".
// Each train is read by the same reader as the Durgapur card (readRow in railway.ts): its time AT ASANSOL (the departure, or the arrival for a train that ends there) and the days it is AT ASANSOL (moved on from the
// starting station's days by the arrival day). The local (MEMU) trains are kept apart, as at Durgapur. An answer that is not the expected one, or that lacks the pass-through rows (so that "pass" and "away" could not be
// told apart), is an error, never a guess.
import { clock, readRow, RailwayError, type Train } from "./railway";

export const ASANSOL = { code: "ASN", name: "Asansol", zone: "Asia/Kolkata" } as const;
export const RAILRADAR_ASN_URL = "https://api.railradar.in/v1/stations/ASN/trains";
/** Durgapur's board WITH the trains that pass without stopping */
export const RAILRADAR_DGR_ALL_URL = "https://api.railradar.in/v1/stations/DGR/trains?includeIntermediate=true";

export type Via = "pass" | "away";
export interface AsansolTrain extends Train { via: Via }
export interface AsansolTrains {
  station: string;
  /** mail and express trains of every class, and the specials among them, in the order of the clock at Asansol */
  express: AsansolTrain[];
  /** the local (MEMU) trains */
  local: AsansolTrain[];
  /** all the trains read: those that pass Durgapur without stopping, and those that do not go over it */
  count: number;
  pass: number;
  away: number;
}

const STOPS = new Set(["halt", "origin", "destination"]);
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const byClock = (a: Train, b: Train) => mins(clock(a)) - mins(clock(b)) || a.number.localeCompare(b.number);

function rowsOf(json: unknown, code: string, who: string): Array<Record<string, any>> {
  const root = json as { success?: unknown; data?: { station?: { code?: unknown }; trains?: unknown } };
  if (!root || root.success !== true || !root.data) throw new RailwayError(`RailRadar did not send the timetable of ${who}.`);
  if (root.data.station?.code !== code) throw new RailwayError(`RailRadar sent the timetable of another station for ${who}.`);
  if (!Array.isArray(root.data.trains)) throw new RailwayError(`RailRadar's timetable of ${who} has no list of trains.`);
  return root.data.trains as Array<Record<string, any>>;
}

export function parseAsansol(asnJson: unknown, dgrAllJson: unknown, opts: { minAsn?: number; minDgr?: number; minPass?: number } = {}): AsansolTrains {
  const asn = rowsOf(asnJson, ASANSOL.code, "Asansol");
  const dgr = rowsOf(dgrAllJson, "DGR", "Durgapur");
  const stopsAtDgr = new Set<string>(), passesDgr = new Set<string>();
  for (const r of dgr) {
    const n = r?.train?.number, ty = r?.stop?.stopType;
    if (typeof n !== "string") continue;
    if (STOPS.has(ty)) stopsAtDgr.add(n); else if (ty === "pass-through") passesDgr.add(n);
  }
  // without the pass-through rows every train would look as if it did not go over Durgapur: refuse rather than mislabel
  if (dgr.length < (opts.minDgr ?? 100) || stopsAtDgr.size < (opts.minDgr ?? 100) * 0.5 || passesDgr.size < (opts.minPass ?? 5)) throw new RailwayError("RailRadar's timetable of Durgapur lacks the trains that pass without stopping.");
  if (asn.length < (opts.minAsn ?? 100)) throw new RailwayError(`RailRadar's timetable of Asansol holds only ${asn.length} trains.`);
  const out: AsansolTrain[] = [];
  const seen = new Set<string>();
  let bad = 0;
  for (const r of asn) {
    const ty = r?.stop?.stopType;
    if (ty === "pass-through") continue; // a train that only passes Asansol is not one to take there
    if (!STOPS.has(ty)) { bad++; continue; }
    const t = readRow(r);
    if (!t) { bad++; continue; }
    if (stopsAtDgr.has(t.number) || seen.has(t.number)) continue; // can be had at Durgapur
    seen.add(t.number);
    out.push({ ...t, via: passesDgr.has(t.number) ? "pass" : "away" });
  }
  if (bad > asn.length * 0.1) throw new RailwayError(`${bad} of ${asn.length} trains in RailRadar's timetable of Asansol could not be read.`);
  out.sort(byClock);
  return {
    station: ASANSOL.name,
    express: out.filter((t) => t.kind !== "local"),
    local: out.filter((t) => t.kind === "local"),
    count: out.length,
    pass: out.filter((t) => t.via === "pass").length,
    away: out.filter((t) => t.via === "away").length,
  };
}

/** the trains that pass the filters: only those that run on `day`, without the specials, and only one of the two kinds when `via` is given */
export function filterAsansol(list: AsansolTrain[], opts: { today?: Train["days"][number] | null; specials: boolean; via?: Via | null }): AsansolTrain[] {
  return list.filter((t) => (opts.specials || t.kind !== "special") && (!opts.today || t.days.includes(opts.today)) && (!opts.via || t.via === opts.via));
}

/** whether a saved answer of the Asansol route is the shape the card draws: a saved copy that is not is never shown */
export function looksLikeAsansol(x: unknown): x is AsansolTrains {
  const r = x as AsansolTrains | null;
  const train = (t: AsansolTrain) => !!t && /^\d{5}$/.test(t.number) && typeof t.name === "string" && typeof t.toCode === "string" && Array.isArray(t.days) && (t.via === "pass" || t.via === "away") && (t.arrival === null || typeof t.arrival === "string") && (t.departure === null || typeof t.departure === "string");
  return !!r && typeof r === "object" && typeof r.count === "number" && Array.isArray(r.express) && Array.isArray(r.local) && r.count === r.express.length + r.local.length && r.count > 0 && [...r.express, ...r.local].every(train);
}
