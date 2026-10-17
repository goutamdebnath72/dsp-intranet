// scripts/check-readings.ts
//
// THE GEMINI READING CHECK of circulars already in the archive. For every page the pipeline has read, Gemini reads the same page image, the
// two readings are compared number by number, and a report lists the pages to look at. READ-ONLY: it writes nothing to the database.
//
//   Step 1  the page readings of the pipeline must be in the re-read tool's cache, so run its dry run for these circulars first:
//           npx tsx --env-file=.env.local scripts/reread-circulars.ts --ids 82,79
//   Step 2  npx tsx --env-file=.env.local scripts/check-readings.ts --ids 82,79
//
//   npx tsx --env-file=.env.local scripts/check-readings.ts --plan --ids 82,79     only says how many Gemini calls it would make
//   npx tsx --env-file=.env.local scripts/check-readings.ts --year 2026 --limit 5   the first 5 circulars of 2026
//   ... --max-calls 100      live Gemini calls allowed in this run (default 100; saved readings are free). Run again to continue.
//   ... --pause-ms 6000      wait after each live call (default 6000), to stay inside the per-minute limit
//   ... --quota-wait-ms 65000  wait when the service refuses on its rate limit (twice), then stop
//   ... --no-gemini-cache    read every page again (default: a page Gemini has read is never paid for twice)
//   ... --dump-text          also save both full readings of every page that needs a look, under reread-reports/text/ (check-<circular>-p<page>-pipeline.txt and -gemini.txt)
//   ... --cache-dir reread-cache   --report-dir reread-reports   (the same folders the re-read tool uses; both are ignored by Git)
//
// Needs DATABASE_URL and GEMINI_API_KEY (GEMINI_VISION_MODEL names the model). A page about 20 seconds: a 10-page circular takes about 3 minutes.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { buildReport, checkCircularPages, summarize, type CircularCheckInput, type PageOutcome } from "../src/lib/ingestion/geminiCheck";
import { cachedReadPage } from "../src/lib/ingestion/pageCache";
import { geminiReader } from "../src/lib/ingestion/pageReader";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  if (flag("help") || flag("h")) {
    console.log(readFileSync(__filename, "utf8").split("\n").slice(2, 22).join("\n").replace(/^\/\/ ?/gm, ""));
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with: npx tsx --env-file=.env.local scripts/check-readings.ts)");
  if (!process.env.GEMINI_API_KEY && !flag("plan")) throw new Error("GEMINI_API_KEY is not set (it is in .env.local when the pilot works)");
  const cacheDir = arg("cache-dir") || "reread-cache";
  const reportDir = arg("report-dir") || "reread-reports";
  const pauseMs = arg("pause-ms") !== undefined ? Number(arg("pause-ms")) : 6000;
  const quotaWaitMs = arg("quota-wait-ms") !== undefined ? Number(arg("quota-wait-ms")) : 65000;
  const maxCalls = arg("max-calls") !== undefined ? Number(arg("max-calls")) : 100;
  const useCache = !flag("no-gemini-cache");
  const reader = geminiReader();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // ---- which circulars: the same selection as the re-read tool
    const where: string[] = [`EXISTS (SELECT 1 FROM public.circular_chunks cc WHERE cc.circular_id = c.id)`];
    const params: unknown[] = [];
    const ids = arg("ids");
    if (ids) { params.push(ids.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n))); where.push(`c.id = ANY($${params.length}::int[])`); }
    const year = arg("year");
    if (year) { params.push(parseInt(year, 10)); where.push(`EXTRACT(YEAR FROM c."publishedAt") = $${params.length}`); }
    const limit = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;
    const rows: { id: number; serialNumber: number | null; headline: string; fileUrls: string[] }[] = (
      await client.query(`SELECT c.id, c."serialNumber", c.headline, c."fileUrls" FROM public.circulars c WHERE ${where.join(" AND ")} ORDER BY c.id ${limit ? `LIMIT ${limit}` : ""}`, params)
    ).rows;

    // ---- the pipeline's reading of every page: from the re-read tool's cache only (this tool never runs OCR)
    const fromCache = cachedReadPage({ dir: cacheDir, enabled: true, read: async () => { throw new Error("not in the page cache"); } });
    type Prepared = { row: (typeof rows)[number]; pageTexts: string[]; notRead: Record<number, string> };
    const prepared: Prepared[] = [];
    for (const row of rows) {
      let structured = new Set<number>(); // roster pages are stored as rows, not as text, and are not read
      try {
        structured = new Set<number>((await client.query(`SELECT DISTINCT page_number FROM public.health_checkup_schedule WHERE circular_id = $1 AND page_number IS NOT NULL`, [row.id])).rows.map((r: { page_number: number }) => r.page_number));
      } catch { structured = new Set<number>(); }
      const urls = Array.isArray(row.fileUrls) ? row.fileUrls : [];
      const pageTexts: string[] = [], notRead: Record<number, string> = {};
      for (let i = 0; i < urls.length; i++) {
        if (structured.has(i + 1)) { pageTexts[i] = ""; notRead[i] = "a roster page: its content is stored as rows, not read"; continue; }
        try { pageTexts[i] = (await fromCache(urls[i], `circular ${row.id} page ${i + 1}`)).text; }
        catch { pageTexts[i] = ""; notRead[i] = "the pipeline's reading is not in the page cache: run scripts/reread-circulars.ts (dry run) for this circular first"; }
      }
      prepared.push({ row: { ...row, fileUrls: urls }, pageTexts, notRead });
    }
    const readable = prepared.reduce((n, p) => n + p.pageTexts.filter((t) => t.trim()).length, 0);
    const missing = prepared.reduce((n, p) => n + Object.values(p.notRead).filter((r) => /page cache/.test(r)).length, 0);
    console.log(`${rows.length} circular(s) selected; ${readable} page(s) with a pipeline reading${missing ? `; ${missing} page(s) NOT in the page cache (run the re-read dry run for them first)` : ""}.`);
    console.log(`Gemini model: ${reader.name}. About ${Math.ceil((readable * (20000 + pauseMs)) / 60000)} minute(s) if every page were read live (saved readings are free); at most ${maxCalls} live call(s) in this run.`);
    if (flag("plan")) { console.log("--plan: nothing was read."); return; }

    // ---- go
    const budget = { liveCallsLeft: maxCalls, liveCalls: 0, cacheHits: 0 };
    const inputs: CircularCheckInput[] = [];
    let stoppedForQuota = false, stoppedForLimit = false;
    const started = new Date().toISOString();
    for (let n = 0; n < prepared.length; n++) {
      const { row, pageTexts, notRead } = prepared[n];
      const label = `[${n + 1}/${prepared.length}] circular ${row.id} "${row.headline.slice(0, 40)}"`;
      const res = await checkCircularPages({
        circularId: row.id, fileUrls: row.fileUrls, pageTexts, notRead, reader, cacheDir, useCache, pauseMs, waitsMs: [quotaWaitMs, quotaWaitMs], sleep, budget, keepTexts: flag("dump-text"),
        fetchImage: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} fetching the page image`); return Buffer.from(await r.arrayBuffer()); },
        onWait: (ms, attempt, total) => console.log(`        rate limit: waiting ${Math.round(ms / 1000)} s for the per-minute window to clear (wait ${attempt} of ${total})`),
        onPage: (o: PageOutcome) => {
          const extra = "check" in o ? ` | confirmed ${o.check.confirmed.length}${o.check.onlyFirst.length ? ` | only the pipeline: ${o.check.onlyFirst.slice(0, 5).join(", ")}` : ""}${o.check.onlySecond.length ? ` | only Gemini: ${o.check.onlySecond.slice(0, 5).join(", ")}` : ""}${o.check.oddScripts.length ? ` | wrong-script letters: ${o.check.oddScripts.map((x) => x.chars).join(" ")}` : ""}${o.cached ? " (saved reading)" : ""}` : o.status === "error" ? ` | ${o.error}` : ` | ${o.reason}`;
          console.log(`  ${label} page ${o.page}: ${o.status.toUpperCase()}${extra}`);
        },
      });
      inputs.push({ id: row.id, serial: row.serialNumber, headline: row.headline, outcomes: res.outcomes });
      if (res.stoppedForQuota) { stoppedForQuota = true; console.log("\nSTOPPING: the service keeps refusing on its rate limit. Run the same command later; pages already read are kept."); break; }
      if (res.stoppedForLimit) { stoppedForLimit = true; console.log(`\nSTOPPING at the limit of ${maxCalls} live call(s). Run the same command again to continue; pages already read are kept.`); break; }
    }

    // ---- the full readings of the pages that need a look
    if (flag("dump-text")) {
      const dir = join(reportDir, "text");
      mkdirSync(dir, { recursive: true });
      let n = 0;
      for (const c of inputs) for (const o of c.outcomes) {
        if (!("texts" in o) || !o.texts || (o.status !== "differences" && o.status !== "partial")) continue;
        writeFileSync(join(dir, `check-${c.id}-p${o.page}-pipeline.txt`), o.texts.first + "\n");
        writeFileSync(join(dir, `check-${c.id}-p${o.page}-gemini.txt`), o.texts.second + "\n");
        n++;
      }
      console.log(`Both full readings of ${n} page(s) saved under ${dir}/`);
    }

    // ---- report
    const { markdown, json } = buildReport(inputs, { reader: reader.name, startedAt: started, liveCalls: budget.liveCalls, cacheHits: budget.cacheHits, stoppedForQuota, stoppedForLimit });
    mkdirSync(reportDir, { recursive: true });
    const base = join(reportDir, `reading-check-${Date.now()}`);
    writeFileSync(`${base}.md`, markdown);
    writeFileSync(`${base}.json`, JSON.stringify(json, null, 1));
    const s = summarize(inputs);
    console.log(`\nSUMMARY: ${s.pages} page(s) | all important numbers agree: ${s.agreed} | some differ: ${s.differences} | partial: ${s.partial} | unusable: ${s.unusable} | errors: ${s.errors} | skipped: ${s.skipped} | numbers confirmed by both readers: ${s.confirmedNumbers}`);
    console.log(`Gemini read live: ${budget.liveCalls}, from saved readings: ${budget.cacheHits}. Nothing was written to the database.`);
    console.log(`Report: ${base}.md   (please send me the .md and the .json)`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
