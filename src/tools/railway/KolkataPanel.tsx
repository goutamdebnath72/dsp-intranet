// src/tools/railway/KolkataPanel.tsx
//
// THE THIRD TAB OF THE RAILWAY CARD: THE TRAINS OF THE KOLKATA STATIONS. They start at Howrah (HWH), Sealdah (SDAH), Santragachi (SRC) or Kolkata (KOAA), go over neither Durgapur nor Asansol, and touch none of the OTHER three
// of the four (the owner's rule; src/lib/live/kolkataView.ts applies it and keeps the trains it left out, which this tab lists so that nothing is hidden unseen). A picker of the four stations is on top, each with its count; the
// station chosen shows its mail, express and special trains in the order of the clock AT THE STATION (the departure large, as on the other tabs), and its local and suburban trains below in violet, as on the other tabs.
// Each express train has its saved FARES from the station (to the end of its run, and to every stop), and the card has the same "find a fare to a station" box, limited to the trains of the station. The local trains have no fare here,
// and the tab says why. All of it is read from the database (src/app/api/live/railway-kol): the trains and fares were saved while the plant's paid RailRadar month lasted and are NOT refreshed, so the tab says when they were saved.
// It is the saved timetable, not live running status. I ask for a station's trains only when the tab is opened (RailwayTabs.tsx mounts this panel then), and again when another station is chosen. Nothing typed is sent anywhere.
// Sizes are in rem and the rows wrap: nothing here has a fixed pixel width, so a larger text size or a long train name changes the layout and does not break it.
"use client";

import React, { useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { NTES_URL, RAILRADAR_SITE, filterTrains, type Moment, type Train } from "@/lib/live/railway";
import { durationText, STARTS, type FareState, type KolkataAnswer, type KolStation, type KolTrain, type StartCode } from "@/lib/live/kolkataView";
import { Column, Switch } from "./RailwayCard";
import { daysAgo, OLD_AFTER_DAYS, ShortForms } from "./Fares";
import { FareFinder } from "./FareFinder";
import { stationLabel } from "./stations";

const when = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" }).toFormat("ccc d LLL yyyy");
const startOf = (code: string) => STARTS.find((s) => s.code === code)!;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The words for a train that has no saved fare, and what they mean. A train with a saved fare gets the ₹ Fares button instead. */
const NO_FARE: Record<Exclude<FareState, "saved">, { text: string; title: string }> = {
  none: { text: "No fare sold", title: "The railway's reservation system sold no ticket for this train when its fare was asked, so there is no fare to show" },
  "not-sold": { text: "Not on reservation", title: "The railway's reservation system does not sell tickets for this train, so there is no reserved fare to show" },
  "not-collected": { text: "Fare not collected", title: "This train is sold by the reservation system, but its fare was not collected while the paid month lasted" },
};

/** The two chips after a train's days: how far and how long it runs, and, for a train with no saved fare, why it has none. */
function trainChips(t: Train) {
  const k = t as KolTrain;
  const run = [k.km ? `${Math.round(k.km).toLocaleString("en-IN")} km` : "", durationText(k.durationMin)].filter(Boolean).join(" · ");
  const no = k.fare !== "saved" && k.kind !== "local" ? NO_FARE[k.fare] : null;
  return (
    <>
      {run && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-600" title="Distance and time of the whole run, from the starting station to the end">{run}</span>}
      {no && <span data-no-fare={k.fare} title={no.title} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-500">{no.text}</span>}
    </>
  );
}

/** THE PICKER OF THE FOUR STATIONS: one card each (name, code, its own full name, the counts), chosen with the mouse or the arrow keys. The cards share the width and wrap, so a long name or a larger text size makes more rows. */
export function StationPicker({ stations, value, onPick }: { stations: KolStation[]; value: StartCode; onPick: (c: StartCode) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = stations[(stations.findIndex((s) => s.code === value) + step + stations.length) % stations.length].code;
    onPick(next);
    requestAnimationFrame(() => document.getElementById(`kolkata-station-${next}`)?.focus());
  };
  return (
    <div role="tablist" aria-label="Starting station" className="mb-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))]" data-kolkata-picker>
      {stations.map((s) => {
        const st = startOf(s.code), on = s.code === value, place = stationLabel(s.code, st.full);
        return (
          <button key={s.code} type="button" role="tab" id={`kolkata-station-${s.code}`} aria-selected={on} aria-controls="kolkata-station-panel" tabIndex={on ? 0 : -1} onClick={() => onPick(s.code)} onKeyDown={onKey} data-station={s.code}
            className={`min-w-0 rounded-2xl border px-3 py-2.5 text-left transition ${on ? "border-rose-400 bg-rose-50 shadow-sm ring-2 ring-rose-200" : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/40"}`}>
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className={`text-base font-extrabold leading-tight ${on ? "text-rose-900" : "text-slate-900"}`}>{st.name}</span>
              <abbr title={`Railway station code ${s.code}`} className="text-xs font-bold tracking-wide text-slate-400 no-underline">{s.code}</abbr>
            </span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug text-slate-500">{place.name}{place.place ? `, ${place.place}` : ""}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.6875rem] font-bold text-sky-800" title="Mail, express and special trains"><span className="tabular-nums">{s.express}</span> express</span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.6875rem] font-bold text-violet-800" title="Local and suburban trains"><span className="tabular-nums">{s.local}</span> local</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** THE LAST LINE OF HONESTY: when the records were saved and, for the fares, when they were received. The paid month collected them once and nothing refreshes them, so an old date is said in amber with what to do. */
export function SavedLine({ savedAt, fareAt, now }: { savedAt: string; fareAt: string | null; now?: DateTime }) {
  const a = daysAgo(savedAt, now), f = fareAt ? daysAgo(fareAt, now) : null;
  const old = a.n > OLD_AFTER_DAYS || (f !== null && f.n > OLD_AFTER_DAYS);
  return (
    <div className={`mb-3 rounded-xl border px-3 py-2 text-xs leading-snug ${old ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} data-saved-line data-old={old ? "true" : "false"}>
      <p><strong>Timetable saved from RailRadar on {when(savedAt)}</strong> ({a.text}){fareAt && <> · <strong>fares received on {when(fareAt)}</strong> ({f!.text})</>}. These are saved copies: nothing refreshes them now that the plant&apos;s paid RailRadar month is over.</p>
      {old && <p className="mt-0.5 font-semibold">They are {Math.max(a.n, f?.n ?? 0)} days old, so a time or a fare may have changed. Check NTES and IRCTC.</p>}
    </div>
  );
}

/** THE TRAINS THE RULE LEFT OUT, for the station: each with the other station it touches. Closed until asked for. */
export function LeftOutList({ data }: { data: KolkataAnswer }) {
  if (data.leftOut.length === 0) return null;
  const st = startOf(data.station);
  const others = [...new Set(data.leftOut.flatMap((l) => l.also))];
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white/70 px-3 py-2" data-left-out>
      <summary className="cursor-pointer text-sm font-bold text-slate-700">Left out: {data.leftOut.length} {st.name} train{data.leftOut.length === 1 ? "" : "s"} that also touch {list(others.map((c) => startOf(c).name))}</summary>
      <p className="mt-2 text-xs leading-snug text-slate-600">A train is listed under a station only when it does not stop at, or pass through, any of the other three stations of this tab. These trains start at {st.name} but touch another of them, so they are not in the lists above. Nothing is wrong with them: they are only outside the rule.</p>
      <ol className="relative mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
        {data.leftOut.map((l) => (
          <li key={l.number} className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-xs" data-left-out-train={l.number}>
            <span className="font-bold text-slate-800">{l.name}</span> <span className="text-slate-500">{l.number} · {l.type}</span>
            <span className="block text-slate-600">to {l.to} · also at <strong className="text-slate-800">{list(l.also.map((c) => `${startOf(c).name} (${c})`))}</strong></span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Skeleton() {
  return <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Fetching the trains of the station">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" />)}</div>;
}

export function KolkataBody({ data, station, onStation, now, busy = false, todayOnly = false, specials = true }: { data: KolkataAnswer; station: StartCode; onStation: (c: StartCode) => void; now: Moment; busy?: boolean; todayOnly?: boolean; specials?: boolean }) {
  const [onlyToday, setOnlyToday] = useState(todayOnly);
  const [withSpecials, setWithSpecials] = useState(specials);
  const f = { today: onlyToday ? now.day : null, specials: withSpecials };
  const here = data.station === station && !busy;
  const st = startOf(station);
  const total = data.stations.reduce((n, s) => n + s.express + s.local, 0);
  const express = here ? filterTrains(data.express, f) : [], local = here ? filterTrains(data.local, f) : [];
  const fareOf = (t: Train) => (t as KolTrain).fare === "saved";
  return (
    <div data-kolkata-panel>
      <p className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-snug text-rose-900">
        <strong>The Kolkata stations</strong> (Howrah HWH, Sealdah SDAH, Santragachi SRC and Kolkata KOAA): the {total} trains that <strong>start</strong> at one of them, <strong>do not go over Durgapur or Asansol</strong>, and <strong>do not touch any other</strong> of these four stations (a Howrah train that goes through Santragachi is not listed). Choose a station: each train shows its time <strong>at that station</strong> (the departure, in large figures) and the days it leaves there. Times are Indian time; it is <strong className="tabular-nums">{now.hm}</strong> now. Press <strong>₹ Fares</strong> on a train for its saved fares from the station.
      </p>
      <StationPicker stations={data.stations} value={station} onPick={onStation} />
      <div role="tabpanel" id="kolkata-station-panel" aria-labelledby={`kolkata-station-${station}`} data-station-panel={station}>
        {!here ? <Skeleton /> : (
          <>
            <SavedLine savedAt={data.savedAt} fareAt={data.fareAt} />
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Which trains to show">
              <Switch on={onlyToday} onClick={() => setOnlyToday((v) => !v)}>Only trains that run today</Switch>
              <Switch on={withSpecials} onClick={() => setWithSpecials((v) => !v)}>Special trains</Switch>
            </div>
            <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600" data-legend>
              <span><span className="rounded bg-amber-100 px-1 font-bold text-amber-900 ring-1 ring-inset ring-amber-300">Amber</span> = a junction (several lines meet; a place to change trains)</span>
              <span><span className="rounded bg-cyan-600 px-1.5 py-px text-[0.625rem] font-extrabold text-white">VANDE BHARAT</span> <span className="rounded bg-indigo-600 px-1.5 py-px text-[0.625rem] font-extrabold text-white">SHATABDI</span> = the premium trains</span>
              <span><span className="rounded bg-violet-600 px-1.5 py-0.5 text-[0.6875rem] font-extrabold text-white">LOCAL</span> violet panel = the local and suburban trains</span>
            </p>
            <FareFinder key={station} now={now} onlyToday={onlyToday} specials={withSpecials} from={station} />
            <h4 className="mb-2 text-base font-extrabold text-slate-900">Express, mail and special trains of {st.name}</h4>
            <Column title={`Leaving ${st.name}`} sub={`${data.express.filter(fareOf).length} of the ${data.express.length} have saved fares from ${st.name}; a train without one says why. The next train that runs today is marked.`} list={express} now={now} empty="None with these switches." tone="express" origin={station} fares={fareOf} extra={trainChips} />
            <section aria-label={`Local trains of ${st.name}`} className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4" data-tone="local">
              <h4 className="mb-2 flex items-center gap-2 text-base font-extrabold text-violet-900"><span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[0.6875rem] font-extrabold tracking-wide text-white">LOCAL</span>Local and suburban trains of {st.name}</h4>
              <p className="mb-2 text-xs leading-snug text-violet-900">Most of these have no fare here: the reservation system sells no ticket for them, and the railway fare table this card uses is for ordinary trains, not for Kolkata&apos;s suburban lines. Ask at the counter. The few that the reservation system does sell have ₹ Fares, as the express trains do.</p>
              <Column title={`Leaving ${st.name}`} list={local} now={now} empty={data.local.length === 0 ? `No local or suburban train starts at ${st.name} without touching another of the four stations.` : "None with these switches."} tone="local" origin={station} fares={fareOf} reserved extra={trainChips} />
            </section>
            <LeftOutList data={data} />
          </>
        )}
      </div>
      <ShortForms more={[["HWH", "Howrah Junction"], ["SDAH", "Sealdah"], ["SRC", "Santragachi Junction"], ["KOAA", "Kolkata (Chitpur)"]]} />
      <p className="mt-3 text-xs leading-snug text-slate-500">This is the <strong>saved timetable, not live running status</strong>: it does not show a delay, a cancellation or a platform, and the railway revises timings and runs extra trains, so check on the day. A train is in a list when it starts at that station (RailRadar&apos;s record of the train says so), its whole route has neither Durgapur nor Asansol, and neither its stops nor its station boards put it at another of the four stations. The days are the days the train leaves its starting station. For live running, use the Indian Railways enquiry (NTES) below.</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <a href={NTES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">Live running status (NTES, Indian Railways) <ExternalLink size={11} aria-hidden="true" /></a>
        <a href={RAILRADAR_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">RailRadar <ExternalLink size={11} aria-hidden="true" /></a>
      </p>
    </div>
  );
}

export function KolkataPanel({ now, start = "HWH" }: { now: Moment; start?: StartCode }) {
  const [station, setStation] = useState<StartCode>(start);
  const { state, env, error, reload } = useLive<KolkataAnswer>(`/api/live/railway-kol?from=${station}`, true);
  // a failure for the station just chosen: the answer of the one before is still held, but it is not this station's
  const failed = error !== "" && (!env || env.data.station !== station);
  if (!env || failed) {
    return failed ? (
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0"><p className="font-bold">The trains of the Kolkata stations cannot be shown just now</p><p>{error} Nothing is shown rather than a wrong list.</p>
          <button type="button" onClick={reload} className="mt-1 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 font-bold text-amber-800">Try again</button></div>
      </div>
    ) : <Skeleton />;
  }
  return <KolkataBody data={env.data} station={station} onStation={setStation} now={now} busy={state === "loading"} />;
}
