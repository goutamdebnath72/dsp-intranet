// scripts/probe-fusion.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing, touches no app code.
//
// Tests the PROPOSED generic ranking BEFORE we build it. It computes three
// independent retrieval arms against the live corpus and fuses them with
// Reciprocal Rank Fusion (scale-free — no cosine-vs-ts_rank normalization,
// no tuned constants; RRF's only knob is k=60 and it is insensitive):
//
//   ARM V — DENSE VECTOR : best-chunk cosine per circular (topical proximity)
//   ARM H — HEADLINE FTS : ts_rank on the headline, LENGTH-NORMALIZED (norm=1)
//                          -> rewards the doc whose SUBJECT is the query
//                          (short "Leave Management System" beats long
//                          "Holidays and Leaves for Contractor Workers…").
//   ARM B — BODY FTS     : max ts_rank over the chunks, length-normalized.
//
// RRF: fused(doc) = Σ_arm  1 / (k + rank_in_arm),  k = 60.
// A doc missing from an arm simply gets nothing from that arm.
//
// NO recency term, NO edge-cliff, NO per-circular / per-keyword rule. Generic.
//
// It prints each arm's top-8, the fused top-8, and (for --find) the fused rank
// of the target — the one question that decides the design: does lexical +
// vector, fused, put the correct doc at #1 for BOTH queries?
//
// Also prints a headline-weighted variant (H counted twice in the fusion) so
// we can see whether subject-weighting is needed, all still generic.
//
// RUN:
//   node scripts/probe-fusion.mjs
//   node scripts/probe-fusion.mjs --q "leave policy" --find "Leave Management"
//
// FLAGS: --q (repeatable), --find (repeatable, positional with --q),
//        --k <n> RRF constant (default 60), --pool <n> per-arm depth (default 30).

import { readFileSync, existsSync } from "fs";
import pg from "pg";

/* ----------------------------- env loading ----------------------------- */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
if (!GEMINI_API_KEY || !DATABASE_URL) {
  console.error("Missing GEMINI_API_KEY or DATABASE_URL (.env.local / .env).");
  process.exit(1);
}

/* ------------------------------ arg parsing ---------------------------- */
function collectFlag(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      out.push(process.argv[i + 1]);
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
  queries = ["leave policy", "c&it attendance"];
  finds = ["Leave Management", "attendance"];
}
const K = parseInt(singleFlag("k", "60"), 10) || 60;
const POOL = parseInt(singleFlag("pool", "30"), 10) || 30;

/* --------------- embedding (mirror of embedding.service.ts) ------------- */
function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const v = data?.embedding?.values;
  if (!v || !Array.isArray(v)) throw new Error(`Invalid Gemini response: ${JSON.stringify(data)}`);
  return v;
}

/* ------------------------------ tsquery build -------------------------- */
// Generic: split on non-alphanumerics, drop <2-char tokens, OR the rest.
// Department noise like "c&it" -> ["c","it"] -> dropped/stopworded, so the
// real topic token drives the match. No special-casing anywhere.
function toOrTsquery(q) {
  const toks = (q || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  const uniq = [...new Set(toks)];
  return uniq.length ? uniq.join(" | ") : null;
}

/* -------------------------------- DB ----------------------------------- */
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function armVector(vectorString) {
  const { rows } = await pool.query(
    `SELECT c.id, c.headline,
            MAX(1 - (cc.embedding <=> $1::vector(768))) AS score
       FROM circular_chunks cc
       JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL
      GROUP BY c.id, c.headline
      ORDER BY score DESC
      LIMIT $2;`,
    [vectorString, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}

async function armHeadlineFts(tsq) {
  if (!tsq) return [];
  // normalization = 1 -> divide rank by 1 + log(doc length): term DENSITY in
  // the headline, so a short on-subject title outranks a long incidental one.
  const { rows } = await pool.query(
    `SELECT c.id, c.headline,
            ts_rank(to_tsvector('english', c.headline), to_tsquery('english', $1), 1) AS score
       FROM circulars c
      WHERE to_tsvector('english', c.headline) @@ to_tsquery('english', $1)
      ORDER BY score DESC
      LIMIT $2;`,
    [tsq, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}

async function armBodyFts(tsq) {
  if (!tsq) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.headline,
            MAX(ts_rank(to_tsvector('english', cc.text), to_tsquery('english', $1), 1)) AS score
       FROM circular_chunks cc
       JOIN circulars c ON c.id = cc.circular_id
      WHERE to_tsvector('english', cc.text) @@ to_tsquery('english', $1)
      GROUP BY c.id, c.headline
      ORDER BY score DESC
      LIMIT $2;`,
    [tsq, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}

/* ------------------------------ RRF fusion ----------------------------- */
// arms: array of { name, weight, rows:[{id,headline,score}] (rank = index) }
function rrf(arms, k) {
  const acc = new Map(); // id -> { headline, fused, parts:{} }
  for (const arm of arms) {
    arm.rows.forEach((row, i) => {
      const rank = i + 1;
      const contrib = (arm.weight ?? 1) * (1 / (k + rank));
      const cur = acc.get(row.id) || { headline: row.headline, fused: 0, parts: {} };
      cur.fused += contrib;
      cur.parts[arm.name] = rank;
      acc.set(row.id, cur);
    });
  }
  return [...acc.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.fused - a.fused);
}

/* ------------------------------ reporting ------------------------------ */
const hit = (h, f) => (f ? (h || "").toLowerCase().includes(f.toLowerCase()) : false);
function printArm(title, rows, find) {
  console.log(`\n  ${title}:`);
  if (rows.length === 0) { console.log("    (empty)"); return; }
  rows.slice(0, 8).forEach((r, i) =>
    console.log(`    ${String(i + 1).padStart(2)}. score=${r.score.toFixed(4)}  ${r.headline}${hit(r.headline, find) ? "  ◀── TARGET" : ""}`),
  );
}
function printFusion(title, fused, find) {
  console.log(`\n  ${title}:`);
  fused.slice(0, 8).forEach((r, i) => {
    const parts = Object.entries(r.parts).map(([n, rk]) => `${n}#${rk}`).join(" ");
    console.log(`    ${String(i + 1).padStart(2)}. rrf=${r.fused.toFixed(5)}  [${parts}]  ${r.headline}${hit(r.headline, find) ? "  ◀── TARGET" : ""}`);
  });
  if (find) {
    const ti = fused.findIndex((r) => hit(r.headline, find));
    console.log(`    → TARGET fused rank: ${ti === -1 ? "NOT PRESENT" : ti + 1}`);
  }
}

async function probe(q, find) {
  console.log("\n" + "=".repeat(80));
  console.log(`QUERY: ${JSON.stringify(q)}` + (find ? `   (target: ${JSON.stringify(find)})` : ""));
  const tsq = toOrTsquery(q);
  console.log(`tsquery: ${tsq ? JSON.stringify(tsq) : "(none — all tokens dropped)"}`);
  console.log("=".repeat(80));

  const vec = normalizeVector(await generateEmbedding(q));
  const vectorString = `[${vec.join(",")}]`;

  const [V, H, B] = await Promise.all([
    armVector(vectorString),
    armHeadlineFts(tsq),
    armBodyFts(tsq),
  ]);

  printArm("ARM V — dense vector (best-chunk cosine)", V, find);
  printArm("ARM H — headline FTS (length-normalized density)", H, find);
  printArm("ARM B — body FTS (length-normalized density)", B, find);

  const equal = rrf(
    [{ name: "V", rows: V }, { name: "H", rows: H }, { name: "B", rows: B }],
    K,
  );
  printFusion(`FUSED — RRF equal weight (k=${K})`, equal, find);

  const hWeighted = rrf(
    [{ name: "V", rows: V }, { name: "H", weight: 2, rows: H }, { name: "B", rows: B }],
    K,
  );
  printFusion(`FUSED — RRF headline×2 (subject-weighted, k=${K})`, hWeighted, find);
}

/* -------------------------------- main --------------------------------- */
(async () => {
  try {
    for (let i = 0; i < queries.length; i++) await probe(queries[i], finds[i] || null);
  } catch (e) {
    console.error("\nProbe failed:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
