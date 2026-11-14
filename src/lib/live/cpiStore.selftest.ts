// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/cpiStore.selftest.ts
// The saved consumer price index: the table is made once, rows are written in batches and read back, a row that is not the shape written is not shown, and database trouble never breaks the card.
import { CPI_TABLE_STATEMENTS, cpiFromRow, typeormCpiStore } from "./cpiStore";
import type { CpiRow } from "./cpi";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

function fakeDb(opts: { tableExists?: boolean; failCreate?: boolean; failRead?: boolean; failWrite?: boolean } = {}) {
  const log: string[] = [];
  const rows = new Map<string, any>();
  let exists = opts.tableExists ?? false;
  return {
    log, rows,
    async query(sql: string, p: unknown[][] | unknown[] = []) {
      log.push(sql.replace(/\s+/g, " ").trim().slice(0, 36));
      if (/to_regclass/.test(sql)) return [{ t: exists ? "cpi_month" : null }];
      if (/^\s*CREATE TABLE/.test(sql)) { if (opts.failCreate) throw new Error("permission denied"); exists = true; return []; }
      if (/ENABLE ROW LEVEL|REVOKE/.test(sql)) return [];
      if (/^\s*INSERT INTO public\.cpi_month/.test(sql)) {
        if (opts.failWrite) throw new Error("disk full");
        const a = p as unknown[][];
        a[0].forEach((_, i) => rows.set(`${a[0][i]}|${a[1][i]}|${a[2][i]}|${a[3][i]}`, { base_year: a[0][i], month: a[1][i], state: a[2][i], sector: a[3][i], idx: a[4][i], inflation: a[5][i] }));
        return [];
      }
      if (/FROM public\.cpi_month/.test(sql)) { if (opts.failRead) throw new Error("connection lost"); return [...rows.values()]; }
      throw new Error("unexpected " + sql);
    },
  };
}

const R = (state: string, month: string, index: number, inflation: number | null = 3): CpiRow => ({ base: "2024", month, state, sector: "Combined", index, inflation });
(async () => {
  const db = fakeDb();
  const st = typeormCpiStore(db);
  ok("nothing saved at first", (await st.all()).length === 0);
  await st.put([R("All India", "2026-10", 110.05, 6.09), R("West Bengal", "2026-10", 108.33, null)], new Date());
  const back = await st.all();
  ok("rows are written and read back as they were (a missing rate stays null)", back.length === 2 && back.find((r) => r.state === "West Bengal")?.inflation === null && back.find((r) => r.state === "All India")?.index === 110.05, JSON.stringify(back));
  ok("the table is made once, with row-level security", db.log.filter((l) => /^CREATE TABLE/.test(l)).length === 1 && CPI_TABLE_STATEMENTS.some((s) => /ENABLE ROW LEVEL SECURITY/.test(s)) && CPI_TABLE_STATEMENTS.some((s) => /REVOKE ALL ON public\.cpi_month FROM anon, authenticated/.test(s)));
  await st.put([R("All India", "2026-10", 110.06, 6.1)], new Date());
  ok("a month received again replaces the saved one, never doubles it", (await st.all()).length === 2 && (await st.all()).find((r) => r.state === "All India")?.index === 110.06);
  const many = Array.from({ length: 1000 }, (_, i) => R(`S${i}`, "2026-09", 100 + (i % 10)));
  const d2 = fakeDb({ tableExists: true });
  await typeormCpiStore(d2).put(many, new Date());
  ok("a thousand rows go in batches of at most 400 (3 statements)", d2.log.filter((l) => /^INSERT/.test(l)).length === 3 && d2.rows.size === 1000);
  ok("a row that is not the shape written is not shown", cpiFromRow({ base_year: "2019", month: "2026-10", state: "X", sector: "Combined", idx: "1" }) === null && cpiFromRow({ base_year: "2024", month: "Oct", state: "X", sector: "Combined", idx: "1" }) === null && cpiFromRow({ base_year: "2024", month: "2026-10", state: "X", sector: "Mixed", idx: "1" }) === null && cpiFromRow({ base_year: "2024", month: "2026-10", state: "X", sector: "Rural", idx: "abc" }) === null && cpiFromRow({ base_year: "2024", month: "2026-10", state: "X", sector: "Rural", idx: "105.5", inflation: "4.1" })?.inflation === 4.1);
  const bad = typeormCpiStore(fakeDb({ failCreate: true }));
  ok("a database that cannot make the table: nothing saved, nothing thrown", (await bad.all()).length === 0 && (await bad.put([R("All India", "2026-10", 110)], new Date())) === undefined);
  const r1 = typeormCpiStore(fakeDb({ tableExists: true, failRead: true }));
  ok("a read that fails answers nothing saved", (await r1.all()).length === 0);
  const w1 = typeormCpiStore(fakeDb({ tableExists: true, failWrite: true }));
  ok("a write that fails does not throw", (await w1.put([R("All India", "2026-10", 110)], new Date())) === undefined);
  console.log(`cpiStore: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
