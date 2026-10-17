// src/lib/ingestion/ocr.ts
//
// The OCR of one page, moved out of the circular upload route so it can be tested with the real engine.
// (Behaviour is the same as before EXCEPT how the two passes are combined: see ocrMerge.ts.)

import Tesseract from "tesseract.js";
import { reconstructTableFromTSV } from "./tableReconstruction";
import { keepWellRead, parseTsvWords, readRuledTables, textOfWords, tsvWithout, withoutTableWords, type CellOcr, type RuledPage, type TableReading } from "./ruledTable";
import { mergeOcrPasses } from "./ocrMerge";

export const OCR_LANGS = ["eng", "hin+eng+ben"] as const;

/** The most time one page may spend reading its ruled tables cell by cell (a typical table takes a few seconds). */
export const RULED_TABLE_BUDGET_MS = 90_000;

/** Reads one cell: "block" mode (a few words or lines) at a stated resolution, which is what the engine does well. */
function cellReader(worker: any): CellOcr {
  let prepared = false;
  return async (png) => {
    if (!prepared) {
      await worker.setParameters({ tessedit_pageseg_mode: "6" as any, user_defined_dpi: "300" as any });
      prepared = true;
    }
    const { data } = await worker.recognize(png, {}, { text: true });
    return { text: data.text || "", conf: Number(data.confidence ?? 0) };
  };
}
export type OcrWorkerPool = Record<(typeof OCR_LANGS)[number], any>;

/** Create both language workers ONCE per upload, reused across every page
 *  of a document -- a fresh worker per page/pass measurably added tens of
 *  seconds on multi-page documents.
 *  `workerOptions` is for tests only (a local language-data folder); the upload route passes nothing. */
export async function createOcrWorkerPool(workerOptions?: Record<string, unknown>): Promise<OcrWorkerPool> {
  const pool = {} as OcrWorkerPool;
  for (const langs of OCR_LANGS) {
    const worker = workerOptions ? await Tesseract.createWorker(langs, 1, workerOptions as any) : await Tesseract.createWorker(langs);
    // PSM 3 = fully automatic page segmentation (the value the CLI uses).
    await worker.setParameters({ tessedit_pageseg_mode: "3" as any });
    pool[langs] = worker;
  }
  return pool;
}

export async function destroyOcrWorkerPool(pool: OcrWorkerPool) {
  await Promise.all(OCR_LANGS.map((langs) => pool[langs]?.terminate().catch(() => {})));
}

/* ============================================================
   Dual-pass OCR for one page/image.

   Hard-won facts that drove this:
   1) tesseract.js's DEFAULT page-seg mode differs from the tesseract CLI and
      mangles dense tables -- it silently drops values like "20995.30". PSM 3
      (fully automatic) is set EXPLICITLY (see createOcrWorkerPool).
   2) Running hin+eng+ben on an ENGLISH page corrupts Latin alphanumerics.
      Measured: "Rs. 15,000/-" -> "Rs. 5,000/-", "10:00 AM" -> "0:00 AM",
      "16.12.2023" -> "76.|2.2023". An eng-only pass reads them cleanly.
   3) The English pass's word positions let us rebuild table columns in the
      right order (tableReconstruction.ts), added ADDITIVELY.

   So each page is OCR'd twice at PSM 3: "eng" (Latin letters, digits, codes)
   and "hin+eng+ben" (Hindi and Bengali). They used to be stored BOTH, in full,
   which put every number into the text twice -- once right, once wrong -- and
   let search and the synthesis quote either. Now (ocrMerge.ts): the English
   pass is kept in full; from the other pass ONLY the Indic-script words are
   kept. The numbers that only the Hindi/Bengali pass "saw" are discarded and
   reported in the log.
============================================================ */
export interface OcrPageResult {
  /** The text to store for this page. */
  text: string;
  /** Characters the English pass produced (0 = the English pass failed or found nothing). */
  englishChars: number;
  indicLetters: number;
  /** Numbers only the Hindi/Bengali pass saw (discarded as probable misreadings). */
  discarded: string[];
  /** The English pass was empty and the Hindi/Bengali text had to be used in full: its Latin digits are NOT trustworthy. */
  fellBackToIndicPass: boolean;
  /** Ruled tables read cell by cell (ruledTable.ts) instead of by the page reading. */
  ruledTables?: number;
  /** Numbers in those tables that the readings could not agree on (written "[unclear]"). */
  unclearCells?: number;
}

/** The OCR of one page with the details the archive re-read needs. The upload route uses ocrPageDualPass (just the text). */
export async function ocrPageDual(input: Buffer | Uint8Array, label: string, workers: OcrWorkerPool): Promise<OcrPageResult> {
  let eng = "";
  let table = "";
  let tri = "";
  // RULED TABLES (ruledTable.ts). The page reading cannot be trusted to lay out a table: it drops a narrow column and turns grid lines into
  // characters, differently at every scale. So the cells of a ruled table are read one by one (with a vote on every number). The page is still
  // read as before (always from the original picture), and a table reading is USED only if it keeps the words the page reading saw in that table;
  // the words it contains are then cut out of the page text by their positions, so no damaged copy of the table is stored.
  let ruled: RuledPage = { tables: [], text: "", maskedPng: null, skipped: [] };
  let kept: TableReading[] = [];
  const notUsed: string[] = [];
  try {
    ruled = await readRuledTables(Buffer.from(input), cellReader(workers.eng), { budgetMs: RULED_TABLE_BUDGET_MS, alt: cellReader(workers["hin+eng+ben"]) });
  } catch (err) {
    console.error(`Ruled-table reading failed${label ? " on " + label : ""} (the page is read as before):`, (err as any)?.message || err);
  } finally {
    for (const langs of OCR_LANGS) {
      try {
        await workers[langs].setParameters({ tessedit_pageseg_mode: "3" as any, user_defined_dpi: "0" as any });
      } catch {
        /* the workers are reset for the page reading; a failure here shows up as a failed page reading below */
      }
    }
  }
  notUsed.push(...ruled.skipped);
  for (const langs of OCR_LANGS) {
    try {
      const worker = workers[langs];
      const {
        data: { text, tsv },
      } = await worker.recognize(input, {}, { text: true, tsv: langs === "eng" });
      if (langs === "eng") {
        eng = text || "";
        let tsvForOldTables = tsv || "";
        if (tsv && ruled.tables.length) {
          const words = parseTsvWords(tsv);
          const verdict = keepWellRead(ruled.tables, words);
          kept = verdict.kept;
          notUsed.push(...verdict.skipped);
          if (kept.length) {
            // cut only what the table readings contain (and grid-line debris); every other word inside a table's box stays
            const rest = withoutTableWords(words, kept);
            eng = textOfWords(rest.words);
            tsvForOldTables = tsvWithout(tsv, rest.removed);
          }
        }
        // a table WITHOUT lines is still rebuilt from the word positions, as before
        if (tsvForOldTables) table = reconstructTableFromTSV(tsvForOldTables) || "";
      } else {
        tri = text || "";
      }
    } catch (err) {
      console.error(`OCR pass "${langs}" failed${label ? " on " + label : ""}:`, (err as any)?.message || err);
    }
  }
  if (kept.length) {
    const keptText = kept.map((t) => t.text).join("\n\n");
    table = table ? `${keptText}\n\n${table}` : keptText;
  }
  const merged = mergeOcrPasses(eng, table, tri);
  // OCR_QUIET is set by the archive re-read tool (hundreds of pages; it prints its own summary). Uploads keep this line.
  if (!process.env.OCR_QUIET) console.info(
    `[ocr] ${label || "page"}: English pass ${eng.length} chars; Indic words kept ${merged.indicLetters} letters; ` +
      (merged.fellBackToIndicPass
        ? "ENGLISH PASS EMPTY, used the Hindi/Bengali text in full (its digits are NOT trustworthy)"
        : merged.discarded.length
          ? `${merged.discarded.length} number(s) seen only by the Hindi/Bengali pass were discarded as probable misreadings (e.g. ${merged.discarded.slice(0, 4).join(" | ")})`
          : "the two passes agree on every number") +
      (kept.length ? ` | ruled tables read cell by cell: ${kept.length}${kept.reduce((n, t) => n + t.unclear, 0) ? ` (${kept.reduce((n, t) => n + t.unclear, 0)} unclear number(s))` : ""}` : "") +
      (notUsed.length ? ` | not used: ${notUsed.join("; ")}` : ""),
  );
  return { text: merged.text, englishChars: eng.length, indicLetters: merged.indicLetters, discarded: merged.discarded, fellBackToIndicPass: merged.fellBackToIndicPass, ruledTables: kept.length, unclearCells: kept.reduce((n, t) => n + t.unclear, 0) };
}

/** The upload route's entry point: the text only. */
export async function ocrPageDualPass(input: Buffer | Uint8Array, label: string, workers: OcrWorkerPool): Promise<string> {
  return (await ocrPageDual(input, label, workers)).text;
}
