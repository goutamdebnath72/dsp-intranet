// src/lib/search/issuerFinding.ts
//
// "THROUGH WHOM": when the question asks who issues, approves or sanctions something and the table has a column for it, the key findings must say it too (prompt rule WHO ISSUES,
// APPROVES OR SANCTIONS). The model sometimes leaves the table to say it alone (the Zero Tolerance answer, 11 Nov 2026: a full "Issued through" column and two findings that never
// mention it). This is the plain-code backstop: ONE finding built from the cells of that column, in their own words, and only when the findings do not already name them.
// Pure: no I/O, no model. Nothing is added when the question does not ask, when there is no such column, or when the findings already say it.

import type { SynthesisTable } from "./executiveSynthesis";

/** The question asks who does it: "through whom", "by whom", "who issues / approves / sanctions", "which authority", "issued by". */
const ASKS_WHO = /\b(?:through\s+whom|by\s+whom|who\s+(?:issues?|approves?|sanctions?|signs?|imposes?|authori[sz]es?)|which\s+(?:authority|officer|department)|(?:issued|approved|sanctioned|imposed)\s+(?:by|through))\b/i;
/** The column that holds it. */
const WHO_COLUMN = /\b(?:issued\s+(?:through|by)|issuing\s+authority|approved\s+by|approving\s+authority|sanctioned\s+by|sanctioning\s+authority|imposed\s+by|through\s+whom|by\s+whom|authority)\b/i;
const NOT_NAMED = /^(?:not\s+(?:applicable|permitted|allowed|stated)|n\/?a|nil|none|-|—)/i;

const norm = (s: string) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clip = (s: string) => (s || "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");

export function issuerColumn(table: SynthesisTable): number {
  return table.columns.findIndex((c, i) => i > 0 && WHO_COLUMN.test(c || ""));
}

/** One finding that says who issues, from the table's own column, or null. `findings` are the texts already written: nothing is added when they already name every issuer. */
export function describeIssuers(table: SynthesisTable | null | undefined, query: string, findings: string[]): { text: string; sources: number[] } | null {
  if (!table || !ASKS_WHO.test(query || "")) return null;
  const col = issuerColumn(table);
  if (col < 0 || table.rows.length === 0) return null;
  const header = clip(table.columns[col]);
  const total = table.rows.length;

  const groups = new Map<string, { value: string; labels: string[] }>();
  let unnamed = 0;
  for (const row of table.rows) {
    const cell = clip(row[col] ?? "");
    if (!cell || NOT_NAMED.test(cell)) { unnamed++; continue; }
    const g = groups.get(norm(cell)) ?? { value: cell, labels: [] };
    g.labels.push(clip(row[0] ?? ""));
    groups.set(norm(cell), g);
  }

  const said = norm(findings.join(" "));
  if (groups.size > 0 && [...groups.values()].every((g) => said.includes(norm(g.value)))) return null; // the findings already name them
  if (groups.size === 0 && /\b(?:no(?:t)?\s+(?:one|issuer|authority|stated|named)|names?\s+no|not\s+(?:stated|named))\b/i.test(findings.join(" "))) return null;

  const sources = table.sources ?? [];
  if (groups.size === 0) {
    return { text: `Who issues it: the circular names no one in the table's "${header}" column, for any of its ${total} row${total === 1 ? "" : "s"}.`, sources };
  }
  const parts = [...groups.values()].map((g) => {
    const n = g.labels.length;
    if (n === total) return `"${g.value}" for every row`;
    const named = n <= 3 ? ` (${g.labels.map((l) => `"${l}"`).join("; ")})` : "";
    return `"${g.value}" for ${n} of the ${total} rows${named}`;
  });
  const rest = unnamed > 0 ? ` For the other ${unnamed} row${unnamed === 1 ? "" : "s"} the circular names no one.` : "";
  return { text: `Who issues it, from the table's "${header}" column: ${parts.join("; ")}.${rest}`, sources };
}
