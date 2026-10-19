// scripts/crosscheck-report.ts
//
// THE ENGLISH / HINDI / BENGALI CROSS-CHECK OF THE ARCHIVE. For every stored circular whose pages say the same thing in different scripts (English and Hindi,
// English and Bengali, or all three), it lists the numbers read differently on two pages (probably a misreading on one of them), the garbled longer forms
// of a number, and the numbers on one page only. It uses the text already in the database: no Gemini, no cost. See src/lib/ingestion/crossCheck.ts.
//
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts                 REPORT ONLY (nothing is written to the database)
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --apply         the same, and STORE the checks the report describes
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --ids 48,85     only these circulars        (also: --limit 20)
//
// WHAT --apply STORES (table circular_page_check, the checks the answer card's gate reads): per page, the numbers two readings agree on (confirmed) and the
// readings the other pages contradict (unconfirmed: the answer card then REFUSES an answer that rests on one). A check a second reader (Gemini) stored for
// the same page text is kept and merged: what it confirmed is never marked unconfirmed. A check about other text (the page was re-read since) is replaced.
// Safe to run again: the same input gives the same rows. Needs DATABASE_URL.

import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { crossCheck, mergeIntoStored, renderReport, summarize, twinChecks, type CircularFindings, type StoredCheck } from "../src/lib/ingestion/crossCheck";
import { pageTextHash, savePageChecks, storedPageTexts } from "../src/lib/search/pageChecks";

const args = process.argv.slice(2);
const val = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with: npx tsx --env-file=.env.local scripts/crosscheck-report.ts)");
  const ids = val("ids")?.split(",").map((x) => Number(x.trim())).filter(Boolean);
  const limit = val("limit") ? Number(val("limit")) : undefined;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const items: CircularFindings[] = [];
  const written: { id: number; page: number; confirmed: number; unconfirmed: string[] }[] = [];
  let pagesToWrite = 0, pagesSaved = 0, newlyConfirmed = 0;
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
      const groups = crossCheck(pages);
      items.push({ id: row.id, serial: row.serialNumber, headline: row.headline ?? "", pages: pages.length, groups });
      const twin = twinChecks(groups);
      if (!twin.length) continue;
      pagesToWrite += twin.length;
      if (!APPLY) continue;
      let existing: StoredCheck[] = [];
      try {
        existing = (await client.query(`SELECT page_number, status, confirmed, unconfirmed, second_only, reader, text_hash FROM public.circular_page_check WHERE circular_id = $1`, [row.id])).rows.map(
          (r: { page_number: number; status: string; confirmed: string[] | null; unconfirmed: string[] | null; second_only: string[] | null; reader: string; text_hash: string }) => ({
            page: Number(r.page_number), status: r.status, confirmed: r.confirmed ?? [], unconfirmed: r.unconfirmed ?? [], secondOnly: r.second_only ?? [], reader: r.reader, textHash: r.text_hash,
          }),
        );
      } catch {
        throw new Error("the table circular_page_check cannot be read: run src/lib/nl2sql/sql/10_circular_page_check.sql first");
      }
      const merged = twin.map((t) => mergeIntoStored(existing.find((e) => e.page === t.page) ?? null, t, pageTextHash(stored.get(t.page) ?? "")));
      for (const m of merged) {
        const before = existing.find((e) => e.page === m.page && e.textHash === m.textHash);
        newlyConfirmed += m.confirmed.filter((n) => !(before?.confirmed ?? []).includes(n)).length;
        written.push({ id: row.id, page: m.page, confirmed: m.confirmed.length, unconfirmed: m.unconfirmed });
      }
      pagesSaved += await savePageChecks((sql, params) => client.query(sql, params), row.id, merged);
    }
  } finally {
    await client.end();
  }
  const s = summarize(items);
  console.log(`Circulars read: ${s.circulars} | with two or more pages: ${s.withTwoPages} | groups of pages that say the same thing in different scripts: ${s.groups}`);
  for (const [languages, n] of s.byLanguages) console.log(`  ${languages}: ${n}`);
  console.log(`  groups where every important number stands on more than one page: ${s.clean}`);
  console.log(`  GROUPS WITH A READING THAT DISAGREES WITH ANOTHER PAGE, OR A GARBLED LONGER FORM OF A NUMBER: ${s.flagged.length}`);
  for (const { item, group: g } of s.flagged.slice(0, 12)) {
    console.log(`\n  circular ${item.id}: ${item.headline.slice(0, 70)}  (${g.languages})`);
    for (const d of g.disagreements) console.log(`    page ${d.a.page} ${d.a.value}  against  page ${d.b.page} ${d.b.value}   (${d.b.context.slice(0, 60)})`);
    for (const v of g.variants) console.log(`    page ${v.page} ${v.value}  is a longer form of  ${v.base}`);
  }
  if (APPLY) {
    console.log(`\nSTORED: ${pagesSaved} of ${pagesToWrite} page checks (${newlyConfirmed} numbers newly confirmed).`);
    if (pagesSaved < pagesToWrite) console.log("  Some were not stored: see the warning above (is the table circular_page_check there?).");
    const marked = written.filter((w) => w.unconfirmed.length);
    console.log(`  Pages with readings now recorded as UNCONFIRMED (the answer card refuses an answer resting on them): ${marked.length}`);
    for (const w of marked.slice(0, 25)) console.log(`    circular ${w.id} page ${w.page}: ${w.unconfirmed.join(", ")}`);
  } else {
    console.log(`\nREPORT ONLY. Storing the checks would write ${pagesToWrite} pages (${s.numbersConfirmed} numbers confirmed, ${s.numbersUnconfirmed} readings unconfirmed). Add --apply to store them.`);
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
