// scripts/test-eds-query.ts
import { Client } from "pg";
import { DateTime } from "luxon";
import { executeExecutiveSynthesis } from "../src/lib/search/executiveSynthesis";
import { generateEmbedding } from "../src/lib/ai/geminiEmbedding";
import { SearchResultRow } from "../src/lib/search/titleSearch";

async function main() {
  const q = process.argv[2] || "Synthesize the financial and welfare adjustments made for contract workers between 2022 and 2025. Detail the revised GPAIS premium structures, the January 2024 minimum wage calculations for the Works area, and their specific eligibility under DSP's Motivational Award Schemes, specifically the Kaushal Award.";
  console.log(`\n=== Testing Executive Deep Synthesis on Query ===\n"${q}"\n`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // 1. Generate query embedding
    console.log("Generating query embedding...");
    const queryVector = await generateEmbedding(q, "search_query");
    const vecStr = `[${queryVector.join(",")}]`;

    // 2. Vector search over circular_chunks
    console.log("Fetching top candidate circulars via vector similarity...");
    const searchRes = await client.query(`
      SELECT DISTINCT ON (c.id)
        c.id,
        c.headline,
        c."publishedAt",
        cc.text AS "chunkText",
        1 - (cc.embedding <=> $1::vector) AS similarity
      FROM public.circular_chunks cc
      JOIN public.circulars c ON c.id = cc.circular_id
      ORDER BY c.id, similarity DESC
    `, [vecStr]);

    const sorted = searchRes.rows
      .sort((a, b) => Number(b.similarity) - Number(a.similarity))
      .slice(0, 8);

    console.log("\nTop Retrieved Sources:");
    sorted.forEach((r, idx) => {
      console.log(`  ${idx + 1}. [Circular ID ${r.id}] (${(Number(r.similarity) * 100).toFixed(1)}% match) - "${r.headline}"`);
    });

    // 3. Fetch full circular text for candidate sources
    const ids = sorted.map((r) => r.id);
    const fullTextRes = await client.query(`
      SELECT circular_id, text
      FROM public.circular_chunks
      WHERE circular_id = ANY($1::int[])
      ORDER BY circular_id ASC, chunk_index ASC
    `, [ids]);

    const fullTextMap = new Map<number, string>();
    for (const r of fullTextRes.rows) {
      const prev = fullTextMap.get(r.circular_id) || "";
      if (prev.length < 60000) {
        fullTextMap.set(r.circular_id, prev ? `${prev}\n${r.text}` : r.text);
      }
    }

    const synthesisSources: SearchResultRow[] = sorted.map((r) => ({
      id: r.id,
      type: "circular",
      headline: r.headline,
      url: null,
      publishedAt: r.publishedAt ? DateTime.fromJSDate(r.publishedAt).toISODate() : null,
      similarity: Number(r.similarity),
      matchPercentage: Math.round(Number(r.similarity) * 100),
      chunkText: fullTextMap.get(r.id) || r.chunkText,
    }));

    const labels = new Map<number, string>();
    for (const s of sorted) {
      labels.set(s.id, `Circular ${String(s.id).padStart(3, "0")}`);
    }

    // 4. Run Executive Deep Synthesis
    console.log("\nExecuting executive synthesis (Groq / LLM)...");
    const result = await executeExecutiveSynthesis(q, synthesisSources, labels);

    console.log("\n================ EXECUTIVE BRIEFING ================\n");
    console.log(`Headline: ${result.headline || "(none)"}`);
    console.log(`\nOverview:\n${result.overview}`);
    console.log(`\nKey Findings:`);
    result.keyFindings.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.text} (Sources: [${f.sources.join(", ")}])`);
    });

    if (result.table) {
      console.log(`\nComparative Table:`);
      console.log(`Columns: ${result.table.columns.join(" | ")}`);
      result.table.rows.forEach((row) => {
        console.log(`  ${row.join(" | ")}`);
      });
    }

    if (result.charts && result.charts.length > 0) {
      console.log(`\nCharts & Data Directives:`);
      result.charts.forEach((c) => {
        console.log(`  [${c.type.toUpperCase()}] ${c.title} (${c.unit || ""})`);
        c.items.forEach((it) => {
          console.log(`    - ${it.label}: ${it.value}${it.secondaryValue !== undefined ? ` / ${it.secondaryValue}` : ""} (${it.detail || ""})`);
        });
      });
    }

    console.log("\n====================================================\n");

  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
