// scripts/probe-fusion2.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing, touches no app code.
//
// Refines the design to TWO arms, RRF-fused (scale-free, no tuned constants):
//
//   ARM V — DENSE VECTOR : best-chunk cosine per circular (topical proximity).
//   ARM L — FIELD-WEIGHTED LEXICAL : ONE ts_rank over a single document
//           tsvector built as  setweight(headline,'A') || setweight(body,'B')
//           so a headline (subject) match counts far above a body mention,
//           with LENGTH NORMALIZATION so a short, focused circular ("Leave
//           Management System") outranks a long incidental one ("Holidays and
//           Leaves for Contractor Workers…"). This is the aboutness signal.
//
// It tests three principled variants of ARM L and reports, for every query,
// the target's FUSED rank under each recipe — the decision table:
//
//   L-log : ts_rank,    normalization = 1  (÷ 1+log(len))   — mild
//   L-len : ts_rank,    normalization = 2  (÷ len)          — strong short-doc
//   L-cd  : ts_rank_cd, normalization = 2  (÷ len) + proximity of terms
//
// Each fused equal-weight and lexical×2. Generic: no circular, no keyword,
// no per-query rule; body is the whole document (all chunks aggregated).
//
// RUN:  node scripts/probe-fusion2.mjs
//       node scripts/probe-fusion2.mjs --q "leave policy" --find "Leave Management"
// FLAGS: --q / --find (repeatable, positional), --k (RRF, default 60),
//        --pool (per-arm depth, default 30).

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
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
  for (let i = 0; i < process.argv.length; i++)
    if (process.argv[i] === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) out.push(process.argv[i + 1]);
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
    body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const v = data?.embedding?.values;
  if (!v || !Array.isArray(v)) throw new Error(`Invalid Gemini response: ${JSON.stringify(data)}`);
  return v;
}

/* ------------------------------ tsquery build -------------------------- */
function toOrTsquery(q) {
  const toks = (q || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const uniq = [...new Set(toks)];
  return uniq.length ? uniq.join(" | ") : null;
}

/* -------------------------------- DB ----------------------------------- */
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

async function armVector(vectorString) {
  const { rows } = await pool.query(
    `SELECT c.id, c.headline, MAX(1 - (cc.embedding <=> $1::vector(768))) AS score
       FROM circular_chunks cc JOIN circulars c ON c.id = cc.circular_id
      WHERE cc.embedding IS NOT NULL
      GROUP BY c.id, c.headline ORDER BY score DESC LIMIT $2;`,
    [vectorString, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}

// Field-weighted whole-document lexical arm. `rankExpr` is the ts_rank[_cd]
// call (weights {D,C,B,A} default {0.1,0.2,0.4,1.0}); `norm` the normalization
// flag. Body = all chunks aggregated -> the true document unit.
async function armLexical(tsq, rankFn, norm) {
  if (!tsq) return [];
  const rankExpr =
    rankFn === "cd"
      ? `ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], doc.tsv, to_tsquery('english',$1), ${norm})`
      : `ts_rank('{0.1,0.2,0.4,1.0}'::float4[], doc.tsv, to_tsquery('english',$1), ${norm})`;
  const { rows } = await pool.query(
    `WITH doc AS (
        SELECT c.id, c.headline,
               setweight(to_tsvector('english', c.headline), 'A') ||
               setweight(to_tsvector('english', coalesce(string_agg(cc.text, ' '), '')), 'B') AS tsv
          FROM circulars c
          LEFT JOIN circular_chunks cc ON cc.circular_id = c.id
         GROUP BY c.id, c.headline
     )
     SELECT id, headline, ${rankExpr} AS score
       FROM doc
      WHERE doc.tsv @@ to_tsquery('english',$1)
      ORDER BY score DESC LIMIT $2;`,
    [tsq, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}

/* ------------------------------ RRF fusion ----------------------------- */
function rrf(arms, k) {
  const acc = new Map();
  for (const arm of arms)
    arm.rows.forEach((row, i) => {
      const contrib = (arm.weight ?? 1) * (1 / (k + i + 1));
      const cur = acc.get(row.id) || { headline: row.headline, fused: 0, parts: {} };
      cur.fused += contrib;
      cur.parts[arm.name] = i + 1;
      acc.set(row.id, cur);
    });
  return [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.fused - a.fused);
}

/* ------------------------------ reporting ------------------------------ */
const hit = (h, f) => (f ? (h || "").toLowerCase().includes(f.toLowerCase()) : false);
function printArm(title, rows, find) {
  console.log(`\n  ${title}:`);
  if (!rows.length) return console.log("    (empty)");
  rows.slice(0, 6).forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.score.toFixed(4)}  ${r.headline}${hit(r.headline, find) ? "  ◀── TARGET" : ""}`));
}
function printFusion(title, fused, find) {
  console.log(`\n  ${title}:`);
  fused.slice(0, 6).forEach((r, i) => {
    const parts = Object.entries(r.parts).map(([n, rk]) => `${n}#${rk}`).join(" ");
    console.log(`    ${String(i + 1).padStart(2)}. ${r.fused.toFixed(5)}  [${parts}]  ${r.headline}${hit(r.headline, find) ? "  ◀── TARGET" : ""}`);
  });
  const ti = find ? fused.findIndex((r) => hit(r.headline, find)) : -1;
  return ti === -1 ? "—" : ti + 1;
}

async function probe(q, find, summary) {
  console.log("\n" + "=".repeat(80));
  console.log(`QUERY: ${JSON.stringify(q)}` + (find ? `   (target: ${JSON.stringify(find)})` : ""));
  const tsq = toOrTsquery(q);
  console.log(`tsquery: ${tsq ? JSON.stringify(tsq) : "(none)"}`);
  console.log("=".repeat(80));

  const vec = normalizeVector(await generateEmbedding(q));
  const vectorString = `[${vec.join(",")}]`;

  const [V, Llog, Llen, Lcd] = await Promise.all([
    armVector(vectorString),
    armLexical(tsq, "rank", 1),
    armLexical(tsq, "rank", 2),
    armLexical(tsq, "cd", 2),
  ]);

  printArm("ARM V  — dense vector", V, find);
  printArm("ARM L-log — field-weighted ts_rank (÷1+log len)", Llog, find);
  printArm("ARM L-len — field-weighted ts_rank (÷len)", Llen, find);
  printArm("ARM L-cd  — field-weighted ts_rank_cd (÷len, proximity)", Lcd, find);

  const recipes = [
    ["V + L-log",        [{ name: "V", rows: V }, { name: "L", rows: Llog }]],
    ["V + L-len",        [{ name: "V", rows: V }, { name: "L", rows: Llen }]],
    ["V + L-cd",         [{ name: "V", rows: V }, { name: "L", rows: Lcd }]],
    ["V + L-len×2",      [{ name: "V", rows: V }, { name: "L", weight: 2, rows: Llen }]],
    ["V + L-cd×2",       [{ name: "V", rows: V }, { name: "L", weight: 2, rows: Lcd }]],
  ];
  const ranks = {};
  for (const [name, arms] of recipes) {
    const fused = rrf(arms, K);
    ranks[name] = printFusion(`FUSED — ${name} (k=${K})`, fused, find);
  }
  summary.push({ q, find, ranks });
}

/* -------------------------------- main --------------------------------- */
(async () => {
  const summary = [];
  try {
    for (let i = 0; i < queries.length; i++) await probe(queries[i], finds[i] || null, summary);

    console.log("\n" + "#".repeat(80));
    console.log("DECISION TABLE — target FUSED rank (1 = correct at top)");
    console.log("#".repeat(80));
    const recipeNames = summary.length ? Object.keys(summary[0].ranks) : [];
    const w = Math.max(20, ...summary.map((s) => (s.find || s.q).length));
    console.log("  " + "query/target".padEnd(w) + "  " + recipeNames.map((n) => n.padStart(12)).join(""));
    for (const s of summary)
      console.log("  " + (s.find || s.q).padEnd(w) + "  " + recipeNames.map((n) => String(s.ranks[n]).padStart(12)).join(""));
    console.log("\n  WIN = a recipe with rank 1 for EVERY row above.\n");
  } catch (e) {
    console.error("\nProbe failed:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
