/**
 * What a second reader said about the numbers of a circular's pages, for the answer card (the gate in circularAnswer.ts).
 *
 * The check script (scripts/check-readings.ts --save) stores, per page, the numbers both readings had ("confirmed") and the numbers only the
 * pipeline had ("unconfirmed"), together with a FINGERPRINT of the page text it checked. A check is used only while the stored page text still
 * has that fingerprint: if the circular is re-read later, its check is stale and is ignored, so a check can never vouch for text it did not see.
 */
import { createHash } from "node:crypto";
import type { PageChecks } from "./circularAnswer";

/** The page text as it is compared and fingerprinted: whitespace collapsed. */
export const normPageText = (s: string): string => String(s ?? "").replace(/\s+/g, " ").trim();

export function pageTextHash(text: string): string {
  return createHash("sha1").update(normPageText(text)).digest("hex");
}

/** The stored text of each page: its chunks in order, joined with a space (the chunks were cut from the whitespace-collapsed page text). */
export function storedPageTexts(chunks: { page: number | null; index: number; text: string }[]): Map<number, string> {
  const by = new Map<number, string[]>();
  for (const c of [...chunks].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.index - b.index)) {
    if (c.page == null) continue;
    by.set(c.page, [...(by.get(c.page) ?? []), c.text]);
  }
  return new Map([...by].map(([pg, texts]) => [pg, texts.join(" ")]));
}

export interface CheckRow {
  page_number: number;
  confirmed: string[] | null;
  unconfirmed: string[] | null;
  text_hash: string;
}

/** The saved checks that are still about the stored text. */
export function freshChecks(rows: CheckRow[], chunks: { page: number | null; index: number; text: string }[]): PageChecks {
  const texts = storedPageTexts(chunks);
  const out: PageChecks = {};
  for (const r of rows) {
    const stored = texts.get(Number(r.page_number));
    if (stored === undefined || pageTextHash(stored) !== r.text_hash) continue;
    out[Number(r.page_number)] = { confirmed: r.confirmed ?? [], unconfirmed: r.unconfirmed ?? [] };
  }
  return out;
}

/**
 * Loads the fresh checks of one circular. Never throws: with no table yet (the SQL was not run) or any database trouble the answer is simply
 * built without a check, exactly as before.
 */
export async function loadPageChecks(
  query: (sql: string, params: unknown[]) => Promise<any[]>,
  circularId: number,
  chunks: { page: number | null; index: number; text: string }[],
): Promise<PageChecks | undefined> {
  try {
    const rows = await query(`SELECT page_number, confirmed, unconfirmed, text_hash FROM circular_page_check WHERE circular_id = $1`, [circularId]);
    const checks = freshChecks(rows as CheckRow[], chunks);
    return Object.keys(checks).length ? checks : undefined;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------------------------------------ checks recorded at UPLOAD (step 39a)
export interface NewCheck {
  page: number;
  status: string;
  confirmed: string[];
  unconfirmed: string[];
  secondOnly: string[];
  reader: string;
}
export type NewCheckRow = NewCheck & { textHash: string };

/** The checks of a new circular with the fingerprint of the text that is really stored for each page (its chunks); a page with no stored text gets no row. */
export function checkRowsFor(checks: NewCheck[], chunks: { page: number | null; index: number; text: string }[]): NewCheckRow[] {
  const texts = storedPageTexts(chunks);
  return checks.flatMap((c) => {
    const stored = texts.get(c.page);
    return stored === undefined ? [] : [{ ...c, textHash: pageTextHash(stored) }];
  });
}

/** Stores the rows (one upsert each). Never throws: a missing table or any database trouble just means the page is not protected, as before. Returns how many were saved. */
export async function savePageChecks(run: (sql: string, params: unknown[]) => Promise<unknown>, circularId: number, rows: NewCheckRow[]): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    try {
      await run(
        `INSERT INTO public.circular_page_check (circular_id, page_number, status, confirmed, unconfirmed, second_only, reader, text_hash, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (circular_id, page_number) DO UPDATE SET status = EXCLUDED.status, confirmed = EXCLUDED.confirmed, unconfirmed = EXCLUDED.unconfirmed,
           second_only = EXCLUDED.second_only, reader = EXCLUDED.reader, text_hash = EXCLUDED.text_hash, checked_at = now()`,
        [circularId, r.page, r.status, r.confirmed, r.unconfirmed, r.secondOnly, r.reader, r.textHash],
      );
      saved++;
    } catch (e) {
      console.warn("UPLOAD: the page checks could not be stored (the circular is saved):", (e as Error)?.message ?? e);
      break;
    }
  }
  return saved;
}
