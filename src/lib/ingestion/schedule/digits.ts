// src/lib/ingestion/schedule/digits.ts
//
// A number on a roster page (a ticket, a department code) is read three ways -- the cell cut out on its own and enlarged, the column as a strip, and
// the page as a whole -- and they do not always agree: the checking of 1,015 real rows found each of them wrong now and then (mostly "1" read as "4",
// "9" read as "2"), and wrong in different rows. The readings vote; the readings that lost are kept as ALTERNATIVES, for the HR directory to judge.

/** A department code: 3-5 digits. A sixth digit in front of five is a ruled line read as a "1": dropped. */
export function cleanCode(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (/^\d{3,5}$/.test(digits)) return digits;
  if (digits.length === 6 && digits[0] === "1") return digits.slice(1);
  return null;
}

export interface Vote {
  value: string | null;
  /** the other valid readings that differ from the winner */
  alts: string[];
}

/**
 * The readings in order of trust (best first), `null` for one that was missing or malformed. The most common reading wins; on a tie the one that
 * comes first wins. The others that differ are returned as alternatives.
 */
export function voteDigits(readings: Array<string | null | undefined>): Vote {
  const valid = readings.filter((r): r is string => !!r);
  if (valid.length === 0) return { value: null, alts: [] };
  const count = new Map<string, number>();
  for (const r of valid) count.set(r, (count.get(r) ?? 0) + 1);
  let best = valid[0];
  for (const r of valid) if ((count.get(r) ?? 0) > (count.get(best) ?? 0)) best = r;
  return { value: best, alts: [...new Set(valid.filter((r) => r !== best))] };
}
