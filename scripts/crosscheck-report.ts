// scripts/crosscheck-report.ts
//
// A READ-ONLY REPORT: for every stored circular that has a Hindi (or Bengali) page and an English page with the same important numbers, it lists the
// numbers that are read differently on the two pages (probably a misreading on one of them) and the numbers that stand on one page only. It uses the text
// already in the database. No Gemini, no cost, nothing is written to the database; the report goes to reread-reports/. See src/lib/ingestion/crossCheck.ts.
//
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --ids 48,85
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --limit 20
//
// Needs DATABASE_URL.

import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { crossCheck, renderReport, summarize, type CircularFindings } from "../src/lib/ingestion/crossCheck";
import { storedPageTexts } from "../src/lib/search/pageChecks";

const args = process.argv.slice(2);
const val = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with: npx tsx --env-file=.env.local scripts/crosscheck-report.ts)");
  const ids = val("ids")?.split(",").map((x) => Number(x.trim())).filter(Boolean);
  const limit = val("limit") ? Number(val("limit")) : undefined;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const items: CircularFindings[] = [];
  try {
    const rows: { id: number; serialNumber: number | null; headline: string }[] = (
      await client.query(
        `SELECT c.id, c."serialNumber", c.headline FROM public.circulars c
         WHERE EXISTS (SELECT 1 FROM public.circular_chunks cc WHERE cc.circular_id = c.id) ${ids ? "AND c.id = ANY($1)" : ""}
         ORDER BY c.id ${limit ? `LIMIT ${limit}` : ""}`,
        ids ? [ids] : [],
      )
    ).rows;
    for (const row of rows) {
      const chunkRows = (await client.query(`SELECT page_number, chunk_index, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY page_number, chunk_index`, [row.id])).rows;
      const stored = storedPageTexts(chunkRows.map((r: { page_number: number | null; chunk_index: number; text: string | null }) => ({ page: r.page_number == null ? null : Number(r.page_number), index: r.chunk_index, text: r.text ?? "" })));
      const pages = [...stored.entries()].map(([page, text]) => ({ page, text }));
      items.push({ id: row.id, serial: row.serialNumber, headline: row.headline ?? "", pages: pages.length, findings: crossCheck(pages) });
    }
  } finally {
    await client.end();
  }
  const s = summarize(items);
  console.log(`Circulars read: ${s.circulars} | with two or more pages: ${s.withTwoPages} | twin pairs (a Hindi page and an English page with the same numbers): ${s.pairs}`);
  console.log(`  every important number on both pages: ${s.clean}`);
  console.log(`  A NUMBER READ DIFFERENTLY ON THE TWO PAGES (probably a misreading): ${s.disputed.length}`);
  console.log(`  numbers that stand on one page only: ${s.oneSided.length}`);
  for (const { item, finding: f } of s.disputed.slice(0, 12)) {
    console.log(`\n  circular ${item.id}: ${item.headline.slice(0, 70)}  (Indic page ${f.indicPage}, Latin page ${f.latinPage})`);
    for (const d of f.disputes) console.log(`    Indic page ${d.pipeline}  against  Latin page ${d.second}   (${d.context.slice(0, 70)})`);
  }
  mkdirSync("reread-reports", { recursive: true });
  const file = `reread-reports/crosscheck-${Date.now()}.md`;
  writeFileSync(file, renderReport(items));
  console.log(`\nReport: ${file}   (please send me this file)`);
}

main().catch((e) => {
  console.error("crosscheck-report:", e instanceof Error ? e.message : e);
  process.exit(1);
});
