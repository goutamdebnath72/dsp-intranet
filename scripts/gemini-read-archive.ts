// scripts/gemini-read-archive.ts
//
// Reads the page images of the archived circulars with the two Gemini readers (a primary and a checker) and SAVES each reading in reread-cache/gemini/. Those saved readings are what
// scripts/ocr-consensus.ts compares with the stored text. READ-ONLY: it never writes to the database. A page already read by a reader is never read (or paid for) again.
//
//   npx tsx --env-file=.env.local scripts/gemini-read-archive.ts --plan                 how many pages still need a reading
//   npx tsx --env-file=.env.local scripts/gemini-read-archive.ts [--ids 34,20] [--max-calls 200] [--pause-ms 3000]
//   Models: OCR_PRIMARY_MODEL (default gemini-3.1-pro-preview) and OCR_CHECK_MODEL (default gemini-3.8-flash).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";
import { geminiReader, STOPPED_MARKER } from "../src/lib/ingestion/pageReader";
import { geminiCacheFile } from "../src/lib/ingestion/geminiCheck";
import { DEFAULT_CHECK_MODEL, DEFAULT_PRIMARY_MODEL } from "../src/lib/ingestion/geminiOcr";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const cacheDir = arg("cache-dir") || "reread-cache";
  const pauseMs = Number(arg("pause-ms") ?? 3000);
  let callsLeft = Number(arg("max-calls") ?? 200);
  const models = [process.env.OCR_PRIMARY_MODEL || DEFAULT_PRIMARY_MODEL, process.env.OCR_CHECK_MODEL || DEFAULT_CHECK_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  const readers = models.map((m) => geminiReader({ model: m }));
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const ids = arg("ids")?.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger);
    const rows = (await client.query(`SELECT id, headline, "fileUrls" FROM public.circulars WHERE EXISTS (SELECT 1 FROM public.circular_chunks k WHERE k.circular_id = id) ${ids ? "AND id = ANY($1::int[])" : ""} ORDER BY id`, ids ? [ids] : [])).rows as Array<{ id: number; headline: string; fileUrls: string[] }>;
    const todo: Array<{ id: number; page: number; url: string; reader: (typeof readers)[number] }> = [];
    for (const r of rows) {
      let structured = new Set<number>();
      try { structured = new Set<number>((await client.query(`SELECT DISTINCT page_number FROM public.health_checkup_schedule WHERE circular_id = $1 AND page_number IS NOT NULL`, [r.id])).rows.map((x: any) => Number(x.page_number))); } catch { /* no such table */ }
      (r.fileUrls ?? []).forEach((url, i) => {
        if (structured.has(i + 1)) return; // a roster page is stored as rows, not as text
        for (const reader of readers) if (!existsSync(geminiCacheFile(cacheDir, url, reader.name))) todo.push({ id: r.id, page: i + 1, url, reader });
      });
    }
    console.log(`${rows.length} circular(s); ${todo.length} page reading(s) still needed (readers: ${readers.map((r) => r.name).join(", ")}).`);
    if (flag("plan")) return;
    let done = 0, failed = 0;
    for (const t of todo) {
      if (callsLeft <= 0) { console.log("STOPPING: --max-calls reached. Run the same command again to continue."); break; }
      callsLeft--;
      try {
        const res = await fetch(t.url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching the page image`);
        const text = await t.reader.read(Buffer.from(await res.arrayBuffer()));
        if (text.includes(STOPPED_MARKER)) throw new Error("the reading was cut off or repeated itself (not saved)");
        const file = geminiCacheFile(cacheDir, t.url, t.reader.name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ url: t.url, reader: t.reader.name, savedAt: new Date().toISOString(), text }));
        done++;
        console.log(`  circular ${t.id} page ${t.page} ${t.reader.name}: read (${text.length} chars)`);
      } catch (e) {
        failed++;
        const m = String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
        console.log(`  circular ${t.id} page ${t.page} ${t.reader.name}: FAILED ${m}`);
        if (/daily limit|per.?day/i.test(m)) { console.log("STOPPING: the daily allowance is used up. Run the same command after it renews."); break; }
      }
      await sleep(pauseMs);
    }
    console.log(`\nRead ${done}, failed ${failed}.`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
