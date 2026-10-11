// src/lib/search/circularLabels.selftest.ts
// Run:  TEST_DATABASE_URL=postgres://user:pass@host:5432/dbname npx tsx src/lib/search/circularLabels.selftest.ts
// Creates a throwaway public.circulars and DROPS it; REFUSES to run if public.circulars already exists (a real database).
import { Client } from "pg";
import { fetchCircularLabels } from "./circularLabels";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("circularLabels selftest SKIPPED: set TEST_DATABASE_URL to a scratch Postgres.");
  process.exit(0);
}
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  if ((await c.query(`SELECT to_regclass('public.circulars') AS t`)).rows[0].t) {
    console.log("circularLabels selftest REFUSED: public.circulars already exists, so this looks like a real database. Use a scratch one.");
    await c.end();
    process.exit(2);
  }
  await c.query(`CREATE TABLE public.circulars (id serial PRIMARY KEY, headline text, "serialNumber" integer, "publishedAt" timestamp)`);
  try {
    await c.query(`INSERT INTO public.circulars (id, headline, "serialNumber", "publishedAt") VALUES
      (49, 'Circular - Gift card corrigendum', 7, '2026-08-08 10:00'),
      (51, 'Circular - Online option for Gift Card', 8, '2026-08-03 10:00'),
      (7,  'Notice for cancellation of JO written examination', 5, '2022-02-22 10:00'),
      (90, 'A circular with no serial number', NULL, '2026-05-01'),
      (91, 'Published on the last day of the year', 3, '2025-12-31 23:59:59'),
      (92, 'Published on the first day of the year', 1, '2026-01-01 00:00:00'),
      (93, 'A circular with a three-digit serial', 123, '2024-06-06')`);

    // the real node-postgres client returns { rows }
    const m = await fetchCircularLabels(c, [49, 51, 7, 90, 91, 92, 93, 4040]);
    check("id 49 -> 'Circular 007 (2026)' and id 51 -> 'Circular 008 (2026)' (what the 2026 list shows)", m.get(49) === "Circular 007 (2026)" && m.get(51) === "Circular 008 (2026)", JSON.stringify([...m]));
    check("an older year keeps ITS year: id 7 -> 'Circular 005 (2022)' (the serial 5 of 2022, not the id 7)", m.get(7) === "Circular 005 (2022)");
    check("a three-digit serial is not padded further: 'Circular 123 (2024)'", m.get(93) === "Circular 123 (2024)");
    check("the YEAR RULE is the upload's (year of the published date): 31 Dec 2025 23:59 -> 2025, 1 Jan 2026 00:00 -> 2026", m.get(91) === "Circular 003 (2025)" && m.get(92) === "Circular 001 (2026)", `${m.get(91)} | ${m.get(92)}`);
    check("a circular with no serial number and an id that does not exist are simply absent (they will be named by title)", !m.has(90) && !m.has(4040) && m.size === 6, String(m.size));
    check("no empty list, duplicates or junk ids cause an error", (await fetchCircularLabels(c, [])).size === 0 && (await fetchCircularLabels(c, [49, 49, 49])).size === 1 && (await fetchCircularLabels(c, [NaN as unknown as number, 1.5])).size === 0);

    // TypeORM's DataSource.query returns the rows themselves, not { rows }: the same code must work with that shape
    const typeormLike = { query: async (t: string, p?: unknown[]) => (await c.query(t, p as any[])).rows };
    const m2 = await fetchCircularLabels(typeormLike, [49, 51]);
    check("works with TypeORM's return shape (an array of rows) as well", m2.get(49) === "Circular 007 (2026)" && m2.size === 2);

    // a failing database must never break the answer
    const warn = console.warn;
    console.warn = () => {};
    const broken = await fetchCircularLabels({ query: async () => { throw new Error("connection lost"); } }, [49]);
    console.warn = warn;
    check("a failed lookup gives an EMPTY map (sources are then named by title), never an error", broken.size === 0);
  } finally {
    await c.query(`DROP TABLE IF EXISTS public.circulars`);
    await c.end();
  }
  console.log(`\ncircularLabels selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
