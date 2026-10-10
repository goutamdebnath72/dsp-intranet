// src/lib/holidays/format.ts
//
// Pure text helpers for holiday answers. No database or model imports, so they are trivially testable.

import { DateTime } from "luxon";

const VALID = /^[A-D]$/;

/** "A,B" -> "Categories A and B"; "B" -> "Category B"; all four -> "all categories"; empty/invalid -> null. */
export function formatCategoryList(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cats = Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => VALID.test(c)),
    ),
  ).sort();
  if (cats.length === 0) return null;
  if (cats.length === 4) return "all categories";
  if (cats.length === 1) return `Category ${cats[0]}`;
  return `Categories ${cats.slice(0, -1).join(", ")} and ${cats[cats.length - 1]}`;
}

/** "Festival" + "A,B" -> "Festival, Categories A and B". No (valid) categories -> the label unchanged. */
export function labelWithCategories(label: string, categories: string | null | undefined): string {
  const c = formatCategoryList(categories);
  return c ? `${label}, ${c}` : label;
}

/** Distinct, non-empty notes joined into one string with a leading space, or "" when there are none. */
export function notesSuffix(notes: Array<string | null | undefined>): string {
  const uniq = Array.from(new Set(notes.filter((n): n is string => !!n && n.trim().length > 0)));
  return uniq.length ? ` ${uniq.join(" ")}` : "";
}

// ---------------------------------------------------------------------------------------------------
// Structured detail for "when is X" / "is this date a holiday" answers.
// The answer used to be one long sentence (date, type, categories, explanation and a maintainer's side
// remark all run together). The same facts are now returned as data so the screen can lay them out.
// ---------------------------------------------------------------------------------------------------
export interface HolidayDetailEntry {
  date: string; // ISO yyyy-LL-dd
  dateLabel: string; // "23 October 2025"
  weekday: string; // "Thursday"
  type: string; // "CH" | "FH" | "RH"
  typeLabel: string; // "Festival"
  audience: string | null; // "Category B", "Categories A and B", "all categories", or null
}

export interface HolidayDetail {
  name: string;
  aliases: string[];
  entries: HolidayDetailEntry[];
  /** The employee-facing reason (the note without the maintainer's "(Note: ...)" remark), or null. */
  explanation: string | null;
  /** The maintainer's "(Note: ...)" remark about the source document, or null. Shown folded away. */
  sourceNote: string | null;
}

/** Split "reason ... (Note: remark about the source)" into its two parts. */
export function splitNote(note: string | null | undefined): { explanation: string | null; sourceNote: string | null } {
  const n = (note ?? "").trim();
  if (!n) return { explanation: null, sourceNote: null };
  const i = n.search(/\(\s*Note:/i);
  if (i === -1) return { explanation: n, sourceNote: null };
  const before = n.slice(0, i).trim();
  let after = n.slice(i).replace(/^\(\s*Note:\s*/i, "").trim();
  if (after.endsWith(")")) after = after.slice(0, -1).trim();
  return { explanation: before || null, sourceNote: after || null };
}

interface DetailInputRow {
  name: string;
  aliases: string[] | null;
  type: string;
  date: string;
  categories: string | null;
  note: string | null;
}

/** Group rows by holiday name (input order kept) into display-ready details. */
export function buildHolidayDetails(rows: DetailInputRow[], typeLabel: Record<string, string>): HolidayDetail[] {
  const groups = new Map<string, DetailInputRow[]>();
  for (const r of rows) {
    const g = groups.get(r.name);
    if (g) g.push(r);
    else groups.set(r.name, [r]);
  }
  const out: HolidayDetail[] = [];
  for (const [name, g] of groups) {
    const parts = g.map((r) => splitNote(r.note));
    const uniq = (xs: Array<string | null>) => Array.from(new Set(xs.filter((x): x is string => !!x)));
    out.push({
      name,
      aliases: g[0].aliases ?? [],
      entries: g.map((r) => {
        const d = DateTime.fromISO(r.date);
        return {
          date: r.date,
          dateLabel: d.toFormat("d LLLL yyyy"),
          weekday: d.toFormat("cccc"),
          type: r.type,
          typeLabel: typeLabel[r.type] ?? r.type,
          audience: formatCategoryList(r.categories),
        };
      }),
      explanation: uniq(parts.map((p) => p.explanation)).join(" ") || null,
      sourceNote: uniq(parts.map((p) => p.sourceNote)).join(" ") || null,
    });
  }
  return out;
}
