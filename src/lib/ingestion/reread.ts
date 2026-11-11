// src/lib/ingestion/reread.ts
//
// Replacing the stored text of an ALREADY-UPLOADED circular, in place: its chunks (circular_chunks) and its whole-document vector (circulars.embedding).
// NEVER its id, serial number, dates, headline, author or page images. Used by scripts/ocr-consensus.ts (the consensus correction of the stored text).
//
// SAFETY: applyReread() computes every embedding first (a failure there changes nothing), saves the old chunks and vectors to a backup file, then replaces them in ONE
// transaction; if anything fails nothing changes. restoreFromBackup() puts the old text and vectors back exactly.
//
// Everything outside the logic (the embedding service, the database) is injected, so it is tested without network access.

import { nowIso } from "../dates";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documentEmbeddingText, type PlannedChunk } from "./chunking";

export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface RereadDeps {
  embed(text: string): Promise<number[]>;
}

/** What is about to replace a circular's stored text. Only a plan whose status is "would-change" is applied. */
export interface RereadPlan {
  id: number;
  serialNumber: number | null;
  headline: string;
  status: "unchanged" | "would-change" | "suspicious" | "skipped";
  /** Why it is suspicious or skipped; null otherwise. */
  reason: string | null;
  pages: number;
  oldChunks: number;
  newChunks: PlannedChunk[];
  oldChars: number;
  newChars: number;
  onlyInOld: string[];
  onlyInNew: string[];
  pageTexts: string[];
  /** The text of the whole document (its first 8192 characters make the whole-document vector). */
  extractedText: string;
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
  writeFileSync(backupFile, JSON.stringify({ circularId: plan.id, headline: plan.headline, savedAt: nowIso(), documentEmbedding: doc.rows[0]?.embedding ?? null, chunks: old.rows }, null, 1));

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
