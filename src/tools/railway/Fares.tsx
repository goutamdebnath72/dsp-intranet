// src/tools/railway/Fares.tsx
//
// THE FARES OF ONE TRAIN, opened from the "Fares" button on its row. FareBox asks the server (src/app/api/live/railway-fare) only when it is opened: the answer is the SAVED fares of the train (database, src/lib/live/fareStore.ts) with the date they were received, said first by ReceivedLine, because the paid fare service is used for one month only; FareTable is the
// plain picture of an answer. The words are the point: the figures are the railway reservation system's own for the day named, called APPROXIMATE (they can differ on the day), the source is named and linked, the unreserved
// fare is said to be missing (never made up) and a class the train does not have is not listed.
"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { CLASSES, LOCAL_CLASS, type FareSet } from "@/lib/live/fare";
import type { FareAnswer, LegsAnswer } from "@/lib/live/fareService";
import { ORDINARY_SOURCE } from "@/lib/live/ordinaryFare";
import { RAILRADAR_SITE } from "@/lib/live/railway";
import { stationLabel } from "./stations";

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const when = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" }).toFormat("ccc d LLL yyyy");

/** how long ago the fares were received, in whole days of Indian time ("today", "yesterday", "5 days ago") */
export function daysAgo(receivedAt: string, now: DateTime = DateTime.now()): { n: number; text: string } {
  const a = DateTime.fromISO(receivedAt).setZone("Asia/Kolkata").startOf("day");
  const n = Math.max(0, Math.round(now.setZone("Asia/Kolkata").startOf("day").diff(a, "days").days));
  return { n, text: n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago` };
}

/** fares older than this many days are called old on the card, even while the service is refreshing them */
export const OLD_AFTER_DAYS = 7;

/** THE DATE THE FARES WERE LAST RECEIVED, said first and plainly (the paid service is used for one month and the fares are saved): green while they are fresh, amber when they are old or are no longer refreshed */
export function ReceivedLine({ receivedAt, frozen, now, hint = false }: { receivedAt: string; frozen: boolean; now?: DateTime; hint?: boolean }) {
  const ago = daysAgo(receivedAt, now);
  // a hint is worked out from a fixed table and a distance, which do not age as a fare does: it is never called old or frozen
  const old = !hint && (frozen || ago.n > OLD_AFTER_DAYS);
  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${old ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} data-fares-received data-old={old ? "true" : "false"}>
      <p className="font-bold">{hint ? "Fare table applied to the distance on" : "Fares last received from the railway:"} {when(receivedAt)} <span className="font-semibold">({ago.text})</span></p>
      {hint ? null : frozen
        ? <p className="mt-0.5 font-semibold">These fares are no longer refreshed (the plant&apos;s paid fare service has ended), so they may have changed since. Check IRCTC for today&apos;s fare.</p>
        : old && <p className="mt-0.5 font-semibold">These figures are {ago.n} days old: they may have changed. Check IRCTC for today&apos;s fare.</p>}
    </div>
  );
}

export function FareDisclaimer() {
  return <p className="mt-2 text-[11px] text-slate-500" data-fare-disclaimer>Approximate: may differ when you book. Check IRCTC.</p>;
}

/** THE SOURCE, in the fewest words: where the figures come from, linked (the date they were received is said above the fares) */
export function FareSource({ reservation = true, table = false }: { reservation?: boolean; table?: boolean }) {
  const link = (href: string, text: string, title?: string) => <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="font-semibold text-slate-600 underline">{text}</a>;
  return (
    <p className="mt-1 text-[11px] text-slate-500" data-fare-source>
      Source: {reservation && link(RAILRADAR_SITE, "RailRadar", "Fares from the railway's reservation system")}
      {reservation && table && " · "}
      {table && <>{link(ORDINARY_SOURCE.url, "Railway Board fare table", ORDINARY_SOURCE.name)}{!reservation && <> · {link(RAILRADAR_SITE, "RailRadar")} (distance)</>}{reservation && " (local trains)"}</>}
    </p>
  );
}

/** THE DISCLAIMER OF A HINT (local trains): worked out from the railway's published table, not looked up; says where the distance comes from and why a range may be shown */
export function HintDisclaimer({ number }: { number: string }) {
  return <p className="mt-2 text-[11px] text-slate-500" data-hint-disclaimer>Estimate, not a lookup: the ticket counter&apos;s fare applies.{!number.startsWith("6") && " An express-numbered MEMU may cost more."}</p>;
}

export function FareTable({ set, now, local = false }: { set: FareSet & { receivedAt?: string; frozen?: boolean }; now?: DateTime; local?: boolean }) {
  const to = stationLabel(set.to, set.to);
  // a HINT (local train) is a table estimate; the other fares are the reservation system's own
  const noHint = local && set.classes.length === 0; // a local train for which no hint can be made: none of the fare wording applies
  const hint = noHint || set.classes.some((c) => c.basis === "table");
  return (
    <div className="min-w-0 max-w-full" data-fares-table>
      <p className="text-xs font-bold text-slate-800">
        {hint ? "Fare hint" : "Fare"} from Durgapur to {to.name} ({set.to}){set.distanceKm > 0 && <span className="font-semibold text-slate-500"> · {Math.round(set.distanceKm).toLocaleString("en-IN")} km</span>}
      </p>
      {set.receivedAt && !noHint && <ReceivedLine receivedAt={set.receivedAt} frozen={set.frozen === true} now={now} hint={hint} />}
      {!hint && <p className="mt-1.5 text-[11px] text-slate-500">Asked for travel on <strong className="text-slate-700">{when(set.journeyDate)}</strong> (a day the train is at Durgapur)</p>}
      {set.classes.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700" data-no-fare>
          {local ? "No fare hint for this train: it reverses on its way. Ask at the ticket counter." : "No fare available for this train. Check IRCTC."}
        </p>
      ) : (
        <ul className={`mt-2 grid gap-1.5 ${set.classes.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {set.classes.map((c) => (
            <li key={c.code} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5" data-fare-class={c.code}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{c.name} <abbr title={`Class code ${c.code}`} className="text-[10px] font-bold text-slate-400 no-underline">({c.code})</abbr></span>
                <span className="text-sm font-extrabold tabular-nums text-slate-900" title={c.basis === "table" ? "An estimate from the fare table" : undefined}>{c.basis === "table" && <span className="mr-1 text-[10px] font-bold text-slate-400">about</span>}{rupees(c.total)}{c.high ? `\u2013${c.high.toLocaleString("en-IN")}` : ""}</span>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">{c.parts.map((p) => `${p.label} ${rupees(p.amount)}`).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      {noHint ? null : hint ? <HintDisclaimer number={set.train} /> : <FareDisclaimer />}
    </div>
  );
}

/** the full names of the short class codes, as the railway writes them */
export const CLASS_FULL: Record<string, string> = {
  "2S": "Second Sitting",
  SL: "Sleeper",
  CC: "AC Chair Car",
  EC: "Executive Chair Car (AC)",
  "3E": "AC 3 Tier Economy",
  "3A": "AC 3 Tier",
  "2A": "AC 2 Tier",
  "1A": "First Class AC",
  UR: "Unreserved (ordinary) second class",
};

/** the short forms in a table, written out under it (a phone has no hover): "SL Sleeper · 3A AC 3 Tier" */
export function ClassKey({ codes }: { codes: string[] }) {
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-slate-500" data-class-key>
      {codes.map((c, i) => <React.Fragment key={c}>{i > 0 && " · "}<strong className="font-bold text-slate-700">{c}</strong> {CLASS_FULL[c] ?? c}</React.Fragment>)}
      {" · "}<strong className="font-bold text-slate-700">km</strong> distance from Durgapur
    </p>
  );
}

/** every short form the card uses, written out once at the bottom of the whole card */
export function ShortForms() {
  const items: Array<[string, string]> = [
    ...Object.entries(CLASS_FULL).filter(([c]) => c !== "UR"),
    ["MEMU", "Mainline Electric Multiple Unit (the local train)"],
    ["DGR", "the railway code of Durgapur; the code in brackets beside a station is its railway code"],
    ["GST", "Goods and Services Tax"],
    ["IRCTC", "Indian Railway Catering and Tourism Corporation (the ticket booking site)"],
    ["NTES", "National Train Enquiry System (live running status)"],
  ];
  return (
    <p className="mt-3 text-xs leading-snug text-slate-500" data-short-forms>
      <strong className="font-bold text-slate-700">Short forms: </strong>
      {items.map(([k, v], i) => <React.Fragment key={k}>{i > 0 && " · "}<strong className="font-bold text-slate-700">{k}</strong> {v}</React.Fragment>)}
    </p>
  );
}

/** the classes found in the legs, cheapest class first (the order of CLASSES, the local hint last) */
export function legClasses(legs: LegsAnswer["legs"]): Array<{ code: string; name: string }> {
  const seen = new Map<string, string>();
  for (const l of legs) for (const c of l.classes) if (!seen.has(c.code)) seen.set(c.code, c.name);
  const order = [...CLASSES.map((c) => c.code), LOCAL_CLASS.code];
  return [...seen.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([code, name]) => ({ code, name }));
}

/** THE FARE TO EVERY STOP AFTER DURGAPUR: one row per stop (name, code, distance from Durgapur) and one column per class the train has; a dash where the train does not sell that class between Durgapur and the stop */
export function LegsTable({ answer, now }: { answer: LegsAnswer; now?: DateTime }) {
  const cols = legClasses(answer.legs);
  const cell = (l: LegsAnswer["legs"][number], code: string) => {
    const c = l.classes.find((x) => x.code === code);
    if (!c) return <span className="text-slate-300" aria-label="not available">&ndash;</span>;
    return <>{c.basis === "table" && <span className="mr-0.5 text-[9px] font-bold text-slate-400">about</span>}{rupees(c.total)}{c.high ? `\u2013${c.high.toLocaleString("en-IN")}` : ""}</>;
  };
  return (
    <div className="min-w-0 max-w-full" data-legs-table>
      <ReceivedLine receivedAt={answer.receivedAt} frozen={answer.frozen} now={now} hint={answer.hint} />
      <p className="mt-1.5 text-[11px] text-slate-500">{answer.hint ? "Fare hints" : "Fares"} from Durgapur to each of the {answer.legs.length} stops after it; a dash: class not available.</p>
      <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max border-collapse text-left text-[11px] tabular-nums">
          <thead className="sticky top-0 z-20 bg-slate-50 text-slate-500">
            <tr>
              <th scope="col" className="sticky left-0 z-30 bg-slate-50 px-2 py-1 font-bold">Stop</th>
              <th scope="col" className="px-2 py-1 text-right font-bold">km</th>
              {cols.map((c) => <th scope="col" key={c.code} className="px-2 py-1 text-right font-bold"><abbr title={c.name} className="no-underline">{c.code}</abbr></th>)}
            </tr>
          </thead>
          <tbody>
            {answer.legs.map((l) => {
              const st = stationLabel(l.to, l.name);
              return (
                <tr key={l.to} className="border-t border-slate-100" data-leg={l.to}>
                  <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-1 font-semibold text-slate-800">
                    <span className="block max-w-[7.5rem] sm:max-w-none">{st.junction ? <span className="rounded bg-amber-100 px-1 font-bold text-amber-900 ring-1 ring-inset ring-amber-300" title="Junction: several railway lines meet here">{st.name}</span> : st.name} <span className="text-[10px] font-bold text-slate-400">({l.to})</span></span>
                  </th>
                  <td className="px-2 py-1 text-right text-slate-500">{Math.round(l.distanceKm).toLocaleString("en-IN")}</td>
                  {cols.map((c) => <td key={c.code} className="px-2 py-1 text-right font-bold text-slate-900">{cell(l, c.code)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ClassKey codes={cols.map((c) => c.code)} />
      {answer.hint ? <HintDisclaimer number={answer.train} /> : <FareDisclaimer />}
    </div>
  );
}

/** the fares to every stop, asked for (from the database) when the button is pressed */
export function LegsBox({ number }: { number: string }) {
  const { state, env, error, reload } = useLive<LegsAnswer>(`/api/live/railway-fare-legs?train=${number}`, true);
  return (
    <div className="mt-2 min-w-0 max-w-full" data-legs-box>
      {state === "loading" && <p className="flex items-center gap-2 text-xs text-slate-600" aria-busy="true"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading the fares to every stop…</p>}
      {state === "error" && <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700">{error || "The fares to the stops could not be shown."} <button type="button" onClick={reload} className="ml-1 font-bold text-slate-800 underline">Try again</button></p>}
      {env && <><LegsTable answer={env.data} /><FareSource reservation={!env.data.hint} table={env.data.hint} /></>}
    </div>
  );
}

/** the open panel of a train: asks for the fares as it appears */
export function FareBox({ number, local = false }: { number: string; local?: boolean }) {
  const { state, env, error, reload } = useLive<FareAnswer>(`/api/live/railway-fare?train=${number}`, true);
  return (
    <div className="mt-2 min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3" data-fare-box role="region" aria-label={`Fares of train ${number}`}>
      {state === "loading" && <p className="flex items-center gap-2 text-xs text-slate-600" aria-busy="true"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Asking the railway&apos;s reservation system for the fares…</p>}
      {state === "error" && (
        <div className="flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0"><p className="font-bold">The fares cannot be shown just now</p><p>{error || "The source did not answer."} Nothing is shown rather than a wrong figure.</p>
            <button type="button" onClick={reload} className="mt-1 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 font-bold text-amber-800">Try again</button></div>
        </div>
      )}
      {env && <><FareTable set={env.data} local={local} />{!(local && env.data.classes.length === 0) && <FareSource reservation={!env.data.classes.some((c) => c.basis === "table")} table={env.data.classes.some((c) => c.basis === "table")} />}</>}
      {env && env.data.classes.length > 0 && <StopsToggle number={number} />}
    </div>
  );
}

/** the button under a train's fares that opens the fare to every stop on its route */
function StopsToggle({ number }: { number: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 min-w-0 max-w-full border-t border-slate-200 pt-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 hover:border-rose-300 hover:text-rose-700" data-stops-button>{open ? "Hide the stops" : "Fares to every stop on the route"}</button>
      {open && <LegsBox number={number} />}
    </div>
  );
}
