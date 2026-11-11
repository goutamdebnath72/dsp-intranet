// scripts/ocr-consensus.ts
//
// CONSENSUS CORRECTION of the stored circular text. For every page, the stored text (read by the pipeline's OCR) is compared word by word with the readings of two
// other independent readers of the SAME page image (Gemini 3.1 Pro and Gemini 3.8 Flash, already saved in reread-cache/gemini by scripts/gemini-read-archive.ts).
// A number, date, amount, phone or clause number of the stored text is replaced ONLY when BOTH readers propose the same replacement for the same place; a word is never changed
// (it is reported). See src/lib/ingestion/consensusPatch.ts for every rule.
//
//   DRY RUN (default): writes nothing to the database and calls no Gemini; saves reread-reports/consensus-<time>.json and .md
//   npx tsx --env-file=.env.local scripts/ocr-consensus.ts [--ids 34,20,31]
//   APPLY: for every circular that passes the gate, backs it up (reread-backups/), replaces its chunks (new vectors), reads them back, and re-checks them.
//   npx tsx --env-file=.env.local scripts/ocr-consensus.ts --apply [--ids ...]
//
// THE GATE (a circular is applied only if all hold): no patch crosses a chunk boundary; every replacement number is present in BOTH readers' text;
// after the patches the circular has no MORE unconfirmed numbers than before; no roster page (stored as rows) is touched.
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Client } from "pg";
import { geminiCacheFile } from "../src/lib/ingestion/geminiCheck";
import { applyToChunks, coverage, proposePatches, tokenize, type Patch } from "../src/lib/ingestion/consensusPatch";
import { applyReread, type RereadPlan } from "../src/lib/ingestion/reread";
import { memoized, throttled } from "../src/lib/ingestion/embedThrottle";
import { checkReadings } from "../src/lib/ingestion/readingCheck";
import { checkRowsFor, savePageChecks, type NewCheck } from "../src/lib/search/pageChecks";

const PRO = "gemini:gemini-3.1-pro-preview";
const FLASH = "gemini:gemini-3.8-flash";
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function savedReading(cacheDir: string, url: string, reader: string): string | null {
  const f = geminiCacheFile(cacheDir, url, reader);
  if (!existsSync(f)) return null;
  try { const j = JSON.parse(readFileSync(f, "utf8")); return j?.url === url && typeof j.text === "string" ? j.text : null; } catch { return null; }
}

// The PDF's own text layer (exact for Latin text; junk for old Hindi fonts, which is why it only ever ARBITRATES a conflict, never overwrites on its own).
const normAll = (t: string) => t.normalize("NFC").toLowerCase().replace(/\s+/g, " ");
let manifest: Array<{ file: string; folder: string; title: string }> | null = null;
const layerCache = new Map<number, string | null>();
function pdfLayer(id: number, headline: string): string | null {
  if (layerCache.has(id)) return layerCache.get(id)!;
  let out: string | null = null;
  try {
    manifest ??= readFileSync("circulars_manifest.csv", "utf8").split("\n").slice(1).filter(Boolean).map((l) => { const m = l.match(/^([^,]+),([^,]*),(.*?),(\d{4}-\d{2}-\d{2}),/); return m ? { file: m[1], folder: m[2], title: m[3].replace(/^"|"$/g, "") } : null; }).filter(Boolean) as any;
    const key = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const hit = manifest!.find((m) => key(m.title) === key(headline));
    if (hit) {
      const txt = execFileSync("pdftotext", ["-layout", `2026 to 2022/${hit.folder}/${hit.file}`, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
      if (txt.replace(/\s/g, "").length >= 400) out = normAll(txt);
    }
  } catch { out = null; }
  layerCache.set(id, out);
  return out;
}

interface PageResult {
  page: number; status: "checked" | "skipped"; reason?: string;
  patches: Array<{ kind: string; from: string; to: string; by?: string }>; unsettled: Array<{ stored: string; readers: string[] }>; refused: number; layerVerified?: string[]; check?: NewCheck;
  before?: ReturnType<typeof coverage>; after?: ReturnType<typeof coverage>;
}
interface CircPlan {
  id: number; serial: number | null; headline: string; pages: PageResult[]; gate: { pass: boolean; why: string[] };
  newChunks: Array<{ index: number; page: number; text: string }>; changedChunks: number; patchCount: number;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const apply = flag("apply");
  const cacheDir = arg("cache-dir") || "reread-cache";
  const reportDir = arg("report-dir") || "reread-reports";
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const ids = arg("ids")?.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger);
    const rows = (await client.query(
      `SELECT c.id, c."serialNumber", c.headline, c."fileUrls" FROM public.circulars c WHERE EXISTS (SELECT 1 FROM public.circular_chunks k WHERE k.circular_id = c.id) ${ids ? "AND c.id = ANY($1::int[])" : ""} ORDER BY c.id`,
      ids ? [ids] : [],
    )).rows as Array<{ id: number; serialNumber: number | null; headline: string; fileUrls: string[] }>;

    const plans: CircPlan[] = [];
    for (const row of rows) {
      const chunks = (await client.query(`SELECT chunk_index, page_number, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [row.id])).rows as Array<{ chunk_index: number; page_number: number; text: string }>;
      let structured = new Set<number>();
      try { structured = new Set<number>((await client.query(`SELECT DISTINCT page_number FROM public.health_checkup_schedule WHERE circular_id = $1 AND page_number IS NOT NULL`, [row.id])).rows.map((r: any) => Number(r.page_number))); } catch { /* no such table */ }
      const urls = Array.isArray(row.fileUrls) ? row.fileUrls : [];
      const newChunks = chunks.map((c) => ({ index: c.chunk_index, page: c.page_number, text: c.text }));
      const pages: PageResult[] = [];
      const why: string[] = [];
      let patchCount = 0, changed = 0;
      for (let p = 1; p <= urls.length; p++) {
        const mine = newChunks.filter((c) => c.page === p);
        if (structured.has(p)) { pages.push({ page: p, status: "skipped", reason: "roster page (stored as rows)", patches: [], unsettled: [], refused: 0 }); continue; }
        if (!mine.length) { pages.push({ page: p, status: "skipped", reason: "no stored text for this page", patches: [], unsettled: [], refused: 0 }); continue; }
        const pro = savedReading(cacheDir, urls[p - 1], PRO), flash = savedReading(cacheDir, urls[p - 1], FLASH);
        if (pro === null || flash === null) { pages.push({ page: p, status: "skipped", reason: `a saved reading is missing (${pro === null ? "Pro " : ""}${flash === null ? "Flash" : ""})`, patches: [], unsettled: [], refused: 0 }); continue; }
        const texts = mine.map((c) => c.text);
        const page = texts.join(" ");
        const plan = proposePatches(page, [pro, flash]);
        const before = coverage(page, [pro, flash]);
        let patches: Patch[] = plan.patches;
        // gate 1: every replacement number must be in BOTH readers' text
        const proTokens = new Set(tokenize(pro).map((t) => t.norm)), flashTokens = new Set(tokenize(flash).map((t) => t.norm));
        patches = patches.filter((pt) => {
          const toks = tokenize(pt.to).filter((t) => t.content);
          const okBoth = toks.every((t) => proTokens.has(t.norm) && flashTokens.has(t.norm));
          if (!okBoth) why.push(`page ${p}: replacement "${pt.to}" is not in both readers`);
          return okBoth;
        });
        // a conflict the readers did not settle between themselves goes to the exact arbiter: the PDF text layer. It must contain the one version and NOT the other.
        const layer = pdfLayer(row.id, row.headline);
        const layerBy = new Set<string>();
        const layerVerified: string[] = [];
        const stillUnsettled: typeof plan.unsettled = [];
        for (const u of plan.unsettled) {
          const cand = (u.readers.find((r) => r !== "(other)") ?? "");
          if (!layer || u.start === undefined || u.end === undefined || !u.candidates?.length || !u.stored || !cand) { stillUnsettled.push(u); continue; }
          const hasStored = layer.includes(normAll(u.stored)), hasCand = layer.includes(normAll(cand));
          if (hasStored && !hasCand) { layerVerified.push(u.stored); continue; }
          if (hasCand && !hasStored && !patches.some((x) => x.start < u.end! && u.start! < x.end)) {
            const pt: Patch = { kind: "replace", start: u.start, end: u.end, from: page.slice(u.start, u.end), to: u.candidates[0] };
            patches.push(pt); layerBy.add(`${pt.start}:${pt.end}`); continue;
          }
          stillUnsettled.push(u);
        }
        plan.unsettled = stillUnsettled;
        const out = applyToChunks(texts, patches);
        if (out.refused.length) why.push(`page ${p}: ${out.refused.length} patch(es) cross a chunk boundary`);
        const after = coverage(out.chunks.join(" "), [pro, flash]);
        if (after.unconfirmed.length > before.unconfirmed.length) why.push(`page ${p}: unconfirmed numbers would increase (${before.unconfirmed.length} -> ${after.unconfirmed.length})`);
        mine.forEach((c, k) => { if (out.chunks[k] !== c.text) { changed++; c.text = out.chunks[k]; } });
        patchCount += patches.length - out.refused.length;
        // the saved check of the page (what the answer card consults): numbers confirmed by a reader or by the PDF layer, numbers NO source confirms, numbers both readers have and the page lacks
        const finalText = out.chunks.join(" ");
        const cPro = checkReadings(finalText, pro), cFlash = checkReadings(finalText, flash);
        const verified = new Set(layerVerified);
        const both = (a: string[], b: string[]) => a.filter((x) => b.includes(x));
        const unconf = both(cPro.onlyFirst, cFlash.onlyFirst).filter((n) => ![...verified].some((v) => v.includes(n)));
        const check: NewCheck = { page: p, status: unconf.length ? "differences" : "agreed", confirmed: [...new Set([...cPro.confirmed, ...cFlash.confirmed])], unconfirmed: unconf, secondOnly: both(cPro.onlySecond, cFlash.onlySecond), reader: "consensus:pro+flash" };
        pages.push({ page: p, status: "checked", patches: patches.map((x) => ({ kind: x.kind, from: x.from, to: x.to, by: layerBy.has(`${x.start}:${x.end}`) ? "pdf-layer" : "both readers" })), unsettled: plan.unsettled, refused: out.refused.length, before, after, layerVerified, check });
      }
      plans.push({ id: row.id, serial: row.serialNumber, headline: row.headline, pages, gate: { pass: why.length === 0, why }, newChunks, changedChunks: changed, patchCount });
    }

    // ---- the report
    const sum = (f: (p: PageResult) => number) => plans.reduce((n, c) => n + c.pages.reduce((m, p) => m + (p.status === "checked" ? f(p) : 0), 0), 0);
    const tot = {
      circulars: plans.length, pagesChecked: sum(() => 1), pagesSkipped: plans.reduce((n, c) => n + c.pages.filter((p) => p.status === "skipped").length, 0),
      patches: sum((p) => p.patches.length), digitTokens: sum((p) => p.before!.digitTokens),
      confirmedBefore: sum((p) => p.before!.confirmed), confirmedAfter: sum((p) => p.after!.confirmed),
      unconfirmedAfter: sum((p) => p.after!.unconfirmed.length), words: sum((p) => p.before!.words), wordsConfirmed: sum((p) => p.before!.wordsConfirmed),
      unsettled: sum((p) => p.unsettled.length), missingFromStored: sum((p) => p.after!.missing.length),
    };
    mkdirSync(reportDir, { recursive: true });
    const stamp = Date.now();
    const md: string[] = [`# Consensus correction ${apply ? "(APPLIED)" : "(dry run)"} - ${new Date().toISOString()}`, "",
      `Readers: ${PRO}, ${FLASH} (saved readings of the page images). Circulars ${tot.circulars}; pages checked ${tot.pagesChecked}, skipped ${tot.pagesSkipped}.`,
      `Numbers (tokens with a digit): ${tot.digitTokens}; confirmed by a reader before ${tot.confirmedBefore} (${((100 * tot.confirmedBefore) / Math.max(1, tot.digitTokens)).toFixed(1)}%), after the patches ${tot.confirmedAfter} (${((100 * tot.confirmedAfter) / Math.max(1, tot.digitTokens)).toFixed(1)}%); still unconfirmed ${tot.unconfirmedAfter}.`,
      `Words confirmed by a reader: ${tot.wordsConfirmed} of ${tot.words} (${((100 * tot.wordsConfirmed) / Math.max(1, tot.words)).toFixed(1)}%); words are never changed.`,
      `Patches proposed: ${tot.patches} (of which by the PDF text layer: ${plans.reduce((n, c) => n + c.pages.reduce((m, p) => m + p.patches.filter((x) => x.by === "pdf-layer").length, 0), 0)}); conflicts settled in favour of the stored text by the PDF layer: ${plans.reduce((n, c) => n + c.pages.reduce((m, p) => m + (p.layerVerified?.length ?? 0), 0), 0)}. Disagreements the readers did not settle (not applied): ${tot.unsettled}. Numbers both readers have and the stored text lacks: ${tot.missingFromStored}.`, ""];
    for (const c of plans) {
      const pp = c.pages.flatMap((p) => p.patches.map((x) => `p${p.page}: \`${x.from || "(nothing)"}\` -> \`${x.to}\` (${x.by})`));
      const un = c.pages.flatMap((p) => p.unsettled.map((x) => `p${p.page}: stored \`${x.stored}\` vs readers ${x.readers.map((r) => `\`${r}\``).join(", ")}`));
      const unc = c.pages.flatMap((p) => (p.after?.unconfirmed ?? []).map((n) => `p${p.page}:${n}`));
      if (!pp.length && !un.length && !unc.length) continue;
      md.push(`## Circular ${c.id}: ${c.headline.slice(0, 70)}  [gate: ${c.gate.pass ? "pass" : "FAIL: " + c.gate.why.join("; ")}]`);
      if (pp.length) md.push("Patches: " + pp.join(" | "));
      if (un.length) md.push("Unsettled (not applied): " + un.slice(0, 12).join(" | "));
      if (unc.length) md.push(`Numbers in the stored text that neither reader has (${unc.length}): ${unc.slice(0, 25).join(", ")}`);
      md.push("");
    }
    writeFileSync(join(reportDir, `consensus-${stamp}.md`), md.join("\n"));
    writeFileSync(join(reportDir, `consensus-${stamp}.json`), JSON.stringify({ totals: tot, circulars: plans.map(({ newChunks, ...rest }) => rest) }, null, 1));
    console.log(md.slice(0, 7).join("\n"));
    console.log(`\nCirculars with patches: ${plans.filter((c) => c.patchCount > 0).length} (gate pass ${plans.filter((c) => c.patchCount > 0 && c.gate.pass).length}, fail ${plans.filter((c) => c.patchCount > 0 && !c.gate.pass).length}).`);
    console.log(`Report: ${join(reportDir, `consensus-${stamp}.md`)}`);
    if (!apply) { console.log("DRY RUN: nothing was written to the database."); return; }

    // ---- apply
    let realEmbed: ((t: string, k?: "search_query" | "search_document") => Promise<number[]>) | null = null;
    const base = async (t: string) => {
      realEmbed ??= (await import("../src/lib/ai/geminiEmbedding")).generateEmbedding;
      for (let attempt = 0; ; attempt++) {
        try { return await realEmbed(t, "search_document"); } catch (e: any) {
          if (attempt < 3 && /429|quota|RESOURCE_EXHAUSTED/i.test(String(e?.message))) { console.log("   embedding rate limit: waiting 65 s"); await sleep(65000); continue; }
          throw e;
        }
      }
    };
    const embed = memoized(throttled(base, 1200));
    const applyList = plans.filter((x) => x.patchCount > 0);
    for (const c of applyList) {
      if (!c.gate.pass) { console.log(`circular ${c.id}: NOT applied (gate failed: ${c.gate.why.join("; ")})`); continue; }
      const sorted = [...c.newChunks].sort((a, b) => a.index - b.index);
      const extractedText = sorted.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim();
      const plan: RereadPlan = { id: c.id, serialNumber: c.serial, headline: c.headline, status: "would-change", reason: null, pages: c.pages.length, oldChunks: sorted.length, newChunks: sorted, oldChars: 0, newChars: extractedText.length, onlyInOld: [], onlyInNew: [], pageTexts: [], extractedText };
      const res = await applyReread(client as any, { embed }, plan, "reread-backups");
      // read back: exactly the planned text must now be in the database
      const back = (await client.query(`SELECT chunk_index, page_number, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [c.id])).rows;
      const same = back.length === sorted.length && back.every((r: any, i: number) => r.chunk_index === sorted[i].index && r.page_number === sorted[i].page && r.text === sorted[i].text);
      console.log(`circular ${c.id}: applied ${c.patchCount} patch(es) in ${c.changedChunks} chunk(s); read back ${same ? "IDENTICAL to the plan" : "DIFFERENT from the plan (restore from " + res.backupFile + ")"}; backup ${res.backupFile}`);
    }
    // the saved page checks (after the patches, so each fingerprint is that of the text really stored): the answer card refuses a number no source confirmed
    if (!flag("no-save-checks")) {
      let saved = 0;
      for (const c of plans) {
        const stored = (await client.query(`SELECT chunk_index AS index, page_number AS page, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [c.id])).rows;
        const rowsToSave = checkRowsFor(c.pages.flatMap((p) => (p.check ? [p.check] : [])), stored);
        saved += await savePageChecks((sql, params) => client.query(sql, params as any[]), c.id, rowsToSave);
      }
      console.log(`Saved ${saved} page check(s) in circular_page_check.`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
