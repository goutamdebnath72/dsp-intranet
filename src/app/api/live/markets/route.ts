// src/app/api/live/markets/route.ts
//
// SENSEX, NIFTY AND THE WATCH LIST. Reads nothing from the caller. The source (Yahoo Finance's public chart feed) turns away anyone who asks too fast, so this asks GENTLY: one symbol at a time with a
// pause between, each symbol kept five minutes in our memory (only the symbols that have gone stale are asked again), and at the first "too many requests" it stops asking and shows what it has
// (the last good figures of the others, with their own times). A refresh therefore fills the card up over a few minutes rather than failing all at once. Only when no symbol has ever been fetched is it an error.
import { getJson, UpstreamError } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { recall, remember } from "@/lib/live/memo";
import { INDICES, WATCHLIST, buildMarkets, parseYahooChart, type Instrument, type Quote } from "@/lib/live/markets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QUOTE_TTL_MS = 5 * 60 * 1000;
const PAUSE_MS = 350;
const chartUrl = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function quotes(list: Instrument[]): Promise<Array<Quote | null>> {
  const out: Array<Quote | null> = [];
  let blocked = false;
  for (const inst of list) {
    const key = `quote:${inst.symbol}`;
    const kept = recall<Quote>(key);
    if (kept && Date.now() - kept.at < QUOTE_TTL_MS) { out.push(kept.value); continue; }
    if (blocked) { out.push(kept?.value ?? null); continue; }
    try {
      const q = parseYahooChart(await getJson<unknown>(chartUrl(inst.symbol), { timeoutMs: 6000 }), inst);
      if (q) remember(key, q);
      out.push(q ?? kept?.value ?? null);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 429) blocked = true;
      out.push(kept?.value ?? null);
    }
    await sleep(PAUSE_MS);
  }
  return out;
}

export async function GET() {
  return liveRoute({
    key: "markets",
    ttlMs: 2 * 60 * 1000,
    source: "Yahoo Finance (public chart data, may be delayed about 15 minutes)",
    sourceUrl: "https://finance.yahoo.com/",
    load: async () => {
      const all = await quotes([...INDICES, ...WATCHLIST]);
      return buildMarkets(all.slice(0, INDICES.length), all.slice(INDICES.length));
    },
  });
}
