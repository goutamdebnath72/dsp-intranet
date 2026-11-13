// src/tools/railway/RailwayCard.tsx
//
// THE TRAINS AT DURGAPUR RAILWAY STATION (DGR): the mail and express trains first, in two lists (towards Howrah, and away from it), then the local MEMU trains in both directions below them. Each train shows its time at
// Durgapur (the departure, large; the arrival under it), its name and number, where it starts and ends, and the days it runs (Daily, or the weekdays); a special train is marked. The next train of each list that runs today is
// marked and the ones already gone today are dimmed. Two switches: only the trains that run today, and whether the special trains are shown.
// It is the TIMETABLE (src/lib/live/railway.ts reads RailRadar's station timetable and checks it), not live running status: the card says so, says when it was fetched, names its source and links the official live enquiry.
// Nothing typed is sent anywhere: the request carries nothing, and the plant's API key never leaves the server.
"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { LiveGate, SourceLine } from "@/components/tools/live/LivePieces";
import { clock, daysChip, DAYS, filterTrains, NTES_URL, nextTrain, RAILRADAR_SITE, STATION, type Group, type Moment, type Railway, type Train } from "@/lib/live/railway";
import { until } from "@/lib/live/flights";

export const RAILWAY_REFRESH_MS = 60 * 60 * 1000;

/** the time and the day of the week now at Durgapur */
export const momentNow = (): Moment => { const t = DateTime.now().setZone(STATION.zone); return { hm: t.toFormat("HH:mm"), day: DAYS[t.weekday - 1] }; };

/** the clock of the card (its own small state, ticking every half minute, so that the lists are not redrawn by anything else) */
function useClock(): Moment {
  const [t, setT] = useState(momentNow);
  useEffect(() => { const id = setInterval(() => setT((old) => { const n = momentNow(); return n.hm === old.hm && n.day === old.day ? old : n; }), 30_000); return () => clearInterval(id); }, []);
  return t;
}

const TRIM = "supports-[text-box:trim-start_cap_alphabetic]:[text-box:trim-start_cap_alphabetic]";
/** THE HEADROOM OF A TRIMMED TITLE. The trim puts the top of the box at the height of a capital, and a title that is cut with an ellipsis (overflow hidden) would shave whatever stands higher: in Poppins the tops of b, d, h, k, l (4% of the size above a capital), the dot of i and the tops of f and j (10%). So the box gets 0.12 em of room above it and the same amount of negative margin, which leaves the text exactly where it was and lets those tops show. Measured on the card: a render with the clipping on differs from one with it off in the tops of those letters; with the headroom they are the same. */
const HEADROOM = "pt-[0.12em] -mt-[0.12em]";

/** one train. The top of the time and the top of the first line are one row of pixels (the same trimming as the flights card: the room above a capital is trimmed from both, the time let down 0.05 em for Poppins' round digits). */
function Row({ t, now, next }: { t: Train; now: Moment; next: boolean }) {
  const runsToday = t.days.includes(now.day);
  const gone = runsToday && clock(t) < now.hm;
  const chip = daysChip(t.days);
  const main = t.departure ?? t.arrival;
  const under = t.arrival && t.departure ? `arr ${t.arrival}` : t.departure ? "starts here" : "ends here";
  return (
    <li className={`flex items-baseline gap-3 rounded-xl border px-3 py-2.5 supports-[text-box:trim-start_cap_alphabetic]:items-start ${next ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-white"} ${gone ? "opacity-55" : ""}`} aria-current={next ? "true" : undefined}>
      <span className="w-[4.25rem] shrink-0">
        <span className={`relative top-[0.05em] block text-lg font-extrabold leading-none tabular-nums text-slate-900 ${TRIM}`}>{main}</span>
        <span className="mt-1 block text-[11px] font-semibold tabular-nums text-slate-500">{under}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold leading-snug text-slate-800 ${HEADROOM} ${TRIM}`} title={t.name}>{t.name}</span>
        <span className="mt-[calc(0.125rem-0.12em)] block truncate pt-[0.12em] text-xs text-slate-500" title={`${t.from} (${t.fromCode}) to ${t.to} (${t.toCode})`}>{t.number} · {t.label} · {t.fromCode} → {t.toCode}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span title={chip.title} className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">{chip.text}</span>
          {t.kind === "special" && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-bold text-fuchsia-800" title="A special train (festival, Puja, Chhath or on demand), not in the regular timetable">Special</span>}
        </span>
      </span>
      {next && <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white">Next · {until(now.hm, clock(t))}</span>}
    </li>
  );
}

function Column({ title, list, now, empty }: { title: string; list: Train[]; now: Moment; empty: string }) {
  const next = nextTrain(list, now);
  return (
    <section aria-label={title}>
      <h5 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-slate-800">{title}<span className="rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">{list.length}</span></h5>
      {list.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-sm text-slate-600">{empty}</p> : (
        // a scrolling list must be reachable by keyboard to be scrolled (the arrow keys), so it takes focus
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <ol tabIndex={0} aria-label={`${title}: list of trains`} className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
          {list.map((t) => <Row key={`${t.number}-${clock(t)}`} t={t} now={now} next={t === next} />)}
        </ol>
      )}
    </section>
  );
}

const TO_HOWRAH = "Towards Barddhaman and Howrah";
const FROM_HOWRAH = "Towards Asansol and beyond";

function Section({ title, group, now, filters, note }: { title: string; group: Group; now: Moment; filters: { today: Day2; specials: boolean }; note?: string }) {
  const opts = { today: filters.today, specials: filters.specials };
  const east = filterTrains(group.east, opts), west = filterTrains(group.west, opts), other = filterTrains(group.other, opts);
  return (
    <section aria-label={title} className="mt-5 first:mt-0">
      <h4 className="mb-2 text-base font-extrabold text-slate-900">{title}</h4>
      {note && <p className="mb-2 text-xs leading-snug text-slate-500">{note}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Column title={TO_HOWRAH} list={east} now={now} empty="None with these switches." />
        <Column title={FROM_HOWRAH} list={west} now={now} empty="None with these switches." />
      </div>
      {other.length > 0 && (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Other through trains <span className="rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">{other.length}</span> <span className="font-normal text-slate-500">(the timetable does not say which way they run past Durgapur; each shows where it starts and ends)</span></summary>
          <ol className="mt-2 space-y-1.5">{other.map((t) => <Row key={`${t.number}-${clock(t)}`} t={t} now={now} next={false} />)}</ol>
        </details>
      )}
    </section>
  );
}

type Day2 = Moment["day"] | null;

function Switch({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${on ? "border-rose-400 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700"}`}>{children}</button>;
}

export function RailwayBody({ data, now, todayOnly = false, specials = true }: { data: Railway; now: Moment; todayOnly?: boolean; specials?: boolean }) {
  const [onlyToday, setOnlyToday] = useState(todayOnly);
  const [withSpecials, setWithSpecials] = useState(specials);
  const filters = { today: onlyToday ? now.day : null, specials: withSpecials };
  return (
    <div>
      <p className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-snug text-rose-900">
        <strong>{STATION.name} Railway Station</strong> ({STATION.code}): the trains that stop here, {data.count} in all. Each shows its time <strong>at Durgapur</strong>: the departure in large figures and the arrival under it (a train that starts or ends here shows only one). Times are Indian time; it is <strong className="tabular-nums">{now.hm}</strong> now. The days are the days the train is <strong>at Durgapur</strong>.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Which trains to show">
        <Switch on={onlyToday} onClick={() => setOnlyToday((v) => !v)}>Only trains that run today</Switch>
        <Switch on={withSpecials} onClick={() => setWithSpecials((v) => !v)}>Special trains</Switch>
      </div>
      <Section title="Express and mail trains" group={data.express} now={now} filters={filters} />
      <Section title="Local trains (MEMU)" group={data.local} now={now} filters={filters} note="The local passenger trains, in both directions." />
      <p className="mt-4 text-xs leading-snug text-slate-500">This is the <strong>timetable, not live running status</strong>: it does not show a delay, a cancellation or a platform, and the railway revises timings and runs extra trains, so check on the day. The days of running are worked out from the train&apos;s starting station and moved on to the day it reaches Durgapur; the direction is taken from where each train starts and ends (for a few, from its route), and the trains in the first list include the few that go on to Suri and Malda instead of Howrah. For live running, use the Indian Railways enquiry (NTES) below.</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <a href={NTES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">Live running status (NTES, Indian Railways) <ExternalLink size={11} aria-hidden="true" /></a>
        <a href={RAILRADAR_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">RailRadar <ExternalLink size={11} aria-hidden="true" /></a>
      </p>
    </div>
  );
}

export function RailwayCard() {
  const { state, env, error, reload } = useLive<Railway>("/api/live/railway", true, { refreshMs: RAILWAY_REFRESH_MS });
  const now = useClock();
  return (
    <div>
      <LiveGate state={state} error={error} reload={reload} what="the trains">
        {env && (
          <>
            <RailwayBody data={env.data} now={now} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}
