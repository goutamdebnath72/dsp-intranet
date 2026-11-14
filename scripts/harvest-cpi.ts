// scripts/harvest-cpi.ts: LOAD THE CONSUMER PRICE INDEX OF MoSPI INTO THE DATABASE (public.cpi_month): the new series (base 2024) from January 2026 to the latest month due, every State and sector, and the old series
// (base 2012) of all India from 2016 to December 2025, which gives the inflation chart its ten years. About 20 requests to MoSPI's open service (no login, no key), one after the other.
// The card does this by itself the first time, and tops up a missing month later; running this puts the data there beforehand, or re-reads everything (rows are replaced, nothing is duplicated).
//   npx tsx --env-file=.env.local scripts/harvest-cpi.ts          load everything
//   npx tsx --env-file=.env.local scripts/harvest-cpi.ts list     what is saved
import { Client } from "pg";
import { askAll } from "../src/lib/live/cpi";
import { CPI_TABLE_STATEMENTS, typeormCpiStore } from "../src/lib/live/cpiStore";

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    for (const sql of CPI_TABLE_STATEMENTS) await db.query(sql);
    if (process.argv[2] !== "list") {
      console.log("Asking MoSPI (about 20 requests)...");
      const rows = await askAll();
      await typeormCpiStore(db).put(rows, new Date());
      console.log(`Received and saved ${rows.length} rows.`);
    }
    const r = await db.query(`SELECT base_year, count(*)::int AS rows, min(month) AS first, max(month) AS last, max(fetched_at) AS received FROM public.cpi_month GROUP BY base_year ORDER BY base_year`);
    for (const x of r.rows) console.log(`base ${x.base_year}: ${x.rows} rows, ${x.first} to ${x.last}, last received ${new Date(x.received).toISOString()}`);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
