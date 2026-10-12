// src/lib/ingestion/reread.ts
//
// Re-reading an ALREADY-UPLOADED circular with the fixed OCR, in place. Used by scripts/reread-circulars.ts.
//
// WHY: until the fix, every OCR'd circular stored BOTH full reads of every page: the English pass (right) and the
// Hindi/Bengali pass (which damages Latin digits: "Rs. 15,000" -> "Rs. 5,000", "10:00" -> "0:00"). The archive still holds those
// doubled, partly wrong texts, and search and the synthesis can quote the wrong copy (the invented "Rs 74,999 / 75,000").
//
// WHAT IT TOUCHES: only the circular's chunks (circular_chunks) and its whole-document vector (circulars.embedding).
// NEVER its id, serial number, dates, headline, author or page images.
//
// SAFETY: planReread() writes nothing and calls no embedding service (a DRY RUN). applyReread() computes every embedding first,
// saves the old chunks to a backup file, then replaces them in ONE transaction; if anything fails nothing changes.
// restoreFromBackup() puts the old text and vectors back exactly.
//
// Everything outside the logic (images, OCR, embeddings, the database) is injected, so it is tested without network access.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageUnits, documentEmbeddingText, planChunks, type PlannedChunk } from "./chunking";
import { numericTokens } from "./ocrMerge";
import type { OcrPageResult } from "./ocr";

export interface CircularRow {
  id: number;
  serialNumber: number | null;
  headline: string;
  fileUrls: string[];
}
export interface OldChunk {
  chunk_index: number;
  page_number: number;
  text: string;
}
export interface RereadDeps {
  /** Fetch one page image and read it (the tool wraps this in a disk cache). Throws if the image cannot be fetched or read. */
  readPage(url: string, label: string): Promise<OcrPageResult>;
  embed(text: string): Promise<number[]>;
}
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export type RereadStatus = "unchanged" | "would-change" | "suspicious" | "skipped";

export interface RereadPlan {
  id: number;
  serialNumber: number | null;
  headline: string;
  status: RereadStatus;
  /** Why it is suspicious or skipped; null otherwise. */
  reason: string | null;
  pages: number;
  oldChunks: number;
  newChunks: PlannedChunk[];
  oldChars: number;
  newChars: number;
  /** Numbers in the stored text that the fixed reading does not contain: the probable misreadings that will disappear. */
  onlyInOld: string[];
  /** Numbers the fixed reading contains that the stored text did not. Should be empty; if not, look at the circular. */
  onlyInNew: string[];
  /** The text of every page, as the upload would store it. */
  pageTexts: string[];
  extractedText: string;
}

/** Rebuilt tables can legitimately make a table-heavy circular several times longer; beyond this it is treated as a runaway. */
export const MAX_NEW_TO_OLD_RATIO = 8;

/** The new text must be at least this share of the old. The old text held two reads of each page, so about half is normal. */
export const MIN_NEW_TO_OLD_RATIO = 0.25;

const uniq = (xs: string[]) => [...new Set(xs)];

/** The numbers in a text, NOT counting the "col1:", "col2:" ... labels that the table rebuilding adds (they are not on the page). */
export const numbersOf = (text: string): string[] => numericTokens((text || "").replace(/\bcol\d+:/g, " "));

/**
 * `structuredPages`: pages whose content is stored as structured rows (the roster pages of a health check-up schedule, see schedule/ingest.ts). A fresh
 * upload does not read or chunk them (their text would be a second, unstructured copy of the rows), so neither does a re-read: they are not read, their
 * old chunks are left out of the comparison, and a circular that still has such old chunks is a "would-change" (applying it drops them).
 */
export async function planReread(deps: RereadDeps, row: CircularRow, oldChunks: OldChunk[], structuredPages: ReadonlySet<number> = new Set()): Promise<RereadPlan> {
  const keptOld = oldChunks.filter((c) => !structuredPages.has(c.page_number));
  const staleStructured = oldChunks.length - keptOld.length;
  const keptOldChars = keptOld.reduce((n, c) => n + c.text.length, 0);
  const base = {
    id: row.id,
    serialNumber: row.serialNumber,
    headline: row.headline,
    pages: Array.isArray(row.fileUrls) ? row.fileUrls.length : 0,
    oldChunks: oldChunks.length,
    newChunks: [] as PlannedChunk[],
    oldChars: oldChunks.reduce((n, c) => n + c.text.length, 0),
    newChars: 0,
    onlyInOld: [] as string[],
    onlyInNew: [] as string[],
    pageTexts: [] as string[],
    extractedText: "",
  };
  if (oldChunks.length === 0) return { ...base, status: "skipped", reason: "no stored text (a holiday list or a display-only circular): nothing to re-read" };
  if (!base.pages) return { ...base, status: "skipped", reason: "no page images stored for this circular" };
  if (structuredPages.size > 0 && Array.from({ length: base.pages }, (_, i) => i + 1).every((p) => structuredPages.has(p))) {
    return { ...base, status: "skipped", reason: "every page is a roster page whose content is stored as rows: nothing to read" };
  }

  const pageTexts: string[] = [];
  const problems: string[] = [];
  for (let i = 0; i < row.fileUrls.length; i++) {
    const label = `circular ${row.id} page ${i + 1}`;
    if (structuredPages.has(i + 1)) {
      pageTexts[i] = ""; // a roster page: its content is stored as rows, so it is not read
      continue;
    }
    try {
      const r = await deps.readPage(row.fileUrls[i], label);
      pageTexts[i] = r.text;
      if (r.fellBackToIndicPass || r.englishChars === 0) problems.push(`page ${i + 1}: the English reading was empty`);
    } catch (e) {
      pageTexts[i] = "";
      problems.push(`page ${i + 1}: ${(e as Error)?.message ?? e}`);
    }
  }

  // The same assembly as the upload: pages joined, spaces cleaned, then chunked per page.
  const extractedText = pageTexts.map((t) => t + " \n").join("").replace(/\s+/g, " ").trim();
  const newChunks = planChunks(buildPageUnits(pageTexts, extractedText));
  const oldText = keptOld.map((c) => c.text).join(" ");
  const newText = newChunks.map((c) => c.text).join(" ");
  const oldNums = uniq(numbersOf(oldText));
  const newNums = uniq(numbersOf(newText));
  const newSet = new Set(newNums);
  const oldSet = new Set(oldNums);
  const plan: RereadPlan = {
    ...base,
    pageTexts,
    extractedText,
    newChunks,
    newChars: newChunks.reduce((n, c) => n + c.text.length, 0),
    onlyInOld: oldNums.filter((n) => !newSet.has(n)),
    onlyInNew: newNums.filter((n) => !oldSet.has(n)),
    status: "would-change",
    reason: null,
  };

  if (problems.length) return { ...plan, status: "suspicious", reason: problems.join("; ") };
  if (newChunks.length === 0) return { ...plan, status: "suspicious", reason: "the re-read produced no text at all" };
  if (keptOldChars > 0 && plan.newChars < keptOldChars * MIN_NEW_TO_OLD_RATIO) {
    return { ...plan, status: "suspicious", reason: `the new text is only ${plan.newChars} characters against ${keptOldChars} stored (less than ${MIN_NEW_TO_OLD_RATIO * 100}%): the re-read probably failed` };
  }
  if (keptOldChars > 0 && plan.newChars > keptOldChars * MAX_NEW_TO_OLD_RATIO) {
    return { ...plan, status: "suspicious", reason: `the new text is ${(plan.newChars / keptOldChars).toFixed(1)}x the stored text (more than ${MAX_NEW_TO_OLD_RATIO}x): probably runaway table text` };
  }
  const same = staleStructured === 0 && newChunks.length === keptOld.length && newChunks.every((c, i) => c.text === keptOld[i].text);
  if (same) return { ...plan, status: "unchanged" };
  return plan;
}

export interface ApplyResult {
  id: number;
  chunksBefore: number;
  chunksAfter: number;
  backupFile: string;
}

const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;

/** Replaces the circular's chunks and whole-document vector with the re-read ones. Only for a plan whose status is "would-change". */
export async function applyReread(client: SqlClient, deps: Pick<RereadDeps, "embed">, plan: RereadPlan, backupDir: string): Promise<ApplyResult> {
  if (plan.status !== "would-change") throw new Error(`refusing to apply a plan with status "${plan.status}"`);

  // 1. Every embedding first, before anything is written: a failure here changes nothing.
  const docText = documentEmbeddingText(plan.extractedText);
  const docVector = docText ? vectorLiteral(await deps.embed(docText)) : null;
  const chunkVectors: string[] = [];
  for (const c of plan.newChunks) chunkVectors.push(vectorLiteral(await deps.embed(c.text)));

  // 2. Back up exactly what is about to be replaced (text AND vectors), so it can be restored.
  const old = await client.query(
    `SELECT chunk_index, page_number, text, embedding::text AS embedding FROM public.circular_chunks WHERE circular_id = $1 ORDER BY chunk_index`,
    [plan.id],
  );
  const doc = await client.query(`SELECT embedding::text AS embedding FROM public.circulars WHERE id = $1`, [plan.id]);
  mkdirSync(backupDir, { recursive: true });
  const backupFile = join(backupDir, `circular-${plan.id}-${Date.now()}.json`);
  writeFileSync(backupFile, JSON.stringify({ circularId: plan.id, headline: plan.headline, savedAt: new Date().toISOString(), documentEmbedding: doc.rows[0]?.embedding ?? null, chunks: old.rows }, null, 1));

  // 3. One transaction: all of it or none of it.
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM public.circular_chunks WHERE circular_id = $1`, [plan.id]);
    for (let i = 0; i < plan.newChunks.length; i++) {
      const c = plan.newChunks[i];
      await client.query(
        `INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding) VALUES ($1, $2, $3, $4, $5)`,
        [plan.id, c.index, c.page, c.text, chunkVectors[i]],
      );
    }
    if (docVector) await client.query(`UPDATE public.circulars SET embedding = $1::vector WHERE id = $2`, [docVector, plan.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  return { id: plan.id, chunksBefore: old.rows.length, chunksAfter: plan.newChunks.length, backupFile };
}

export interface Backup {
  circularId: number;
  headline: string;
  documentEmbedding: string | null;
  chunks: Array<{ chunk_index: number; page_number: number; text: string; embedding: string | null }>;
}

/** Puts a circular's old chunks and whole-document vector back exactly as saved in a backup file. */
export async function restoreFromBackup(client: SqlClient, backup: Backup): Promise<{ chunks: number }> {
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM public.circular_chunks WHERE circular_id = $1`, [backup.circularId]);
    for (const c of backup.chunks) {
      await client.query(
        `INSERT INTO public.circular_chunks (circular_id, chunk_index, page_number, text, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
        [backup.circularId, c.chunk_index, c.page_number, c.text, c.embedding],
      );
    }
    if (backup.documentEmbedding) await client.query(`UPDATE public.circulars SET embedding = $1::vector WHERE id = $2`, [backup.documentEmbedding, backup.circularId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  return { chunks: backup.chunks.length };
}
