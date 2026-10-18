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
