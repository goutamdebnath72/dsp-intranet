// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/marketStore.selftest.ts
// The saved market quotes: the table is made once, quotes are written in one statement and read back, a row that is not the shape written is not shown, and database trouble never breaks the card.
import { MARKET_TABLE_STATEMENTS, NO_STORE, savedFromRow, typeormMarketStore } from "./marketStore";
import type { Quote } from "./markets";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const quote = (symbol: string, price = 100): Quote => ({ symbol, name: symbol, price, prevClose: 99, change: 1, pct: 1.01, high: 101, low: 98, time: "2026-11-13T10:00:00.000Z", spark: [99, 100] });

function fakeDb(o: { tableExists?: boolean; failCreate?: boolean; failRead?: boolean; failWrite?: boolean } = {}) {
  const log: string[] = [];
  const rows = new Map<string, { symbol: string; quote: string; fetched_at: string }>();
  let exists = o.tableExists ?? false;
  return {
    log, rows,
    async query(sql: string, p: unknown[] = []) {
      log.push(sql.replace(/\s+/g, " ").trim().slice(0, 30));
      if (/to_regclass/.test(sql)) return [{ t: exists ? "market_quote" : null }];
      if (/^\s*CREATE TABLE/.test(sql)) { if (o.failCreate) throw new Error("permission denied"); exists = true; return []; }
      if (/ENABLE ROW LEVEL|REVOKE/.test(sql)) return [];
      if (/^\s*INSERT INTO public\.market_quote/.test(sql)) {
        if (o.failWrite) throw new Error("disk full");
        const [syms, qs, at] = p as [string[], string[], string];
        syms.forEach((s, i) => rows.set(s, { symbol: s, quote: qs[i], fetched_at: at }));
        return [];
      }
      if (/FROM public\.market_quote/.test(sql)) { if (o.failRead) throw new Error("connection lost"); return [...rows.values()]; }
      throw new Error("unexpected " + sql);
    },
  };
}

void (async () => {
const warn = console.warn; console.warn = () => undefined;

// The table is made once, then quotes go in and come back, newer replacing older.
{
  const db = fakeDb(); const st = typeormMarketStore(db);
  await st.put([quote("^BSESN", 100), quote("SAIL.NS", 120)], Date.parse("2026-11-13T10:30:00Z"));
  await st.put([quote("^BSESN", 105)], Date.parse("2026-11-13T11:00:00Z"));
  const all = await st.all();
  ok("the table is created once; two symbols are kept and a newer quote replaces the older of its symbol", db.log.filter((l) => l.startsWith("CREATE TABLE")).length === 1 && all.size === 2 && all.get("^BSESN")?.quote.price === 105 && all.get("^BSESN")?.at === Date.parse("2026-11-13T11:00:00Z") && all.get("SAIL.NS")?.quote.price === 120);
  ok("the quotes of one write travel in ONE statement", db.log.filter((l) => l.startsWith("INSERT")).length === 2);
}
// An existing table is not made again, and having nothing to write does not touch the database.
{
  const db = fakeDb({ tableExists: true }); const st = typeormMarketStore(db);
  await st.put([], Date.now()); await st.all();
  ok("an existing table is left alone and an empty write asks nothing", !db.log.some((l) => l.startsWith("CREATE")) && !db.log.some((l) => l.startsWith("INSERT")));
}
// A row that is not the shape written is dropped.
{
  const good = { symbol: "A", quote: JSON.stringify(quote("A")), fetched_at: "2026-11-13T10:30:00Z" };
  ok("a good row is read back (the quote as text or as an object)", savedFromRow(good)?.quote.price === 100 && savedFromRow({ ...good, quote: quote("A") })?.at === Date.parse("2026-11-13T10:30:00Z"));
  ok("rows of the wrong shape are dropped, never shown", [null, {}, { ...good, symbol: "B" }, { ...good, quote: "not json" }, { ...good, quote: JSON.stringify({ ...quote("A"), price: -1 }) }, { ...good, quote: JSON.stringify({ ...quote("A"), spark: ["x"] }) }, { ...good, fetched_at: "never" }, { ...good, quote: JSON.stringify({ ...quote("A"), high: "x" }) }].every((r) => savedFromRow(r) === null));
}
// I check that database trouble never breaks the card.
{
  const a = typeormMarketStore(fakeDb({ failCreate: true }));
  await a.put([quote("A")], Date.now());
  ok("when the table cannot be made, reading gives nothing and writing does nothing, without a throw", (await a.all()).size === 0);
  const b = typeormMarketStore(fakeDb({ tableExists: true, failRead: true, failWrite: true }));
  await b.put([quote("A")], Date.now());
  ok("a failed read gives nothing and a failed write is swallowed", (await b.all()).size === 0);
  ok("the empty store holds nothing and writes nothing", (await NO_STORE.all()).size === 0 && (await NO_STORE.put([quote("A")], Date.now())) === undefined);
}
ok("the table is made with row level security on and no public access", MARKET_TABLE_STATEMENTS.length === 3 && /ROW LEVEL SECURITY/.test(MARKET_TABLE_STATEMENTS[1]) && /REVOKE ALL/.test(MARKET_TABLE_STATEMENTS[2]));

console.warn = warn;
console.log(`marketStore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
