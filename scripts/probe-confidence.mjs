// scripts/probe-confidence.mjs
//
// DIAGNOSTIC ONLY — reads the live DB, writes nothing. Calibrates an HONEST
// confidence + relevance floor for the hybrid engine by exposing the real
// signals behind every candidate, for JUNK vs LEGIT queries side by side:
//
//   cos     real best-chunk cosine (topicality)
//   tsR     lexical ts_rank (field-weighted, log-norm)  — 0 = not in lexical arm
//   vRank   rank in the vector arm  (– = absent)
//   lRank   rank in the lexical arm (– = absent)
//   both?   present in BOTH arms (cross-arm agreement = the real signal)
//   rrf     fused score (same formula as the engine: L weighted x2, k=60)
//
// The hypothesis to confirm: a GENUINE top hit shows cross-arm agreement (in
// both arms, decent ranks) and/or a clear cosine peak; JUNK rides a single
// common lexical token (lexical-only, vector-absent or low) or a flat vector
// nearest-neighbour with no lexical support. If so, confidence should be driven
// by cosine + cross-arm agreement — NOT by rank position — and a floor should
// drop the lexical-only-common-word / vector-only-near-floor cases.
//
// RUN:  node scripts/probe-confidence.mjs
// PREREQUISITE: node_modules; .env.local carries GEMINI_API_KEY + DATABASE_URL.

import { readFileSync, existsSync } from "fs";
import pg from "pg";

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvFile(".env.local"); loadEnvFile(".env");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY, DATABASE_URL = process.env.DATABASE_URL;
if (!GEMINI_API_KEY || !DATABASE_URL) { console.error("Missing GEMINI_API_KEY or DATABASE_URL."); process.exit(1); }

const K = 60, LEX_WEIGHT = 2, POOL = 30;

const CASES = [
  ["LEGIT", "leave policy"],
  ["LEGIT", "c&it attendance"],
  ["LEGIT", "procedure to apply for a refundable PF loan"],
  ["LEGIT", "how do I submit the format B declaration for SIR"],
  ["LEGIT", "table tennis team selection"],
  ["JUNK",  "honda spark plugs price list"],
  ["JUNK",  "asdfghjkl qwerty"],
  ["JUNK",  "the of and in a"],
  ["JUNK",  "best pizza near me"],
  ["MISS",  "hindi teaching scheme"],
];

function normalizeVector(vec) { const n = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1; return vec.map((v) => v / n); }
async function embed(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 }) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const d = await res.json(); const v = d?.embedding?.values;
  if (!v) throw new Error("no embedding"); return v;
}
function toOrTsquery(q) {
  const t = (q || "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
  const u = [...new Set(t)]; return u.length ? u.join(" | ") : null;
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

async function armVector(vs) {
  const { rows } = await pool.query(
    `WITH r AS (SELECT c.id, c.headline, (1-(cc.embedding <=> $1::vector(768))) cos,
        ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY cc.embedding <=> $1::vector(768) ASC) rn
      FROM circular_chunks cc JOIN circulars c ON c.id=cc.circular_id WHERE cc.embedding IS NOT NULL)
     SELECT id, headline, cos FROM r WHERE rn=1 ORDER BY cos DESC LIMIT $2;`, [vs, POOL]);
  return rows.map((r) => ({ id: r.id, headline: r.headline, cos: Number(r.cos) }));
}
async function armLexical(tsq) {
  if (!tsq) return [];
  const { rows } = await pool.query(
    `WITH doc AS (SELECT c.id,
        setweight(to_tsvector('english',c.headline),'A') ||
        setweight(to_tsvector('english',coalesce(string_agg(cc.text,' '),'')),'B') tsv
      FROM circulars c LEFT JOIN circular_chunks cc ON cc.circular_id=c.id GROUP BY c.id)
     SELECT id, ts_rank('{0.1,0.2,0.4,1.0}'::float4[], tsv, to_tsquery('english',$1),1) score
     FROM doc WHERE tsv @@ to_tsquery('english',$1) ORDER BY score DESC LIMIT $2;`, [tsq, POOL]);
  return rows.map((r) => ({ id: r.id, score: Number(r.score) }));
}

(async () => {
  try {
    for (const [tag, q] of CASES) {
      const tsq = toOrTsquery(q);
      const vec = normalizeVector(await embed(q));
      const [V, L] = await Promise.all([armVector(`[${vec.join(",")}]`), armLexical(tsq)]);
      const vRank = new Map(V.map((r, i) => [r.id, i + 1]));
      const lRank = new Map(L.map((r, i) => [r.id, i + 1]));
      const lScore = new Map(L.map((r) => [r.id, r.score]));
      const head = new Map(V.map((r) => [r.id, r.headline]));
      const cos = new Map(V.map((r) => [r.id, r.cos]));
      const ids = new Set([...vRank.keys(), ...lRank.keys()]);
      const fused = [...ids].map((id) => {
        const rv = vRank.get(id), rl = lRank.get(id);
        return { id, rrf: (rv ? 1 / (K + rv) : 0) + (rl ? LEX_WEIGHT / (K + rl) : 0) };
      }).sort((a, b) => b.rrf - a.rrf).slice(0, 6);

      console.log(`\n[${tag}] ${JSON.stringify(q)}   tsq=${tsq ? JSON.stringify(tsq) : "(none)"}`);
      console.log(`     ${"cos".padStart(6)} ${"tsR".padStart(7)} ${"vRk".padStart(4)} ${"lRk".padStart(4)} both  headline`);
      for (const f of fused) {
        const c = cos.has(f.id) ? cos.get(f.id).toFixed(3) : "  –  ";
        const tr = lScore.has(f.id) ? lScore.get(f.id).toFixed(4) : "  –   ";
        const vr = vRank.get(f.id) ?? "–", lr = lRank.get(f.id) ?? "–";
        const both = vRank.has(f.id) && lRank.has(f.id) ? "YES " : "no  ";
        const h = (head.get(f.id) || `#${f.id}`).slice(0, 52);
        console.log(`     ${String(c).padStart(6)} ${String(tr).padStart(7)} ${String(vr).padStart(4)} ${String(lr).padStart(4)}  ${both} ${h}`);
      }
      if (fused.length === 0) console.log("     (no candidates)");
    }
    console.log("");
  } catch (e) { console.error("\nProbe failed:", e?.message || e); process.exitCode = 1; }
  finally { await pool.end(); }
})();
