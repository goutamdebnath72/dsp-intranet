// src/tools/aicpi/AicpiCard.tsx
//
// THE ALL-INDIA CONSUMER PRICE INDEX FOR INDUSTRIAL WORKERS AND THE DEARNESS ALLOWANCE OF SAIL EMPLOYEES WORKED OUT FROM IT. From the top: the latest index and how it moved; the graph of the year (from the same month a year back
// to the latest month, the span of the other one-year charts); the DA of the quarter in force and of the next, three figures; the quarters of the year in a table with the work of each; the formula step by step; a calculator for a
// basic pay. The DA is the CPSE "IDA pattern" of the 2017 pay scales, revised every three months (src/lib/live/aicpi.ts has the orders it comes from and the test against the announced rates). Everything is worked out here, in
// the browser, from the record the server reads from the Labour Bureau; what is typed into the calculator is not sent anywhere.
// IT SAYS WHAT IS AND IS NOT ESTABLISHED: the formula and the rates are those of the Department of Public Enterprises' orders; that SAIL pays exactly these is from the guidelines its executives are under and its 2021 wage
// agreement (reported), and SAIL's own circular is the authority.
"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { LiveGate, SourceLine, TrendChart, type TrendPoint } from "@/components/tools/live/LivePieces";
import { announcedFor, IDA_ANNOUNCED_CHECKED, idaAmount, idaForQuarter, idaProjected, LINK_POINT, LINKING_FACTOR, PERCENT_PER_POINT, quarterOf, quartersOf, ZONE, type Aicpi, type IdaWork, type IndexPoint } from "@/lib/live/aicpi";

export const AICPI_REFRESH_MS = 6 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sep 2025" */
export const monthText = (m: string): string => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** "1 October 2026" */
export const dayText = (iso: string): string => DateTime.fromISO(iso, { zone: ZONE }).toFormat("d LLLL yyyy");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

export function indexPoints(pts: IndexPoint[]): TrendPoint[] {
  return pts.map((p) => ({ iso: `${p.month}-01`, label: monthText(p.month), full: monthText(p.month), value: p.value }));
}

/** the month after the latest published, and the day its index is due (the last day of the month after that: "the index of the previous month is released on the last day of the ongoing month") */
export function nextDue(latest: string): { month: string; day: string } {
  const next = DateTime.fromISO(`${latest}-01`, { zone: ZONE }).plus({ months: 1 });
  return { month: monthText(next.toFormat("yyyy-MM")), day: next.plus({ months: 1 }).endOf("month").toFormat("d LLLL yyyy") };
}

function Figure({ title, big, sub, tone }: { title: string; big: string; sub: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${tone}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600">{title}</p>
      <p className="text-2xl font-extrabold leading-tight tabular-nums text-slate-900">{big}</p>
      <p className="text-xs leading-snug text-slate-600">{sub}</p>
    </div>
  );
}

const rangeText = (w: IdaWork) => `${monthText(w.months[0])} to ${monthText(w.months[2])}`;

export function AicpiBody({ data, today = DateTime.now().setZone(ZONE), basic = "" }: { data: Aicpi; today?: DateTime; basic?: string }) {
  const pts = data.points;
  const [typed, setTyped] = useState(basic);
  const latest = pts[pts.length - 1], before = pts[pts.length - 2];
  const yearAgo = pts.length >= 13 ? pts[0] : null;
  const due = nextDue(latest.month);
  const { startsOn, next } = quarterOf(today);
  const inForce = idaForQuarter(pts, startsOn);
  const announced = announcedFor(startsOn);
  const coming = idaForQuarter(pts, next) ?? idaProjected(pts, next);
  const quarters = quartersOf(pts, today);
  const pay = Number(typed.replace(/[^\d]/g, ""));
  const validPay = Number.isFinite(pay) && pay > 0 && pay <= 10_000_000;
  const rows = validPay ? [
    inForce ? { name: `From ${dayText(startsOn)}, ${f1(inForce.rate)}%`, rate: inForce.rate } : null,
    coming ? { name: `From ${dayText(next)}, ${f1(coming.rate)}%${coming.known < 3 ? " (expected)" : ""}`, rate: coming.rate } : null,
  ].filter((r): r is { name: string; rate: number } => !!r) : [];
  return (
    <div>
      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
        <strong>AICPI-IW</strong>, the All-India Consumer Price Index for Industrial Workers (base 2016 = 100), is published each month by the Labour Bureau, on the last day of the next month. The <strong>dearness allowance (DA)</strong> of SAIL&apos;s employees follows it and is revised <strong>every three months</strong>.
        The latest published is <strong>{monthText(latest.month)}: {f1(latest.value)}</strong>{before ? ` (${latest.value >= before.value ? "up" : "down"} ${f1(Math.abs(latest.value - before.value))} points on ${monthText(before.month)})` : ""}{yearAgo ? `, ${f1(((latest.value - yearAgo.value) / yearAgo.value) * 100)}% above ${monthText(yearAgo.month)}` : ""}. The index of {due.month} is due on {due.day}.
      </p>

      <h4 className="mb-1.5 text-sm font-extrabold text-slate-800">AICPI-IW, {monthText(pts[0].month)} to {monthText(latest.month)}</h4>
      <TrendChart points={indexPoints(pts)} color="#d97706" format={f1} latestLabel="Latest index" pointsText={`${pts.length} monthly figures, from the same month a year back`} ariaLabel={`AICPI-IW, ${monthText(pts[0].month)} to ${monthText(latest.month)}`} />

      <h4 className="mb-1.5 mt-5 text-sm font-extrabold text-slate-800">Dearness allowance, quarter by quarter (IDA, 2017 pay scales)</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <Figure tone="border-emerald-200 bg-emerald-50/80" title={`From ${dayText(startsOn)}`} big={inForce ? `${f1(inForce.rate)}%` : "–"} sub={inForce ? <>of basic pay, from {rangeText(inForce)} ({f2(inForce.exact)}%){announced ? <>. {announced.order}.</> : <>. Worked out here; no order of this quarter is in the list.</>}</> : "The months of this quarter are not in the record."} />
        <Figure tone="border-violet-200 bg-violet-50/80" title={`${coming && coming.known === 3 ? "From" : "Expected from"} ${dayText(next)}`} big={coming ? `${f1(coming.rate)}%` : "–"} sub={coming ? (coming.known === 3 ? <>from {rangeText(coming)} ({f2(coming.exact)}%).</> : <>from {rangeText(coming)}: {coming.known} of 3 months published, the rest taken at {f1(latest.value)} ({f2(coming.exact)}%). A projection, not an announcement.</>) : "Not enough months."} />
        <Figure tone="border-sky-200 bg-sky-50/80" title="One point of the index" big={`${PERCENT_PER_POINT.toFixed(2)}%`} sub={<>of DA for each point the three-month average rises (2.88 ÷ 277.33 × 100): a rise of 2 points in the average adds about {(PERCENT_PER_POINT * 2).toFixed(1)}%.</>} />
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white/80">
        <table className="w-full min-w-[34rem] text-sm" aria-label="The dearness allowance of each quarter">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-3 py-2">From</th><th scope="col" className="px-3 py-2">Months averaged</th><th scope="col" className="px-3 py-2 text-right">Average</th><th scope="col" className="px-3 py-2 text-right">× {LINKING_FACTOR}</th><th scope="col" className="px-3 py-2 text-right">DA</th><th scope="col" className="px-3 py-2">DPE order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {quarters.map((w) => {
              const a = announcedFor(w.startsOn);
              return (
                <tr key={w.startsOn} className={w.startsOn === startsOn ? "bg-emerald-50/70 font-semibold" : ""}>
                  <td className="px-3 py-1.5">{dayText(w.startsOn)}{w.known < 3 ? <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-[11px] font-bold text-violet-800">expected</span> : null}</td>
                  <td className="px-3 py-1.5">{rangeText(w)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f2(w.average)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f2(w.linked)}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums text-slate-900">{f1(w.rate)}%</td>
                  <td className="px-3 py-1.5 text-xs">{a ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800" title={a.order}>{f1(a.rate)}% ✓</span> : <span className="text-slate-400">not in the list</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2" open>
        <summary className="cursor-pointer text-sm font-bold text-slate-800">The formula, step by step</summary>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold leading-snug text-slate-800">
          DA % = ( ( average of three months × {LINKING_FACTOR} ) − {LINK_POINT} ) ÷ {LINK_POINT} × 100, to one decimal place
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-snug text-slate-600">
          <li><strong>The three months.</strong> The DA from 1 January uses September, October and November; from 1 April, December to February; from 1 July, March to May; from 1 October, June to August.</li>
          <li><strong>{LINK_POINT}</strong> is the link point of the 2017 pay scales (the average of September to November 2016 on the 2001-base index, from which the DA began again at zero: the DPE order of 3 August 2017). <strong>{LINKING_FACTOR}</strong> is the factor that carries today&apos;s base-2016 index back to that base; the orders do not print it, and it is the one that gives the rates they announce.</li>
          <li><strong>Rounded to the nearest tenth:</strong> 59.06% is 59.1% (the order of 27 October 2026).</li>
          <li><strong>Checked against the orders.</strong> With the Labour Bureau&apos;s own indices the formula gives 53.4% for 1 January 2026 and 59.1% for 1 October 2026, the two rates the Department of Public Enterprises&apos; orders give.</li>
        </ul>
        {inForce && (
          <table className="mt-3 w-full max-w-md text-sm" aria-label={`The work for the quarter from ${dayText(startsOn)}`}>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr><td className="py-1">Average of the three figures, {rangeText(inForce)}</td><td className="py-1 text-right font-bold tabular-nums">{f2(inForce.average)}</td></tr>
              <tr><td className="py-1">× {LINKING_FACTOR}</td><td className="py-1 text-right font-bold tabular-nums">{f2(inForce.linked)}</td></tr>
              <tr><td className="py-1">− {LINK_POINT}</td><td className="py-1 text-right font-bold tabular-nums">{f2(inForce.increase)}</td></tr>
              <tr><td className="py-1">÷ {LINK_POINT} × 100</td><td className="py-1 text-right font-bold tabular-nums">{f2(inForce.exact)}%</td></tr>
              <tr><td className="py-1 font-bold text-slate-900">Dearness allowance (one decimal)</td><td className="py-1 text-right text-base font-extrabold tabular-nums text-slate-900">{f1(inForce.rate)}%</td></tr>
            </tbody>
          </table>
        )}
      </details>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
        <label htmlFor="aicpi-basic" className="text-sm font-bold text-slate-800">Your DA on a basic pay</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">Basic pay ₹</span>
          <input id="aicpi-basic" inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="for example 56100" className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200" />
        </div>
        {validPay ? (
          <table className="mt-3 w-full text-sm" aria-label="Dearness allowance on the basic pay">
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((r) => (
                <tr key={r.name}><td className="py-1 pr-3">{r.name}</td><td className="py-1 text-right font-bold tabular-nums text-slate-900">{rupees(idaAmount(pay, r.rate))}</td><td className="py-1 pl-3 text-right text-xs tabular-nums text-slate-500">{rupees(pay + idaAmount(pay, r.rate))} with pay</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="mt-2 text-xs text-slate-500">Type a basic pay in rupees to see the DA at each rate (the rate applied to the basic pay, to the nearest rupee; your pay slip is the authority on how it is rounded). Nothing you type here is sent anywhere.</p>}
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>What this rests on.</strong> The formula and the rates are those of the Department of Public Enterprises&apos; orders for the 2017 pay scales (the IDA pattern, 100% neutralisation, adjusted once in three months). SAIL&apos;s executives are under those guidelines, and SAIL&apos;s wage agreement of 22 October 2021 for its non-executives is reported to give them the same DA on the same link point. <strong>SAIL&apos;s own circular is the authority</strong>: its pages could not be read for this, so no extra factor of SAIL&apos;s own is included, and none was found. The announced rates are listed by hand from the orders (last compared on {DateTime.fromISO(IDA_ANNOUNCED_CHECKED).toFormat("d LLL yyyy")}); the other quarters are worked out here.</span>
      </p>
    </div>
  );
}

export function AicpiCard() {
  const { state, env, error, reload } = useLive<Aicpi>("/api/live/aicpi", true, { refreshMs: AICPI_REFRESH_MS });
  return (
    <div>
      <LiveGate state={state} error={error} reload={reload} what="the consumer price index">
        {env && (
          <>
            <AicpiBody data={env.data} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}
