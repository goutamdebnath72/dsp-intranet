// scripts/seed-markets.ts: SAVES THE LAST GOOD QUOTE OF EACH SYMBOL of the Sensex, Nifty and watch-list card (table public.market_quote, src/lib/nl2sql/sql/24_market_quote.sql), slowly, so that the card has a copy to show
// when Yahoo Finance turns the app away. The app saves every quote it fetches by itself; I use this script for the first fill (or a refill after DELETE FROM public.market_quote) when Yahoo is in a mood to answer one at a time.
//   npx tsx --env-file=.env.local scripts/seed-markets.ts                  every symbol, 4 seconds apart, waiting and trying again when Yahoo says "too many requests"
//   npx tsx --env-file=.env.local scripts/seed-markets.ts --gap-ms 6000    seconds apart, in ms
//   npx tsx --env-file=.env.local scripts/seed-markets.ts --tries 6        attempts for each symbol (default 5, with a wait of a minute after each refusal)
//   npx tsx --env-file=.env.local scripts/seed-markets.ts list             what is saved
// It is safe to stop and run again: each quote is saved as soon as it is had, and a newer one replaces an older one of its symbol.
import { Pool } from "pg";
import { DateTime } from "luxon";
import { getJson, UpstreamError } from "../src/lib/live/http";
import { INDICES, WATCHLIST, parseYahooChart } from "../src/lib/live/markets";
import { MARKET_TABLE_STATEMENTS, typeormMarketStore } from "../src/lib/live/marketStore";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chartUrl = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;

async function main() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    for (const sql of MARKET_TABLE_STATEMENTS) await db.query(sql);
    const store = typeormMarketStore(db);
    if (process.argv[2] === "list") {
      const all = await store.all();
      for (const [sym, s] of all) console.log(`${sym.padEnd(14)} ${String(s.quote.price).padStart(10)}  price time ${s.quote.time}  received ${DateTime.fromMillis(s.at).setZone("Asia/Kolkata").toFormat("d LLL yyyy, h:mm a")} IST`);
      console.log(`${all.size} symbol(s) saved.`);
      return;
    }
    const gap = Number(arg("--gap-ms") ?? 4000), tries = Number(arg("--tries") ?? 5);
    let saved = 0;
    const failed: string[] = [];
    for (const inst of [...INDICES, ...WATCHLIST]) {
      let done = false;
      for (let t = 1; t <= tries && !done; t++) {
        try {
          const q = parseYahooChart(await getJson<unknown>(chartUrl(inst.symbol), { timeoutMs: 8000 }), inst);
          if (!q) { console.log(`${inst.name}: the answer held no usable price`); break; }
          await store.put([q], Date.now());
          saved++; done = true;
          console.log(`${inst.name}: saved ${q.price} (price time ${q.time})`);
        } catch (e) {
          const refused = e instanceof UpstreamError && e.status === 429;
          console.log(`${inst.name}: ${refused ? "Yahoo says too many requests" : (e as Error).message} (try ${t} of ${tries})${refused && t < tries ? ", waiting a minute" : ""}`);
          if (refused && t < tries) await sleep(60_000);
        }
      }
      if (!done) failed.push(inst.name);
      await sleep(gap);
    }
    console.log(`Saved ${saved} of ${INDICES.length + WATCHLIST.length}.${failed.length ? ` Not saved: ${failed.join(", ")}. Run again later.` : ""}`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
