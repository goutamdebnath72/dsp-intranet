// src/lib/holidays/policyChunks.ts
//
// Generates and embeds the holiday policy chunks (see holiday-policy-
// chunk.model.ts) that make free-text holiday policy questions searchable --
// things structured queryHolidays() queries can never fully answer, like
// "can a new joiner get a full RH quota" or "what happens if my restricted
// holiday coincides with my weekly off". Two source types:
//
//   - "policyNote": a year-wide policy paragraph, embedded as-is (its own
//     topic + text is already self-contained prose).
//   - "reclassification": one of holidayyear's own `note` values (why a
//     specific holiday was promoted to an extra FH this year), embedded as
//     a short synthesized sentence naming the holiday and date, so the
//     chunk is self-contained even without its row's other context.
//
// Called from holidays/admin/store.ts after a year's holidays/rhQuota are
// written -- idempotent (deletes then re-inserts this year's chunks), same
// pattern as every other per-year sync in this codebase.

import { getDb } from "@/lib/db";
import { HolidayPolicyChunk } from "@/lib/db/models/holiday-policy-chunk.model";
import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";

export interface PolicyNoteInput {
  topic: string;
  text: string;
}

export interface ReclassificationInput {
  holidayName: string;
  date: string; // ISO yyyy-mm-dd
  note: string;
}

/**
 * Rebuild a year's holiday policy chunks from scratch: the policyNotes
 * array (as given in the enriched upload JSON) plus every holiday that
 * carries a non-null `note` (already persisted on holidayyear rows by the
 * time this runs). Deletes this year's existing chunks first, so re-running
 * (e.g. re-uploading a corrected file) never duplicates.
 */
export async function syncHolidayPolicyChunks(
  year: number,
  policyNotes: PolicyNoteInput[],
  reclassifications: ReclassificationInput[],
): Promise<{ chunksWritten: number }> {
  const d = await getDb();
  const repo = d.getRepository(HolidayPolicyChunk);

  console.log(`🧹 Clearing existing holiday policy chunks for ${year}...`);
  await repo.delete({ year });

  let chunksWritten = 0;

  for (const note of policyNotes) {
    if (!note.text || !note.text.trim()) continue;
    const embedding = await embedChunkText(note.text);
    const chunk = repo.create({
      year,
      sourceType: "policyNote",
      topic: note.topic,
      holidayName: null,
      text: note.text,
      embedding,
    });
    await repo.save(chunk);
    chunksWritten++;
  }

  for (const r of reclassifications) {
    if (!r.note || !r.note.trim()) continue;
    // Synthesized so the chunk reads sensibly in isolation -- the raw note
    // text alone often starts mid-sentence ("One Festival Holiday namely...")
    // without naming which holiday or year it's actually about.
    const synthesized = `${r.holidayName} (${r.date}, ${year}): ${r.note}`;
    const embedding = await embedChunkText(synthesized);
    const chunk = repo.create({
      year,
      sourceType: "reclassification",
      topic: null,
      holidayName: r.holidayName,
      text: synthesized,
      embedding,
    });
    await repo.save(chunk);
    chunksWritten++;
  }

  console.log(`✅ Wrote ${chunksWritten} holiday policy chunks for ${year}.`);
  return { chunksWritten };
}

async function embedChunkText(text: string): Promise<number[]> {
  const raw = await generateEmbedding(text, "search_document");
  return normalizeVector(raw);
}

// ---------------------------------------------------------------------------------------------------------------------
// TRANSACTIONAL VARIANT (used by the Holiday manager). syncHolidayPolicyChunks above deletes and re-inserts on its OWN
// connection while embedding over the network: called inside the manager's transaction it (a) held the tool's global
// write lock during every network call, (b) committed even when the surrounding transaction rolled back, and (c) swallowed
// an embedding failure, leaving the year's chunks deleted or half rewritten while the tool said "ok".
// So: buildPolicyChunkRows embeds everything FIRST (no lock, no transaction; it throws if any embedding fails, so nothing
// is touched), and writePolicyChunkRows then replaces the year's rows inside the caller's transaction.
// ---------------------------------------------------------------------------------------------------------------------

export interface PolicyChunkRow {
  sourceType: "policyNote" | "reclassification";
  topic: string | null;
  holidayName: string | null;
  text: string;
  embedding: number[];
}

export async function buildPolicyChunkRows(
  year: number,
  policyNotes: PolicyNoteInput[],
  reclassifications: ReclassificationInput[],
): Promise<PolicyChunkRow[]> {
  const rows: PolicyChunkRow[] = [];
  for (const note of policyNotes) {
    if (!note.text || !note.text.trim()) continue;
    rows.push({ sourceType: "policyNote", topic: note.topic, holidayName: null, text: note.text, embedding: await embedChunkText(note.text) });
  }
  for (const r of reclassifications) {
    if (!r.note || !r.note.trim()) continue;
    // Synthesized so the chunk reads sensibly in isolation (see syncHolidayPolicyChunks).
    const text = `${r.holidayName} (${r.date}, ${year}): ${r.note}`;
    rows.push({ sourceType: "reclassification", topic: null, holidayName: r.holidayName, text, embedding: await embedChunkText(text) });
  }
  return rows;
}

/** Replace the year's policy chunks with these rows, on the caller's connection (inside its transaction). */
export async function writePolicyChunkRows(
  q: (sql: string, params?: unknown[]) => Promise<any[]>,
  year: number,
  rows: PolicyChunkRow[],
): Promise<number> {
  await q(`DELETE FROM public.holiday_policy_chunks WHERE year = $1`, [year]);
  for (const r of rows) {
    await q(
      `INSERT INTO public.holiday_policy_chunks (year, source_type, topic, holiday_name, text, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)`,
      [year, r.sourceType, r.topic, r.holidayName, r.text, `[${r.embedding.join(",")}]`],
    );
  }
  return rows.length;
}
