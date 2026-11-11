// scripts/reingest-circulars-gemini.ts
//
// Ingests / re-reads circulars with ONLINE GEMINI VISION OCR (gemini-3.5-flash).
// Replaces poor text and corrupted tables with high-fidelity verbatim text,
// recalculates Google embeddings, and atomically updates PostgreSQL circular_chunks.
//
// USAGE:
//   npx tsx --env-file=.env.local scripts/reingest-circulars-gemini.ts
//   npx tsx --env-file=.env.local scripts/reingest-circulars-gemini.ts --ids 82,21
//   npx tsx --env-file=.env.local scripts/reingest-circulars-gemini.ts --year 2024
//   npx tsx --env-file=.env.local scripts/reingest-circulars-gemini.ts --dry-run
//
// SAFEGUARDS (added in the review of 7 Nov 2026; the first version had none of them):
//   * holiday-list circulars and health check-up roster circulars are SKIPPED, exactly as the upload route treats them
//     (their body is deliberately not chunked: the facts live in structured tables);
//   * a page whose reading ended with the "reading incomplete" marker, or came back empty, is never cached and never saved:
//     the circular is skipped and reported (use --allow-incomplete only knowingly);
//   * nothing is written when no text was read, or when the new text is under half the stored text (use --force knowingly);
//   * a circular that fails is reported and the run goes on; the exit code is 1 if any failed;
//   * "already done" means a .committed flag written AFTER the commit (a rolled-back run is not counted as done);
//   * stored text is embedded as a DOCUMENT, as the upload route now does (queries are the only query-type embeddings).
//
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { geminiReader, STOPPED_MARKER } from "../src/lib/ingestion/pageReader";
import { shrinkForReading } from "../src/lib/ingestion/pageImage";
import { buildPageUnits, documentEmbeddingText, planChunks } from "../src/lib/ingestion/chunking";
import { generateEmbedding } from "../src/lib/ai/geminiEmbedding";
import { detectHolidayListCircular } from "../src/lib/holidays/circularDetection";
import { DateTime } from "luxon";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment.");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");

  const model = process.env.GEMINI_VISION_MODEL || arg("model") || "gemini-3.1-pro-preview";
  const dryRun = flag("dry-run");
  const force = flag("force");
  const allowIncomplete = flag("allow-incomplete");
  const skipDone = flag("skip-done") || !arg("ids");
  const delayMs = Number(arg("delay-ms") || 1000);
  const cacheDir = arg("cache-dir") || "reread-gemini-cache";
  const backupDir = arg("backup-dir") || "reread-backups";

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });

  const candidateModels = [
    model,
    "gemini-pro-latest",
    "gemini-3.8-flash",
  ].filter((v, i, a) => a.indexOf(v) === i);

  console.log(`\n======================================================`);
  console.log(`  DSP Intranet: Gemini Vision Corpus Re-ingestion`);
  console.log(`======================================================`);
  console.log(`Mode:       ${dryRun ? "DRY RUN (no DB writes)" : "LIVE APPLY (replaces chunks & embeddings in DB)"}`);
  console.log(`Top Model:  ${model}`);
  console.log(`Fallbacks:  ${candidateModels.slice(1).join(", ") || "none"}`);
  console.log(`Cache Dir:  ${cacheDir}`);
  console.log(`Backup Dir: ${backupDir}`);
  console.log(`Pacing:     ${delayMs}ms between Gemini API calls\n`);

  async function readWithFallback(shrunk: Buffer): Promise<{ text: string; modelUsed: string }> {
    let lastErr: any = null;
    for (const m of candidateModels) {
      try {
        const r = geminiReader({ apiKey, model: m, timeoutMs: 90_000 });
        const text = await r.read(shrunk);
        return { text, modelUsed: m };
      } catch (err: any) {
        lastErr = err;
        console.warn(`    [FALLBACK] Model ${m} failed (${err.message}). Trying next candidate...`);
      }
    }
    throw lastErr;
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Build selection query
    const where: string[] = [`c."fileUrls" IS NOT NULL AND array_length(c."fileUrls", 1) > 0`];
    const params: unknown[] = [];

    const idsArg = arg("ids");
    if (idsArg) {
      const ids = idsArg.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger);
      params.push(ids);
      where.push(`c.id = ANY($${params.length}::int[])`);
    }

    const yearArg = arg("year");
    if (yearArg) {
      params.push(parseInt(yearArg, 10));
      where.push(`EXTRACT(YEAR FROM c."publishedAt") = $${params.length}`);
    }

    const limitArg = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;
    const limitClause = limitArg ? `LIMIT ${limitArg}` : "";

    const query = `
      SELECT c.id, c."serialNumber", c.headline, c."publishedAt", c."fileUrls"
      FROM public.circulars c
      WHERE ${where.join(" AND ")}
      ORDER BY c.id ASC
      ${limitClause}
    `;

    const { rows } = await client.query(query, params);
    console.log(`Selected ${rows.length} circulars for processing.\n`);

    // Circulars the upload path keeps as display-only or as structured data: never re-chunked from their body text.
    const structured = await client.query(
      `SELECT DISTINCT circular_id FROM public.circular_ingest_log WHERE kind IN ('health-schedule', 'holiday-list')`,
    ).then((r) => new Set<number>(r.rows.map((x: any) => Number(x.circular_id)))).catch(() => new Set<number>());
    const failures: string[] = [];
    let skippedCount = 0;

    let totalPagesProcessed = 0;
    let totalCharsExtracted = 0;
    let totalChunksSaved = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const circularId = row.id;
      const fileUrls: string[] = row.fileUrls || [];
      const numPages = fileUrls.length;

      console.log(`------------------------------------------------------`);
      console.log(`[${i + 1}/${rows.length}] Circular ID ${circularId} (Sl ${row.serialNumber || "-"}): "${row.headline}"`);
      console.log(`  Total pages: ${numPages}`);

      if (detectHolidayListCircular(String(row.headline || "")).isHolidayListCircular || structured.has(Number(circularId))) {
        console.log(`  [SKIPPED] holiday-list / health-roster circular: its body is deliberately not chunked (see the upload route).`);
        skippedCount++;
        continue;
      }

      const doneFlag = join(backupDir, `circular-${circularId}.committed`);
      if (skipDone && existsSync(doneFlag)) {
        console.log(`  [ALREADY RE-INGESTED] Skipping circular ${circularId} (flag: ${doneFlag})`);
        continue;
      }

      try {

      const pageTexts: string[] = [];

      for (let p = 0; p < numPages; p++) {
        const pageNum = p + 1;
        const pageUrl = fileUrls[p];
        const cacheFile = join(cacheDir, `circular-${circularId}-page-${pageNum}.json`);

        let pageText = "";

        if (existsSync(cacheFile)) {
          try {
            const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
            if (typeof cached.text === "string" && cached.text.trim().length > 0 && !cached.text.includes(STOPPED_MARKER)) {
              pageText = cached.text;
              console.log(`  Page ${pageNum}/${numPages}: [CACHE HIT] Loaded ${pageText.length} chars from disk`);
            }
          } catch {
            // ignore cache parse error and re-read
          }
        }

        if (!pageText) {
          console.log(`  Page ${pageNum}/${numPages}: Fetching image from blob storage...`);
          const res = await fetch(pageUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${pageUrl}`);
          const rawBuf = Buffer.from(await res.arrayBuffer());
          const shrunk = await shrinkForReading(rawBuf);

          console.log(`  Page ${pageNum}/${numPages}: Sending to Gemini (${(shrunk.length / 1024).toFixed(1)} KB)...`);
          const t0 = Date.now();
          const { text, modelUsed } = await readWithFallback(shrunk);
          pageText = text;
          const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
          console.log(`  Page ${pageNum}/${numPages}: [${modelUsed} OK] ${pageText.length} chars extracted in ${elapsed}s`);

          // an incomplete or empty reading is never cached (it would be served from disk as if it were a good one next time)
          if (pageText.trim() && !pageText.includes(STOPPED_MARKER)) {
            writeFileSync(cacheFile, JSON.stringify({ circularId, page: pageNum, text: pageText, timestamp: DateTime.now().toUTC().toISO() }, null, 2), "utf8");
          }

          // Pace requests to respect quota safely
          if (p < numPages - 1 || i < rows.length - 1) {
            await sleep(delayMs);
          }
        }

        pageTexts.push(pageText);
        totalPagesProcessed++;
        totalCharsExtracted += pageText.length;
      }

      const badPages = pageTexts.map((t, k) => (!t.trim() || t.includes(STOPPED_MARKER) ? k + 1 : 0)).filter(Boolean);
      if (badPages.length && !allowIncomplete) {
        console.warn(`  [SKIPPED] page(s) ${badPages.join(", ")} came back empty or incomplete: nothing was changed for circular ${circularId}. Run it again, or use --allow-incomplete knowingly.`);
        failures.push(`${circularId}: incomplete reading of page(s) ${badPages.join(", ")}`);
        continue;
      }

      // Chunking & Assembly
      const extractedText = pageTexts.map((t) => t + " \n").join("").replace(/\s+/g, " ").trim();
      const pageUnits = buildPageUnits(pageTexts, extractedText);
      const plannedChunks = planChunks(pageUnits);
      console.log(`  Assembled: ${extractedText.length} chars -> ${plannedChunks.length} chunks planned`);

      if (plannedChunks.length === 0) {
        console.warn(`  [SKIPPED] the reading produced no text at all: the existing chunks of circular ${circularId} are kept.`);
        failures.push(`${circularId}: no text produced`);
        continue;
      }
      const oldChars = Number((await client.query(`SELECT COALESCE(sum(length(text)), 0)::int AS n FROM public.circular_chunks WHERE circular_id = $1`, [circularId])).rows[0]?.n ?? 0);
      const newChars = plannedChunks.reduce((n, c) => n + c.text.length, 0);
      if (!force && oldChars > 0 && newChars < oldChars * 0.5) {
        console.warn(`  [SKIPPED] the new text (${newChars} chars) is under half the stored text (${oldChars} chars): the stored text is kept. Check the reading, or use --force knowingly.`);
        failures.push(`${circularId}: new text ${newChars} chars vs ${oldChars} stored`);
        continue;
      }

      if (dryRun) {
        console.log(`  [DRY RUN] Would update DB with ${plannedChunks.length} chunks (${newChars} chars; stored ${oldChars}).`);
        continue;
      }

      // Generate Embeddings
      console.log(`  Generating document & chunk embeddings...`);
      const docEmbedText = documentEmbeddingText(extractedText);
      let docVector: number[] | null = null;
      if (docEmbedText) {
        docVector = await generateEmbedding(docEmbedText, "search_document");
      }

      const chunkVectors: string[] = [];
      for (let ci = 0; ci < plannedChunks.length; ci++) {
        const c = plannedChunks[ci];
        const v = await generateEmbedding(c.text, "search_document");
        chunkVectors.push(vectorLiteral(v));
      }

      // Database Transaction: Backup & Atomic Replacement
      const oldChunksRes = await client.query(
        `SELECT chunk_index, page_number, text, embedding::text AS embedding FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`,
        [circularId],
      );
      const docEmbedRes = await client.query(`SELECT embedding::text AS embedding FROM public.circulars WHERE id = $1`, [circularId]);

      const backupFile = join(backupDir, `circular-${circularId}-${Date.now()}.json`);
      writeFileSync(
        backupFile,
        JSON.stringify({
          circularId,
          headline: row.headline,
          savedAt: DateTime.now().toUTC().toISO(),
          documentEmbedding: docEmbedRes.rows[0]?.embedding ?? null,
          chunks: oldChunksRes.rows,
        }, null, 2),
        "utf8",
      );

      await client.query("BEGIN");
      try {
        await client.query(`DELETE FROM public.circular_chunks WHERE circular_id = $1`, [circularId]);
        for (let ci = 0; ci < plannedChunks.length; ci++) {
          const c = plannedChunks[ci];
          await client.query(
            `INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
            [circularId, c.index, c.page, c.text, chunkVectors[ci]],
          );
        }
        if (docVector) {
          await client.query(`UPDATE public.circulars SET embedding = $1::vector WHERE id = $2`, [vectorLiteral(docVector), circularId]);
        }
        await client.query("COMMIT");
        writeFileSync(doneFlag, DateTime.now().toUTC().toISO() ?? "", "utf8"); // "done" is decided HERE, after the commit
        console.log(`  [DB COMMITTED] Replaced ${oldChunksRes.rows.length} old chunks with ${plannedChunks.length} Gemini chunks (backup: ${backupFile})`);
        totalChunksSaved += plannedChunks.length;
      } catch (dbErr) {
        await client.query("ROLLBACK");
        try { unlinkSync(backupFile); } catch { /* nothing was changed: the backup is not needed */ }
        console.error(`  [DB ERROR] Rolled back transaction for circular ${circularId}:`, dbErr);
        throw dbErr;
      }
      } catch (err: any) {
        // one circular failing must not stop the others (a network error on page 7 of circular 30 used to end the whole run)
        console.error(`  [FAILED] circular ${circularId}: ${err?.message || err}`);
        failures.push(`${circularId}: ${err?.message || err}`);
        continue;
      }
    }

    console.log(`\n======================================================`);
    console.log(`  RE-INGESTION COMPLETE`);
    console.log(`======================================================`);
    console.log(`Circulars processed: ${rows.length}`);
    console.log(`Total pages OCR'd:    ${totalPagesProcessed}`);
    console.log(`Total chars read:     ${totalCharsExtracted}`);
    console.log(`Total chunks in DB:   ${totalChunksSaved}`);
    console.log(`Skipped (holiday / roster): ${skippedCount}`);
    console.log(`Failed or refused:    ${failures.length}${failures.length ? "\n  - " + failures.join("\n  - ") : ""}`);
    if (failures.length) process.exitCode = 1;
    console.log(`======================================================\n`);

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nFATAL ERROR in reingest script:", err);
  process.exit(1);
});
