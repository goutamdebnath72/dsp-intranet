// src/lib/live/marketService.ts
//
// THE SENSEX, NIFTY AND WATCH-LIST ANSWER, with a copy kept for the bad minutes. Yahoo Finance turns away anyone who asks too fast, so each symbol is asked one at a time, kept five minutes in memory, and at the first
// "too many requests" no more are asked. A symbol that could not be had now falls back to its LAST GOOD QUOTE: first the one in memory, then the one saved in the database (src/lib/live/marketStore.ts, which survives a
// restart). Those quotes are shown as they were, with `saved` saying which ones and when they were received, so the card can say "not live" and never shows an old figure as new. Only when there is nothing at all
// is it an error. Every fresh quote is saved. Pure but for what it is handed (the fetcher, the memory, the store), so it is tested without the network.
import { DateTime } from "luxon";
import { INDICES, WATCHLIST, buildMarkets, type Instrument, type MarketsData, type Quote } from "./markets";
import type { MarketStore, SavedQuote } from "./marketStore";

export const QUOTE_TTL_MS = 5 * 60 * 1000;
const keyOf = (symbol: string) => `quote:${symbol}`;

export interface MarketDeps {
  /** asks the source for one symbol: a quote, null when the answer holds no usable price, and a throw when it fails */
  fetchOne(inst: Instrument): Promise<Quote | null>;
  /** whether a failure is the source turning us away (then no more symbols are asked) */
  isTurnedAway(e: unknown): boolean;
  recall(key: string): { value: Quote; at: number } | null;
  remember(key: string, value: Quote): void;
  store: MarketStore;
  now(): number;
  pause(ms: number): Promise<void>;
  pauseMs?: number;
}

export async function marketsAnswer(d: MarketDeps): Promise<MarketsData> {
  const list: Instrument[] = [...INDICES, ...WATCHLIST];
  const got = new Map<string, { q: Quote; savedAt?: number }>();
  const fresh: Quote[] = [];
  const lacking: Array<{ inst: Instrument; kept: { value: Quote; at: number } | null }> = [];
  let turnedAway = false;
  for (const inst of list) {
    const kept = d.recall(keyOf(inst.symbol));
    if (kept && d.now() - kept.at < QUOTE_TTL_MS) { got.set(inst.symbol, { q: kept.value }); continue; }
    if (!turnedAway) {
      try {
        const q = await d.fetchOne(inst);
        if (q) { d.remember(keyOf(inst.symbol), q); fresh.push(q); got.set(inst.symbol, { q }); }
      } catch (e) {
        if (d.isTurnedAway(e)) turnedAway = true;
      }
      await d.pause(d.pauseMs ?? 350);
      if (got.has(inst.symbol)) continue;
    }
    lacking.push({ inst, kept });
  }
  // what could not be had now: the last good quote in memory, else the one saved in the database
  if (lacking.length) {
    const saved = await d.store.all().catch(() => new Map<string, SavedQuote>());
    for (const { inst, kept } of lacking) {
      const s = saved.get(inst.symbol);
      const best = kept && (!s || kept.at >= s.at) ? { q: kept.value, at: kept.at } : s ? { q: s.quote, at: s.at } : null;
      if (best) got.set(inst.symbol, { q: best.q, savedAt: best.at });
    }
  }
  if (fresh.length) await d.store.put(fresh, d.now()).catch(() => undefined);
  const data = buildMarkets(INDICES.map((i) => got.get(i.symbol)?.q ?? null), WATCHLIST.map((i) => got.get(i.symbol)?.q ?? null));
  const old = list.filter((i) => got.get(i.symbol)?.savedAt !== undefined);
  if (old.length) data.saved = { at: DateTime.fromMillis(Math.min(...old.map((i) => got.get(i.symbol)!.savedAt!))).toUTC().toISO() ?? "", names: old.map((i) => i.name) };
  return data;
}
