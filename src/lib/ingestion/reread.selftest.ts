// src/lib/ingestion/reread.selftest.ts
// Run:  TEST_DATABASE_URL=postgres://user:pass@host:5432/dbname npx tsx src/lib/ingestion/reread.selftest.ts
//
// Needs a SCRATCH Postgres with the pgvector extension available. It creates throwaway tables public.circulars and
// public.circular_chunks and DROPS them at the end -- so it REFUSES to run if public.circulars already exists (a real database).
// OCR, images and embeddings are faked (deterministic); the OCR texts are built from the REAL Tesseract outputs in __fixtures__.
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";
import { mergeOcrPasses } from "./ocrMerge";
import { buildPageUnits, planChunks } from "./chunking";
import { MAX_NEW_TO_OLD_RATIO, applyReread, numbersOf, planReread, restoreFromBackup, type Backup, type CircularRow, type OldChunk, type RereadDeps, type SqlClient } from "./reread";
import type { OcrPageResult } from "./ocr";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("reread selftest SKIPPED: set TEST_DATABASE_URL to a scratch Postgres with pgvector.");
  process.exit(0);
}
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const fx = (n: string) => readFileSync(join(__dirname, "__fixtures__", n), "utf8");

// ---- the two real pages: what the NEW reader stores, and what the OLD pipeline stored (both full texts, concatenated) ----
const engP1 = fx("lab_page1_english_pass.txt"), triP1 = fx("lab_page1_indic_pass.txt");
const engP2 = fx("lab_page2_english_pass.txt"), triP2 = fx("lab_page2_indic_pass.txt");
const mergedP1 = mergeOcrPasses(engP1, "", triP1);
const mergedP2 = mergeOcrPasses(engP2, "", triP2);
const asResult = (m: ReturnType<typeof mergeOcrPasses>, engText: string): OcrPageResult => ({ text: m.text, englishChars: engText.length, indicLetters: m.indicLetters, discarded: m.discarded, fellBackToIndicPass: m.fellBackToIndicPass });
const OLD_PAGE_TEXT = [engP1 + "\n" + triP1 + "\n", engP2 + "\n" + triP2 + "\n"]; // the old pipeline: both reads, in full

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
let embedCalls = 0;
const fakeVec = (text: string) => {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return Array.from({ length: 8 }, (_, i) => ((h + i * 97) % 1000) / 1000);
};
const deps = (opts: { failEmbedOnCall?: number } = {}): RereadDeps => ({
  readPage: async (u) => {
    if (u.includes("MISSING")) throw new Error("404 not found");
    const k = u.split("/").pop() || "";
    if (k === "P1") return asResult(mergedP1, engP1);
    if (k === "P2") return asResult(mergedP2, engP2);
    if (k === "EMPTY") return { text: "वेतन रु दैनिक", englishChars: 0, indicLetters: 9, discarded: [], fellBackToIndicPass: true };
    if (k === "TINY") return { text: "Rs. 15,000", englishChars: 10, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    if (k === "BIG") return { text: ("Rs. 99,999 table row col1: 7 | col2: 8 ").repeat(400), englishChars: 15000, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    if (k === "NEWNUM") return { text: "Rs. 15,000/- and a figure 424242 that the stored text never had", englishChars: 60, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    throw new Error("unknown test image " + k);
  },
  embed: async (t) => {
    embedCalls++;
    if (opts.failEmbedOnCall && embedCalls >= opts.failEmbedOnCall) throw new Error("embedding service down");
    return fakeVec(t);
  },
});

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const exists = (await client.query(`SELECT to_regclass('public.circulars') AS t`)).rows[0].t;
  if (exists) {
    console.log("reread selftest REFUSED: public.circulars already exists, so this looks like a real database. Use a scratch one.");
    await client.end();
    process.exit(2);
  }
  await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await client.query(`CREATE TABLE public.circulars (id serial PRIMARY KEY, headline text NOT NULL, "fileUrls" text[], "publishedAt" timestamp, "uploadedAt" timestamp, "authorTicketNo" varchar, "serialNumber" integer, embedding vector)`);
  await client.query(`CREATE TABLE public.circular_chunks (id serial PRIMARY KEY, circular_id integer NOT NULL, chunk_index integer, page_number integer, text text, embedding vector)`);
  const backupDir = join(tmpdir(), `reread-selftest-${Date.now()}`);

  const seed = async (headline: string, urls: string[], pageTexts: string[]) => {
    const r = await client.query(`INSERT INTO public.circulars (headline, "fileUrls", "publishedAt", "uploadedAt", "authorTicketNo", "serialNumber", embedding) VALUES ($1, $2, '2026-08-08', '2026-09-01', '498301', 7, $3::vector) RETURNING id`, [headline, urls, `[${fakeVec("old doc").join(",")}]`]);
    const id = r.rows[0].id;
    const chunks = planChunks(buildPageUnits(pageTexts, ""));
    for (const c of chunks) await client.query(`INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding) VALUES ($1,$2,$3,$4,$5::vector)`, [id, c.index, c.page, c.text, `[${fakeVec(c.text).join(",")}]`]);
    return id as number;
  };
  const rowOf = async (id: number): Promise<CircularRow> => {
    const r = await client.query(`SELECT id, "serialNumber", headline, "fileUrls" FROM public.circulars WHERE id = $1`, [id]);
    return r.rows[0];
  };
  const oldChunksOf = async (id: number): Promise<OldChunk[]> => (await client.query(`SELECT chunk_index, page_number, text FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [id])).rows;
  const snapshot = async (id: number) => ({
    row: (await client.query(`SELECT id, headline, "fileUrls", "publishedAt", "uploadedAt", "authorTicketNo", "serialNumber" FROM public.circulars WHERE id = $1`, [id])).rows[0],
    chunks: (await client.query(`SELECT chunk_index, page_number, text, embedding::text AS embedding FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`, [id])).rows,
    doc: (await client.query(`SELECT embedding::text AS e FROM public.circulars WHERE id = $1`, [id])).rows[0].e,
  });

  try {
    // ===================== A. the dry run =====================
    const id1 = await seed("Circular - wage rates", ["http://blob/P1", "http://blob/P2"], OLD_PAGE_TEXT);
    const before = await snapshot(id1);
    embedCalls = 0;
    const plan = await planReread(deps(), await rowOf(id1), await oldChunksOf(id1));
    check("A. a circular holding the old doubled text is planned as 'would-change'", plan.status === "would-change" && plan.reason === null, `${plan.status} ${plan.reason}`);
    check("A. the dry run calls no embedding service", embedCalls === 0);
    check("A. the dry run writes nothing", JSON.stringify(await snapshot(id1)) === JSON.stringify(before));
    check("A. it reports the probable misreadings that will disappear (5,000, 0:00, 76 ...)", plan.onlyInOld.includes("5,000") && plan.onlyInOld.some((n) => /0:00/.test(n)) && plan.onlyInOld.length >= 6, JSON.stringify(plan.onlyInOld));
    check("A. it finds nothing the old text lacked (new readings are a subset of the old)", plan.onlyInNew.length === 0, JSON.stringify(plan.onlyInNew));
    check("A. the new text keeps every correct reading and none of the damaged ones", ["Rs. 15,000/-", "10:00 AM", "16.12.2023", "Rs. 20,995.30"].every((g) => plan.newChunks.map((c) => c.text).join(" ").includes(g)) && !/Rs\. 5,000|\]4,999|76\.\|2\.2023/.test(plan.newChunks.map((c) => c.text).join(" ")));
    check("A. the new text is about half of the old (the doubled copy is gone)", plan.newChars < plan.oldChars * 0.75 && plan.newChars > plan.oldChars * 0.25, `${plan.newChars} vs ${plan.oldChars}`);
    check("A. page numbers are kept (chunks on pages 1 and 2)", new Set(plan.newChunks.map((c) => c.page)).size === 2 && plan.newChunks[0].page === 1 && plan.newChunks[plan.newChunks.length - 1].page === 2);

    // ===================== B. apply =====================
    const res = await applyReread(client as SqlClient, deps(), plan, backupDir);
    const after = await snapshot(id1);
    check("B. apply replaced the chunks (count matches the plan, numbered 0..n-1)", after.chunks.length === plan.newChunks.length && after.chunks.every((c: any, i: number) => c.chunk_index === i), `${after.chunks.length}`);
    check("B. the stored chunk text is the new text, every chunk has a vector", after.chunks.every((c: any, i: number) => c.text === plan.newChunks[i].text && !!c.embedding) && !after.chunks.some((c: any) => /Rs\. 5,000/.test(c.text)));
    check("B. the circular row is UNTOUCHED (id, headline, file links, dates, author, serial number)", JSON.stringify(after.row) === JSON.stringify(before.row));
    check("B. the whole-document vector was replaced", after.doc !== before.doc && !!after.doc);
    check("B. a backup file with the old chunks exists", existsSync(res.backupFile) && (JSON.parse(readFileSync(res.backupFile, "utf8")) as Backup).chunks.length === before.chunks.length && res.chunksBefore === before.chunks.length && res.chunksAfter === after.chunks.length);

    // ===================== D. unchanged after apply =====================
    const again = await planReread(deps(), await rowOf(id1), await oldChunksOf(id1));
    check("D. running it again finds nothing to do ('unchanged'), so a re-run is harmless", again.status === "unchanged");
    let refused = "";
    try {
      await applyReread(client as SqlClient, deps(), again, backupDir);
    } catch (e: any) {
      refused = e.message;
    }
    check("D. apply refuses a plan that is not 'would-change'", /refusing to apply/.test(refused));

    // ===================== C. restore =====================
    const backup = JSON.parse(readFileSync(res.backupFile, "utf8")) as Backup;
    await restoreFromBackup(client as SqlClient, backup);
    const restored = await snapshot(id1);
    check("C. restore puts back the old text and vectors exactly", JSON.stringify(restored.chunks) === JSON.stringify(before.chunks) && restored.doc === before.doc);
    check("C. restore leaves the circular row untouched", JSON.stringify(restored.row) === JSON.stringify(before.row));

    // ===================== E-H. refusals =====================
    const idE = await seed("English reading empty", ["http://blob/P1", "http://blob/EMPTY"], OLD_PAGE_TEXT);
    const pE = await planReread(deps(), await rowOf(idE), await oldChunksOf(idE));
    check("E. an empty English reading on a page makes it 'suspicious' (named), not applied", pE.status === "suspicious" && /page 2: the English reading was empty/.test(pE.reason || ""), `${pE.status} ${pE.reason}`);
    let refE = "";
    try {
      await applyReread(client as SqlClient, deps(), pE, backupDir);
    } catch (e: any) {
      refE = e.message;
    }
    check("E. apply refuses a suspicious plan", /refusing to apply/.test(refE));

    const idF = await seed("Image missing", ["http://blob/P1", "http://blob/MISSING"], OLD_PAGE_TEXT);
    const pF = await planReread(deps(), await rowOf(idF), await oldChunksOf(idF));
    check("F. a page image that cannot be fetched makes it 'suspicious' with the reason", pF.status === "suspicious" && /page 2: 404 not found/.test(pF.reason || ""), `${pF.status} ${pF.reason}`);

    const idG = (await client.query(`INSERT INTO public.circulars (headline, "fileUrls", "serialNumber") VALUES ('Holiday list', ARRAY['http://blob/P1'], 99) RETURNING id`)).rows[0].id as number;
    const pG = await planReread(deps(), await rowOf(idG), []);
    check("G. a circular with no stored text (a holiday list) is skipped, never re-read", pG.status === "skipped" && /holiday list/.test(pG.reason || ""));
    const idG2 = await seed("No images", [], OLD_PAGE_TEXT);
    const pG2 = await planReread(deps(), await rowOf(idG2), await oldChunksOf(idG2));
    check("G. a circular with no page images is skipped", pG2.status === "skipped" && /no page images/.test(pG2.reason || ""));

    const idH = await seed("Far too short", ["http://blob/TINY"], ["x ".repeat(500)]);
    const pH = await planReread(deps(), await rowOf(idH), await oldChunksOf(idH));
    check("H. new text under 25% of the stored text is 'suspicious' (the re-read probably failed)", pH.status === "suspicious" && /less than 25%/.test(pH.reason || ""), `${pH.status} ${pH.reason}`);

    // ===================== I-J. failures change nothing =====================
    const idI = await seed("Embedding fails", ["http://blob/P1", "http://blob/P2"], OLD_PAGE_TEXT);
    const beforeI = await snapshot(idI);
    const pI = await planReread(deps(), await rowOf(idI), await oldChunksOf(idI));
    embedCalls = 0;
    let errI = "";
    try {
      await applyReread(client as SqlClient, deps({ failEmbedOnCall: 2 }), pI, backupDir);
    } catch (e: any) {
      errI = e.message;
    }
    check("I. if the embedding service fails, apply fails and the database is exactly as before", /embedding service down/.test(errI) && JSON.stringify(await snapshot(idI)) === JSON.stringify(beforeI));

    const idJ = await seed("Database fails midway", ["http://blob/P1", "http://blob/P2"], OLD_PAGE_TEXT);
    const beforeJ = await snapshot(idJ);
    const pJ = await planReread(deps(), await rowOf(idJ), await oldChunksOf(idJ));
    let inserts = 0;
    const flaky: SqlClient = {
      query: async (text: string, params?: unknown[]) => {
        if (/INSERT INTO public\.circular_chunks/.test(text) && ++inserts === 2) throw new Error("connection lost");
        return client.query(text, params as any[]);
      },
    };
    let errJ = "";
    try {
      await applyReread(flaky, deps(), pJ, backupDir);
    } catch (e: any) {
      errJ = e.message;
    }
    check("J. a database error halfway through rolls everything back (old chunks intact)", /connection lost/.test(errJ) && JSON.stringify(await snapshot(idJ)) === JSON.stringify(beforeJ));

    // ===================== L. growth: legitimate table growth passes, runaway growth is refused =====================
    const idL1 = await seed("Table heavy", ["http://blob/BIG"], ["Rs. 99,999 x ".repeat(120)]); // ~1.5k chars stored
    const pL1 = await planReread(deps(), await rowOf(idL1), await oldChunksOf(idL1));
    check("L. a new text more than 8x the stored text is 'suspicious' (runaway table text), not applied", pL1.status === "suspicious" && /probably runaway table text/.test(pL1.reason || "") && pL1.newChars > pL1.oldChars * MAX_NEW_TO_OLD_RATIO, `${pL1.status} ${pL1.reason}`);
    const idL2 = await seed("Table a bit longer", ["http://blob/P1", "http://blob/P2"], [engP1.slice(0, 150), engP2.slice(0, 150)]); // new text ~ 3-4x of a short stored text
    const pL2 = await planReread(deps(), await rowOf(idL2), await oldChunksOf(idL2));
    check("L. growth under the limit (here several times) is allowed and reported, not blocked", pL2.status === "would-change" && pL2.newChars > pL2.oldChars * 2 && pL2.newChars < pL2.oldChars * MAX_NEW_TO_OLD_RATIO, `${pL2.status} ${pL2.oldChars}->${pL2.newChars}`);

    // ===================== N. table labels are not numbers on the page =====================
    check("N. the col1:/col2: labels of a rebuilt table are not counted as numbers", numbersOf("[TABLE]\ncol1: 1 | col2: 30-34 | col7: 1,637.00").join(" ") === "1 30-34 1,637.00", numbersOf("[TABLE]\ncol1: 1 | col2: 30-34 | col7: 1,637.00").join(" "));
    check("N. ... but a real number next to a word that merely contains 'col' is kept", numbersOf("protocol 12 and col 5").join(" ") === "12 5");

    // ===================== M. numbers the fixed reading holds that the stored text lacked =====================
    const idM = await seed("Different engine", ["http://blob/NEWNUM"], ["Rs. 15,000/- and some other words that are long enough to avoid the length guard ".repeat(2)]);
    const pM = await planReread(deps(), await rowOf(idM), await oldChunksOf(idM));
    check("M. a number the stored text never had is reported in onlyInNew (the sign of a different reading, to be looked at)", pM.onlyInNew.includes("424242"), JSON.stringify(pM.onlyInNew));

    // ===================== K. the shared chunking behaves like the old inline code =====================
    const oldInline = (perPage: string[], extracted: string) => {
      const chunkSize = 200;
      let chunkIndex = 0;
      const out: Array<{ index: number; page: number; text: string }> = [];
      const pageUnits: Array<{ page: number; text: string }> = [];
      const havePageText = perPage.some((t) => t && t.trim().length > 0);
      if (havePageText) {
        for (let pi = 0; pi < perPage.length; pi++) {
          const t = (perPage[pi] || "").replace(/\s+/g, " ").trim();
          if (t.length > 0) pageUnits.push({ page: pi + 1, text: t });
        }
      } else if (extracted && extracted.length > 0) pageUnits.push({ page: 0, text: extracted });
      for (const unit of pageUnits) {
        const words = unit.text.split(/\s+/);
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunkText = words.slice(i, i + chunkSize).join(" ");
          if (!chunkText.trim()) continue;
          out.push({ index: chunkIndex, page: unit.page, text: chunkText });
          chunkIndex++;
        }
      }
      return out;
    };
    const words = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");
    let same = true;
    const cases: Array<[string[], string]> = [
      [[words(450, "a"), "", words(10, "b"), "   \n  "], ""],
      [[], "whole document text here"],
      [["", "  "], "fallback text"],
      [[words(200, "x")], ""],
      [[words(201, "x"), words(399, "y")], "ignored"],
      [[], ""],
    ];
    for (const [pp, ex] of cases) if (JSON.stringify(planChunks(buildPageUnits(pp, ex))) !== JSON.stringify(oldInline(pp, ex))) same = false;
    check("K. the shared chunking gives exactly what the old inline upload code gave (6 shapes, incl. empty pages and the no-page fallback)", same);
  } finally {
    await client.query(`DROP TABLE IF EXISTS public.circular_chunks`);
    await client.query(`DROP TABLE IF EXISTS public.circulars`);
    rmSync(backupDir, { recursive: true, force: true });
    await client.end();
  }
  console.log(`\nreread selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
