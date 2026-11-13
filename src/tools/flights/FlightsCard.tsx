// src/tools/flights/FlightsCard.tsx
//
// THE FLIGHTS TO AND FROM ANDAL AIRPORT: two lists, leaving Durgapur and reaching Durgapur, each flight with its time at Durgapur, the other city, the flight number, the time there and how long it flies; the next
// flight of each list is marked, and flights already gone for the day are dimmed. It is the airport's TIMETABLE (src/lib/live/flights.ts reads the airport's own flight page and checks it): the card says so, says
// when the airport last updated it, and links the airport's own live boards. Nothing typed is sent anywhere: the request carries nothing.
"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { daysChip, fareChip, fareGuideStale, FARE_AS_OF, FARE_SOURCES } from "@/lib/live/flightFacts";
import { AIRPORT, duration, FLIGHTS_URL, LIVE_ARRIVALS_URL, LIVE_DEPARTURES_URL, nextFlight, until, type Flight, type Flights } from "@/lib/live/flights";
import { LiveGate, SourceLine } from "@/components/tools/live/LivePieces";

export const FLIGHTS_REFRESH_MS = 10 * 60 * 1000;
/** the time now at Durgapur, "HH:mm" */
export const hmNow = (): string => DateTime.now().setZone(AIRPORT.zone).toFormat("HH:mm");
/** "12 Nov, 8:20 pm" */
export const updatedText = (iso: string): string => DateTime.fromISO(iso, { zone: AIRPORT.zone }).toFormat("d LLL, h:mm a").replace("AM", "am").replace("PM", "pm");

/** the clock of the card: the time at Durgapur, ticking every half minute (its own small state, so that the lists are not redrawn by anything else) */
function useClock(): string {
  const [t, setT] = useState(hmNow);
  useEffect(() => { const id = setInterval(() => setT(hmNow()), 30_000); return () => clearInterval(id); }, []);
  return t;
}

/**
 * THE TOP OF THE TIME AND THE TOP OF THE FIRST LINE ARE ONE ROW OF PIXELS. Both have the room ABOVE a capital trimmed (text-box: trim-start cap alphabetic: only the top, because the title is cut with overflow hidden for its ellipsis and trimming its bottom would clip the tails of g, y and p), so the larger time does not poke above the smaller text; a
 * browser without it falls back to aligning the baselines. Poppins' round digits (0 2 3 6 8 9) stand 0.04 to 0.045 em ABOVE its capitals, so the time is let down 0.05 em (relative top, in em: the text stays elastic). THE TITLE ALSO HAS 0.12 em OF HEADROOM (padding above it and the same negative margin): the trim puts the top of the box at capital height, and the ellipsis clip would otherwise shave the tops of b, d, h, k, l, the dot of i and the tops of f and j, which stand higher than a capital in Poppins.
 * MEASURED on the real card (screenshots read pixel by pixel, 12 cards, widths 1160 to 2560, 100% to 200% scaling): the tops are the same row on 100% screens of common widths and within ONE physical pixel
 * everywhere else, which is the most there is: each text puts its baseline on a whole device pixel by itself.
 */
function Row({ f, now, next, kind, today }: { f: Flight; now: string; next: boolean; kind: "dep" | "arr"; today: DateTime }) {
  const gone = f.time < now;
  // the days a flight runs: a chip only when someone has checked them (flightFacts.ts); a rough fare: for a flight LEAVING Durgapur only (the listings it comes from are for Durgapur to the city)
  const days = daysChip(f.number);
  const fare = kind === "dep" ? fareChip(f.iata, today) : null;
  return (
    <li className={`flex items-baseline gap-4 rounded-xl border px-3 py-3 supports-[text-box:trim-start_cap_alphabetic]:items-start ${next ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-white"} ${gone ? "opacity-55" : ""}`} aria-current={next ? "true" : undefined}>
      <span className="relative top-[0.05em] w-14 shrink-0 text-lg font-extrabold leading-none tabular-nums text-slate-900 supports-[text-box:trim-start_cap_alphabetic]:[text-box:trim-start_cap_alphabetic]">{f.time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate pt-[0.12em] -mt-[0.12em] text-sm font-bold leading-snug text-slate-800 supports-[text-box:trim-start_cap_alphabetic]:[text-box:trim-start_cap_alphabetic]">{kind === "dep" ? "To" : "From"} {f.city} <span className="font-semibold text-slate-400">({f.iata})</span></span>
        <span className="mt-[calc(0.125rem-0.12em)] block truncate pt-[0.12em] text-xs text-slate-500">{f.airline} {f.number} · {kind === "dep" ? `reaches ${f.otherTime}` : `leaves ${f.otherTime}`} · {duration(f.minutes)}</span>
        {(days || fare) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {days && <span title={days.title} className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">{days.text}</span>}
            {fare && <span title={fare.title} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{fare.text} <span className="font-semibold text-amber-800/80">one way, economy</span></span>}
          </span>
        )}
      </span>
      {next && <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white">Next · {until(now, f.time)}</span>}
    </li>
  );
}

function Column({ title, icon, list, kind, now, today }: { title: string; icon: React.ReactNode; list: Flight[]; kind: "dep" | "arr"; now: string; today: DateTime }) {
  const next = nextFlight(list, now);
  return (
    <section aria-label={title}>
      <h4 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-slate-800">{icon}{title}<span className="rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">{list.length}</span></h4>
      {list.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-sm text-slate-600">None listed.</p> : (
        <ol className="space-y-1.5">{list.map((f) => <Row key={`${f.number}-${f.time}`} f={f} now={now} next={f === next} kind={kind} today={today} />)}</ol>
      )}
      {list.length > 0 && !next && <p className="mt-1.5 text-xs text-slate-500">No more flights in this list after {now} today.</p>}
    </section>
  );
}

export function FlightsBody({ data, now, today = DateTime.now() }: { data: Flights; now: string; today?: DateTime }) {
  const anyFare = data.departures.some((f) => fareChip(f.iata, today));
  const staleFare = fareGuideStale(today);
  return (
    <div>
      <p className="mb-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-snug text-violet-900">
        <strong>{AIRPORT.name}</strong>, {AIRPORT.place} ({AIRPORT.iata}). The airport&apos;s own flight list, last updated by the airport on <strong>{updatedText(data.updatedAt)}</strong>. Times are Indian time. Today it is <strong className="tabular-nums">{now}</strong> at Durgapur.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Column title="Leaving Durgapur" icon={<PlaneTakeoff size={16} aria-hidden="true" className="text-violet-600" />} list={data.departures} kind="dep" now={now} today={today} />
        <Column title="Reaching Durgapur" icon={<PlaneLanding size={16} aria-hidden="true" className="text-violet-600" />} list={data.arrivals} kind="arr" now={now} today={today} />
      </div>
      {anyFare && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
          <strong>About the fares:</strong> a rough guide only, <strong>not the airline&apos;s price</strong>. Each is about the middle of the lowest one-way economy fares that public booking sites ({FARE_SOURCES}) listed for the route on <strong>{DateTime.fromISO(FARE_AS_OF).toFormat("d LLL yyyy")}</strong>, shown for flights leaving Durgapur. The booking sites disagree with one another, a fare depends on the date and on how early you book, and it is usually much higher close to the day of travel. A route with only one or two listings is a rougher guide still. For anything you will pay, check IndiGo&apos;s own booking page.
        </p>
      )}
      {staleFare && <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">The fare guide is out of date (it was read on {DateTime.fromISO(FARE_AS_OF).toFormat("d LLL yyyy")}), so no fare is shown. Check IndiGo&apos;s booking page.</p>}
      <p className="mt-3 text-xs leading-snug text-slate-500">This is the airport&apos;s <strong>timetable, not live status</strong>: it does not show a delay or a cancellation, it does not say on which days of the week a flight runs, and the airport says the schedule can change, so check with the airline on the day of travel. For the airport&apos;s own live boards, use the links below.</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <a href={LIVE_ARRIVALS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">Live arrivals <ExternalLink size={11} aria-hidden="true" /></a>
        <a href={LIVE_DEPARTURES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">Live departures <ExternalLink size={11} aria-hidden="true" /></a>
        <a href={FLIGHTS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">The airport&apos;s flight page <ExternalLink size={11} aria-hidden="true" /></a>
      </p>
    </div>
  );
}

export function FlightsCard() {
  const { state, env, error, reload } = useLive<Flights>("/api/live/flights", true, { refreshMs: FLIGHTS_REFRESH_MS });
  const now = useClock();
  return (
    <div>
      <LiveGate state={state} error={error} reload={reload} what="the flights">
        {env && (
          <>
            <FlightsBody data={env.data} now={now} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}
