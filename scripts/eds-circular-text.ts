// scripts/eds-circular-text.ts: prints the stored text of circulars whose headline matches a word, for checking a briefing against its source.
//   npx tsx --env-file=.env.local scripts/eds-circular-text.ts "Retention of Company Accomodation"
import { Client } from "pg";
async function main() {
  const word = process.argv[2] || "";
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, headline, "publishedAt" FROM public.circulars WHERE headline ILIKE $1 ORDER BY id`, [`%${word}%`]);
    for (const row of r.rows) {
      console.log(`\n##### id=${row.id} | ${row.headline} | ${row.publishedAt}`);
      const t = await c.query(`SELECT text FROM public.circular_chunks WHERE circular_id=$1 ORDER BY chunk_index`, [row.id]);
      console.log(t.rows.map((x) => x.text).join("\n"));
    }
  } finally { await c.end(); }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
