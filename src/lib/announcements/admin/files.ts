// src/lib/announcements/admin/files.ts
//
// THE DATABASE SIDE OF AN ANNOUNCEMENT'S PDF (the table public.announcement_file, src/lib/nl2sql/sql/28_announcement_file.sql). I wrap every READ here in a savepoint, so that a database where the table
// has not been created yet (the SQL file not run, and nobody has attached a PDF) simply has no files, and the announcements themselves are untouched. Postgres aborts a whole transaction at the first failed
// statement; the savepoint is what keeps one missing table from taking the list of announcements down with it.

import type { QueryFn } from "@/lib/facility/types";
import type { AnnouncementFileInfo } from "../attachment";

/** A file as the database holds it. Use `url` on the server only. */
export interface StoredFile extends AnnouncementFileInfo {
  url: string;
}

/** I run `fn` so that its failure leaves the transaction usable; it returns what `fn` returned, or `null` if it failed. */
export async function tryInSavepoint<T>(q: QueryFn, fn: () => Promise<T>): Promise<T | null> {
  await q("SAVEPOINT announcement_file_try");
  try {
    const out = await fn();
    await q("RELEASE SAVEPOINT announcement_file_try");
    return out;
  } catch {
    await q("ROLLBACK TO SAVEPOINT announcement_file_try");
    return null;
  }
}

/** Creates the table if it is not there (the first PDF ever attached). If the database user is not allowed to, I let the error go up and the route says to run the SQL file. */
export async function ensureFileTable(q: QueryFn): Promise<void> {
  await q(
    `CREATE TABLE IF NOT EXISTS public.announcement_file (
       announcement_id integer PRIMARY KEY REFERENCES public.announcement(id) ON DELETE CASCADE,
       url text NOT NULL,
       name varchar(255) NOT NULL,
       bytes integer NOT NULL CHECK (bytes > 0),
       uploaded_at timestamptz NOT NULL DEFAULT now(),
       uploaded_by varchar(20) NOT NULL
     )`,
  );
}

/** Returns the file of one announcement, address included, or null (none, or no table yet). */
export async function fileOf(q: QueryFn, id: number): Promise<StoredFile | null> {
  const rows = await tryInSavepoint(q, () => q(`SELECT url, name, bytes FROM public.announcement_file WHERE announcement_id = $1`, [id]));
  const r = rows?.[0];
  return r ? { url: String(r.url), name: String(r.name), bytes: Number(r.bytes) } : null;
}

/** Returns the name and size of the files of these announcements, by announcement id. I never return the address here. */
export async function filesOf(q: QueryFn, ids: number[]): Promise<Map<number, AnnouncementFileInfo>> {
  const out = new Map<number, AnnouncementFileInfo>();
  if (ids.length === 0) return out;
  const rows = await tryInSavepoint(q, () => q(`SELECT announcement_id, name, bytes FROM public.announcement_file WHERE announcement_id = ANY($1::int[])`, [ids]));
  for (const r of rows ?? []) out.set(Number(r.announcement_id), { name: String(r.name), bytes: Number(r.bytes) });
  return out;
}

/** I save the file of an announcement here, replacing the one it had. */
export async function saveFile(q: QueryFn, id: number, f: StoredFile, ticket: string): Promise<void> {
  await q(
    `INSERT INTO public.announcement_file (announcement_id, url, name, bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (announcement_id) DO UPDATE
        SET url = EXCLUDED.url, name = EXCLUDED.name, bytes = EXCLUDED.bytes, uploaded_at = now(), uploaded_by = EXCLUDED.uploaded_by`,
    [id, f.url, f.name, f.bytes, ticket],
  );
}

/** Removes the row of an announcement's file. The PDF in Blob is deleted by the caller, after the commit, not here. */
export async function dropFile(q: QueryFn, id: number): Promise<void> {
  await tryInSavepoint(q, () => q(`DELETE FROM public.announcement_file WHERE announcement_id = $1`, [id]));
}
