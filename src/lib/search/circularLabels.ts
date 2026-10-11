// src/lib/search/circularLabels.ts
//
// How a reader names a circular: the number the archive shows in its year list ("007"), with the year, since serial numbers restart
// every January: "Circular 007 (2026)". Same three-digit padding as the circulars modal, and the same year rule as the upload
// (the year of the published date, which is what numbers the serial). The database's internal id is never shown to anyone.

export interface QueryClient {
  // TypeORM's DataSource.query returns the rows themselves; node-postgres returns { rows }. Both are accepted.
  query(text: string, params?: unknown[]): Promise<any>;
}

/** "Circular 007 (2026)", or null when the serial or the year is not known (the caller then names the circular by its title). */
export function circularLabel(serial: number | null | undefined, year: number | null | undefined): string | null {
  const s = Number(serial);
  const y = Number(year);
  if (!Number.isInteger(s) || s < 1 || !Number.isInteger(y) || y < 1900) return null;
  return `Circular ${String(s).padStart(3, "0")} (${y})`;
}

/** circular id -> "Circular 007 (2026)". Ids with no serial are simply absent. Never throws: a failed lookup gives an empty map. */
export async function fetchCircularLabels(db: QueryClient, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n)))];
  if (clean.length === 0) return out;
  try {
    const res = await db.query(
      `SELECT id, "serialNumber" AS serial, EXTRACT(YEAR FROM "publishedAt")::int AS year
         FROM public.circulars
        WHERE id = ANY($1::int[])`,
      [clean],
    );
    const rows: Array<{ id: number; serial: number | null; year: number | null }> = Array.isArray(res) ? res : (res?.rows ?? []);
    for (const r of rows) {
      const label = circularLabel(r.serial, r.year);
      if (label) out.set(Number(r.id), label);
    }
  } catch (e) {
    console.warn("fetchCircularLabels failed; sources will be named by title:", (e as any)?.message ?? e);
  }
  return out;
}
