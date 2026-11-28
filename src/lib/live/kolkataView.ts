// src/lib/live/kolkataView.ts
//
// WHAT THE KOLKATA TAB SHOWS (pure: the catalogue rows and the saved fares are handed in; no request, no database). The tab is the third set of the paid RailRadar month (kolkataSet.ts, kolkataStore.ts): the trains that
// START at Howrah (HWH), Sealdah (SDAH), Santragachi (SRC) or Kolkata (KOAA) and go over neither Durgapur nor Asansol. The owner added one more rule when he asked for this screen, and I apply it here, to what is saved:
//   * a train of one of the four must NOT touch any OTHER of the four, whether it stops there or only passes: a Howrah train that goes through Santragachi is not a Howrah train for this tab.
// I know what a train touches from two things that are saved: `touches` (the boards of the four stations it is on, halts and pass-throughs alike: RailRadar's boards with includeIntermediate) and its halts. The trains that are
// left out are kept in a list with the reason (the other station it touches), so that the owner can see what the rule removed, and nothing is hidden without being counted.
// The times are the times AT THE STARTING STATION, and the days are the days it leaves there (the train starts here, so nothing is moved on by a day). Nothing is guessed: a train whose first halt has no readable departure is not
// drawn, and a train with no fare says why (the reservation system does not sell it, or it sold none, or it was not collected).
import { DAYS, labelOf, type Day, type Train } from "./railway";

/** The four starting stations, in the order the owner named them. `name` is the short name used in words, `full` the station's own name. */
export const STARTS = [
  { code: "HWH", name: "Howrah", full: "Howrah Junction" },
  { code: "SDAH", name: "Sealdah", full: "Sealdah" },
  { code: "SRC", name: "Santragachi", full: "Santragachi Junction" },
  { code: "KOAA", name: "Kolkata", full: "Kolkata Chitpur" },
] as const;
export type StartCode = (typeof STARTS)[number]["code"];
export const START_CODES: string[] = STARTS.map((s) => s.code);
export const isStartCode = (x: unknown): x is StartCode => typeof x === "string" && START_CODES.includes(x);
export const startName = (code: string): string => STARTS.find((s) => s.code === code)?.name ?? code;

/** The part of a catalogue row (kolkataStore.ts) that this file reads; a structural type, so that nothing here depends on the database file. */
export interface KolRow {
  number: string;
  name: string;
  type: string;
  from: string;
  to: string;
  toName: string;
  runDays: string[];
  distanceKm: number | null;
  durationMin: number | null;
  prsBookable: boolean;
  touches: string[];
  inSet: boolean;
  halts: Array<{ code: string; departure: string | null }>;
  fetchedAt: string;
}

/** Why a train has no fare shown: "saved" = it has one; "none" = the fare service sold nothing for it; "not-collected" = it is sold but its fare was not collected; "not-sold" = the reservation system does not sell it. */
export type FareState = "saved" | "none" | "not-collected" | "not-sold";

export interface KolTrain extends Train {
  fare: FareState;
  km: number | null;
  durationMin: number | null;
}

export interface KolStation { code: StartCode; express: number; local: number; leftOut: number }
export interface LeftOut { number: string; name: string; type: string; to: string; also: StartCode[] }

export interface KolkataAnswer {
  /** The station whose trains are in `express`, `local` and `leftOut` */
  station: StartCode;
  /** The four stations, with their counts, so that the picker can show them all whichever one is opened */
  stations: KolStation[];
  express: KolTrain[];
  local: KolTrain[];
  leftOut: LeftOut[];
  /** The time the OLDEST train record shown was saved from RailRadar (ISO, UTC): none is older */
  savedAt: string;
  /** The time the OLDEST saved fare among the trains shown was received (ISO, UTC); null when none has a fare */
  fareAt: string | null;
  /** How many of the trains shown have a saved fare */
  withFares: number;
}

/** What is known of the fare of one train: the number of classes that answered at the end of its run (0 = none sold), and when. */
export interface FareSummary { classes: number; receivedAt: string }

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDay = (d: unknown): d is Day => typeof d === "string" && (DAYS as string[]).includes(d);
const LOCAL_TYPE = /suburban|emu|memu|passenger/i;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** The other starting stations a train touches: where it stops, or is on the board of (a pass-through is on the board too). Empty = it is only its own station's train. */
export function alsoTouches(r: Pick<KolRow, "from" | "touches" | "halts">): StartCode[] {
  return STARTS.map((s) => s.code).filter((c) => c !== r.from && (r.touches.includes(c) || r.halts.some((h) => h.code === c)));
}

/** Is the row a train of the set that starts at one of the four (the set's own rule, kolkataSet.ts; the owner's new rule is `alsoTouches`)? */
export const startsHere = (r: Pick<KolRow, "inSet" | "from"> & { halts: Array<{ code: string }> }): boolean => r.inSet && isStartCode(r.from) && r.halts.length > 0 && r.halts[0].code === r.from;

/** The row as a train of the card: its departure at its starting station, its days, its kind. Null when it cannot be drawn (no readable departure, no readable day). */
export function toTrain(r: KolRow, fare: FareState): KolTrain | null {
  const dep = r.halts[0]?.departure ?? null;
  const days = r.runDays.filter(isDay);
  if (!dep || !HM.test(dep) || days.length === 0) return null;
  const kind = /demand/i.test(r.type) ? "special" : LOCAL_TYPE.test(r.type) ? "local" : "express";
  const fromName = startName(r.from);
  return { number: r.number, name: r.name, kind, label: labelOf(r.type), from: fromName, fromCode: r.from, to: r.toName, toCode: r.to, arrival: null, departure: dep, days: DAYS.filter((d) => days.includes(d)), heading: "other", fare, km: r.distanceKm, durationMin: r.durationMin };
}

export function fareStateOf(r: Pick<KolRow, "number" | "prsBookable">, fares: Map<string, FareSummary>): FareState {
  if (!r.prsBookable) return "not-sold";
  const f = fares.get(r.number);
  return !f ? "not-collected" : f.classes > 0 ? "saved" : "none";
}

const byDeparture = (a: Train, b: Train) => mins(a.departure as string) - mins(b.departure as string) || a.number.localeCompare(b.number);

/** The trains of one starting station that the tab shows (they touch no other of the four), in the order of the clock at the station, with the trains the rule left out. */
export function stationTrains(rows: KolRow[], fares: Map<string, FareSummary>, code: StartCode): { trains: KolTrain[]; leftOut: LeftOut[]; unreadable: number } {
  const trains: KolTrain[] = [];
  const leftOut: LeftOut[] = [];
  let unreadable = 0;
  for (const r of rows) {
    if (r.from !== code || !startsHere(r)) continue;
    const also = alsoTouches(r);
    if (also.length) { leftOut.push({ number: r.number, name: r.name, type: r.type, to: r.toName, also }); continue; }
    const t = toTrain(r, fareStateOf(r, fares));
    if (t) trains.push(t); else unreadable++;
  }
  trains.sort(byDeparture);
  leftOut.sort((a, b) => a.number.localeCompare(b.number));
  return { trains, leftOut, unreadable };
}

/** The whole answer for one starting station: its trains, and the counts of all four. */
export function buildKolkata(rows: KolRow[], fares: Map<string, FareSummary>, code: StartCode): KolkataAnswer {
  const per = STARTS.map((s) => ({ code: s.code, ...stationTrains(rows, fares, s.code) }));
  const mine = per.find((p) => p.code === code)!;
  const express = mine.trains.filter((t) => t.kind !== "local"), local = mine.trains.filter((t) => t.kind === "local");
  const at = (iso: string) => new Date(iso).getTime();
  const shown = new Set(mine.trains.map((t) => t.number));
  const savedTimes = rows.filter((r) => shown.has(r.number)).map((r) => at(r.fetchedAt)).filter(Number.isFinite);
  const fareTimes = mine.trains.filter((t) => t.fare === "saved").map((t) => fares.get(t.number)?.receivedAt).filter((x): x is string => !!x).map(at).filter(Number.isFinite);
  return {
    station: code,
    stations: per.map((p) => ({ code: p.code, express: p.trains.filter((t) => t.kind !== "local").length, local: p.trains.filter((t) => t.kind === "local").length, leftOut: p.leftOut.length })),
    express,
    local,
    leftOut: mine.leftOut,
    savedAt: savedTimes.length ? new Date(Math.min(...savedTimes)).toISOString() : "",
    fareAt: fareTimes.length ? new Date(Math.min(...fareTimes)).toISOString() : null,
    withFares: mine.trains.filter((t) => t.fare === "saved").length,
  };
}

/** "9 h 40 min" for a run time in minutes; "" when it is not known. */
export function durationText(min: number | null): string {
  if (min === null || !Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Tells whether a saved or received answer has the shape the tab draws; I never draw one that has not. */
export function looksLikeKolkata(x: unknown): x is KolkataAnswer {
  const r = x as KolkataAnswer | null;
  const train = (t: KolTrain) => !!t && /^\d{5}$/.test(t.number) && typeof t.name === "string" && typeof t.toCode === "string" && Array.isArray(t.days) && typeof t.departure === "string" && ["saved", "none", "not-collected", "not-sold"].includes(t.fare);
  return !!r && typeof r === "object" && isStartCode(r.station) && Array.isArray(r.stations) && r.stations.length === 4 && Array.isArray(r.express) && Array.isArray(r.local) && Array.isArray(r.leftOut) && [...r.express, ...r.local].every(train);
}
