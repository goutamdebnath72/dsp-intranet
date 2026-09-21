// scripts/probe-battery.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing, touches no app code.
//
// Picks the hybrid ranking recipe on EVIDENCE, not on two queries. It runs a
// battery of policy-lane queries (each with a known-correct target headline)
// against every candidate recipe and reports, objectively:
//   - the target's fused rank per query per recipe (decision table)
//   - per recipe: rank-1 count, MRR (mean reciprocal rank), worst rank.
//
// The engine under test is the two-arm hybrid from probe-fusion2:
//   ARM V — dense vector (best-chunk cosine)
//   ARM L — field-weighted lexical: ts_rank[_cd] over
//           setweight(headline,'A') || setweight(body,'B'), length-normalized.
// Fused with RRF (k=60). Recipes differ only in L's normalization / weight.
// Generic: no per-query, per-keyword, per-circular rule anywhere.
//
// SCOPE: this is the CONVERSATIONAL / AMBIGUOUS lane (executePolicySearch).
// The quoted / literal-code lane (executeContentSearch) is a different path
// and is intentionally NOT in this battery — the hybrid change does not touch
// it. Indic queries carry NO Latin tokens, so ARM L no-ops and every recipe
// collapses to V-only — i.e. today's behaviour — which is exactly the
// cross-lingual regression guard included below.
//
// RUN:  node scripts/probe-battery.mjs
//       node scripts/probe-battery.mjs --verbose   (dump each arm per query)
// FLAGS: --k (RRF, default 60), --pool (per-arm depth, default 30), --verbose

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
const VERBOSE = process.argv.includes("--verbose");
function singleFlag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : def;
}
const K = parseInt(singleFlag("k", "60"), 10) || 60;
const POOL = parseInt(singleFlag("pool", "30"), 10) || 30;

/* ------------------------------ THE BATTERY ---------------------------- */
// find = case-insensitive substring of the CORRECT circular's headline.
// Targets taken from the confirmed manifest / TOCs.
const BATTERY = [
  // --- topic / conversational (English -> hybrid active) ---
  { q: "leave policy",                          find: "Leave Management" },
  { q: "c&it attendance",                       find: "attendance" },
  { q: "attendance system",                     find: "attendance" },
  { q: "biometric attendance contractor",       find: "Biometric Attendance" },
  { q: "table tennis team selection",           find: "TABLE TENNIS" },
  { q: "gift card for employees",               find: "Gift Card" },
  { q: "mediclaim policy extension",            find: "Mediclaim" },
  { q: "company accommodation after retirement",find: "Retention of Company" },
  { q: "pf loan repayment",                     find: "PF Loan" },
  { q: "merit award scheme contract workers",   find: "Merit Award" },
  { q: "motivational award scheme",             find: "Motivational Award" },
  { q: "zero tolerance safety rules",           find: "SAFETY RULES" },
  { q: "linkedin membership for executives",    find: "LinkedIn" },
  { q: "hindi teaching scheme",                 find: "Hindi Teaching" },
  { q: "holiday list 2026",                     find: "HOLIDAY LIST FOR THE YEAR 2026" }, // holiday list IS correct here
  { q: "sail gaurav diwas",                     find: "GAURAV DIWAS" },
  // --- cross-lingual / conversational regression (ARM L no-ops -> V-only) ---
  { q: "टेबल टेनिस टीम के खिलाड़ियों का चयन",         find: "TABLE TENNIS" },
  { q: "तेलुगु, तमिल, कन्नड़, मलयालम, मिजो",          find: "HTS" },
  { q: "How much deposit is required to keep a 2-bedroom quarter in Delhi after retirement?", find: "Retention of Company" },
];

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
      WHERE cc.embedding IS NOT NULL GROUP BY c.id, c.headline
      ORDER BY score DESC LIMIT $2;`,
    [vectorString, POOL],
  );
  return rows.map((r) => ({ id: r.id, headline: r.headline, score: Number(r.score) }));
}
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
          FROM circulars c LEFT JOIN circular_chunks cc ON cc.circular_id = c.id
         GROUP BY c.id, c.headline)
     SELECT id, headline, ${rankExpr} AS score
       FROM doc WHERE doc.tsv @@ to_tsquery('english',$1)
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
      const cur = acc.get(row.id) || { headline: row.headline, fused: 0 };
      cur.fused += (arm.weight ?? 1) * (1 / (k + i + 1));
      acc.set(row.id, cur);
    });
  return [...acc.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.fused - a.fused);
}
const hit = (h, f) => (f ? (h || "").toLowerCase().includes(f.toLowerCase()) : false);
function targetRank(fused, find) {
  const i = fused.findIndex((r) => hit(r.headline, find));
  return i === -1 ? null : i + 1;
}

/* -------------------------------- main --------------------------------- */
const RECIPES = ["V-only", "V+L-log", "V+L-log×2", "V+L-len×2", "V+L-cd×2"];

(async () => {
  const table = []; // { q, find, ranks:{recipe:rank} }
  try {
    for (const { q, find } of BATTERY) {
      const vec = normalizeVector(await generateEmbedding(q));
      const vectorString = `[${vec.join(",")}]`;
      const tsq = toOrTsquery(q);
      const [V, Llog, Llen, Lcd] = await Promise.all([
        armVector(vectorString),
        armLexical(tsq, "rank", 1),
        armLexical(tsq, "rank", 2),
        armLexical(tsq, "cd", 2),
      ]);
      const ranks = {
        "V-only":    targetRank(rrf([{ name: "V", rows: V }], K), find),
        "V+L-log":   targetRank(rrf([{ name: "V", rows: V }, { name: "L", rows: Llog }], K), find),
        "V+L-log×2": targetRank(rrf([{ name: "V", rows: V }, { name: "L", weight: 2, rows: Llog }], K), find),
        "V+L-len×2": targetRank(rrf([{ name: "V", rows: V }, { name: "L", weight: 2, rows: Llen }], K), find),
        "V+L-cd×2":  targetRank(rrf([{ name: "V", rows: V }, { name: "L", weight: 2, rows: Lcd }], K), find),
      };
      table.push({ q, find, ranks });
      if (VERBOSE) {
        console.log(`\n${q}  (target: ${find})`);
        [["V", V], ["L-log", Llog], ["L-len", Llen], ["L-cd", Lcd]].forEach(([n, rows]) =>
          console.log(`  ${n}: ` + rows.slice(0, 4).map((r) => `${r.headline}${hit(r.headline, find) ? "✔" : ""}`).join(" | ")),
        );
      }
    }

    // ---- decision table ----
    const qw = Math.max(24, ...table.map((t) => t.q.length > 40 ? 40 : t.q.length));
    console.log("\n" + "#".repeat(96));
    console.log("DECISION TABLE — target fused rank (1 = correct at top, '—' = not found)");
    console.log("#".repeat(96));
    console.log("  " + "query".padEnd(qw) + RECIPES.map((r) => r.padStart(11)).join(""));
    for (const t of table) {
      const label = (t.q.length > 40 ? t.q.slice(0, 39) + "…" : t.q).padEnd(qw);
      console.log("  " + label + RECIPES.map((r) => String(t.ranks[r] ?? "—").padStart(11)).join(""));
    }

    // ---- summary stats per recipe ----
    console.log("\n" + "=".repeat(96));
    console.log("SUMMARY — higher rank-1 & MRR is better; lower worst-rank is better");
    console.log("=".repeat(96));
    const N = table.length;
    console.log("  " + "recipe".padEnd(14) + "rank-1".padStart(10) + "MRR".padStart(10) + "worst".padStart(10) + "  misses");
    for (const r of RECIPES) {
      let ones = 0, mrrSum = 0, worst = 0, misses = 0;
      for (const t of table) {
        const rk = t.ranks[r];
        if (rk == null) { misses++; worst = Math.max(worst, 99); continue; }
        if (rk === 1) ones++;
        mrrSum += 1 / rk;
        worst = Math.max(worst, rk);
      }
      const mrr = (mrrSum / N).toFixed(3);
      console.log("  " + r.padEnd(14) + `${ones}/${N}`.padStart(10) + String(mrr).padStart(10) + String(worst).padStart(10) + "  " + misses);
    }
    console.log("\n  Pick the recipe with the best rank-1/MRR that does NOT regress the");
    console.log("  cross-lingual rows (they should read identically to V-only).\n");
  } catch (e) {
    console.error("\nProbe failed:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
