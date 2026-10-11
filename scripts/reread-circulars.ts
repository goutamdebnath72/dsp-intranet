// scripts/reread-circulars.ts
//
// Re-reads circulars ALREADY in the archive with the fixed OCR (English pass in full, only the Indic words from the Hindi/Bengali
// pass), IN PLACE. Ids, serial numbers, dates, headlines and page images are never touched: only the stored text chunks and vectors.
//
//   DRY RUN (the default): reads the page images, runs the OCR, prints and saves a report of what WOULD change. Writes nothing to
//   the database and calls no embedding service.
//
//   npx tsx --env-file=.env.local scripts/reread-circulars.ts                       dry run, every circular that has stored text
//   npx tsx --env-file=.env.local scripts/reread-circulars.ts --ids 49,51           only these circular ids
//   npx tsx --env-file=.env.local scripts/reread-circulars.ts --year 2026 --limit 5
//   npx tsx --env-file=.env.local scripts/reread-circulars.ts --ids 49 --apply      REALLY replace (saves a backup file first)
//   npx tsx --env-file=.env.local scripts/reread-circulars.ts --restore reread-backups/circular-49-123.json
//
// Safe to run again: a circular that already matches is reported "unchanged" and skipped. Apply refuses a circular whose re-read
// looks wrong (an empty English reading, a failed image, far less text than stored) and says why.
//
// Test aids (never needed in normal use): OCR_LANG_PATH (a local folder with eng/hin/ben .traineddata) and REREAD_FAKE_EMBEDDINGS=1.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { createOcrWorkerPool, destroyOcrWorkerPool, ocrPageDual } from "../src/lib/ingestion/ocr";
import { applyReread, planReread, restoreFromBackup, type Backup, type CircularRow, type OldChunk, type RereadDeps, type RereadPlan } from "../src/lib/ingestion/reread";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

process.env.OCR_QUIET = "1"; // one summary line per circular is enough here; the per-page OCR lines would bury it

async function main() {
  if (flag("help") || flag("h")) {
    console.log(readFileSync(__filename, "utf8").split("\n").slice(2, 20).join("\n").replace(/^\/\/ ?/gm, ""));
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with: npx tsx --env-file=.env.local scripts/reread-circulars.ts)");
  const apply = flag("apply");
  const backupDir = arg("backup-dir") || "reread-backups";
  const reportDir = arg("report-dir") || "reread-reports";
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // ---- restore ----
    const restoreFile = arg("restore");
    if (restoreFile) {
      const backup = JSON.parse(readFileSync(restoreFile, "utf8")) as Backup;
      const r = await restoreFromBackup(client, backup);
      console.log(`Restored circular ${backup.circularId} ("${backup.headline}"): ${r.chunks} chunks and its whole-document vector put back from ${restoreFile}.`);
      return;
    }

    // ---- which circulars ----
    const where: string[] = [`EXISTS (SELECT 1 FROM public.circular_chunks cc WHERE cc.circular_id = c.id)`]; // holiday lists have no chunks
    const params: unknown[] = [];
    const ids = arg("ids");
    if (ids) {
      params.push(ids.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n)));
      where.push(`c.id = ANY($${params.length}::int[])`);
    }
    const year = arg("year");
    if (year) {
      params.push(parseInt(year, 10));
      where.push(`EXTRACT(YEAR FROM c."publishedAt") = $${params.length}`);
    }
    const limit = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;
    const rows: CircularRow[] = (
      await client.query(`SELECT c.id, c."serialNumber", c.headline, c."fileUrls" FROM public.circulars c WHERE ${where.join(" AND ")} ORDER BY c.id ${limit ? `LIMIT ${limit}` : ""}`, params)
    ).rows;
    console.log(`${apply ? "APPLY" : "DRY RUN"}: ${rows.length} circular(s) with stored text selected.${apply ? " Old chunks are backed up to " + backupDir + " first." : " Nothing will be written."}\n`);

    // ---- dependencies ----
    const workerOptions = process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH, gzip: false, cacheMethod: "none" } : undefined;
    const pool = await createOcrWorkerPool(workerOptions);
    // The embedding code is loaded only when the FIRST embedding is needed, so a dry run (which embeds nothing) never loads it.
    // It is the Google-only module, called exactly as the upload calls it (one argument, no normalising), so the new vectors are made
    // the same way as the ones an upload stores.
    let realEmbed: ((text: string) => Promise<number[]>) | null = null;
    const embed = process.env.REREAD_FAKE_EMBEDDINGS
      ? async (t: string) => Array.from({ length: 768 }, (_, i) => ((t.length * 31 + i * 7) % 1000) / 1000)
      : async (t: string) => {
          realEmbed ??= (await import("../src/lib/ai/geminiEmbedding")).generateEmbedding;
          return realEmbed(t);
        };
    const deps: RereadDeps = {
      fetchImage: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return new Uint8Array(await res.arrayBuffer());
      },
      ocrPage: (img, label) => ocrPageDual(img, label, pool),
      embed,
    };

    // ---- go ----
    const plans: RereadPlan[] = [];
    const applied: string[] = [];
    const errors: string[] = [];
    const started = Date.now();
    try {
      for (let n = 0; n < rows.length; n++) {
        const row = rows[n];
        const t0 = Date.now();
        const old: OldChunk[] = (await client.query(`SELECT chunk_index, page_number, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [row.id])).rows;
        const plan = await planReread(deps, row, old);
        plans.push(plan);
        const removed = plan.onlyInOld.length ? ` | numbers that disappear: ${plan.onlyInOld.slice(0, 8).join(", ")}${plan.onlyInOld.length > 8 ? ", ..." : ""}` : "";
        console.log(`[${n + 1}/${rows.length}] id ${row.id} (serial ${row.serialNumber}) "${row.headline.slice(0, 50)}": ${plan.status.toUpperCase()}${plan.reason ? " (" + plan.reason + ")" : ""} | ${plan.pages} page(s), ${plan.oldChars} -> ${plan.newChars} chars${removed} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        if (apply && plan.status === "would-change") {
          try {
            const r = await applyReread(client, deps, plan, backupDir);
            applied.push(`${row.id}`);
            console.log(`        applied: ${r.chunksBefore} -> ${r.chunksAfter} chunks. Backup: ${r.backupFile}`);
          } catch (e) {
            errors.push(`id ${row.id}: ${(e as Error).message}`);
            console.log(`        NOT APPLIED (nothing changed for this circular): ${(e as Error).message}`);
          }
        }
      }
    } finally {
      await destroyOcrWorkerPool(pool);
    }

    // ---- summary + report ----
    const by = (s: string) => plans.filter((p) => p.status === s);
    const damaged = plans.filter((p) => p.onlyInOld.length > 0);
    const lines = [
      `# Circular re-read report (${apply ? "APPLIED" : "DRY RUN"}) - ${new Date().toISOString()}`,
      "",
      `- Circulars looked at: **${plans.length}**`,
      `- Holding numbers that the fixed reading does not contain (a second, partly wrong copy): **${damaged.length}**`,
      `- Would change / changed: ${by("would-change").length} | unchanged: ${by("unchanged").length} | suspicious (not applied): ${by("suspicious").length} | skipped: ${by("skipped").length}`,
      apply ? `- Applied: ${applied.length}; errors: ${errors.length}` : "- Nothing was written to the database.",
      "",
      "| id | serial | headline | status | pages | chars before -> after | numbers that disappear | note |",
      "|---|---|---|---|---|---|---|---|",
      ...plans.map((p) => `| ${p.id} | ${p.serialNumber ?? ""} | ${p.headline.replace(/\|/g, "/").slice(0, 60)} | ${p.status} | ${p.pages} | ${p.oldChars} -> ${p.newChars} | ${p.onlyInOld.slice(0, 12).join(", ")} | ${(p.reason || (p.onlyInNew.length ? "NEW numbers: " + p.onlyInNew.join(", ") : "")).replace(/\|/g, "/")} |`),
    ];
    mkdirSync(reportDir, { recursive: true });
    const reportFile = join(reportDir, `reread-${apply ? "apply" : "dry"}-${Date.now()}.md`);
    writeFileSync(reportFile, lines.join("\n") + "\n");
    console.log(`\nSUMMARY: ${plans.length} looked at | ${damaged.length} held a second, partly wrong copy of numbers | would change/changed ${by("would-change").length} | unchanged ${by("unchanged").length} | suspicious ${by("suspicious").length} | skipped ${by("skipped").length} | ${((Date.now() - started) / 60000).toFixed(1)} min`);
    if (apply) console.log(`Applied ${applied.length}, errors ${errors.length}.`);
    console.log(`Report: ${reportFile}`);
    if (errors.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
