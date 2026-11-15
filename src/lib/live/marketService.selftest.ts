// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/marketService.selftest.ts
// The markets answer with its saved copy: fresh quotes are saved, a source that turns us away falls back to the last good quotes (memory, then the saved copy) marked as such, and only nothing at all is an error.
import { marketsAnswer, QUOTE_TTL_MS, type MarketDeps } from "./marketService";
import { INDICES, WATCHLIST, type Instrument, type Quote } from "./markets";
import type { MarketStore, SavedQuote } from "./marketStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const quoteOf = (i: Instrument, price = 100): Quote => ({ symbol: i.symbol, name: i.name, price, prevClose: 99, change: price - 99, pct: Math.round(((price - 99) / 99) * 10000) / 100, high: price + 1, low: price - 1, time: "2026-11-13T10:00:00.000Z", spark: [price - 1, price] });
const ALL = [...INDICES, ...WATCHLIST];

function world(o: { answers?: "all" | "none" | "firstThenAway"; savedRows?: string[]; storeFails?: boolean; kept?: Record<string, { price: number; ageMs: number }> } = {}) {
  let t = Date.parse("2026-11-15T07:00:00Z");
  const asked: string[] = [], puts: Quote[][] = [], memory = new Map<string, { value: Quote; at: number }>();
  for (const [sym, k] of Object.entries(o.kept ?? {})) { const inst = ALL.find((x) => x.symbol === sym)!; memory.set(`quote:${sym}`, { value: quoteOf(inst, k.price), at: t - k.ageMs }); }
  const saved = new Map<string, SavedQuote>();
  for (const sym of o.savedRows ?? []) saved.set(sym, { quote: quoteOf(ALL.find((x) => x.symbol === sym)!, 50), at: Date.parse("2026-11-13T10:30:00Z") });
  const store: MarketStore = { all: async () => { if (o.storeFails) throw new Error("db down"); return saved; }, put: async (q) => { puts.push(q); } };
  const deps: MarketDeps = {
    fetchOne: async (inst) => {
      asked.push(inst.symbol);
      const mode = o.answers ?? "all";
      if (mode === "none" || (mode === "firstThenAway" && asked.length > 1)) throw Object.assign(new Error("429"), { status: 429 });
      return quoteOf(inst, 200);
    },
    isTurnedAway: (e) => (e as { status?: number })?.status === 429,
    recall: (k) => memory.get(k) ?? null,
    remember: (k, v) => { memory.set(k, { value: v, at: t }); },
    store, now: () => t, pause: async () => { t += 1; }, pauseMs: 0,
  };
  return { deps, asked, puts, memory };
}

void (async () => {
// 1. everything answers: fresh figures, no 'saved', and every quote saved
{
  const w = world();
  const d = await marketsAnswer(w.deps);
  ok("when Yahoo answers, the figures are fresh, nothing is marked saved, and every quote is saved for later", d.saved === undefined && d.indices.length === 3 && d.stocks.length === WATCHLIST.length && d.missing.length === 0 && w.puts.length === 1 && w.puts[0].length === ALL.length);
}
// 2. the source turns us away at the first symbol: the saved copy fills the card; no more symbols are asked
{
  const w = world({ answers: "none", savedRows: ALL.map((x) => x.symbol) });
  const d = await marketsAnswer(w.deps);
  ok("when Yahoo turns us away the saved copy is shown, all of it marked saved with the time it was received; Yahoo is asked once, not for every symbol", d.saved?.names.length === ALL.length && d.saved?.at === "2026-11-13T10:30:00.000Z" && d.indices[0].price === 50 && w.asked.length === 1 && w.puts.length === 0 && d.missing.length === 0, JSON.stringify({ n: d.saved?.names.length, asked: w.asked.length }));
}
// 3. a mix: the first symbol fresh, the others from the saved copy; the oldest copy time is given
{
  const w = world({ answers: "firstThenAway", savedRows: ALL.slice(1).map((x) => x.symbol) });
  const d = await marketsAnswer(w.deps);
  ok("a mix of fresh and saved: only the saved ones are named, the fresh one is kept and saved", d.saved?.names.length === ALL.length - 1 && !d.saved?.names.includes("Sensex") && d.indices[0].price === 200 && d.indices[1].price === 50 && w.puts[0]?.length === 1);
}
// 4. a quote in memory that is older than five minutes counts as a copy; one younger than five minutes is used without asking
{
  const w = world({ answers: "none", kept: { "^BSESN": { price: 77, ageMs: 10 * 60 * 1000 }, "^NSEI": { price: 88, ageMs: 60 * 1000 } }, savedRows: ["^NSEBANK"] });
  const d = await marketsAnswer(w.deps);
  ok("memory: a quote younger than five minutes is used as fresh without asking; an older one is a copy (marked); a saved row fills another; the rest are missing", d.indices.find((x) => x.name === "Nifty 50")?.price === 88 && !d.saved?.names.includes("Nifty 50") && !!d.saved?.names.includes("Sensex") && !!d.saved?.names.includes("Nifty Bank") && d.missing.length === WATCHLIST.length && QUOTE_TTL_MS === 5 * 60 * 1000, JSON.stringify(d.saved));
}
// 5. the newer of a memory copy and a saved row wins
{
  const w = world({ answers: "none", kept: { "^BSESN": { price: 77, ageMs: 10 * 60 * 1000 } }, savedRows: ["^BSESN"] });
  const d = await marketsAnswer(w.deps);
  ok("the newer of the copy in memory (10 minutes old) and the saved row (two days old) is shown", d.indices[0].price === 77);
}
// 6. nothing at all is an error; a store that fails does not break the answer
{
  let threw = "";
  try { await marketsAnswer(world({ answers: "none" }).deps); } catch (e) { threw = (e as Error).message; }
  ok("nothing fresh, in memory or saved is the plain error", /did not answer/.test(threw), threw);
  const w = world({ answers: "none", storeFails: true, kept: { "^BSESN": { price: 77, ageMs: 10 * 60 * 1000 } } });
  const d2 = await marketsAnswer(w.deps);
  ok("a store that throws does not break the answer: the copy in memory is still shown", d2.indices[0].price === 77 && d2.saved?.names.join() === "Sensex");
}

console.log(`marketService: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
