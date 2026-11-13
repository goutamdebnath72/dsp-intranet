// src/app/api/tools/rates/route.ts
//
// PUBLIC REFERENCE EXCHANGE RATES for the currency converter of the search bar. The browser does the sum; this route only fetches and caches the rates,
// and it reads nothing from the user: no body, no query, no cookie, no log of what anyone converted.
//
// Sources (free, no key): Frankfurter (European Central Bank reference rates; many currencies including INR), and open.er-api.com for the Gulf currencies the ECB does not publish.
// Either may fail: the other is used; both failing gives a plain 503 and the card says "rates unavailable right now".
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { validRates, type Rates } from "@/tools/converter/currency";

export const runtime = "nodejs";
export const revalidate = 3600; // an hour: the ECB publishes once a day

const TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: 3600 }, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const [frank, er] = await Promise.all([
    getJson("https://api.frankfurter.dev/v1/latest?base=USD"),
    getJson("https://open.er-api.com/v6/latest/USD"),
  ]);
  const rates: Record<string, number> = {};
  let date = "";
  const sources: string[] = [];
  if (er && er.result === "success" && er.rates && typeof er.rates === "object") {
    // the broad list first, the ECB's figures over it where both exist
    for (const [k, v] of Object.entries(er.rates)) if (typeof v === "number" && v > 0) rates[k] = v;
    date = (Number(er.time_last_update_unix) > 0 ? DateTime.fromSeconds(Number(er.time_last_update_unix), { zone: "utc" }) : DateTime.utc()).toISODate() ?? "";
    sources.push("open.er-api.com");
  }
  if (frank && frank.rates && typeof frank.rates === "object") {
    for (const [k, v] of Object.entries(frank.rates)) if (typeof v === "number" && v > 0) rates[k] = v;
    if (typeof frank.date === "string") date = frank.date;
    sources.unshift("European Central Bank reference rates (Frankfurter)");
  }
  const out: Rates = { base: "USD", date, rates, source: sources.join(" and ") };
  if (!validRates(out)) return NextResponse.json({ error: "rates unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
