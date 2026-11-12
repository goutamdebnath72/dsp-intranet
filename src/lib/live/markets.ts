// src/lib/live/markets.ts
//
// SENSEX, NIFTY AND A WATCH LIST OF SHARES, from Yahoo Finance's public chart feed (one small request per symbol, kept five minutes on the server, so the load on the source is light).
// Prices there may be delayed (about fifteen minutes) and the card says so. "Trending" means the biggest movers of a FIXED WATCH LIST of large companies (SAIL among them), not of the whole market:
// the card names the list instead of claiming more. This is market data, never advice.
// Pure: the feed's JSON in, the numbers out (tested on a hand-made sample of the feed's documented shape; a live check needs the source to be answering).
import { DateTime } from "luxon";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  pct: number;
  high: number | null;
  low: number | null;
  /** ISO time of the last price */
  time: string;
  /** the day's prices, for a small line (up to 40 points) */
  spark: number[];
}

export interface Instrument {
  symbol: string;
  name: string;
}

export const INDICES: Instrument[] = [
  { symbol: "^BSESN", name: "Sensex" },
  { symbol: "^NSEI", name: "Nifty 50" },
  { symbol: "^NSEBANK", name: "Nifty Bank" },
];

/** the fixed watch list: SAIL first, then large companies across sectors (steel peers among them) */
export const WATCHLIST: Instrument[] = [
  { symbol: "SAIL.NS", name: "SAIL" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel" },
  { symbol: "HINDALCO.NS", name: "Hindalco" },
  { symbol: "RELIANCE.NS", name: "Reliance Industries" },
  { symbol: "TCS.NS", name: "TCS" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank" },
  { symbol: "INFY.NS", name: "Infosys" },
  { symbol: "SBIN.NS", name: "State Bank of India" },
  { symbol: "ITC.NS", name: "ITC" },
  { symbol: "LT.NS", name: "Larsen & Toubro" },
];

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A quote from one chart answer; null when the answer does not hold a usable price (never a guess). */
export function parseYahooChart(json: unknown, inst: Instrument): Quote | null {
  const res = (json as YahooChart)?.chart?.result?.[0];
  const m = res?.meta;
  if (!m || !finite(m.regularMarketPrice) || m.regularMarketPrice <= 0) return null;
  const prev = finite(m.chartPreviousClose) ? m.chartPreviousClose : finite(m.previousClose) ? m.previousClose : null;
  if (prev === null || prev <= 0) return null;
  const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter(finite);
  const step = Math.max(1, Math.ceil(closes.length / 40));
  const spark = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);
  const time = finite(m.regularMarketTime) ? (DateTime.fromSeconds(m.regularMarketTime).toUTC().toISO() ?? "") : "";
  return {
    symbol: inst.symbol,
    name: inst.name,
    price: r2(m.regularMarketPrice),
    prevClose: r2(prev),
    change: r2(m.regularMarketPrice - prev),
    pct: r2(((m.regularMarketPrice - prev) / prev) * 100),
    high: finite(m.regularMarketDayHigh) ? r2(m.regularMarketDayHigh) : null,
    low: finite(m.regularMarketDayLow) ? r2(m.regularMarketDayLow) : null,
    time,
    spark,
  };
}

export interface MarketsData {
  indices: Quote[];
  stocks: Quote[];
  /** the names that could not be fetched this time */
  missing: string[];
  gainers: Quote[];
  losers: Quote[];
}

/** The biggest risers and fallers of the quotes (only those that actually moved, three of each). */
export function movers(stocks: Quote[], n = 3): { gainers: Quote[]; losers: Quote[] } {
  const sorted = [...stocks].sort((a, b) => b.pct - a.pct);
  return { gainers: sorted.filter((q) => q.pct > 0).slice(0, n), losers: sorted.filter((q) => q.pct < 0).slice(-n).reverse() };
}

export function buildMarkets(indices: Array<Quote | null>, stocks: Array<Quote | null>): MarketsData {
  const idx = indices.filter((q): q is Quote => !!q);
  const st = stocks.filter((q): q is Quote => !!q);
  if (!idx.length && !st.length) throw new Error("The market data source did not answer.");
  const missing = [...INDICES.filter((_, i) => !indices[i]), ...WATCHLIST.filter((_, i) => !stocks[i])].map((x) => x.name);
  return { indices: idx, stocks: st, missing, ...movers(st) };
}

/** Whether the last price is from the trading session now: NSE and BSE trade 9:15 to 15:30 IST on weekdays, and a price older than 20 minutes is the last close. */
export function sessionState(quoteTimeIso: string, now: DateTime): "live" | "closed" {
  const t = DateTime.fromISO(quoteTimeIso);
  if (!t.isValid) return "closed";
  const ist = now.setZone("Asia/Kolkata");
  const open = ist.weekday <= 5 && ist.hour * 60 + ist.minute >= 9 * 60 + 15 && ist.hour * 60 + ist.minute <= 15 * 60 + 35;
  return open && now.diff(t, "minutes").minutes <= 20 ? "live" : "closed";
}
