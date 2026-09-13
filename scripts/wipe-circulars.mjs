// scripts/wipe-circulars.mjs
//
// Wipes ALL circulars cleanly, in two places:
//   1. Postgres (Supabase): circular_chunks + circulars  (TRUNCATE, resets IDs to 1)
//   2. Vercel Blob: every object under the "circulars/" prefix
//
// SAFETY: shows counts first, then asks y/N before deleting anything.
//
// RUN:
//     node scripts/wipe-circulars.mjs
//
// Requires .env.local with DATABASE_URL and BLOB_READ_WRITE_TOKEN (already present).

import { readFileSync } from "fs";
import { createInterface } from "readline";
import { Client } from "pg";
import { list, del } from "@vercel/blob";

// --- load .env.local manually (no dotenv dependency) ---
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    console.error("Could not read .env.local — run this from the project root.");
    process.exit(1);
  }
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

const BLOB_PREFIX = "circulars/";

async function main() {
  loadEnv();

  const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env.local");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // --- 1. Show current DB state ---
  const chunks = await client.query("SELECT COUNT(*) FROM public.circular_chunks");
  const circs = await client.query("SELECT COUNT(*) FROM public.circulars");
  const chunkCount = Number(chunks.rows[0].count);
  const circCount = Number(circs.rows[0].count);

  // --- 2. Show current Blob state ---
  let blobs = [];
  let cursor = undefined;
  while (true) {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    blobs = blobs.concat(page.blobs);
    if (!page.hasMore) break;
    cursor = page.cursor;
  }

  console.log("\n" + "=".repeat(50));
  console.log("ABOUT TO WIPE:");
  console.log(`  DB  circular_chunks : ${chunkCount} rows`);
  console.log(`  DB  circulars       : ${circCount} rows`);
  console.log(`  Blob "${BLOB_PREFIX}"   : ${blobs.length} files`);
  console.log("=".repeat(50));

  if (chunkCount === 0 && circCount === 0 && blobs.length === 0) {
    console.log("Everything is already empty. Nothing to do.");
    await client.end();
    return;
  }

  const answer = await ask('\nType "y" to permanently delete ALL of the above, anything else to cancel: ');
  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled. Nothing was deleted.");
    await client.end();
    return;
  }

  // --- 3. Wipe DB (child first via CASCADE, resets IDs) ---
  console.log("\nTruncating database tables...");
  await client.query(
    "TRUNCATE public.circular_chunks, public.circulars RESTART IDENTITY CASCADE",
  );
  console.log("  DB cleared.");

  // --- 4. Wipe Blob ---
  if (blobs.length) {
    console.log(`Deleting ${blobs.length} blob files...`);
    // del() accepts an array of urls; do it in batches to be safe
    const urls = blobs.map((b) => b.url);
    const BATCH = 100;
    for (let i = 0; i < urls.length; i += BATCH) {
      await del(urls.slice(i, i + BATCH));
      console.log(`  deleted ${Math.min(i + BATCH, urls.length)}/${urls.length}`);
    }
    console.log("  Blob cleared.");
  }

  // --- 5. Verify ---
  const c2 = await client.query("SELECT COUNT(*) FROM public.circular_chunks");
  const r2 = await client.query("SELECT COUNT(*) FROM public.circulars");
  let remaining = 0;
  let cur2 = undefined;
  while (true) {
    const page = await list({ prefix: BLOB_PREFIX, cursor: cur2, limit: 1000 });
    remaining += page.blobs.length;
    if (!page.hasMore) break;
    cur2 = page.cursor;
  }

  console.log("\n" + "=".repeat(50));
  console.log("AFTER WIPE (all should be 0):");
  console.log(`  DB  circular_chunks : ${c2.rows[0].count}`);
  console.log(`  DB  circulars       : ${r2.rows[0].count}`);
  console.log(`  Blob "${BLOB_PREFIX}"   : ${remaining}`);
  console.log("=".repeat(50) + "\n");

  await client.end();
}

main().catch((e) => {
  console.error("Wipe failed:", e);
  process.exit(1);
});
