// src/lib/holidays/format.ts
//
// Pure text helpers for holiday answers. No database or model imports, so they are trivially testable.

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
