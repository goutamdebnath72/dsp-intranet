// src/lib/live/railway.ts
//
// THE TRAINS THAT STOP AT DURGAPUR RAILWAY STATION (DGR), from RailRadar's station timetable (https://api.railradar.in/v1/stations/DGR/trains, an API that needs a key: the plant's own key, kept on the server only, in
// RAILRADAR_API_KEY). Each train has its number, name, kind, where it starts and ends, its arrival and departure at Durgapur, and the days it runs.
// It is the TIMETABLE, not live running status (the card says so). This reads the answer, CHECKS it and sorts it; nothing is guessed:
//   * THE DAYS. RailRadar gives the days a train leaves its STARTING station; a train that starts far away reaches Durgapur on a later day ("arrivalDay": 2 means the day after it started). The days shown are therefore
//     the days AT DURGAPUR: each day of the list moved on by (arrivalDay - 1). (checked against a third-party list on 13 Nov 2026: Jaynagar Weekly 13135 leaves Kolkata on Saturdays at 20:55 and is at Durgapur at 00:04 on Sundays.)
//   * THE DIRECTION. The answer does not say which way a train runs past Durgapur, only where it starts and ends. A train that ends at Howrah, Kolkata, Sealdah, Shalimar, Dankuni or Barddhaman runs TOWARDS HOWRAH; one that
//     starts at any of them runs AWAY from it. A train with neither end among these is placed when one end is a station known to lie beyond Asansol (Patna, Barauni, Delhi...), or from its own route (the ROUTE_HEADING table
//     below); every other train goes in a third list ("other through trains") with where it starts and ends, rather than being given a direction the data does not support. "Towards Barddhaman" includes the few trains that go on
//     from Durgapur to Suri and Malda instead of Howrah.
//   * THE KIND. "MEMU" is the local train; "Train on Demand" is a special (festival, Puja, Chhath); the rest are mail and express trains of every class.
// A reply that is not the expected shape, or in which too many trains cannot be read, is an error, never a guess.
export const STATION = { code: "DGR", name: "Durgapur", zone: "Asia/Kolkata" } as const;
export const RAILRADAR_URL = "https://api.railradar.in/v1/stations/DGR/trains";
export const RAILRADAR_SITE = "https://railradar.in/";
export const NTES_URL = "https://enquiry.indianrail.gov.in/ntes/";

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_LONG: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export type Heading = "east" | "west" | "other";
export type Kind = "express" | "special" | "local";

export interface Train {
  number: string;
  name: string;
  kind: Kind;
  /** the class in words: "Superfast", "Vande Bharat", "Rajdhani", "Express", "Special", "MEMU (local)" */
  label: string;
  /** where it starts and ends, as RailRadar names them, with the station codes */
  from: string;
  fromCode: string;
  to: string;
  toCode: string;
  /** "HH:mm" at Durgapur; a train that starts here has no arrival, one that ends here no departure */
  arrival: string | null;
  departure: string | null;
  /** the days it is at Durgapur (already moved on from the starting station's days) */
  days: Day[];
  heading: Heading;
}

export interface Group { east: Train[]; west: Train[]; other: Train[] }
export interface Railway {
  station: string;
  /** mail and express trains of every class, and the specials among them */
  express: Group;
  /** the local (MEMU) trains */
  local: Group;
  /** all the trains read */
  count: number;
}

export class RailwayError extends Error {}

/** the stations on the Howrah side of Durgapur (a train that ends at one of them runs towards Howrah; one that starts at one runs away from it) */
const HOWRAH_SIDE = new Set(["HWH", "SHM", "KOAA", "SDAH", "DKAE", "BWN"]);
/** stations certain to lie beyond Durgapur on the Asansol side, used only when neither end is on the Howrah side */
const ASANSOL_SIDE = new Set(["ASN", "DHN", "PNBE", "BJU", "MFP", "DBG", "GKP", "RXL", "SMI", "JYG", "NDLS", "ANVT", "ASR", "BNRS", "LKU", "CNB", "AGC", "GWL", "KWP", "BKN", "ADI"]);

/**
 * THE DIRECTION OF THE TRAINS THE ENDS DO NOT SETTLE (neither end on the Howrah side or beyond Asansol): read once from each train's full route (RailRadar's /v1/trains/{number}: the order of the stops, Asansol
 * before Durgapur = the train is moving towards Barddhaman, Asansol after it = moving towards Asansol), on 13 Nov 2026, one train of each pair; the other number of a pair runs the opposite way (checked: its two ends
 * are the first one's reversed). NOT worked out from the train number: the odd = down, even = up custom depends on each zone's headquarters, and on this very list it fails for 14 of 238 trains (13417 and 15629 are odd and
 * run towards Barddhaman). A train that is not in this table and whose ends do not settle it is shown in the "other through trains" list; the table is for the trains that run all the year, check it when the railway renumbers one.
 */
const ROUTE_HEADING: Record<string, Heading> = {
  "12551": "east", "12552": "west", "08409": "west", "08410": "east", "13417": "east", "13418": "west", "13425": "west", "13426": "east", "15629": "east", "15630": "west",
  "15639": "east", "15640": "west", "15661": "east", "15662": "west", "15929": "east", "15930": "west", "22305": "west", "22306": "east", "22611": "east", "22612": "west",
};
export const ROUTE_HEADING_CHECKED = "2026-11-13";

export function headingOf(fromCode: string, toCode: string, number?: string): Heading {
  const h = headingByEnds(fromCode, toCode);
  return h === "other" && number && ROUTE_HEADING[number] ? ROUTE_HEADING[number] : h;
}

function headingByEnds(fromCode: string, toCode: string): Heading {
  if (HOWRAH_SIDE.has(toCode)) return HOWRAH_SIDE.has(fromCode) ? "other" : "east";
  if (HOWRAH_SIDE.has(fromCode)) return "west";
  if (ASANSOL_SIDE.has(toCode)) return ASANSOL_SIDE.has(fromCode) ? "other" : "west";
  if (ASANSOL_SIDE.has(fromCode)) return "east";
  return "other";
}

const LABEL: Record<string, string> = {
  "Mail/Express": "Express",
  "Superfast Express": "Superfast",
  "Vande Bharat Express": "Vande Bharat",
  "Amrit Bharat Express": "Amrit Bharat",
  "Rajdhani Express": "Rajdhani",
  "Shatabdi Express": "Shatabdi",
  "Jan Shatabdi Express": "Jan Shatabdi",
  "Garib Rath Express": "Garib Rath",
  "Train on Demand": "Special",
  MEMU: "MEMU (local)",
};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const isDay = (d: unknown): d is Day => typeof d === "string" && (DAYS as string[]).includes(d);
const str = (x: unknown, max = 120): string | null => (typeof x === "string" && x.trim() && x.length <= max ? x.trim() : null);

/** the days moved on by `offset` days (a train that starts on Saturday and reaches Durgapur the next day is at Durgapur on Sunday) */
export function shiftDays(days: Day[], offset: number): Day[] {
  const set = new Set(days.map((d) => (DAYS.indexOf(d) + offset) % 7));
  return DAYS.filter((_, i) => set.has(i));
}

/** "Daily", "Mon–Fri", "Mon, Wed, Sat"; the title spells the days out */
export function daysChip(days: Day[]): { text: string; title: string } {
  const have = DAYS.filter((d) => days.includes(d));
  const title = have.length === 7 ? "Every day of the week" : `Runs on ${have.map((d) => DAY_LONG[d]).join(", ")}`;
  if (have.length === 7) return { text: "Daily", title };
  const weekdays = have.length === 5 && have.every((d, i) => d === DAYS[i]);
  if (weekdays) return { text: "Mon–Fri", title };
  return { text: have.map((d) => DAY_SHORT[d]).join(", "), title };
}

/** the minute of the day a train is at Durgapur (the departure, or the arrival for a train that ends here), for ordering */
export const clock = (t: Train): string => (t.departure ?? t.arrival) as string;

const byClock = (a: Train, b: Train) => mins(clock(a)) - mins(clock(b)) || a.number.localeCompare(b.number);

/** Reads and checks RailRadar's answer for the station. `min` is the fewest trains a believable answer holds (Durgapur has hundreds). */
export function parseRailway(json: unknown, opts: { min?: number } = {}): Railway {
  const root = json as { success?: unknown; data?: { station?: { code?: unknown }; trains?: unknown } };
  if (!root || root.success !== true || !root.data) throw new RailwayError("RailRadar did not send a timetable.");
  if (root.data.station?.code !== STATION.code) throw new RailwayError("RailRadar sent the timetable of another station.");
  const rows = root.data.trains;
  if (!Array.isArray(rows)) throw new RailwayError("RailRadar's timetable has no list of trains.");
  const trains: Train[] = [];
  let bad = 0;
  for (const r of rows as Array<Record<string, any>>) {
    const t = r?.train, s = r?.stop;
    const number = typeof t?.number === "string" && /^\d{5}$/.test(t.number) ? t.number : null;
    const name = str(t?.name), type = str(t?.type, 40);
    const from = str(t?.source?.name), fromCode = str(t?.source?.code, 8), to = str(t?.destination?.name), toCode = str(t?.destination?.code, 8);
    const runDays = Array.isArray(t?.runDays) && t.runDays.length > 0 && t.runDays.every(isDay) ? (t.runDays as Day[]) : null;
    const arrival = s?.arrival == null ? null : typeof s.arrival === "string" && HM.test(s.arrival) ? s.arrival : undefined;
    const departure = s?.departure == null ? null : typeof s.departure === "string" && HM.test(s.departure) ? s.departure : undefined;
    const day = s?.arrivalDay ?? s?.departureDay;
    const offset = typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 5 ? day - 1 : null;
    if (!number || !name || !type || !from || !fromCode || !to || !toCode || !runDays || arrival === undefined || departure === undefined || (arrival === null && departure === null) || offset === null) { bad++; continue; }
    const kind: Kind = type === "MEMU" ? "local" : type === "Train on Demand" ? "special" : "express";
    trains.push({ number, name, kind, label: LABEL[type] ?? type, from, fromCode, to, toCode, arrival, departure, days: shiftDays(runDays, offset), heading: headingOf(fromCode, toCode, number) });
  }
  const min = opts.min ?? 50;
  if (trains.length < min) throw new RailwayError(`RailRadar's timetable holds only ${trains.length} readable trains.`);
  if (bad > rows.length * 0.1) throw new RailwayError(`${bad} of ${rows.length} trains in RailRadar's timetable could not be read.`);
  const group = (pick: (t: Train) => boolean): Group => {
    const list = trains.filter(pick).sort(byClock);
    return { east: list.filter((t) => t.heading === "east"), west: list.filter((t) => t.heading === "west"), other: list.filter((t) => t.heading === "other") };
  };
  return { station: STATION.name, express: group((t) => t.kind !== "local"), local: group((t) => t.kind === "local"), count: trains.length };
}

export interface Moment { hm: string; day: Day }

/** the next train of a list that is at Durgapur today at or after `now`, among those that run today */
export function nextTrain(list: Train[], now: Moment): Train | null {
  return list.find((t) => t.days.includes(now.day) && clock(t) >= now.hm) ?? null;
}

/** the trains of a list that pass the filters: only those that run on `day`, and without the specials */
export function filterTrains(list: Train[], opts: { today?: Day | null; specials: boolean }): Train[] {
  return list.filter((t) => (opts.specials || t.kind !== "special") && (!opts.today || t.days.includes(opts.today)));
}
