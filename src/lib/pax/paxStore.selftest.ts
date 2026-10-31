// Run (from the project root; needs a scratch Postgres):
//   NL2SQL_TEST_ADMIN_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx tsx --tsconfig tsconfig.json src/lib/pax/paxStore.selftest.ts
// Step 63a: the REAL loader (store.ts) and the REAL route (runOmnibar) against a small database that holds the table as the handoff describes it.
//
// HONEST NOTE: sql/12_pax_directory.sql is not in the repository; the table below is rebuilt from the handoff's description (columns id, dept_name, location, number, label, note, source, created_at, updated_at;
// UNIQUE (label, number); a function public.pax_area(number); row level security with everything revoked from the public API roles). The numbers other than the ones the handoff names are INVENTED.
// What this test proves: the loader's SQL is valid Postgres and reads those columns; the area words of the function are understood; the route answers from rows READ FROM A TABLE.
// What it cannot prove: that the live table has exactly these columns. The read-only file cleanup/sql/63a_check_pax_directory.sql shows the live table's real shape (run it once).

import { Client } from "pg";
import { runOmnibar } from "../nl2sql/omnibar";
import { answerPax } from "./answer";
import { loadPaxRows } from "./store";

const admin = process.env.NL2SQL_TEST_ADMIN_URL;
if (!admin) {
  console.log("paxStore selftest: skipped (NL2SQL_TEST_ADMIN_URL is not set)");
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const DB = "pax_selftest";

const SEED: Array<[string, string, string, string]> = [
  // dept_name, location, number, label (the label as printed)
  ["Civil", "A - Zone", "40101", "Civil (A - Zone)"], ["Civil", "B - Zone", "40102", "Civil (B - Zone)"],
  ["Fire Service", "", "42046", "Fire Service"],
  ["C & IT", "Console", "40511", "C & IT (Console)"], ["Network Team", "C & IT", "40521", "Network Team (C & IT)"],
  ["CISF Tumla Gate", "", "42043", "CISF Tumla Gate"], ["Weigh Bridge - Tumla Gate", "", "42043", "Weigh Bridge - Tumla Gate"],
  ["CISF Main Hospital", "", "46298", "CISF Main Hospital"],
  ["PAX Complain", "In Plant", "40221", "PAX Complain (In Plant)"], ["PAX Complain", "Township", "45221", "PAX Complain (Township)"],
  ["Township Garage", "", "45310", "Township Garage"],
];

async function build(areaWords: { plant: string; outside: string; none: string }): Promise<Client> {
  const a = new Client({ connectionString: admin });
  await a.connect();
  await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await a.query(`CREATE DATABASE ${DB}`);
  await a.end();
  const c = new Client({ connectionString: admin!.replace(/\/[^/]*$/, `/${DB}`) });
  await c.connect();
  await c.query(`
    CREATE TABLE public.pax_directory (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, dept_name text NOT NULL, location text NOT NULL DEFAULT '', number text NOT NULL, label text NOT NULL,
      note text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'PAX_Phone_numbers.docx', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (label, number), CHECK (number ~ '^[0-9]{3,6}$'), CHECK (length(btrim(dept_name)) > 0 AND length(btrim(label)) > 0));
    CREATE FUNCTION public.pax_area(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
      SELECT CASE WHEN n ~ '^4[0-2][0-9]{3}$' THEN '${areaWords.plant}' WHEN n ~ '^45[0-9]{3}$' OR n ~ '^5[0-9]{4}$' THEN '${areaWords.outside}' ELSE '${areaWords.none}' END $f$;
    ALTER TABLE public.pax_directory ENABLE ROW LEVEL SECURITY;`);
  for (const [d, l, n, label] of SEED) await c.query(`INSERT INTO public.pax_directory (dept_name, location, number, label) VALUES ($1,$2,$3,$4)`, [d, l, n, label]);
  return c;
}

async function main() {
  const c = await build({ plant: "plant", outside: "outside plant", none: "not classified" });
  const query = async (sql: string, params?: unknown[]) => (await c.query(sql, params as never[])).rows;

  const rows = await loadPaxRows(query);
  ok("the loader reads all rows of the table", rows.length === SEED.length, String(rows.length));
  ok("...with the label as printed, the number, and the area from the database function", rows.some((r) => r.label === "Fire Service" && r.number === "42046" && r.area === "plant") && rows.some((r) => r.number === "45221" && r.area === "outside") && rows.some((r) => r.number === "46298" && r.area === "unclassified"));
  ok("...dept_name and location are kept for matching", rows.some((r) => r.deptName === "Civil" && r.location === "A - Zone"));

  const real = (q: string) => answerPax(q, () => loadPaxRows(query));
  let a = await real("pax number of fire service");
  ok("end to end from the table: 'pax number of fire service' -> 42046, in the plant", a?.card.headline?.text === "42046" && /in the plant/.test(a.summary), JSON.stringify(a?.card.headline));
  a = await real("who has 42043");
  ok("end to end: 'who has 42043' -> two names share it (the number the handoff says is on two names)", a?.card.headline?.text === "2 names share 42043");
  a = await real("pax complaint township");
  ok("end to end: 'pax complaint township' -> 45221", a?.card.headline?.text === "45221");
  a = await real("pax");
  ok("end to end: 'pax' -> the directory: 10 distinct numbers on 11 entries", a?.card.headline?.text === "10 PAX numbers" && a.card.table?.rows.length === 11, JSON.stringify(a?.card.headline));

  // through the real runOmnibar, the model's client must stay untouched
  let modelClient = 0;
  const deps = {
    enabled: true, verifiedMin: 1, skipModel: true, legacy: async () => null, holiday: async () => null, hospital: async () => null,
    pax: async (q: string) => { const r = await real(q); return r ? ({ kind: "count", answer: r.summary, hospital: r.card, interpretation: r.interpretation } as never) : null; },
    llm: async () => { throw new Error("no model"); },
    withClient: async () => { modelClient++; throw new Error("the model's client must not be used"); },
  } as never;
  const o = (await runOmnibar("pax fire servise", "U1", deps)) as { hospital?: { headline?: { text: string } }; source?: string; interpretation?: string } | null;
  ok("runOmnibar over the table: a misspelt name is found, the correction is said, the model's client is never used", o?.hospital?.headline?.text === "42046" && /Read “servise” as “service”/.test(o.interpretation ?? "") && o.source === "holiday" && modelClient === 0, JSON.stringify(o));

  // a different wording of the area function must not turn a plant number into "not classified"
  await c.end();
  const c2 = await build({ plant: "In plant", outside: "Outside_plant", none: "Not classified" });
  const rows2 = await loadPaxRows(async (sql, params) => (await c2.query(sql, params as never[])).rows);
  ok("another wording of the area function ('In plant', 'Outside_plant', 'Not classified') gives the same areas", rows2.some((r) => r.number === "42046" && r.area === "plant") && rows2.some((r) => r.number === "45310" && r.area === "outside") && rows2.some((r) => r.number === "46298" && r.area === "unclassified"));
  await c2.end();

  console.log(`paxStore selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
