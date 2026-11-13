// src/tools/converter/UsdInrTrend.tsx
//
// THE US DOLLAR IN RUPEES OVER THE LAST YEAR: the chart under the currency converter, shown only while the converter is on USD and INR (either way round: it is the same relation). It is drawn like the
// gold and fuel charts: dates along the bottom, the highest and the lowest day marked with their date, and four figures under it (the rate a year ago, the highest, the lowest and the latest).
// The data come from /api/live/usd-inr (src/lib/live/usdInr.ts): the European Central Bank's reference rate of each working day, the same table as the converter's own rate. Nothing typed is sent anywhere.
"use client";

import React from "react";
import { DateTime } from "luxon";
import { Info } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import type { UsdInrTrend } from "@/lib/live/usdInr";
import { LiveGate, SourceLine, TrendChart, type TrendPoint } from "@/components/tools/live/LivePieces";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR = "#4f46e5";

/** ₹94.04, or ₹90 for a round figure (the axis shows round values) */
export const inr = (v: number) => `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
const dmy = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;

/** the chart is for exactly this pair of currencies, in either order */
export const isUsdInr = (from: string, to: string) => (from === "USD" && to === "INR") || (from === "INR" && to === "USD");

export function usdInrPoints(t: UsdInrTrend): TrendPoint[] {
  return t.points.map((p) => ({ iso: p.date, label: dmy(p.date), full: dmy(p.date), value: p.value, ...(p.carried ? { note: `The ECB published no rate for ${dmy(p.date)} (a weekend or a holiday), so the rate of ${dmy(p.carried)}, the last working day before it, is shown.` } : {}) }));
}

export function UsdInrTrendBody({ trend }: { trend: UsdInrTrend }) {
  const points = usdInrPoints(trend);
  const range = `${points[0].full} to ${points[points.length - 1].full}`;
  return (
    <div>
      <span className="mb-3 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Rupees for one US dollar · rate of each working day, {range}</span>
      <TrendChart
        points={points}
        color={COLOR}
        format={inr}
        latestLabel="Latest rate"
        todayIso={DateTime.now().setZone("Asia/Kolkata").toISODate() ?? undefined}
        pointsText={`${points.length} working days shown`}
        ariaLabel={`US dollar in rupees, ${range}`}
      />
      <p className="mt-2 flex items-start gap-2 text-xs leading-snug text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>These are the European Central Bank&apos;s daily reference rates, one for each working day (none for weekends and holidays), and the last point is the rate the converter above uses. A reference rate is a daily fixing: your bank, a money changer or the RBI&apos;s own reference rate will differ a little, and a bank adds its margin.</span>
      </p>
    </div>
  );
}

export function UsdInrTrendCard() {
  const { state, env, error, reload } = useLive<UsdInrTrend>("/api/live/usd-inr");
  return (
    <section aria-label="US dollar in rupees over the last year" className="mt-5 rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900">US dollar in rupees: the last year</h3>
      <p className="mb-3 text-xs text-slate-500">The rate a year ago, the highest, the lowest, and the latest.</p>
      <LiveGate state={state} error={error} reload={reload} what="the dollar-rupee history">
        {env && (
          <>
            <UsdInrTrendBody trend={env.data} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </section>
  );
}
