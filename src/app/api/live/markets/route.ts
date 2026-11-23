// src/app/api/live/markets/route.ts
//
// Sensex, Nifty and the watch list. I read nothing from the caller. The source (Yahoo Finance's public chart feed) turns away anyone who asks too fast, so I ask GENTLY: one symbol at a time with a
// pause between, each symbol kept five minutes in the server's memory (only the symbols that have gone stale are asked again), and at the first "too many requests" I stop asking and show what I have
// (the last good figures of the others, with their own times). A refresh therefore fills the card up over a few minutes rather than failing all at once. Only when no symbol has ever been fetched is it an error.
//
// When Yahoo does not answer, a symbol falls back to its last good quote (memory, then the saved copy in public.market_quote) and the answer says which ones and when they were received (src/lib/live/marketService.ts).
import { getDb } from "@/lib/db";
import { getJson, UpstreamError } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { recall, remember } from "@/lib/live/memo";
import { parseYahooChart, type Quote } from "@/lib/live/markets";
import { marketsAnswer } from "@/lib/live/marketService";
import { NO_STORE, marketStoreFor, type MarketStore } from "@/lib/live/marketStore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const chartUrl = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Returns the saved copy, or none when the database cannot be had: I do not let the card fail because of it */
async function savedCopy(): Promise<MarketStore> {
  try { return marketStoreFor(await getDb()); } catch { return NO_STORE; }
}

export async function GET() {
  return liveRoute({
    key: "markets",
    ttlMs: 2 * 60 * 1000,
    source: "Yahoo Finance (public chart data, may be delayed about 15 minutes)",
    sourceUrl: "https://finance.yahoo.com/",
    load: async () =>
      marketsAnswer({
        fetchOne: async (inst) => parseYahooChart(await getJson<unknown>(chartUrl(inst.symbol), { timeoutMs: 6000 }), inst),
        isTurnedAway: (e) => e instanceof UpstreamError && e.status === 429,
        recall: (key) => recall<Quote>(key),
        remember: (key, q) => remember(key, q),
        store: await savedCopy(),
        now: Date.now,
        pause: sleep,
      }),
  });
}
