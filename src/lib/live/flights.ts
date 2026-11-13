// src/lib/live/flights.ts
//
// THE FLIGHTS TO AND FROM ANDAL AIRPORT (Kazi Nazrul Islam Airport, Durgapur, RDP), from the AIRPORT'S OWN website: https://kniairport.com/flights/ (the "Flight Information" page, free and open to anyone).
// That page lists the airport's flights as cards (the airline, the other airport, the two times, the flight number), each marked Departure or Arrival, and says when it was last updated. This reads it, CHECKS it, and
// nothing else: it is the airport's TIMETABLE, not live status (the airport's own page says: "for realtime flight data please contact the airport support desk"; its Live Arrivals and Live Departures boards
// are linked from the card, not read). A page whose layout is not the one expected is an error, never a guess at the times.
//
// HOW A CARD READS. Each card shows two times: the first, under the Durgapur label, is the time AT DURGAPUR; the second, under the other airport's name, is the time AT THE OTHER AIRPORT.
//   a Departure card: leaves Durgapur at the first time, reaches the other airport at the second.   an Arrival card: leaves the other airport at the second time, reaches Durgapur at the first.
// (checked on the real page: every flight then takes between about 1 h 50 min and 3 h 10 min, which is right for these routes; a card whose flight time comes out under half an hour or over six hours is refused.)
import { DateTime } from "luxon";

export const AIRPORT = { name: "Kazi Nazrul Islam Airport", place: "Andal, Durgapur", iata: "RDP", zone: "Asia/Kolkata" } as const;
export const FLIGHTS_URL = "https://kniairport.com/flights/";
/** the airport's own live boards, linked from its flight page (opened by the reader, never read here) */
export const LIVE_ARRIVALS_URL = "https://fidslive.in/arrival_no_add";
export const LIVE_DEPARTURES_URL = "https://fidslive.in/departure_no_add";

/** the two-letter airline codes of the airlines that have flown from here (standard IATA codes); an airline not in the table is shown by its name and the number alone, never a guessed code */
const AIRLINE_CODE: Record<string, string> = { indigo: "6E", spicejet: "SG", "alliance air": "9I", "air india": "AI", "star air": "S5" };

export interface Flight {
  airline: string;
  /** "6E 509", or "509" for an airline whose code is not in the table */
  number: string;
  /** the other airport's city ("Bengaluru") and code ("BLR") */
  city: string;
  iata: string;
  /** the time at Durgapur ("08:55"), and the time at the other airport */
  time: string;
  otherTime: string;
  /** the minutes in the air, as the two times give them */
  minutes: number;
}
export interface Flights {
  airport: string;
  /** when the airport's page says it was last updated (ISO, UTC) */
  updatedAt: string;
  /** leaving Durgapur, by the time of leaving */
  departures: Flight[];
  /** reaching Durgapur, by the time of arriving */
  arrivals: Flight[];
}

export class FlightsError extends Error {}

const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const validTime = (hm: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hm);

/** Reads and checks the airport's flight page. */
export function parseFlights(html: string, now: DateTime = DateTime.now()): Flights {
  const stamp = /last updated on (\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/i.exec(html);
  if (!stamp) throw new FlightsError("The airport's flight page does not say when it was updated.");
  const updated = DateTime.fromFormat(stamp[1], "dd-MM-yyyy HH:mm:ss", { zone: AIRPORT.zone });
  if (!updated.isValid || updated > now.plus({ days: 1 })) throw new FlightsError("The airport's flight page gave an unusable update time.");
  const list = /<ul id="schedule_list">([\s\S]*?)<\/ul>/.exec(html);
  if (!list) throw new FlightsError("The airport's flight page has no flight list.");
  const departures: Flight[] = [], arrivals: Flight[] = [];
  for (const m of list[1].matchAll(/<li class="flightScheduleCard[^"]*"([^>]*)>([\s\S]*?)<\/li>/g)) {
    const attrs = m[1], body = m[2];
    const dir = /data-direction="(Departure|Arrival)"/.exec(attrs)?.[1];
    const from = /data-departure="([A-Z]{3})"/.exec(attrs)?.[1], to = /data-arrival="([A-Z]{3})"/.exec(attrs)?.[1];
    if (!dir) continue; // a card without a direction is not one of the airport's flights
    if (!from || !to || (dir === "Departure" ? from !== AIRPORT.iata : to !== AIRPORT.iata)) throw new FlightsError("A flight card of the airport's page is not to or from Durgapur.");
    const airline = text(/<div class="flightIcon">[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? "");
    const first = /<div class="dept">\s*<h4>([\s\S]*?)<br>\s*<span>(\d{2}:\d{2})<\/span>/.exec(body);
    const second = /<div class="arrive">\s*<h4>([\s\S]*?)<br>\s*<span>(\d{2}:\d{2})<\/span>/.exec(body);
    const number = /Flight Number<br>\s*<span>([0-9]{1,4}[A-Z]?)<\/span>/.exec(body)?.[1];
    if (!airline || !first || !second || !number || !validTime(first[2]) || !validTime(second[2])) throw new FlightsError("A flight card of the airport's page could not be read.");
    if (!/durgapur/i.test(first[1]) || /durgapur/i.test(second[1])) throw new FlightsError("The airport's flight page is laid out differently than expected.");
    const city = text(second[1]).replace(/\s*\(.*$/, "").trim();
    const other = dir === "Departure" ? to : from;
    const leave = dir === "Departure" ? first[2] : second[2], reach = dir === "Departure" ? second[2] : first[2];
    const minutes = (mins(reach) - mins(leave) + 1440) % 1440;
    if (minutes < 30 || minutes > 360) throw new FlightsError("A flight on the airport's page has an unusable flight time.");
    const code = AIRLINE_CODE[airline.toLowerCase()];
    const f: Flight = { airline, number: code ? `${code} ${number}` : number, city, iata: other, time: first[2], otherTime: second[2], minutes };
    (dir === "Departure" ? departures : arrivals).push(f);
  }
  if (!departures.length && !arrivals.length) throw new FlightsError("The airport's flight page lists no flights.");
  const byTime = (a: Flight, b: Flight) => a.time.localeCompare(b.time) || a.number.localeCompare(b.number);
  return { airport: AIRPORT.name, updatedAt: updated.toUTC().toISO() as string, departures: departures.sort(byTime), arrivals: arrivals.sort(byTime) };
}

/** the next flight at or after `at` (a time at Durgapur, "HH:mm") in a list sorted by time, or null when none is left in the list */
export function nextFlight(list: Flight[], at: string): Flight | null {
  return list.find((f) => f.time >= at) ?? null;
}
/** "2 h 30 min" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
/** "in 1 h 20 min" / "in 35 min": the minutes from `at` to the flight's time, both "HH:mm" at Durgapur */
export function until(at: string, time: string): string {
  const d = mins(time) - mins(at);
  return d <= 0 ? "now" : `in ${duration(d)}`;
}
