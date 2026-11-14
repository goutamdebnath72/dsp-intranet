// src/tools/railway/FareFinder.tsx
//
// "FIND A FARE": the user says where they are going from Durgapur and sees every train that goes there with its fare for each class. The fares to every stop were collected and SAVED while the plant's paid fare service lasted
// (src/lib/live/fareLegStore.ts), so this asks only the database (src/app/api/live/railway-fare-find): nothing is asked of RailRadar's fare service, and nothing is requested until the box is opened. The list of stations is
// the stations that have a saved fare; the choice is made in the tools' own searchable dropdown. Results follow the card's two switches (only trains that run today; specials) and can be ordered by time or by price.
// What is said honestly: the date of the OLDEST fare shown, that fares have been collected for X of Y trains (so a train may be missing), that a local train's figure is an estimate from the fare table, and the disclaimer.
"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { ToolSelect, type SelectOption } from "@/components/tools/toolKit";
import { cheapest, type FindAnswer, type FindTrain, type StopsAnswer } from "@/lib/live/fareFind";
import { daysChip, type Moment } from "@/lib/live/railway";
import { FareDisclaimer, FareSource, ReceivedLine, rupees } from "./Fares";
import { PREMIUM } from "./premium";
import { stationLabel } from "./stations";

export type SortBy = "time" | "price";

/** the trains that pass the card's switches, in the order asked for */
export function shownTrains(trains: FindTrain[], opts: { today: Moment["day"] | null; specials: boolean; sort: SortBy }): FindTrain[] {
  const list = trains.filter((t) => (opts.specials || t.kind !== "special") && (!opts.today || t.days.length === 0 || t.days.includes(opts.today)));
  return opts.sort === "price" ? [...list].sort((a, b) => cheapest(a) - cheapest(b) || a.number.localeCompare(b.number)) : list;
}

const money = (c: FindTrain["classes"][number]) => <>{c.basis === "table" && <span className="mr-0.5 text-[9px] font-bold text-slate-400">about</span>}{rupees(c.total)}{c.high ? `–${c.high.toLocaleString("en-IN")}` : ""}</>;

export function FindRow({ t }: { t: FindTrain }) {
  const premium = PREMIUM[t.label];
  const local = t.kind === "local";
  const chip = t.days.length ? daysChip(t.days) : null;
  const time = t.departure ?? t.arrival;
  return (
    <li data-find-train={t.number} className={`flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border px-3 py-2 ${premium ? premium.row : local ? "border-violet-100 bg-white" : "border-slate-100 bg-white"}`}>
      <span className="w-[3.6rem] shrink-0">
        <span className="block text-base font-extrabold tabular-nums leading-tight text-slate-900">{time ?? "–"}</span>
        {t.departure && t.arrival && <span className="block text-[10px] font-semibold tabular-nums text-slate-500">arr {t.arrival}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold ${local ? "text-violet-900" : "text-slate-800"}`} title={t.name}>{t.name}</span>
        <span className="block text-[11px] text-slate-500">
          {t.number} · {premium ? <span className={`rounded px-1.5 py-px text-[10px] font-extrabold tracking-wide ${premium.badge}`}>{premium.text}</span> : t.label || "train"}
          {t.endsAt && <> · runs on to {stationLabel(t.endsAt.code, t.endsAt.name).name}</>} · {Math.round(t.distanceKm).toLocaleString("en-IN")} km
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {chip && <span title={chip.title} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${local ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{chip.text}</span>}
          {t.kind === "special" && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-800">Special</span>}
        </span>
      </span>
      <ul className="flex w-full flex-wrap gap-1 sm:w-auto sm:max-w-[55%] sm:justify-end" aria-label={`Fares of ${t.name}`}>
        {t.classes.map((c) => (
          <li key={c.code} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] tabular-nums" title={c.name} data-fare-class={c.code}>
            <span className="font-bold text-slate-500">{c.code}</span> <span className="font-extrabold text-slate-900">{money(c)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** the result for a station: the list, the date of the oldest fare, how much has been collected, the disclaimer */
export function FindResults({ answer, now, onlyToday, specials, sort }: { answer: FindAnswer; now: Moment; onlyToday: boolean; specials: boolean; sort: SortBy }) {
  const list = shownTrains(answer.trains, { today: onlyToday ? now.day : null, specials, sort });
  const stop = stationLabel(answer.stop.code, answer.stop.name);
  const anyHint = answer.trains.some((t) => t.hint), allHint = answer.trains.every((t) => t.hint);
  const partial = answer.coverage.withLegs < answer.coverage.withFares;
  return (
    <div className="min-w-0 max-w-full" data-find-results>
      <p className="mt-2 text-xs font-bold text-slate-800">{answer.trains.length} train{answer.trains.length === 1 ? "" : "s"} go from Durgapur to {stop.name} ({stop.code}){list.length !== answer.trains.length && <span className="font-semibold text-slate-500"> · {list.length} shown with the switches above</span>}</p>
      <ReceivedLine receivedAt={answer.receivedAt} frozen={answer.frozen} hint={allHint} />
      {list.length === 0
        ? <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700">No train matches the switches above (only trains that run today; special trains). Switch one off to see them.</p>
        : <ol className="relative mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label={`Trains from Durgapur to ${stop.name}`}>{list.map((t) => <FindRow key={t.number} t={t} />)}</ol>}
      {partial && <p className="mt-1.5 text-[11px] text-slate-500" data-coverage>Collected for {answer.coverage.withLegs} of {answer.coverage.withFares} trains so far: others may be missing.</p>}
      {anyHint && <p className="mt-1 text-[11px] text-slate-500" data-find-hint>&ldquo;about&rdquo; = estimate (local train).</p>}
      <FareDisclaimer />
      <FareSource reservation={!allHint} table={anyHint} />
    </div>
  );
}

function FinderOpen({ now, onlyToday, specials }: { now: Moment; onlyToday: boolean; specials: boolean }) {
  const stops = useLive<StopsAnswer>("/api/live/railway-fare-find?stops=1", true);
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortBy>("time");
  const res = useLive<FindAnswer>(`/api/live/railway-fare-find?to=${encodeURIComponent(to || "-")}`, to !== "");
  const options: SelectOption[] = useMemo(() => (stops.env?.data.stops ?? []).map((s) => ({ id: s.code, label: stationLabel(s.code, s.name).name, hint: `${s.code} · ${s.trains} train${s.trains === 1 ? "" : "s"}` })), [stops.env]);
  return (
    <div className="mt-3 min-w-0 max-w-full">
      {stops.state === "loading" && <p className="flex items-center gap-2 text-xs text-slate-600" aria-busy="true"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading the stations…</p>}
      {stops.state === "error" && <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700">{stops.error || "The stations could not be listed."} <button type="button" onClick={stops.reload} className="ml-1 font-bold text-slate-800 underline">Try again</button></p>}
      {options.length > 0 && (
        <>
          <span className="block text-[11px] font-bold text-slate-600">Going from Durgapur to</span>
          <ToolSelect value={to} options={options} onChange={setTo} ariaLabel="Station to go to" tone="rose" placeholder="Choose a station (type to search)…" className="mt-1 max-w-md" />
          <p className="mt-1 text-[11px] text-slate-500">{options.length} stations with a saved fare: every stop after Durgapur on a train&apos;s route.</p>
        </>
      )}
      {to && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Order the trains">
            {(["time", "price"] as const).map((k) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${sort === k ? "border-rose-400 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-rose-300"}`}>{k === "time" ? "By time at Durgapur" : "Cheapest first"}</button>)}
          </div>
          {res.state === "loading" && <p className="mt-2 flex items-center gap-2 text-xs text-slate-600" aria-busy="true"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Finding the trains…</p>}
          {res.state === "error" && <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700">{res.error || "No fares could be shown."}</p>}
          {res.state === "ok" && res.env && res.env.data.stop.code === to && <FindResults answer={res.env.data} now={now} onlyToday={onlyToday} specials={specials} sort={sort} />}
        </div>
      )}
    </div>
  );
}

/** the finder: closed until asked for (so a page of trains makes no request), then the station box */
export function FareFinder({ now, onlyToday, specials }: { now: Moment; onlyToday: boolean; specials: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Find a fare" className="mb-3 min-w-0 max-w-full rounded-2xl border border-rose-200 bg-white/80 p-3" data-finder>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-800 hover:bg-rose-100" data-finder-button><Search size={13} aria-hidden="true" /> {open ? "Close the fare finder" : "₹ Find a fare to a station"}</button>
        {!open && <span className="text-[11px] text-slate-500">Where are you going from Durgapur? Every train that goes there, with its fare for each class.</span>}
      </div>
      {open && <FinderOpen now={now} onlyToday={onlyToday} specials={specials} />}
    </section>
  );
}
