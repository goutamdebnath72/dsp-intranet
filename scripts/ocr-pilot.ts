// scripts/ocr-pilot.ts
//
// THE OCR PILOT: read the hardest pages with every reader and score each reading against what the page really says
// (eval/ocr-pilot-truth.json, transcribed by eye). It answers, with numbers instead of opinions: how much better is the new table reader than
// Tesseract as it was, how good is Gemini on the same pages, and how much do two readers agree.
//
// Run from the project root (Gemini is used if GEMINI_API_KEY is in .env.local):
//   npx tsx --tsconfig tsconfig.json scripts/ocr-pilot.ts --files "$HOME/Desktop/Desktop/2026 to 2022"
//   ... --only wage-notice,nodal-officers    just some pages
//   ... --lang-path /folder/with/traineddata offline: use language data from a folder (eng, hin, ben)
//   ... --pause 8000                         milliseconds to wait between Gemini calls (default 6000)
//   ... --skip tesseract,pipeline,gemini     leave out readers whose name starts with one of these (e.g. to measure only Gemini)
// It writes eval/results/ocr-pilot-<time>.md and .json. Nothing is stored in the database; no circular is changed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pdf } from "pdf-to-img";
import { createOcrWorkerPool, destroyOcrWorkerPool, ocrPageDual } from "../src/lib/ingestion/ocr";
import { mergeOcrPasses } from "../src/lib/ingestion/ocrMerge";
import { reconstructTableFromTSV } from "../src/lib/ingestion/tableReconstruction";
import { geminiReader, type PageReader } from "../src/lib/ingestion/pageReader";
import { agreement, scoreText, type Score, type Truth } from "../src/lib/ingestion/ocrScore";

function arg(name: string, def = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : (process.argv[i + 1] ?? def);
}

function loadEnvLocal() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

interface Entry extends Truth {
  pdf: string;
  page: number;
  kind: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number, b: number) => (b ? `${a}/${b}` : "-");

async function main() {
  loadEnvLocal();
  const filesRoot = arg("files");
  if (!filesRoot || !existsSync(filesRoot)) {
    console.error('Give the folder that holds the year folders: --files "/path/to/2026 to 2022"');
    process.exit(1);
  }
  const truthFile = arg("truth", "eval/ocr-pilot-truth.json");
  const only = arg("only").split(",").map((s) => s.trim()).filter(Boolean);
  const pages: Entry[] = JSON.parse(readFileSync(truthFile, "utf8")).pages.filter((p: Entry) => !only.length || only.includes(p.id));
  const pause = Number(arg("pause", "6000"));
  const skip = arg("skip").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const skipped = (reader: string) => skip.some((x) => reader.toLowerCase().startsWith(x));
  const langPath = arg("lang-path") || process.env.OCR_LANG_PATH || "";

  const second: PageReader[] = [];
  if (process.env.GEMINI_API_KEY) second.push(geminiReader());
  else console.log("(no GEMINI_API_KEY in .env.local: Gemini is left out)");

  console.log(`OCR pilot: ${pages.length} page(s); readers: tesseract-before, pipeline-now${second.map((r) => ", " + r.name).join("")}`);
  const pool = await createOcrWorkerPool(langPath ? { langPath, gzip: false } : undefined);
  const docs = new Map<string, any>();
  const results: { id: string; kind: string; reader: string; score: Score | null; seconds: number; error?: string; text: string }[] = [];

  for (const p of pages) {
    const file = join(filesRoot, p.pdf);
    if (!existsSync(file)) { console.log(`  ${p.id}: file not found (${file}), skipped`); continue; }
    if (!docs.has(file)) docs.set(file, await pdf(readFileSync(file), { scale: 300 / 72, format: "png" }));
    const png: Buffer = await docs.get(file).getPage(p.page);
    const run = async (reader: string, fn: () => Promise<string>) => {
      if (skipped(reader)) return;
      const t0 = Date.now();
      try {
        const text = await fn();
        const score = scoreText(text, p);
        results.push({ id: p.id, kind: p.kind, reader, score, seconds: (Date.now() - t0) / 1000, text });
        console.log(`  ${p.id.padEnd(22)} ${reader.padEnd(26)} numbers ${pct(score.numbersFound, score.numbersTotal).padEnd(7)} phrases ${pct(score.phrasesFound, score.phrasesTotal).padEnd(6)} pairs ${pct(score.togetherFound, score.togetherTotal).padEnd(5)} wrong ${score.forbiddenFound.length} garbage ${score.garbage}`);
      } catch (e) {
        results.push({ id: p.id, kind: p.kind, reader, score: null, seconds: (Date.now() - t0) / 1000, error: String((e as Error)?.message ?? e).slice(0, 200), text: "" });
        console.log(`  ${p.id.padEnd(22)} ${reader.padEnd(26)} FAILED: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      }
    };
    // 1. Tesseract as it was before the table reader: the whole page read, the old table rebuilding
    await run("tesseract-before", async () => {
      const e = await pool.eng.recognize(png, {}, { text: true, tsv: true });
      const t = await pool["hin+eng+ben"].recognize(png, {}, { text: true });
      return mergeOcrPasses(e.data.text || "", e.data.tsv ? reconstructTableFromTSV(e.data.tsv) || "" : "", t.data.text || "").text;
    });
    // 2. The pipeline as it is now: ruled tables read cell by cell, the rest as before
    await run("pipeline-now", async () => (await ocrPageDual(png, p.id, pool)).text);
    // 3. The second readers
    for (const r of second) {
      if (skipped(r.name)) continue;
      await run(r.name, () => r.read(png));
      await sleep(pause);
    }
  }
  await destroyOcrWorkerPool(pool);

  // ---------------------------------------------------------------- the report
  const readers = Array.from(new Set(results.map((r) => r.reader)));
  const L: string[] = [];
  L.push(`# OCR pilot ${new Date().toISOString()}`, "", `Pages: ${pages.map((p) => p.id).join(", ")}`, "");
  L.push("## Summary (all pages together)", "", "| reader | numbers read exactly | phrases | label with its value on one line | wrong readings | grid-line garbage | pages failed | mean seconds |", "|---|---|---|---|---|---|---|---|");
  for (const r of readers) {
    const rs = results.filter((x) => x.reader === r);
    const ok = rs.filter((x) => x.score);
    const sum = (f: (s: Score) => number) => ok.reduce((n, x) => n + f(x.score as Score), 0);
    L.push(`| ${r} | ${sum((s) => s.numbersFound)}/${sum((s) => s.numbersTotal)} | ${sum((s) => s.phrasesFound)}/${sum((s) => s.phrasesTotal)} | ${sum((s) => s.togetherFound)}/${sum((s) => s.togetherTotal)} | ${sum((s) => s.forbiddenFound.length)} | ${sum((s) => s.garbage)} | ${rs.length - ok.length} | ${(rs.reduce((n, x) => n + x.seconds, 0) / Math.max(1, rs.length)).toFixed(1)} |`);
  }
  L.push("", "## Page by page", "", "| page | kind | reader | numbers | phrases | pairs | wrong | garbage | seconds |", "|---|---|---|---|---|---|---|---|---|");
  for (const x of results) {
    const s = x.score;
    L.push(s ? `| ${x.id} | ${x.kind} | ${x.reader} | ${pct(s.numbersFound, s.numbersTotal)} | ${pct(s.phrasesFound, s.phrasesTotal)} | ${pct(s.togetherFound, s.togetherTotal)} | ${s.forbiddenFound.length} | ${s.garbage} | ${x.seconds.toFixed(1)} |` : `| ${x.id} | ${x.kind} | ${x.reader} | FAILED: ${x.error} | | | | | |`);
  }
  L.push("", "## What each reader missed", "");
  for (const x of results) {
    const s = x.score;
    if (!s || (!s.missingNumbers.length && !s.missingPhrases.length && !s.missingTogether.length && !s.forbiddenFound.length)) continue;
    L.push(`- **${x.id} / ${x.reader}**: ${[
      s.missingNumbers.length ? `numbers missing: ${s.missingNumbers.slice(0, 12).join(", ")}${s.missingNumbers.length > 12 ? " ..." : ""}` : "",
      s.missingPhrases.length ? `phrases missing: ${s.missingPhrases.slice(0, 4).join(" | ")}${s.missingPhrases.length > 4 ? " ..." : ""}` : "",
      s.missingTogether.length ? `not on one line: ${s.missingTogether.slice(0, 6).join("; ")}` : "",
      s.forbiddenFound.length ? `WRONG readings found: ${s.forbiddenFound.join(", ")}` : "",
    ].filter(Boolean).join(" ; ")}`);
  }
  const sec = readers.filter((r) => r !== "tesseract-before" && r !== "pipeline-now");
  if (sec.length) {
    L.push("", "## Do two readers agree? (the pipeline against each second reader, on the key numbers)", "", "| page | second reader | numbers both read | only the pipeline | only the second reader | neither |", "|---|---|---|---|---|---|");
    for (const p of pages) {
      const a = results.find((x) => x.id === p.id && x.reader === "pipeline-now");
      for (const r of sec) {
        const b = results.find((x) => x.id === p.id && x.reader === r);
        if (!a?.score || !b?.score) continue;
        const g = agreement(a.text, b.text, p.numbers);
        L.push(`| ${p.id} | ${r} | ${g.both} | ${g.onlyA} | ${g.onlyB} | ${g.neither} |`);
      }
    }
  }
  mkdirSync("eval/results", { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  writeFileSync(`eval/results/ocr-pilot-${stamp}.md`, L.join("\n") + "\n");
  writeFileSync(`eval/results/ocr-pilot-${stamp}.json`, JSON.stringify(results.map((x) => ({ ...x, text: x.text.slice(0, 7000) })), null, 1));
  console.log(`\nWrote eval/results/ocr-pilot-${stamp}.md and .json: please send me both.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
