// src/app/api/live/status/route.ts
//
// ARE THE LIVE SOURCES ANSWERING? One page that asks the live routes (gold, fuel, news, sports, markets, the weather, the airport flights, the trains at Durgapur station, and the two history charts) and says, for each, whether its source answered, how long it took and what it said if it did not.
// The place to look first after a deployment, because a source can answer on one host and refuse on another (some sites turn away the addresses of cloud servers). Reads nothing from the caller.
import { NextResponse } from "next/server";
import { GET as gold } from "../gold/route";
import { GET as fuel } from "../fuel/route";
import { GET as sports } from "../sports/route";
import { GET as markets } from "../markets/route";
import { GET as news } from "../news/route";
import { GET as fuelTrend } from "../fuel-trend/route";
import { GET as usdInr } from "../usd-inr/route";
import { GET as weather } from "../weather/route";
import { GET as flights } from "../flights/route";
import { GET as railway } from "../railway/route";
import { GET as aicpi } from "../aicpi/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  stale?: boolean;
  detail: string;
}

async function check(name: string, run: () => Promise<Response>): Promise<Check> {
  const t0 = Date.now();
  try {
    const r = await run();
    const j = (await r.json()) as { ok?: boolean; error?: string; stale?: boolean; source?: string };
    return { name, ok: j.ok === true, ms: Date.now() - t0, stale: j.stale, detail: j.ok ? (j.stale ? "the source failed; the last good answer is being shown" : "answered") : (j.error ?? "no answer") };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : "failed" };
  }
}

export async function GET() {
  const checks = await Promise.all([
    check("gold and silver (IBJA)", () => gold()),
    check("fuel (GoodReturns)", () => fuel()),
    check("news, business (ET, Mint, BusinessLine, WSJ)", () => news(new Request("http://x/api/live/news?lang=biz"))),
    check("news, English", () => news(new Request("http://x/api/live/news?lang=en"))),
    check("news, Hindi", () => news(new Request("http://x/api/live/news?lang=hi"))),
    check("news, Bengali", () => news(new Request("http://x/api/live/news?lang=bn"))),
    check("sports", () => sports()),
    check("markets (Yahoo Finance)", () => markets()),
    check("fuel price history (PPAC, GoodReturns)", () => fuelTrend()),
    check("dollar-rupee history (ECB via Frankfurter)", () => usdInr()),
    check("weather at Durgapur (Open-Meteo)", () => weather()),
    check("flights at Andal Airport (airport's own page)", () => flights()),
    // the answer is kept twelve hours (the plant's key allows few requests a month), so this check usually costs nothing
    check("AICPI-IW consumer price index (Labour Bureau)", () => aicpi()),
    check("trains at Durgapur station (RailRadar, the plant's key)", () => railway()),
  ]);
  return NextResponse.json({ ok: checks.every((c) => c.ok && !c.stale), checks }, { headers: { "Cache-Control": "no-store" } });
}
