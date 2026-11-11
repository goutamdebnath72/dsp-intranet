// scripts/eds-gold.ts: the GOLD test of the EDS engine. Runs each question of scripts/eds-gold-keys.ts through the real engine (no store, one at a time) and scores
// the answer against its KEY: facts found / facts required, statements that must not appear, and every figure in the answer that appears in NONE of the circulars read
// (a possible invention or a derived figure; listed for a human to judge, not counted as an error).
//   npx tsx --env-file=.env.local scripts/eds-gold.ts [G01 G05 ...]     env: GOLD_REPS=1 (repeats per question), GOLD_OUT=path (full JSON)
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { DateTime } from "luxon";
import { executeExecutiveSynthesis } from "../src/lib/search/executiveSynthesis";
import { generateEmbedding } from "../src/lib/ai/geminiEmbedding";
import type { SearchResultRow } from "../src/lib/search/titleSearch";
import { GOLD } from "./eds-gold-keys";

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

const norm = (s: string) =>
  s.toLowerCase().replace(/(\d),(?=\d)/g, "$1").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/₹|rs\.?(?=\s*\d)/g, "rs ").replace(/\s+/g, " ");

/** Every string of the answer, tables as "label | cell | cell" lines. */
function flatten(res: any): string {
  const out: string[] = [];
  const walk = (v: any) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const k of ["headline", "overview", "keyFindings", "chart", "extraChart"]) walk(res?.[k]);
  for (const t of [res?.table, res?.extraTable]) {
    if (!t) continue;
    if (t.title) out.push(t.title);
    out.push((t.columns || []).join(" | "));
    for (const r of t.rows || []) out.push((r as string[]).join(" | "));
  }
  walk(res?.abbreviations);
  return out.join("\n");
}

const figures = (s: string) => new Set((norm(s).match(/\d[\d.]*\d|\d/g) || []).map((x) => x.replace(/\./g, "")).filter((x) => x.length >= 2));

function scoreOne(g: any, res: any, srcFig: Set<string>) {
  const text = norm(flatten(res));
  const found = g.must.filter((m: any) => m.any.some((re: RegExp) => re.test(text)));
  const missing = g.must.filter((m: any) => !m.any.some((re: RegExp) => re.test(text))).map((m: any) => m.fact);
  const bad = g.mustNot.filter((m: any) => m.re.test(text)).map((m: any) => m.why);
  const unsupported = [...figures(flatten(res))].filter((x) => !srcFig.has(x) && !/^(19|20)\d\d$/.test(x) && !/^0\d\d$/.test(x));
  return { found, missing, bad, unsupported };
}

async function main() {
  // GOLD_RESCORE=a.json,b.json : score saved answers again with the current keys (no model call, no cost)
  if (process.env.GOLD_RESCORE) {
    const { readFileSync } = await import("node:fs");
    const c0 = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c0.connect();
    for (const file of process.env.GOLD_RESCORE.split(",")) {
      let tf = 0, tr = 0, tb = 0; const rows: string[] = [];
      for (const x of JSON.parse(readFileSync(file, "utf8"))) {
        const g = GOLD.find((q) => q.id === x.id)!;
        const t = await c0.query(`SELECT string_agg(text, ' ') AS t FROM public.circular_chunks WHERE circular_id = ANY($1::int[])`, [x.sources]);
        const r = scoreOne(g, x.res, figures(t.rows[0]?.t || ""));
        tf += r.found.length; tr += g.must.length; tb += r.bad.length;
        rows.push(`${x.id} ${r.found.length}/${g.must.length}${r.bad.length ? " FORBIDDEN:" + r.bad.join("; ") : ""}${r.unsupported.length ? " unsupported:" + r.unsupported.join(",") : ""}`);
      }
      console.log(`${file.split("/").pop()}: facts ${tf}/${tr} (${((100 * tf) / tr).toFixed(1)}%) | forbidden ${tb}`);
      console.log("  " + rows.join("\n  "));
    }
    await c0.end();
    return;
  }
  const want = process.argv.slice(2);
  const list = GOLD.filter((g) => !want.length || want.includes(g.id));
  const reps = Number(process.env.GOLD_REPS || 1);
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const prepared: any[] = [];
  for (const g of list) {
    const r = await retrieve(c, g.q);
    const ids = r.sources.map((s: any) => s.id);
    const t = await c.query(`SELECT string_agg(text, ' ') AS t FROM public.circular_chunks WHERE circular_id = ANY($1::int[])`, [ids]);
    prepared.push({ g, ...r, sourceText: t.rows[0]?.t || "", ids });
  }
  await c.end();
  const all: any[] = [];
  let sumFound = 0, sumReq = 0, sumNot = 0;
  for (const p of prepared) {
    const srcFig = figures(p.sourceText);
    for (let rep = 1; rep <= reps; rep++) {
      const t0 = Date.now();
      const res: any = await executeExecutiveSynthesis(p.g.q, p.sources, p.labels, {});
      const ms = Date.now() - t0;
      const text = norm(flatten(res));
      const found = p.g.must.filter((m: any) => m.any.some((re: RegExp) => re.test(text)));
      const missing = p.g.must.filter((m: any) => !m.any.some((re: RegExp) => re.test(text))).map((m: any) => m.fact);
      const bad = p.g.mustNot.filter((m: any) => m.re.test(text)).map((m: any) => m.why);
      const ans = figures(flatten(res));
      const unsupported = [...ans].filter((x) => !srcFig.has(x) && !/^(19|20)\d\d$/.test(x));
      sumFound += found.length; sumReq += p.g.must.length; sumNot += bad.length;
      const row = { id: p.g.id, rep, ms, error: res.error || null, sources: p.ids, found: found.length, required: p.g.must.length, missing, mustNotHit: bad, unsupportedFigures: unsupported, table: res.table ? `${res.table.rows.length}x${res.table.columns.length}` : null, score: res.qualityScore ?? null, res };
      all.push(row);
      console.log(`${p.g.id}#${rep} ${Math.round(ms / 1000)}s ${res.error ? "ERROR " + res.error : ""} facts ${found.length}/${p.g.must.length} | forbidden hit ${bad.length} | unsupported figures ${unsupported.length}${unsupported.length ? " [" + unsupported.slice(0, 12).join(",") + "]" : ""}`);
      if (missing.length) console.log("   missing: " + missing.join("; "));
      if (bad.length) console.log("   FORBIDDEN: " + bad.join("; "));
      if (process.env.GOLD_OUT) writeFileSync(process.env.GOLD_OUT, JSON.stringify(all, null, 1));
    }
  }
  console.log(`\nTOTAL facts found ${sumFound}/${sumReq} (${((100 * sumFound) / Math.max(1, sumReq)).toFixed(1)}%) | forbidden statements ${sumNot} | runs ${all.length}`);
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
