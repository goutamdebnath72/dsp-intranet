// scripts/eds-panel.ts: runs the PANEL of new questions through the real engine (no store: every question is generated fresh) and writes a
// compact report, so a change to the engine can be judged on MANY kinds of question at once, not on the last one that looked wrong.
//   npx tsx --env-file=.env.local scripts/eds-panel.ts [P01 P05 ...]        (no ids: all)   EDS_OUT=path writes the full JSON
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { DateTime } from "luxon";
import { executeExecutiveSynthesis } from "../src/lib/search/executiveSynthesis";
import { generateEmbedding } from "../src/lib/ai/geminiEmbedding";
import type { SearchResultRow } from "../src/lib/search/titleSearch";
import { PANEL } from "./eds-panel-queries";

async function retrieve(c: Client, q: string) {
  const v = `[${(await generateEmbedding(q, "search_query")).join(",")}]`;
  const r = await c.query(`SELECT DISTINCT ON (c.id) c.id, c.headline, c."publishedAt", 1 - (cc.embedding <=> $1::vector) AS sim FROM public.circular_chunks cc JOIN public.circulars c ON c.id = cc.circular_id ORDER BY c.id, sim DESC`, [v]);
  const top = r.rows.sort((a, b) => Number(b.sim) - Number(a.sim)).slice(0, 10);
  const t = await c.query(`SELECT circular_id, text FROM public.circular_chunks WHERE circular_id = ANY($1::int[]) ORDER BY circular_id, chunk_index`, [top.map((x) => x.id)]);
  const full = new Map<number, string>();
  for (const x of t.rows) full.set(x.circular_id, (full.get(x.circular_id) ? full.get(x.circular_id) + "\n" : "") + x.text);
  const sources = top.map((x) => ({ id: x.id, type: "circular", headline: x.headline, url: null, publishedAt: x.publishedAt ? DateTime.fromJSDate(x.publishedAt).toISODate() : null, similarity: Number(x.sim), matchPercentage: Math.round(Number(x.sim) * 100), chunkText: full.get(x.id) || "" }) as SearchResultRow);
  const labels = new Map<number, string>();
  for (const x of top) labels.set(x.id, `Circular ${String(x.id).padStart(3, "0")}`);
  return { sources, labels };
}

async function main() {
  const want = process.argv.slice(2);
  const list = PANEL.filter((p) => !want.length || want.includes(p.id));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const prepared = [];
  for (const p of list) prepared.push({ p, ...(await retrieve(c, p.q)) });
  await c.end();
  const out: any[] = [];
  const queue = [...prepared];
  const worker = async () => {
    for (let x = queue.shift(); x; x = queue.shift()) {
      const t0 = Date.now();
      const res = await executeExecutiveSynthesis(x.p.q, x.sources, x.labels, {});
      out.push({ id: x.p.id, shape: x.p.shape, q: x.p.q, ms: Date.now() - t0, sources: x.sources.map((s: any) => `${s.id}(${s.matchPercentage}%)`).join(" "), res });
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.EDS_PAR || 1) }, () => worker()));
  out.sort((a, b) => a.id.localeCompare(b.id));
  if (process.env.EDS_OUT) writeFileSync(process.env.EDS_OUT, JSON.stringify(out, null, 1));
  for (const o of out) {
    const r = o.res;
    console.log(`${o.id} [${o.shape}] ${Math.round(o.ms / 1000)}s ${r.error ? "ERROR " + r.error : `findings=${r.keyFindings.length} table=${r.table ? r.table.rows.length + "x" + r.table.columns.length : "-"}${r.extraTable ? "+" + r.extraTable.rows.length + "x" + r.extraTable.columns.length : ""} charts=[${r.charts.map((c: any) => c.type).join(",")}] cites=${r.citations.length}`}`);
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
