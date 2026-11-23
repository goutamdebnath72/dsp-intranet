// src/tools/railway/AsansolPanel.tsx
//
// THE SECOND TAB OF THE RAILWAY CARD: ASANSOL RAILWAY JUNCTION (ASN), the trains a person at Durgapur can only have by going to Asansol. I show two lists side by side, as the Durgapur tab has its two directions:
//   * trains that pass Durgapur WITHOUT stopping and stop at Asansol (take them from Asansol);
//   * trains that do not go over Durgapur at all and stop at Asansol.
// A train that stops at Durgapur too is not here (it can be had at Durgapur). The local (MEMU) trains of Asansol are below, in violet, as on the Durgapur tab. Each train shows its time AT ASANSOL (the departure large,
// the arrival under it), its name and number, where it starts and ends, and the days it is at Asansol, and the saved FARES FROM ASANSOL (₹ Fares: to the end of its run, and to every stop after Asansol), as at Durgapur.
// It is the timetable, not live running status; the data and its checks are in src/lib/live/railwayAsansol.ts.
// I ask for the tab's data only when the tab is opened (src/tools/railway/RailwayTabs.tsx mounts this panel then). Nothing typed is sent anywhere.
"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { LiveGate, SourceLine } from "@/components/tools/live/LivePieces";
import { NTES_URL, RAILRADAR_SITE, type Moment, type Train } from "@/lib/live/railway";
import { filterAsansol, type AsansolTrain, type AsansolTrains, type Via } from "@/lib/live/railwayAsansol";
import { Column, RAILWAY_REFRESH_MS, Switch } from "./RailwayCard";
import { ShortForms } from "./Fares";
import { FareFinder } from "./FareFinder";

const VIA_CHIP: Record<Via, { text: string; title: string; cls: string }> = {
  pass: { text: "Passes Durgapur, no stop", title: "This train runs over Durgapur without stopping there: to take it, go to Asansol", cls: "bg-rose-100 text-rose-800" },
  away: { text: "Not via Durgapur", title: "This train does not go over Durgapur at all: it is not in Durgapur's timetable", cls: "bg-slate-200 text-slate-700" },
};
const viaChip = (t: Train) => { const c = VIA_CHIP[(t as AsansolTrain).via]; return <span data-via={(t as AsansolTrain).via} title={c.title} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>{c.text}</span>; };

export function AsansolBody({ data, now, todayOnly = false, specials = true }: { data: AsansolTrains; now: Moment; todayOnly?: boolean; specials?: boolean }) {
  const [onlyToday, setOnlyToday] = useState(todayOnly);
  const [withSpecials, setWithSpecials] = useState(specials);
  const f = { today: onlyToday ? now.day : null, specials: withSpecials };
  const pass = filterAsansol(data.express, { ...f, via: "pass" }), away = filterAsansol(data.express, { ...f, via: "away" }), local = filterAsansol(data.local, f);
  return (
    <div data-asansol-panel>
      <p className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-snug text-rose-900">
        <strong>Asansol Railway Junction</strong> (ASN): the {data.count} trains that stop at Asansol and <strong>do not stop at Durgapur</strong>, so a person at Durgapur has to go to Asansol to take them: {data.pass} run over Durgapur without stopping, and {data.away} do not go over Durgapur at all. A train that stops at Durgapur too is not listed here. Each shows its time <strong>at Asansol</strong> (&ldquo;here&rdquo; below means Asansol): the departure in large figures and the arrival under it. Times are Indian time; it is <strong className="tabular-nums">{now.hm}</strong> now. The days are the days the train is <strong>at Asansol</strong>. Press <strong>₹ Fares</strong> on a train for its fares <strong>from Asansol</strong> to the end of its run, and to every stop after Asansol.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Which trains to show">
        <Switch on={onlyToday} onClick={() => setOnlyToday((v) => !v)}>Only trains that run today</Switch>
        <Switch on={withSpecials} onClick={() => setWithSpecials((v) => !v)}>Special trains</Switch>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600" data-legend>
        <span><span className="rounded bg-amber-100 px-1 font-bold text-amber-900 ring-1 ring-inset ring-amber-300">Amber</span> = a junction (several lines meet; a place to change trains)</span>
        <span><span className="rounded bg-cyan-600 px-1.5 py-px text-[10px] font-extrabold text-white">VANDE BHARAT</span> <span className="rounded bg-indigo-600 px-1.5 py-px text-[10px] font-extrabold text-white">SHATABDI</span> = the premium trains</span>
        <span><span className="rounded bg-violet-600 px-1.5 py-0.5 text-[11px] font-extrabold text-white">MEMU</span> violet panel = the local trains</span>
      </p>
      <FareFinder now={now} onlyToday={onlyToday} specials={withSpecials} from="ASN" />
      <h4 className="mb-2 text-base font-extrabold text-slate-900">Express, mail and special trains</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <Column title="Pass Durgapur without stopping" sub="They run over Durgapur and stop at Asansol (42 km on by rail, as RailRadar measures it): take them from Asansol." list={pass} now={now} empty="None with these switches." tone="express" origin="ASN" extra={viaChip} />
        <Column title="Do not go over Durgapur" sub="They stop at Asansol and go another way (towards Gomoh, Adra, Tatanagar, Andal, Sainthia...), or start or end at Asansol." list={away} now={now} empty="None with these switches." tone="express" origin="ASN" extra={viaChip} />
      </div>
      <section aria-label="Local trains (MEMU) of Asansol" className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4" data-tone="local">
        <h4 className="mb-2 flex items-center gap-2 text-base font-extrabold text-violet-900"><span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">MEMU</span>Local trains of Asansol that do not stop at Durgapur</h4>
        <Column title="Local trains (MEMU)" list={local} now={now} empty="None with these switches." tone="local" origin="ASN" extra={viaChip} />
      </section>
      <ShortForms />
      <p className="mt-3 text-xs leading-snug text-slate-500">This is the <strong>timetable, not live running status</strong>: it does not show a delay, a cancellation or a platform, and the railway revises timings and runs extra trains, so check on the day. A train is listed here when it stops at Asansol and does not stop at Durgapur, as RailRadar&apos;s timetables of the two stations have it; whether it passes Durgapur is taken from Durgapur&apos;s timetable, which lists the trains that go through without stopping. The days are worked out from the train&apos;s starting station and moved on to the day it reaches Asansol. For live running, use the Indian Railways enquiry (NTES) below.</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <a href={NTES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">Live running status (NTES, Indian Railways) <ExternalLink size={11} aria-hidden="true" /></a>
        <a href={RAILRADAR_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-700 hover:underline">RailRadar <ExternalLink size={11} aria-hidden="true" /></a>
      </p>
    </div>
  );
}

export function AsansolPanel({ now }: { now: Moment }) {
  const { state, env, error, reload } = useLive<AsansolTrains>("/api/live/railway-asn", true, { refreshMs: RAILWAY_REFRESH_MS });
  return (
    <LiveGate state={state} error={error} reload={reload} what="the trains of Asansol">
      {env && (
        <>
          <AsansolBody data={env.data} now={now} />
          <SourceLine env={env} reload={reload} loading={state === "loading"} />
        </>
      )}
    </LiveGate>
  );
}
