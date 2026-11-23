// src/app/api/live/gold/route.ts
//
// Gold and silver in India (IBJA rates and their trend). I read nothing from the caller; I ask the IBJA page, read it with src/lib/live/gold.ts, and answer with the source and the time.
// The trend is IBJA's own record (about four months), lengthened to a year with ESTIMATED days from the NSE gold/silver ETFs when those can be had (always marked as estimates).
// If the page cannot be reached I return the last good answer, marked stale; if the page has changed so that the numbers cannot be found, it is an error, never a guess.
import { getJson, getText, UpstreamError } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { extendHistory, looksLikeGoldAnswer, parseEtfSeries, parseIbja, type EtfSeries } from "@/lib/live/gold";
import { getDb } from "@/lib/db";
import { NO_SNAPSHOT_STORE, snapshotStoreFor, type SnapshotStore } from "@/lib/live/snapshotStore";
import { memo } from "@/lib/live/memo";
import { todayIn, yearAgo } from "@/lib/live/yearWindow";
import snapshot from "@/lib/live/etfSnapshot.json";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const URL_IBJA = "https://ibjarates.com/";
// For the year before IBJA's page begins I use the NSE-traded gold and silver ETFs (see the end of src/lib/live/gold.ts). Fixed addresses, asked at most once in six hours.
// I ask from a week BEFORE the date one year back (so that the day of that date, or the trading day before it, is in the record) to now
const etfUrl = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${Math.floor(todayIn().minus({ years: 1, days: 7 }).toSeconds())}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** This is the copy of the two records kept with the app: past prices do not change, so I serve it whenever the live source does not answer */
function savedRecords(): { gold: EtfSeries; silver: EtfSeries; savedThrough: string } | null {
  const gold = parseEtfSeries(snapshot.gold), silver = parseEtfSeries(snapshot.silver);
  return gold && silver ? { gold, silver, savedThrough: snapshot.savedThrough } : null;
}

/** Returns the two ETF records (live, else the saved copy), or why neither could be had (the chart then stays on IBJA's own days). It never throws. */
async function etfRecords(): Promise<{ gold: EtfSeries; silver: EtfSeries; savedThrough?: string } | { why: string }> {
  try {
    const { value } = await memo(`gold-etf-from-${yearAgo()}`, 6 * 60 * 60 * 1000, async () => {
      const gold = parseEtfSeries(await getJson<unknown>(etfUrl("GOLDBEES.NS"), { timeoutMs: 6000 }));
      await pause(350);
      const silver = parseEtfSeries(await getJson<unknown>(etfUrl("SILVERBEES.NS"), { timeoutMs: 6000 }));
      if (!gold || !silver) throw new UpstreamError("The ETF price record could not be read.");
      return { gold, silver };
    });
    return value;
  } catch (e) {
    return savedRecords() ?? { why: e instanceof Error ? e.message : "The ETF price record could not be had." };
  }
}

/** Returns the saved last good answer, or none when the database cannot be had: I do not let the card fail because of it */
async function savedAnswers(): Promise<SnapshotStore> {
  try { return snapshotStoreFor(await getDb()); } catch { return NO_SNAPSHOT_STORE; }
}

export async function GET() {
  return liveRoute({
    key: "gold",
    ttlMs: 10 * 60 * 1000,
    source: "IBJA (India Bullion and Jewellers Association)",
    sourceUrl: URL_IBJA,
    // I also keep the last good answer in the database (src/lib/live/snapshotStore.ts): after a restart, or a quiet night with IBJA unreachable, the card shows it marked stale with its own time instead of an error
    persist: { store: savedAnswers, check: looksLikeGoldAnswer },
    // The rates are IBJA's; the estimated earlier months (when there are any) use the closing prices of the NSE gold and silver funds, which come from Yahoo Finance. I name and link both.
    sourceLinks: (d) => [{ name: "IBJA (India Bullion and Jewellers Association)", url: URL_IBJA }, ...("estimate" in d && d.estimate ? [{ name: "Yahoo Finance (NSE gold and silver fund prices, for the estimated earlier months)", url: "https://finance.yahoo.com/" }] : [])],
    load: async () => {
      const rates = parseIbja(await getText(URL_IBJA));
      if (!rates) throw new UpstreamError("The IBJA page no longer has the rates where they were expected.");
      const etf = await etfRecords();
      if ("why" in etf) return { ...rates, estimateUnavailable: etf.why };
      const extended = extendHistory(rates, etf.gold, etf.silver, etf.savedThrough);
      return extended.estimate ? extended : { ...rates, estimateUnavailable: "The ETF prices did not follow IBJA's rates closely enough to be used." };
    },
  });
}
