// src/app/api/live/status/route.ts
//
// ARE THE LIVE SOURCES ANSWERING? One page that asks the five live routes (gold, fuel, news, sports, markets) and says, for each, whether its source answered, how long it took and what it said if it did not.
// The place to look first after a deployment, because a source can answer on one host and refuse on another (some sites turn away the addresses of cloud servers). Reads nothing from the caller.
import { NextResponse } from "next/server";
import { GET as gold } from "../gold/route";
import { GET as fuel } from "../fuel/route";
import { GET as sports } from "../sports/route";
import { GET as markets } from "../markets/route";
import { GET as news } from "../news/route";

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
    check("news, English", () => news(new Request("http://x/api/live/news?lang=en"))),
    check("news, Hindi", () => news(new Request("http://x/api/live/news?lang=hi"))),
    check("news, Bengali", () => news(new Request("http://x/api/live/news?lang=bn"))),
    check("sports", () => sports()),
    check("markets (Yahoo Finance)", () => markets()),
  ]);
  return NextResponse.json({ ok: checks.every((c) => c.ok && !c.stale), checks }, { headers: { "Cache-Control": "no-store" } });
}
