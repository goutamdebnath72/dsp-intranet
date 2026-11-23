// src/lib/search/edsLayout.ts
//
// When does an Executive Deep Synthesis answer need a WIDER omnibar box? A comparison table of 4 or more columns (the parameter and three
// entities or periods) is cramped in the normal width, so I widen the box while such a table is on the screen and return it to its normal width
// the moment the answer goes (a new query, a typed edit, a closed box, an answer whose tables are narrower). It is a pure function of the answer
// being shown: nothing is remembered, so nothing can stay wide by mistake.

export const WIDE_TABLE_COLUMNS = 4;

interface TableLike {
  columns?: string[] | null;
  rows?: unknown[] | null;
}

/** Returns true when the answer carries at least one table with 4+ columns and at least one row. */
export function needsWideModal(synthesis: { table?: TableLike | null; extraTable?: TableLike | null } | null | undefined): boolean {
  if (!synthesis) return false;
  return [synthesis.table, synthesis.extraTable].some(
    (t) => !!t && (t.columns?.length ?? 0) >= WIDE_TABLE_COLUMNS && (t.rows?.length ?? 0) > 0,
  );
}

/**
 * The same rule for an ANSWER CARD (the hospital card's tables, the table of a model-written or finder answer): I widen the box for 4 or more columns and a row
 *  (my reason, 23 Nov 2026: a weekly OPD schedule of seven columns was cramped). It is a pure function of the answer on screen, so the box narrows again when the answer goes.
 */
export function answerNeedsWideModal(
  analytics: { hospital?: { table?: TableLike | null; extraTables?: { table?: TableLike | null }[] | null } | null; nl2sql?: { table?: TableLike | null } | null } | null | undefined,
): boolean {
  if (!analytics) return false;
  const h = analytics.hospital;
  return needsWideModal({ table: h?.table ?? analytics.nl2sql?.table ?? null }) || (h?.extraTables ?? []).some((x) => needsWideModal({ table: x.table })) || needsWideModal({ table: analytics.nl2sql?.table ?? null });
}
