// src/tools/weather/WeatherCard.tsx
//
// THE WEATHER AT DURGAPUR: what it is now (the big figure, the sky in words, what it feels like, humidity, wind, rain, sunrise and sunset, UV), the next 24 hours three hours at a time, and seven days.
// The data are checked in src/lib/live/weather.ts and come from /api/live/weather (Open-Meteo); the card asks again by itself every ten minutes while it is open and in view, quietly (nothing is replaced by a
// loading box). Nothing typed is sent anywhere: the request carries nothing.
"use client";

import React from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, HelpCircle, Moon, Snowflake, Sun, Sunrise, Sunset, Wind, type LucideIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useLive } from "@/hooks/useLive";
import { skyKind, type SkyKind, type Weather } from "@/lib/live/weather";
import { LiveGate, SourceLine } from "@/components/tools/live/LivePieces";

export const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const ZONE = "Asia/Kolkata";

const ICON: Record<SkyKind, LucideIcon> = { clear: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, storm: CloudLightning, snow: Snowflake, unknown: HelpCircle };
const TINT: Record<SkyKind, string> = { clear: "text-amber-500", partly: "text-amber-500", cloud: "text-slate-500", fog: "text-slate-400", drizzle: "text-sky-500", rain: "text-sky-600", storm: "text-violet-600", snow: "text-cyan-500", unknown: "text-slate-400" };

/** the picture of the sky; a clear night is the moon */
export function SkyIcon({ code, night = false, size = 22 }: { code: number; night?: boolean; size?: number }) {
  const kind = skyKind(code);
  if (kind === "clear" && night) return <Moon size={size} className="text-indigo-500" aria-hidden="true" />;
  const Icon = ICON[kind];
  return <Icon size={size} className={TINT[kind]} aria-hidden="true" />;
}

export const deg = (v: number) => `${Math.round(v)}°`;
const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });
/** "6 pm" */
export const hourLabel = (iso: string) => at(iso).toFormat("h a").toLowerCase();
/** "Today", "Tomorrow", "Sat 14 Nov" */
export function dayLabel(date: string, today: string): string {
  const d = at(date), t = at(today);
  const n = Math.round(d.diff(t, "days").days);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : d.toFormat("ccc d LLL");
}
/** is this hour between that day's sunrise and sunset? (for the moon and the sun) */
export function isDaylight(iso: string, w: Weather): boolean {
  const t = at(iso), day = w.days.find((d) => d.date === t.toISODate());
  if (!day) return true;
  const hm = t.toFormat("HH:mm");
  return hm >= day.sunrise && hm < day.sunset;
}

/** the columns of the week: day, picture, sky, chance of rain, amount of rain, then the low, a bar from the low to the high (it takes the rest of the width), the high; the sky's name, the amount and the bar are not on a phone */
export const DAY_GRID = "grid items-center gap-x-2 sm:gap-x-3 grid-cols-[minmax(0,1fr)_1.5rem_2.75rem_2.25rem_2.25rem] sm:grid-cols-[7rem_1.5rem_9.5rem_3.5rem_4rem_2.5rem_minmax(5rem,1fr)_2.5rem]";

/** one end of a day's bar: hover (or rest the pointer on) the end and its temperature is named ("Low 21°", "High 29°"); a small dot marks the end while the pointer is over the bar */
function BarEnd({ side, label }: { side: "left" | "right"; label: string }) {
  return (
    <span aria-hidden="true" className={`group/end absolute top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-default items-center justify-center ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white transition-opacity opacity-0 group-hover/bar:opacity-100 ${side === "left" ? "bg-sky-500" : "bg-amber-500"}`} />
      <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-white opacity-0 shadow transition-opacity group-hover/end:opacity-100">{label}</span>
    </span>
  );
}

export function WeatherBody({ w }: { w: Weather }) {
  const today = w.days[0];
  // the bars are drawn on one scale, the coldest low to the hottest high of the week
  const lo = Math.min(...w.days.map((d) => d.min)), hi = Math.max(...w.days.map((d) => d.max));
  const pct = (t: number) => (hi > lo ? Math.round(((t - lo) / (hi - lo)) * 100) : 0);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-4">
        <div className="flex items-center gap-3">
          <SkyIcon code={w.now.code} night={!w.now.isDay} size={44} />
          <div>
            <p className="text-4xl font-extrabold leading-none tabular-nums text-slate-900">{deg(w.now.temp)}<span className="text-xl font-bold text-slate-500">C</span></p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{w.now.text}</p>
          </div>
        </div>
        <dl className="grid min-w-[16rem] flex-1 grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600 sm:grid-cols-3">
          <div><dt className="inline">Feels like </dt><dd className="inline font-bold tabular-nums text-slate-800">{deg(w.now.feels)}</dd></div>
          <div className="flex items-center gap-1"><Droplets size={12} aria-hidden="true" /><dt className="inline">Humidity </dt><dd className="inline font-bold tabular-nums text-slate-800">{w.now.humidity}%</dd></div>
          <div className="flex items-center gap-1"><Wind size={12} aria-hidden="true" /><dt className="inline">Wind </dt><dd className="inline font-bold tabular-nums text-slate-800">{Math.round(w.now.windKmh)} km/h from {w.now.windFrom}</dd></div>
          <div><dt className="inline">Rain now </dt><dd className="inline font-bold tabular-nums text-slate-800">{w.now.rainMm} mm</dd></div>
          <div className="flex items-center gap-1"><Sunrise size={12} aria-hidden="true" /><dt className="inline">Sunrise </dt><dd className="inline font-bold tabular-nums text-slate-800">{today.sunrise}</dd></div>
          <div className="flex items-center gap-1"><Sunset size={12} aria-hidden="true" /><dt className="inline">Sunset </dt><dd className="inline font-bold tabular-nums text-slate-800">{today.sunset}</dd></div>
        </dl>
        <p className="w-full text-xs text-slate-500">Today: high <strong className="text-slate-700">{deg(today.max)}</strong>, low <strong className="text-slate-700">{deg(today.min)}</strong>, chance of rain <strong className="text-slate-700">{today.rainChance}%</strong>, UV index up to <strong className="text-slate-700">{Math.round(today.uv)}</strong>.</p>
      </div>

      <h4 className="mb-1.5 mt-4 text-sm font-extrabold text-slate-800">Next 24 hours</h4>
      <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" aria-label="The next 24 hours, three hours at a time">
        {w.hours.map((h) => (
          <li key={h.time} className="flex flex-col items-center rounded-xl border border-slate-100 bg-white px-1 py-2 text-center" title={h.text}>
            <span className="text-[11px] font-semibold text-slate-500">{hourLabel(h.time)}</span>
            <SkyIcon code={h.code} night={!isDaylight(h.time, w)} size={20} />
            <span className="text-sm font-bold tabular-nums text-slate-900">{deg(h.temp)}</span>
            <span className="flex items-center gap-0.5 text-[11px] tabular-nums text-sky-700"><Droplets size={10} aria-hidden="true" />{h.rainChance}%</span>
          </li>
        ))}
      </ol>

      <h4 className="mb-1.5 mt-4 text-sm font-extrabold text-slate-800">{w.days.length} days</h4>
      {/* ONE grid for the header and every row, with fixed column widths; the one flexible column is the bar from each day's low to its high, drawn on the scale of the whole week, so the width of the card is used by something to read, not by gaps (on a phone the sky's name, the amount and the bar give way), so that each column is a straight line down the card: day, picture, sky, chance of rain, rain, high, low (the figures right-aligned in tabular digits) */}
      <div className="space-y-1" role="table" aria-label="The forecast for the week">
        <div role="row" className={`${DAY_GRID} px-3 text-[11px] font-bold uppercase tracking-wide text-slate-500`}>
          <span role="columnheader">Day</span>
          <span role="columnheader" aria-hidden="true" />
          <span role="columnheader" className="sr-only sm:not-sr-only">Sky</span>
          <span role="columnheader" className="text-right">Rain</span>
          <span role="columnheader" className="hidden text-right sm:block">Amount</span>
          <span role="columnheader" className="text-right">Low</span>
          <span role="columnheader" className="hidden truncate text-center sm:block">Temperature range</span>
          <span role="columnheader" className="text-right">High</span>
        </div>
        {w.days.map((d) => (
          <div role="row" key={d.date} className={`${DAY_GRID} rounded-xl border border-slate-100 bg-white px-3 py-1.5 text-sm`}>
            <span role="cell" className="truncate font-bold text-slate-800">{dayLabel(d.date, today.date)}</span>
            <span role="cell" className="flex justify-center"><SkyIcon code={d.code} size={18} /></span>
            <span role="cell" title={d.text} className="sr-only min-w-0 text-slate-600 sm:not-sr-only sm:truncate">{d.text}</span>
            <span role="cell" className="text-right text-xs font-semibold tabular-nums text-sky-700"><Droplets size={11} className="mr-0.5 inline" aria-hidden="true" />{d.rainChance}%</span>
            <span role="cell" className="hidden text-right text-xs tabular-nums text-slate-500 sm:block">{d.rainMm > 0 ? `${d.rainMm} mm` : "–"}</span>
            <span role="cell" className="text-right font-semibold tabular-nums text-slate-500">{deg(d.min)}</span>
            <span role="cell" className="group/bar relative hidden h-1.5 rounded-full bg-slate-100 sm:block">
              <span role="img" aria-label={`Low ${deg(d.min)}, high ${deg(d.max)}`} className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 to-amber-400" style={{ left: `${Math.min(pct(d.min), 96)}%`, width: `${Math.max(pct(d.max) - pct(d.min), 4)}%` }}>
                <BarEnd side="left" label={`Low ${deg(d.min)}`} />
                <BarEnd side="right" label={`High ${deg(d.max)}`} />
              </span>
            </span>
            <span role="cell" className="text-right font-bold tabular-nums text-slate-900">{deg(d.max)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-snug text-slate-500">Temperatures in degrees Celsius; the chance of rain is for the day. A forecast is a forecast: it changes, and the further away the day the less sure it is. For anything that matters (a shutdown, a journey), check the Indian Meteorological Department&apos;s own warnings.</p>
    </div>
  );
}

export function WeatherCard() {
  const { state, env, error, reload } = useLive<Weather>("/api/live/weather", true, { refreshMs: WEATHER_REFRESH_MS });
  return (
    <div>
      <LiveGate state={state} error={error} reload={reload} what="the weather">
        {env && (
          <>
            <WeatherBody w={env.data} />
            <SourceLine env={env} reload={reload} loading={state === "loading"} />
          </>
        )}
      </LiveGate>
    </div>
  );
}
