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
//   --base-url URL         another address of the service (for tests)
//
// Needs GEMINI_API_KEY (GEMINI_VISION_MODEL names the model) and, with --id, DATABASE_URL.

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { formatProbe, probePage } from "../src/lib/ingestion/geminiProbe";

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
  console.log(`Asking Gemini to read ${label}; waiting up to ${timeout} s ...`);
  const result = await probePage({ png, apiKey, model: process.env.GEMINI_VISION_MODEL || undefined, baseUrl: val("base-url"), timeoutMs: timeout * 1000, maxTokens: num("max-tokens"), thinkingBudget: num("thinking-budget") });
  console.log("\n" + formatProbe(result, label));
}

main().catch((e) => {
  console.error("gemini-probe:", e instanceof Error ? e.message : e);
  process.exit(1);
});
