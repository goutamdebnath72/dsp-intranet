// scripts/audit-blob.mjs
//
// READ-ONLY. Lists EVERYTHING in your Vercel Blob store (all prefixes),
// grouped by top-level folder, so you can spot old/orphaned files.
// Deletes nothing.
//
// RUN:  node scripts/audit-blob.mjs

import { readFileSync } from "fs";
import { list } from "@vercel/blob";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.error("Could not read .env.local — run from project root.");
    process.exit(1);
  }
}

async function main() {
  loadEnv();
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN");
    process.exit(1);
  }

  let all = [];
  let cursor = undefined;
  while (true) {
    // no prefix => everything in the store
    const page = await list({ cursor, limit: 1000 });
    all = all.concat(page.blobs);
    if (!page.hasMore) break;
    cursor = page.cursor;
  }

  // group by top-level folder (text before first "/"), or "(root)"
  const groups = {};
  let totalBytes = 0;
  for (const b of all) {
    const top = b.pathname.includes("/") ? b.pathname.split("/")[0] + "/" : "(root)";
    if (!groups[top]) groups[top] = { count: 0, bytes: 0, samples: [] };
    groups[top].count++;
    groups[top].bytes += b.size || 0;
    totalBytes += b.size || 0;
    if (groups[top].samples.length < 3) groups[top].samples.push(b.pathname);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`BLOB STORE AUDIT — ${all.length} files total, ${(totalBytes/1048576).toFixed(1)} MB`);
  console.log("=".repeat(60));
  const sorted = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
  for (const [prefix, g] of sorted) {
    console.log(`\n  ${prefix}   ${g.count} files, ${(g.bytes/1048576).toFixed(1)} MB`);
    for (const s of g.samples) console.log(`      e.g. ${s}`);
    if (g.count > 3) console.log(`      ... and ${g.count - 3} more`);
  }
  console.log("\n" + "=".repeat(60));
  console.log("Read-only. Nothing deleted.");
  console.log("=".repeat(60) + "\n");
}

main().catch((e) => { console.error("Audit failed:", e); process.exit(1); });
