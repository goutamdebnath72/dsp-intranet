// scripts/crosscheck-report.ts
//
// THE ENGLISH / HINDI / BENGALI CROSS-CHECK OF THE ARCHIVE. For every stored circular whose pages say the same thing in different scripts (English and Hindi,
// English and Bengali, or all three), it lists the numbers read differently on two pages (probably a misreading on one of them), the garbled longer forms
// of a number, and the numbers on one page only. The languages may be pages of ONE circular, or SEPARATE circulars with the same title and a language tag
// ("... (Eng)", "... (Hin)", "... (Beng)"): a circular's family is a set of witnesses to it. It uses the text already in the database: no Gemini, no cost.
// See src/lib/ingestion/crossCheck.ts and currency.ts.
//
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts                 REPORT ONLY (nothing is written to the database)
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --apply         the same, and STORE the checks the report describes
//   npx tsx --env-file=.env.local scripts/crosscheck-report.ts --ids 48,85     only these circulars        (also: --limit 20)
//
// WHAT --apply STORES (table circular_page_check, the checks the answer card's gate reads): per page, the numbers two readings agree on (confirmed) and the
// readings the other pages contradict (unconfirmed: the answer card then REFUSES an answer that rests on one). A check a second reader (Gemini) stored for
// the same page text is kept and merged: what it confirmed is never marked unconfirmed. A check about other text (the page was re-read since) is replaced.
// A circular's checks are written for ITS OWN pages only, never for its witnesses'. Safe to run again: the same input gives the same rows. Needs DATABASE_URL.

import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import {
  combineChecks, crossCheckWithWitnesses, isWitness, mergeIntoStored, pageScripts, pagesByScriptLine, renderReport, siblingsOf, summarize, twinChecks,
  type CircularFindings, type PageText, type StoredCheck, type WitnessPage,
} from "../src/lib/ingestion/crossCheck";
import { attachedDigitSuspects, rupeeSlotJunk, slotChecks } from "../src/lib/ingestion/currency";
import { pageTextHash, savePageChecks, storedPageTexts } from "../src/lib/search/pageChecks";

const args = process.argv.slice(2);
const val = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");

interface Loaded {
  id: number;
  serial: number | null;
  headline: string;
  pages: PageText[];
  texts: Map<number, string>;
}

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
    // everything is loaded first: a circular's witnesses (the same circular in other languages) are looked for in the WHOLE archive, whatever --ids says
    const rows: { id: number; serialNumber: number | null; headline: string }[] = (
      await client.query(`SELECT c.id, c."serialNumber", c.headline FROM public.circulars c WHERE EXISTS (SELECT 1 FROM public.circular_chunks cc WHERE cc.circular_id = c.id) ORDER BY c.id`)
    ).rows;
    const chunkRows: { circular_id: number; page_number: number | null; chunk_index: number; text: string | null }[] = (
      await client.query(`SELECT circular_id, page_number, chunk_index, text FROM public.circular_chunks ORDER BY circular_id, page_number, chunk_index`)
    ).rows;
    const byCircular = new Map<number, { page: number | null; index: number; text: string }[]>();
    for (const r of chunkRows) byCircular.set(r.circular_id, [...(byCircular.get(r.circular_id) ?? []), { page: r.page_number == null ? null : Number(r.page_number), index: r.chunk_index, text: r.text ?? "" }]);
    const loaded = new Map<number, Loaded>();
    for (const row of rows) {
      const texts = storedPageTexts(byCircular.get(row.id) ?? []);
      loaded.set(row.id, { id: row.id, serial: row.serialNumber, headline: row.headline ?? "", pages: [...texts.entries()].map(([page, text]) => ({ page, text })), texts });
    }
    const siblings = siblingsOf(rows.map((r) => ({ id: r.id, headline: r.headline ?? "" })));
    let todo = rows.filter((r) => !ids || ids.includes(r.id));
    if (limit) todo = todo.slice(0, limit);

    for (const row of todo) {
      const me = loaded.get(row.id) as Loaded;
      const sib = siblings.get(row.id) ?? [];
      const witnesses: WitnessPage[] = sib.flatMap((sid) => (loaded.get(sid)?.pages ?? []).map((p) => ({ circular: sid, page: p.page, text: p.text })));
      const groups = crossCheckWithWitnesses(me.pages, witnesses);
      const rupee = me.pages.map((p) => ({ page: p.page, suspects: attachedDigitSuspects(p.text), junk: rupeeSlotJunk(p.text) })).filter((r) => r.suspects.length || r.junk.length);
      items.push({ id: me.id, serial: me.serial, headline: me.headline, pages: me.pages.length, groups, scripts: pageScripts(me.pages), rupee, siblings: sib });
      // the checks of this circular's OWN pages: from the English / Hindi / Bengali groups (its witnesses' pages are never written to), and from an amount with a stray
      // leading digit (the rupee sign read as a digit): one set, as stored
      const twin = combineChecks(twinChecks(groups, (p) => !isWitness(p)), slotChecks(me.pages));
      if (!twin.length) continue;
      pagesToWrite += twin.length;
      if (!APPLY) continue;
      let existing: StoredCheck[] = [];
      try {
        existing = (await client.query(`SELECT page_number, status, confirmed, unconfirmed, second_only, reader, text_hash FROM public.circular_page_check WHERE circular_id = $1`, [me.id])).rows.map(
          (r: { page_number: number; status: string; confirmed: string[] | null; unconfirmed: string[] | null; second_only: string[] | null; reader: string; text_hash: string }) => ({
            page: Number(r.page_number), status: r.status, confirmed: r.confirmed ?? [], unconfirmed: r.unconfirmed ?? [], secondOnly: r.second_only ?? [], reader: r.reader, textHash: r.text_hash,
          }),
        );
      } catch {
        throw new Error("the table circular_page_check cannot be read: run src/lib/nl2sql/sql/10_circular_page_check.sql first");
      }
      const merged = twin.map((t) => mergeIntoStored(existing.find((e) => e.page === t.page) ?? null, t, pageTextHash(me.texts.get(t.page) ?? "")));
      for (const m of merged) {
        const before = existing.find((e) => e.page === m.page && e.textHash === m.textHash);
        newlyConfirmed += m.confirmed.filter((n) => !(before?.confirmed ?? []).includes(n)).length;
        written.push({ id: me.id, page: m.page, confirmed: m.confirmed.length, unconfirmed: m.unconfirmed });
      }
      pagesSaved += await savePageChecks((sql, params) => client.query(sql, params), me.id, merged);
    }
  } finally {
    await client.end();
  }
  const s = summarize(items);
  console.log(`Circulars read: ${s.circulars} | with two or more pages: ${s.withTwoPages} | groups of pages that say the same thing in different scripts: ${s.groups}`);
  if (s.families) console.log(`  families of circulars with the same title in different languages (separate files): ${s.families} (${s.familyCirculars} circulars)`);
  for (const [languages, n] of s.byLanguages) console.log(`  ${languages}: ${n}`);
  console.log(`  pages by script: ${pagesByScriptLine(s.pagesByScript)}`);
  console.log(`  groups where every important number stands on more than one page: ${s.clean}`);
  console.log(`  GROUPS WITH A READING THAT DISAGREES WITH ANOTHER PAGE, OR A GARBLED LONGER FORM OF A NUMBER: ${s.flagged.length}`);
  for (const { item, group: g } of s.flagged.slice(0, 12)) {
    console.log(`\n  circular ${item.id}: ${item.headline.slice(0, 70)}  (${g.languages})`);
    for (const d of g.disagreements) console.log(`    ${d.a.value}  against  ${d.b.value}   (${d.b.context.slice(0, 60)})`);
    for (const v of g.variants) console.log(`    ${v.value}  is a longer form of  ${v.base}`);
  }
  console.log(`\n  THE RUPEE SIGN: ${s.slotSuspects} amounts on ${s.suspectPages.length} pages have an extra leading digit that the same page also states without it (probably the sign read as a digit: recorded as unconfirmed); ${s.junkPages.length} pages have a symbol such as % or ¥ right before an amount (the sign read as a symbol).`);
  for (const r of s.suspectPages.slice(0, 10)) for (const x of r.suspects) console.log(`    circular ${r.item.id} page ${r.page}: ${x.value} next to ${x.base}   (${x.context.slice(0, 60)})`);
  if (APPLY) {
    console.log(`\nSTORED: ${pagesSaved} of ${pagesToWrite} page checks (${newlyConfirmed} numbers newly confirmed).`);
    if (pagesSaved < pagesToWrite) console.log("  Some were not stored: see the warning above (is the table circular_page_check there?).");
    const marked = written.filter((w) => w.unconfirmed.length);
    console.log(`  Pages with readings now recorded as UNCONFIRMED (the answer card refuses an answer resting on them): ${marked.length}`);
    for (const w of marked.slice(0, 25)) console.log(`    circular ${w.id} page ${w.page}: ${w.unconfirmed.join(", ")}`);
  } else {
    console.log(`\nREPORT ONLY. Storing the checks would write ${pagesToWrite} pages (${s.numbersConfirmed} numbers confirmed, ${s.numbersUnconfirmed} readings unconfirmed, the rupee-sign ones included). Add --apply to store them.`);
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
