// src/lib/ingestion/ocr.ts
//
// The OCR of one page, moved out of the circular upload route so it can be tested with the real engine.
// (Behaviour is the same as before EXCEPT how the two passes are combined: see ocrMerge.ts.)

import Tesseract from "tesseract.js";
import { reconstructTableFromTSV } from "./tableReconstruction";
import { mergeOcrPasses } from "./ocrMerge";

export const OCR_LANGS = ["eng", "hin+eng+ben"] as const;
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
export async function ocrPageDualPass(input: Buffer | Uint8Array, label: string, workers: OcrWorkerPool): Promise<string> {
  let eng = "";
  let table = "";
  let tri = "";
  for (const langs of OCR_LANGS) {
    try {
      const worker = workers[langs];
      const {
        data: { text, tsv },
      } = await worker.recognize(input, {}, { text: true, tsv: langs === "eng" });
      if (langs === "eng") {
        eng = text || "";
        if (tsv) table = reconstructTableFromTSV(tsv) || "";
      } else {
        tri = text || "";
      }
    } catch (err) {
      console.error(`OCR pass "${langs}" failed${label ? " on " + label : ""}:`, (err as any)?.message || err);
    }
  }
  const merged = mergeOcrPasses(eng, table, tri);
  console.info(
    `[ocr] ${label || "page"}: English pass ${eng.length} chars; Indic words kept ${merged.indicLetters} letters; ` +
      (merged.fellBackToIndicPass
        ? "ENGLISH PASS EMPTY, used the Hindi/Bengali text in full (its digits are NOT trustworthy)"
        : merged.discarded.length
          ? `${merged.discarded.length} number(s) seen only by the Hindi/Bengali pass were discarded as probable misreadings (e.g. ${merged.discarded.slice(0, 4).join(" | ")})`
          : "the two passes agree on every number"),
  );
  return merged.text;
}
