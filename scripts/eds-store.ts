// scripts/eds-store.ts: look at, or empty, the permanent store of Executive Deep Synthesis briefings (table public.eds_briefing).
//   npx tsx --env-file=.env.local scripts/eds-store.ts list
//   npx tsx --env-file=.env.local scripts/eds-store.ts clear "retention"      (removes the briefings whose question contains that text)
//   npx tsx --env-file=.env.local scripts/eds-store.ts clear --all
import { Client } from "pg";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const have = (await c.query(`SELECT to_regclass('public.eds_briefing') AS t`)).rows[0].t;
    if (!have) return console.log("The table public.eds_briefing does not exist yet (it is created on the first synthesis, or run src/lib/nl2sql/sql/20_eds_briefing.sql).");
    if (cmd === "list" || !cmd) {
      const r = await c.query(`SELECT left(query_text, 90) AS q, score, engine, fingerprint, created_at FROM public.eds_briefing ORDER BY created_at DESC`);
      console.log(`${r.rows.length} stored briefing(s)`);
      for (const x of r.rows) console.log(`  score ${String(x.score).padStart(3)} | ${x.created_at.toISOString().slice(0, 16)} | engine ${x.engine} | ${x.q}`);
    } else if (cmd === "clear") {
      if (arg === "--all") console.log("removed", (await c.query(`DELETE FROM public.eds_briefing`)).rowCount);
      else if (arg) console.log("removed", (await c.query(`DELETE FROM public.eds_briefing WHERE query_text ILIKE $1`, [`%${arg}%`])).rowCount);
      else console.log('Say what to clear: clear "some words"  or  clear --all');
    } else console.log("Use: list | clear \"words\" | clear --all");
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
