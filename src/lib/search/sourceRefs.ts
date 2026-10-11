// src/lib/search/sourceRefs.ts
//
// The synthesis model is shown each source as "[Circular id=49] Title: ...". That id is the database's internal row number: it means
// nothing to a reader (the archive shows the circular as 007, the document prints 2026/51), yet the model sometimes copies it into
// its own wording ("Corrected amount per Circular 49"). A prompt rule asks it not to; THIS is the guarantee: any reference to a known
// source id is replaced by that circular's archive label ("Circular 007 (2026)": the number the circulars modal shows, plus the year),
// or by its quoted title if the serial number is not known, in every text field, before anything else looks at the output.
//
// Only ids that really are sources of THIS answer are touched. A printed circular number ("Circular No. 2026/51", "Circular 2026/50")
// and an unrelated number ("49 employees", "Circular 5" where 5 is not a source) are left alone.

const MAX_TITLE = 70;

/** A circular named by its title: used only when its serial number and year are not known. */
export function quotedTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  const short = t.length > MAX_TITLE ? t.slice(0, MAX_TITLE - 1).trimEnd() + "\u2026" : t;
  return `"${short}"`;
}

/** id -> the words a reader should see: the circular's label ("Circular 007 (2026)") if known, else its quoted title. */
export function buildSourceNames(
  citations: Array<{ id: number; headline: string }>,
  labels?: Map<number, string>,
): Map<number, string> {
  const names = new Map<number, string>();
  for (const c of citations) names.set(c.id, labels?.get(c.id) ?? quotedTitle(c.headline));
  return names;
}

// An id never starts with 0, so "Circular 007" (a serial number) is NOT read as the id 7 -- this also keeps the clean-up idempotent.
const NUM = String.raw`[1-9]\d{0,5}`;
const LIST = String.raw`${NUM}(?:\s*(?:,|and|&)\s*${NUM})*`;
// "Circular 49", "circular #49", "Circular no. 49", "Circulars 49 and 51", "Circular id=49", "[Circular id=49]", "Circular 49 (2026)"
const REF = new RegExp(String.raw`\[?\bcirculars?\s+(?:#|no\.?\s*|number\s+|id\s*[=:]?\s*)?(${LIST})\b(?!\s*[/.\-]\s*\d)(?:\s*\(\s*(?:19|20)\d\d\s*\))?\]?`, "gi");
// a bare "(id 49)" / "(id=49)" / "(ids: 49, 51)"
const PAREN_ID = new RegExp(String.raw`\s*\(\s*ids?\s*[=:]?\s*(${LIST})\s*\)`, "gi");

export function replaceSourceIds(text: string, names: Map<number, string>): string {
  if (!text || names.size === 0) return text;
  const idsOf = (list: string) => list.split(/\s*(?:,|and|&)\s*/i).map((x) => parseInt(x, 10));

  let out = text.replace(PAREN_ID, (whole, list: string) => (idsOf(list).every((n) => names.has(n)) ? "" : whole));
  out = out.replace(REF, (whole, list: string) => {
    const ids = idsOf(list);
    const known = ids.filter((n) => names.has(n));
    if (known.length === 0) return whole; // not one of our sources: probably a real number in the document
    const named = known.map((n) => names.get(n)!);
    const unknown = ids.filter((n) => !names.has(n));
    return named.join(" and ") + (unknown.length ? ` and ${unknown.join(", ")}` : "");
  });
  return out.replace(/ {2,}/g, " ").replace(/ +([.,;:])/g, "$1");
}

/** Every string in a result, however deeply nested, goes through replaceSourceIds. Numbers (the real source ids in `sources`) are untouched. */
export function sanitizeSourceRefs<T>(value: T, names: Map<number, string>): T {
  if (typeof value === "string") return replaceSourceIds(value, names) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeSourceRefs(v, names)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeSourceRefs(v, names);
    return out as T;
  }
  return value;
}
