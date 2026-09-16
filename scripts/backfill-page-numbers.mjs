// scripts/backfill-page-numbers.mjs
//
// Backfills circular_chunks.page_number for circulars uploaded BEFORE the
// per-page pipeline change (their chunks currently have page_number = 0).
//
// HOW IT WORKS
//   The page a chunk came from was never stored for the old corpus, but the
//   per-page images ARE still in Vercel Blob (circulars.fileUrls is one image
//   per page, in order). So for each circular we:
//     1. download each page image,
//     2. OCR it with a SINGLE fast pass (eng+hin+ben) just to get per-page text
//        for MATCHING (not for storage — we never re-embed),
//     3. assign each existing chunk the page whose OCR text best contains it.
//   Chunks we cannot confidently place are left at 0 (safe: no page-jump, same
//   as current behaviour). NO embedding API is called — zero Gemini quota use.
//
// USAGE
//   node scripts/backfill-page-numbers.mjs            # DRY RUN (no writes)
//   node scripts/backfill-page-numbers.mjs --commit   # actually write
//   node scripts/backfill-page-numbers.mjs --commit --id 12   # one circular
//
// Requires .env.local with DATABASE_URL (or DIRECT_DATABASE_URL). Uses the same
// tesseract.js the app uses; run from the project root where it's installed.

import { readFileSync } from "fs";
import { Client } from "pg";
import Tesseract from "tesseract.js";

/* ---- env ---- */
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
    console.error("Could not read .env.local — run from the project root.");
    process.exit(1);
  }
}

/* ---- text normalisation for matching ---- */
// Lowercase, keep only alphanumerics as space-separated tokens. This makes the
// match tolerant of OCR punctuation/spacing differences between runs.
function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0980-\u09ff]+/g, " ") // keep latin digits + devanagari + bengali
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(text) {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

/* ---- single fast OCR pass for a page image buffer ---- */
async function ocrPageFast(buffer, label = "") {
  let worker = null;
  try {
    worker = await Tesseract.createWorker("eng+hin+ben");
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text || "";
  } catch (err) {
    console.error(`  OCR failed${label ? " on " + label : ""}:`, err?.message || err);
    return "";
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

/* ---- score how well a chunk sits on a page (token overlap ratio) ---- */
function pageScore(chunkTokens, pageTokenSet) {
  if (chunkTokens.length === 0) return 0;
  let hit = 0;
  for (const t of chunkTokens) if (pageTokenSet.has(t)) hit++;
  return hit / chunkTokens.length;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const COMMIT = args.includes("--commit");
  const onlyIdIdx = args.indexOf("--id");
  const ONLY_ID = onlyIdIdx !== -1 ? parseInt(args[onlyIdIdx + 1], 10) : null;

  const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env.local");
    process.exit(1);
  }

  // keepAlive + generous timeouts: OCR between queries can leave the connection
  // idle long enough for the Supabase pooler to drop it. keepAlive pings hold it
  // open; a reconnect helper below recovers if it still drops mid-run.
  function makeClient() {
    const c = new Client({
      connectionString: dbUrl,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
      connectionTimeoutMillis: 30000,
      statement_timeout: 60000,
    });
    // Swallow async 'error' events so a dropped socket doesn't crash the process;
    // queries below detect the dead connection and reconnect.
    c.on("error", (e) => {
      console.warn("  (pg connection error, will reconnect):", e?.message || e);
    });
    return c;
  }

  let client = makeClient();
  await client.connect();

  // Run a query, transparently reconnecting once if the connection was dropped.
  async function q(text, params) {
    try {
      return await client.query(text, params);
    } catch (e) {
      const msg = e?.message || "";
      if (/terminated|Connection|ECONNRESET|timeout|not queryable/i.test(msg)) {
        console.warn("  (reconnecting to Postgres…)");
        try { await client.end().catch(() => {}); } catch {}
        client = makeClient();
        await client.connect();
        return await client.query(text, params); // retry once
      }
      throw e;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(COMMIT ? "BACKFILL — COMMIT MODE (will write)" : "BACKFILL — DRY RUN (no writes)");
  console.log("=".repeat(60));

  // Circulars that still have unplaced chunks.
  const circSql = `
    SELECT c.id, c.headline, c."fileUrls"
    FROM public.circulars c
    WHERE EXISTS (
      SELECT 1 FROM public.circular_chunks cc
      WHERE cc.circular_id = c.id AND (cc.page_number IS NULL OR cc.page_number = 0)
    )
    ${ONLY_ID ? "AND c.id = $1" : ""}
    ORDER BY c.id ASC
  `;
  const circs = await q(circSql, ONLY_ID ? [ONLY_ID] : []);
  console.log(`Circulars needing backfill: ${circs.rows.length}\n`);

  let totalUpdated = 0;
  let totalUnplaced = 0;

  for (const circ of circs.rows) {
    const fileUrls = Array.isArray(circ.fileUrls) ? circ.fileUrls : [];
    console.log(`# id=${circ.id} "${(circ.headline || "").slice(0, 60)}" (${fileUrls.length} pages)`);

    if (fileUrls.length === 0) {
      console.log("  no page images on record — skipping");
      continue;
    }

    // 1. OCR each page -> token set per page.
    const pageTokenSets = [];
    for (let p = 0; p < fileUrls.length; p++) {
      let buf = null;
      for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
        try {
          const res = await fetch(fileUrls[p]);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
        } catch (e) {
          if (attempt === 3) {
            console.log(`  page ${p + 1}: download failed after 3 tries (${e?.message || e}) — page skipped`);
          } else {
            await new Promise((r) => setTimeout(r, 800 * attempt)); // backoff
          }
        }
      }
      if (!buf) {
        pageTokenSets.push(new Set());
        continue;
      }
      const text = await ocrPageFast(buf, `page ${p + 1}`);
      pageTokenSets.push(new Set(tokens(text)));
      process.stdout.write(`  page ${p + 1}/${fileUrls.length} OCR'd\r`);
    }
    process.stdout.write("\n");

    // 2. Fetch this circular's chunks needing placement.
    const chunks = await q(
      `SELECT id, chunk_index, text FROM public.circular_chunks
       WHERE circular_id = $1 AND (page_number IS NULL OR page_number = 0)
       ORDER BY chunk_index ASC`,
      [circ.id],
    );

    // 3. Place each chunk on its best-scoring page.
    const updates = [];
    for (const ch of chunks.rows) {
      const ctoks = tokens(ch.text);
      let bestPage = 0;
      let bestScore = 0;
      for (let p = 0; p < pageTokenSets.length; p++) {
        const sc = pageScore(ctoks, pageTokenSets[p]);
        if (sc > bestScore) {
          bestScore = sc;
          bestPage = p + 1; // 1-based
        }
      }
      // Require a reasonable overlap to avoid mis-placing on OCR noise.
      if (bestPage > 0 && bestScore >= 0.4) {
        updates.push({ id: ch.id, page: bestPage });
      } else {
        totalUnplaced++;
      }
    }

    console.log(`  chunks: ${chunks.rows.length}, placed: ${updates.length}, unplaced: ${chunks.rows.length - updates.length}`);

    // 4. Write (or preview).
    if (COMMIT && updates.length > 0) {
      for (const u of updates) {
        await q(
          `UPDATE public.circular_chunks SET page_number = $1 WHERE id = $2`,
          [u.page, u.id],
        );
      }
      console.log(`  ✅ updated ${updates.length} chunk(s)`);
    } else if (updates.length > 0) {
      const preview = updates.slice(0, 8).map((u) => `#${u.id}->p${u.page}`).join(", ");
      console.log(`  would update: ${preview}${updates.length > 8 ? ", …" : ""}`);
    }
    totalUpdated += updates.length;
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`${COMMIT ? "Updated" : "Would update"}: ${totalUpdated} chunk(s)`);
  console.log(`Left unplaced (page stays 0): ${totalUnplaced} chunk(s)`);
  if (!COMMIT) console.log("\nDRY RUN — re-run with --commit to write.");
  console.log("=".repeat(60) + "\n");

  await client.end();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
