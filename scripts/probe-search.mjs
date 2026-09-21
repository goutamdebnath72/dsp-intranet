// scripts/probe-search.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing, touches no app code.
//
// It reproduces the Policy engine's retrieval EXACTLY (same Gemini model,
// same task type, same 768-dim, same L2 normalize, same cosine SQL) and then
// shows, for each query, THREE views so we can see where a document is lost:
//
//   1. RAW RECALL      — the top-30 chunks by pure cosine (no bonuses at all),
//                        collapsed to one row per circular (best chunk). This
//                        is the candidate pool the ranker gets to work with.
//                        A doc absent here is a RECALL failure (vector alone
//                        can never surface it -> a lexical arm is mandatory).
//
//   2. AFTER 0.5 FLOOR — which of those survive the engine's `rawSim < 0.5`
//                        hard cut (below the cut = discarded before ranking).
//
//   3. APP RANKING SIM — the same rows re-scored with the engine's live knobs
//                        (recency bonus, headline-length penalty) and then run
//                        through the edge-cliff severance, so we see exactly
//                        what reaches the UI and WHY the true doc is dropped
//                        (severed by the cliff vs out-ranked by recency).
//
// This is generic: it hard-codes no circular, no keyword, no expected answer.
// Point --find at any substring only to HIGHLIGHT rows in the print-out; it
// never changes any score.
//
// PREREQUISITES: node_modules present; .env.local (or .env) carries
// GEMINI_API_KEY + DATABASE_URL. No dev server needed.
//
// RUN:
//   node scripts/probe-search.mjs
//   node scripts/probe-search.mjs --q "leave policy" --find "Leave Management"
//   node scripts/probe-search.mjs --q "c&it attendance" --find "attendance"
//   node scripts/probe-search.mjs --q "leave policy" --q "c&it attendance"
//
// FLAGS:
//   --q <string>     a query to probe (repeatable). Defaults to the two
//                    failing queries plus --find hints for each.
//   --find <string>  substring to highlight in the output (repeatable, paired
//                    positionally with --q). Display only.
//   --limit <n>      raw recall depth (default 30 — matches the engine).

import { readFileSync, existsSync } from "fs";
import pg from "pg";

/* ----------------------------- env loading ----------------------------- */
// Minimal .env parser (no dotenv dependency). Loads .env then .env.local so
// .env.local overrides, matching Next.js precedence closely enough for a probe.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
// .env.local first so it wins (we don't overwrite an already-set key).
loadEnvFile(".env.local");
loadEnvFile(".env");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY (.env.local / .env).");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL (.env.local / .env).");
  process.exit(1);
}

/* ------------------------------ arg parsing ---------------------------- */
function collectFlag(name) {
  const out = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      out.push(argv[i + 1]);
    }
  }
  return out;
}
function singleFlag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : def;
}

let queries = collectFlag("q");
let finds = collectFlag("find");
if (queries.length === 0) {
  // Default to the two known-failing queries, each with a display highlight.
  queries = ["leave policy", "c&it attendance"];
  finds = ["Leave Management", "attendance"];
}
const RAW_LIMIT = parseInt(singleFlag("limit", "30"), 10) || 30;

/* --------------- embedding (mirror of embedding.service.ts) ------------- */
function normalizeVector(vec) {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}
async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const vector = data?.embedding?.values;
  if (!vector || !Array.isArray(vector)) {
    throw new Error(`Invalid Gemini response: ${JSON.stringify(data)}`);
  }
  return vector;
}

/* ------------------------------ engine knobs --------------------------- */
// Mirrors semanticPolicySearch.ts so the SIMULATED ranking matches production.
const RAW_FLOOR = 0.5; // rawSim < 0.5 -> discarded before ranking
const CLIFF_OUTER = 0.045; // keep within this of the top internalScore
const CLIFF_STEP = 0.02; // sever on a bigger step than this between neighbours
const CURRENT_YEAR = new Date().getFullYear();
function recencyBonus(pubYear) {
  const age = CURRENT_YEAR - pubYear;
  return Math.max(0, (10 - age) * 0.015);
}
function lengthPenalty(headline) {
  return (headline || "").length * 0.0003;
}

/* -------------------------------- DB ----------------------------------- */
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase pooler requires TLS
  max: 3,
});

// Pure cosine, one query, LIMIT n. No year/script/recency bonuses — this is
// the unmodified recall signal. We keep every chunk then collapse per circular.
async function rawRecall(vectorString, limit) {
  const sql = `
    SELECT
      c.id,
      c.headline,
      c."publishedAt",
      cc.chunk_index,
      cc.text AS chunk_text,
      (1 - (cc.embedding <=> $1::vector(768))) AS base_similarity
    FROM circular_chunks cc
    JOIN circulars c ON c.id = cc.circular_id
    WHERE cc.embedding IS NOT NULL
    ORDER BY base_similarity DESC
    LIMIT $2;
  `;
  const { rows } = await pool.query(sql, [vectorString, limit]);
  // Collapse to best chunk per circular (what the engine's docMap keeps).
  const byDoc = new Map();
  for (const r of rows) {
    const sim = Number(r.base_similarity) || 0;
    const prev = byDoc.get(r.id);
    if (!prev || sim > prev.base_similarity) {
      byDoc.set(r.id, {
        id: r.id,
        headline: r.headline,
        pubYear: new Date(r.publishedAt).getFullYear(),
        base_similarity: sim,
        chunk_index: r.chunk_index,
      });
    }
  }
  return Array.from(byDoc.values()).sort(
    (a, b) => b.base_similarity - a.base_similarity,
  );
}

/* ------------------------------ reporting ------------------------------ */
function hl(headline, find) {
  if (!find) return false;
  return (headline || "").toLowerCase().includes(find.toLowerCase());
}
function fmt(n) {
  return Number(n).toFixed(4);
}
function line(rank, sim, year, headline, mark, tag) {
  const r = String(rank).padStart(2, " ");
  const s = fmt(sim);
  const y = String(year);
  const flag = mark ? " ◀── TARGET" : "";
  const t = tag ? `  [${tag}]` : "";
  return `  ${r}. sim=${s}  ${y}  ${headline}${t}${flag}`;
}

async function probe(q, find) {
  console.log("\n" + "=".repeat(78));
  console.log(`QUERY: ${JSON.stringify(q)}` + (find ? `   (highlight: ${JSON.stringify(find)})` : ""));
  console.log("=".repeat(78));

  const raw = normalizeVector(await generateEmbedding(q));
  const vectorString = `[${raw.join(",")}]`;
  const recall = await rawRecall(vectorString, RAW_LIMIT);

  if (recall.length === 0) {
    console.log("  (no chunks returned — check embeddings exist)");
    return;
  }

  // VIEW 1 — RAW RECALL (pure cosine, per-circular best chunk)
  console.log(`\n[1] RAW RECALL — top ${recall.length} circulars by pure cosine (no bonuses):`);
  recall.forEach((d, i) => {
    const belowFloor = d.base_similarity < RAW_FLOOR;
    console.log(
      line(i + 1, d.base_similarity, d.pubYear, d.headline, hl(d.headline, find),
        belowFloor ? "BELOW 0.5 FLOOR — discarded pre-rank" : ""),
    );
  });

  // Target summary (recall answer to "is it even retrieved?")
  if (find) {
    const idx = recall.findIndex((d) => hl(d.headline, find));
    console.log(`\n    → TARGET ("${find}") in raw recall: ` +
      (idx === -1
        ? "NOT PRESENT (recall failure — vector alone cannot surface it)"
        : `rank ${idx + 1}, sim=${fmt(recall[idx].base_similarity)}` +
          (recall[idx].base_similarity < RAW_FLOOR ? " (BELOW 0.5 floor)" : " (survives 0.5 floor)")));
  }

  // VIEW 2 — AFTER 0.5 FLOOR
  const survivors = recall.filter((d) => d.base_similarity >= RAW_FLOOR);
  console.log(`\n[2] AFTER 0.5 FLOOR — ${survivors.length}/${recall.length} circulars survive to ranking.`);

  // VIEW 3 — APP RANKING SIM (recency + length, then edge-cliff severance)
  const scored = survivors
    .map((d) => ({
      ...d,
      internalScore: d.base_similarity + recencyBonus(d.pubYear) - lengthPenalty(d.headline),
    }))
    .sort((a, b) => b.internalScore - a.internalScore);

  console.log(`\n[3] APP RANKING SIM — recency+length applied, then edge-cliff:`);
  if (scored.length === 0) {
    console.log("  (nothing survived the floor)");
  } else {
    const topScore = scored[0].internalScore;
    let severedAt = scored.length;
    for (let i = 0; i < scored.length; i++) {
      if (scored[i].internalScore < topScore - CLIFF_OUTER) { severedAt = i; break; }
      if (i > 0 && scored[i - 1].internalScore - scored[i].internalScore > CLIFF_STEP) { severedAt = i; break; }
    }
    scored.forEach((d, i) => {
      const kept = i < severedAt;
      const tag = kept ? "returned to UI" : "SEVERED by edge-cliff";
      console.log(
        `  ${String(i + 1).padStart(2, " ")}. score=${fmt(d.internalScore)}` +
        ` (cos=${fmt(d.base_similarity)} +rec=${fmt(recencyBonus(d.pubYear))} -len=${fmt(lengthPenalty(d.headline))})` +
        `  ${d.pubYear}  ${d.headline}  [${tag}]` +
        (hl(d.headline, find) ? " ◀── TARGET" : ""),
      );
    });
    if (find) {
      const ti = scored.findIndex((d) => hl(d.headline, find));
      if (ti === -1) {
        console.log(`\n    → TARGET was cut by the 0.5 floor (never reached ranking).`);
      } else if (ti >= severedAt) {
        console.log(`\n    → TARGET reached ranking at score-rank ${ti + 1} but was SEVERED by the edge-cliff (returned=${severedAt}).`);
      } else {
        console.log(`\n    → TARGET returned to UI at rank ${ti + 1}.`);
      }
    }
  }
}

/* -------------------------------- main --------------------------------- */
(async () => {
  try {
    for (let i = 0; i < queries.length; i++) {
      await probe(queries[i], finds[i] || null);
    }
  } catch (e) {
    console.error("\nProbe failed:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
