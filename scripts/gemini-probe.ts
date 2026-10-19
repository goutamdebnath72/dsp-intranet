// scripts/gemini-probe.ts
//
// READS ONE STORED PAGE ONCE WITH GEMINI and prints what the service says about it: how long it took, how the answer ended, the tokens spent on the
// page, the answer and "thinking", and whether the answer repeats itself. Writes NOTHING (no database write, no file). It is for finding out why a page's
// read is slow or never comes back; see src/lib/ingestion/geminiProbe.ts.
//
//   npx tsx --env-file=.env.local scripts/gemini-probe.ts --id 85 --page 2 --timeout 300
//
//   --id N --page P        the circular and its page (1-based), read from the database and the page image's address
//   --file path.png        or a page image on disk instead
//   --timeout S            seconds to wait for the answer (default 300)
//   --max-tokens N         the answer's length limit (default 8192, what the upload sends)
//   --thinking-budget N    tokens the model may spend thinking (0 = none); left out unless given
//   --jpeg-edge N          send the page shrunk: a JPEG whose long side is N pixels (default 2400 when a --jpeg option is used)
//   --jpeg-quality Q       the JPEG quality, 1 to 100 (default 85)
//   --compare              read the page TWICE, as stored (A) and shrunk (B), and compare time, size and numbers: one command to learn whether the size matters
//   --base-url URL         another address of the service (for tests)
//
// Needs GEMINI_API_KEY (GEMINI_VISION_MODEL names the model) and, with --id, DATABASE_URL.

import { readFileSync } from "node:fs";
import { Client } from "pg";
import sharp from "sharp";
import { compareProbes, formatProbe, probePage } from "../src/lib/ingestion/geminiProbe";

const args = process.argv.slice(2);
const val = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const num = (name: string): number | undefined => { const v = val(name); return v === undefined || v === "" ? undefined : Number(v); };

async function main() {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (run with: npx tsx --env-file=.env.local scripts/gemini-probe.ts ...)");
  let png: Buffer;
  let label: string;
  if (val("file")) {
    png = readFileSync(val("file") as string);
    label = `page image ${val("file")}`;
  } else {
    const id = num("id"), page = num("page") ?? 1;
    if (!id) throw new Error("give --id and --page, or --file (see the top of this script)");
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with --env-file=.env.local)");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    let url: string | undefined;
    try {
      const r = await client.query(`SELECT "fileUrls" FROM public.circulars WHERE id = $1`, [id]);
      url = (r.rows[0]?.fileUrls as string[] | undefined)?.[page - 1];
    } finally {
      await client.end();
    }
    if (!url) throw new Error(`circular ${id} has no page ${page}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the page image could not be fetched (${res.status})`);
    png = Buffer.from(await res.arrayBuffer());
    label = `circular ${id}, page ${page}`;
  }
  const timeout = num("timeout") ?? 300;
  const edge = num("jpeg-edge") ?? 2400, quality = num("jpeg-quality") ?? 85;
  const shrinkWanted = args.includes("--compare") || val("jpeg-edge") !== undefined || val("jpeg-quality") !== undefined;
  const shrunk = shrinkWanted ? await sharp(png).resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer() : null;
  const runs: { name: string; image: Buffer }[] = args.includes("--compare") ? [{ name: "A: as stored", image: png }, { name: `B: shrunk to a JPEG (long side ${edge} px, quality ${quality})`, image: shrunk as Buffer }] : [shrunk ? { name: `shrunk to a JPEG (long side ${edge} px, quality ${quality})`, image: shrunk } : { name: "as stored", image: png }];
  const results = [];
  for (const run of runs) {
    console.log(`\nAsking Gemini to read ${label}, ${run.name}; waiting up to ${timeout} s ...`);
    const result = await probePage({ png: run.image, apiKey, model: process.env.GEMINI_VISION_MODEL || undefined, baseUrl: val("base-url"), timeoutMs: timeout * 1000, maxTokens: num("max-tokens"), thinkingBudget: num("thinking-budget") });
    console.log(formatProbe(result, `${label}, ${run.name}`));
    results.push(result);
  }
  if (results.length === 2) console.log("\n" + compareProbes(results[0], results[1]));
}

main().catch((e) => {
  console.error("gemini-probe:", e instanceof Error ? e.message : e);
  process.exit(1);
});
