// src/lib/nl2sql/paging.ts
//
// "Show more": the list is fetched 100 rows at a time. For pages to be consistent (no one repeated, no one skipped
// between page 1 and page 2) the query needs a TOTAL order. The model's own ORDER BY is kept first (usually seniority,
// which is already unique per person); the position of every selected column is then appended as a final tie-breaker
// (ORDER BY ..., 1, 2, ..., n), so two rows can only be tied when they are identical in every column.
//
// The model's SQL is NEVER rebuilt from its parsed form (that can change what it means): the parser is used only to
// LOOK at the query, and the tie-breaker is inserted into the original text just before its LIMIT / OFFSET (or at the
// end). Returns null when the shape of the query does not allow it (a CTE, a set operation, SELECT *, unparsable): the
// caller then runs the SQL exactly as written and does not offer "Show more".

import { parse } from "pgsql-ast-parser";

/** Rows per page. */
export const PAGE_SIZE = 100;

/** The SQL with the contents of '...' strings and "..." identifiers blanked out, SAME LENGTH, so positions line up. */
function maskKeepingLength(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      out += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            out += "  ";
            i += 2;
            continue;
          }
          out += ch;
          i++;
          break;
        }
        out += " ";
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Where the trailing LIMIT / OFFSET / FETCH of the OUTER query starts (outside any parentheses), or the end. */
function tailStart(masked: string): number {
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /[a-z]/i.test(c) && (i === 0 || /[^a-z0-9_]/i.test(masked[i - 1]))) {
      if (/^(limit|offset|fetch)\b/i.test(masked.slice(i, i + 7))) return i;
    }
  }
  return masked.length;
}

export function stableOrderSql(sql: string): string | null {
  let root: any;
  try {
    root = (parse(sql) as any[])[0];
  } catch {
    return null;
  }
  if (!root || root.type !== "select") return null;
  const cols: any[] = root.columns;
  if (!Array.isArray(cols) || cols.length === 0) return null;
  if (cols.some((c) => c?.expr?.type === "ref" && c.expr.name === "*")) return null;

  const trimmed = sql.replace(/;+\s*$/, "");
  const cut = tailStart(maskKeepingLength(trimmed));
  const head = trimmed.slice(0, cut).trimEnd();
  const tail = trimmed.slice(cut).trim();
  const ordinals = Array.from({ length: cols.length }, (_, i) => String(i + 1)).join(", ");
  const hasOrder = Array.isArray(root.orderBy) && root.orderBy.length > 0;
  return `${head}${hasOrder ? "," : " ORDER BY"} ${ordinals}${tail ? " " + tail : ""}`;
}
