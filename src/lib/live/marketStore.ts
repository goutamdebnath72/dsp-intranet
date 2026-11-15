// src/lib/live/marketStore.ts
//
// THE SAVED MARKET QUOTES (table public.market_quote, src/lib/nl2sql/sql/24_market_quote.sql): the last good quote of each symbol with the time it was received. The markets card shows them, marked as not live,
// when Yahoo Finance does not answer (it turns away anyone who asks too fast), so the card is never empty on a bad minute and a restart of the server does not lose them.
// Nothing here may break a card: database trouble is logged once and the store then answers "nothing saved" (all) or does nothing (put), like src/lib/live/cpiStore.ts, whose pattern this follows.
import { DateTime } from "luxon";
import type { Quote } from "./markets";

export interface SavedQuote {
  quote: Quote;
  /** when it was received from Yahoo Finance (ms since the epoch) */
  at: number;
}

export interface MarketStore {
  all(): Promise<Map<string, SavedQuote>>;
  /** receivedAt: ms since the epoch */
  put(quotes: Quote[], receivedAt: number): Promise<void>;
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const MARKET_TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.market_quote (
     symbol     text        PRIMARY KEY,
     quote      jsonb       NOT NULL,
     fetched_at timestamptz NOT NULL
   )`,
  `ALTER TABLE public.market_quote ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.market_quote FROM anon, authenticated`,
];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** a saved row read back and CHECKED: a row that is not the shape written is dropped, never shown */
export function savedFromRow(x: any): SavedQuote | null {
  const q = typeof x?.quote === "string" ? safeJson(x.quote) : x?.quote;
  const at = x?.fetched_at instanceof Date ? x.fetched_at.getTime() : DateTime.fromISO(String(x?.fetched_at)).toMillis();
  if (!q || typeof q !== "object" || typeof x?.symbol !== "string" || q.symbol !== x.symbol || typeof q.name !== "string") return null;
  if (!finite(q.price) || q.price <= 0 || !finite(q.prevClose) || !finite(q.change) || !finite(q.pct) || typeof q.time !== "string" || !Array.isArray(q.spark) || !q.spark.every(finite) || !Number.isFinite(at)) return null;
  if ((q.high !== null && !finite(q.high)) || (q.low !== null && !finite(q.low))) return null;
  return { quote: q as Quote, at };
}
function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export function typeormMarketStore(ds: Queryable): MarketStore {
  let ready: Promise<boolean> | null = null;
  let failedAt = 0;
  let warned = false;

  const ensure = (): Promise<boolean> => {
    if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60 * 1000)) return ready;
    failedAt = 0;
    ready = (async () => {
      try {
        const have = rowsOf(await ds.query(`SELECT to_regclass('public.market_quote') AS t`));
        if (have[0]?.t) return true;
        for (const sql of MARKET_TABLE_STATEMENTS) await ds.query(sql);
        return true;
      } catch (e: any) {
        failedAt = Date.now();
        if (!warned) {
          warned = true;
          console.warn("[markets] the market store is not available (run src/lib/nl2sql/sql/24_market_quote.sql):", e?.message || e);
        }
        return false;
      }
    })();
    return ready;
  };

  return {
    async all() {
      const out = new Map<string, SavedQuote>();
      if (!(await ensure())) return out;
      try {
        for (const r of rowsOf(await ds.query(`SELECT symbol, quote, fetched_at FROM public.market_quote`))) {
          const s = savedFromRow(r);
          if (s) out.set(s.quote.symbol, s);
        }
      } catch (e: any) {
        console.warn("[markets] could not read the saved quotes:", e?.message || e);
      }
      return out;
    },
    async put(quotes, receivedAt) {
      if (!quotes.length || !(await ensure())) return;
      try {
        await ds.query(
          `INSERT INTO public.market_quote (symbol, quote, fetched_at)
                SELECT s, q::jsonb, $3::timestamptz FROM unnest($1::text[], $2::text[]) AS t(s, q)
           ON CONFLICT (symbol) DO UPDATE SET quote = EXCLUDED.quote, fetched_at = EXCLUDED.fetched_at`,
          [quotes.map((q) => q.symbol), quotes.map((q) => JSON.stringify(q)), DateTime.fromMillis(receivedAt).toUTC().toISO()],
        );
      } catch (e: any) {
        console.warn("[markets] could not save the quotes:", e?.message || e);
      }
    },
  };
}

/** a store that holds nothing, for when the database cannot be had at all: the card then works as it did before the store existed */
export const NO_STORE: MarketStore = { all: async () => new Map(), put: async () => undefined };

const stores = new WeakMap<object, MarketStore>();
export function marketStoreFor(ds: Queryable): MarketStore {
  let st = stores.get(ds);
  if (!st) {
    st = typeormMarketStore(ds);
    stores.set(ds, st);
  }
  return st;
}
