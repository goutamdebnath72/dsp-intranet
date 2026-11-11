// scripts/eds-variance.ts: runs the Executive Deep Synthesis for ONE question N times (cache cleared each time) and prints how much the
// replies differ: the number to look at is "distinct". Use it before and after a change to the engine.
//   EDS_STORE=rollback  also uses the REAL store (SQL and all) inside a transaction that is rolled back at the end: nothing is kept.
//   EDS_RUNS=5 npx tsx --env-file=.env.local scripts/eds-variance.ts "question"      (EDS_CACHE=keep: do not clear the cache between runs)
import { Client } from "pg";
import { DateTime } from "luxon";
import { createHash } from "node:crypto";
import { executeExecutiveSynthesis, clearExecutiveSynthesisCache } from "../src/lib/search/executiveSynthesis";
import { generateEmbedding } from "../src/lib/ai/geminiEmbedding";
import type { SearchResultRow } from "../src/lib/search/titleSearch";
import { typeormEdsStore } from "../src/lib/search/edsStore";

const DEFAULT_Q = "Synthesize the company accommodation retention rules for ex-employees at Type A city locations compared to Type B locations under Circular 46 of 2022. Detail the allowable retention periods, rental escalation multipliers, and the competent sanctioning authorities.";

async function main() {
  const q = process.argv[2] || DEFAULT_Q;
  const runs = Number(process.env.EDS_RUNS || 5);
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let sources: SearchResultRow[] = [];
  const labels = new Map<number, string>();
  try {
    const v = `[${(await generateEmbedding(q, "search_query")).join(",")}]`;
    const r = await c.query(`SELECT DISTINCT ON (c.id) c.id, c.headline, c."publishedAt", 1 - (cc.embedding <=> $1::vector) AS sim FROM public.circular_chunks cc JOIN public.circulars c ON c.id = cc.circular_id ORDER BY c.id, sim DESC`, [v]);
    const top = r.rows.sort((a, b) => Number(b.sim) - Number(a.sim)).slice(0, 8);
    const t = await c.query(`SELECT circular_id, text FROM public.circular_chunks WHERE circular_id = ANY($1::int[]) ORDER BY circular_id, chunk_index`, [top.map((x) => x.id)]);
    const full = new Map<number, string>();
    for (const x of t.rows) full.set(x.circular_id, (full.get(x.circular_id) ? full.get(x.circular_id) + "\n" : "") + x.text);
    sources = top.map((x) => ({ id: x.id, type: "circular", headline: x.headline, url: null, publishedAt: x.publishedAt ? DateTime.fromJSDate(x.publishedAt).toISODate() : null, similarity: Number(x.sim), matchPercentage: Math.round(Number(x.sim) * 100), chunkText: full.get(x.id) || "" }) as SearchResultRow);
    for (const x of top) labels.set(x.id, `Circular ${String(x.id).padStart(3, "0")}`);
    console.log("sources:", sources.map((s: any) => `${s.id}(${s.matchPercentage}%)`).join(" "));
  } finally { await c.end(); }

  let store: ReturnType<typeof typeormEdsStore> | null = null;
  let txClient: Client | null = null;
  if (process.env.EDS_STORE === "rollback") {
    txClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await txClient.connect();
    await txClient.query("BEGIN");
    const tx = txClient;
    store = typeormEdsStore({ query: async (sql: string, params?: unknown[]) => (await tx.query(sql, params as unknown[])).rows });
  }
  const sigs = new Map<string, number>();
  const shapes = new Map<string, number>();
  for (let i = 1; i <= runs; i++) {
    if (process.env.EDS_CACHE !== "keep") clearExecutiveSynthesisCache();
    const t0 = Date.now();
    const res = await executeExecutiveSynthesis(q, sources, labels, { store });
    const ms = Date.now() - t0;
    const shape = `charts=[${res.charts.map((x) => x.type + ":" + x.items.length).join(",")}] table=${res.table ? res.table.rows.length + "x" + res.table.columns.length : "none"} findings=${res.keyFindings.length} cites=${res.citations.length}${res.error ? " ERROR" : ""}`;
    const sig = createHash("sha1").update(JSON.stringify(res)).digest("hex").slice(0, 8);
    sigs.set(sig, (sigs.get(sig) || 0) + 1);
    shapes.set(shape, (shapes.get(shape) || 0) + 1);
    console.log(`run ${i}: ${ms} ms  ${sig}  ${shape}`);
    if (process.env.EDS_DUMP) console.log(JSON.stringify(res, null, 1));
  }
  if (txClient) {
    await txClient.query("ROLLBACK");
    await txClient.end();
    console.log("(store used inside a rolled-back transaction: nothing kept)");
  }
  console.log(`\nDISTINCT results: ${sigs.size} of ${runs}; distinct shapes: ${shapes.size}`);
  for (const [s, n] of shapes) console.log(`  ${n}x ${s}`);
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
