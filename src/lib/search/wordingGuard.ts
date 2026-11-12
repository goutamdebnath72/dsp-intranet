// src/lib/search/wordingGuard.ts
//
// TWO PLAIN-CODE GUARDS on what the model writes, found on the Zero Tolerance answer (11 Nov 2026), both general:
//
// 1. fixDiscretionIssuers: an authority the circular names only as the holder of a DISCRETION ("... / Discretion of Head of Safety") is not the one who ISSUES. The model put "Head of Safety" in
//    the "Issued through" column and dropped the words "Discretion of". Where every place the circular names that authority is "discretion of <authority>", the issuer cell says "Not stated in
//    circular" and the words go back into the consequence cell (the cell just left of the issuer column), where the circular has them.
// 2. stripUnsupportedForce: "immediately", "automatically", "directly", "instantly" add speed or force the circular did not write ("the penalty is imposed DIRECTLY on the contractor" for "imposed on
//    the contractor"). When the circulars never use the word, it is taken out of a sentence (the rest of the sentence is untouched). A word the circular uses is left alone.
// 3. fixItemCount: the overview said "Ten distinct schemes are compared" over a table of twelve (Motivational Award Schemes answer, 11 Nov 2026). A count the text gives for the items the table
//    COMPARES is the table's own row count: said in the table's own noun (its first column's header or its title: "Name of the Scheme" -> "schemes"), only in the plain shapes
//    "<count> <noun> are compared/listed/covered ..." and "compares/lists/covers <count> <noun>". Any other number in the text (grades, rupees, "three for executives") is never touched.
// 4. restoreTruncatedAbbreviations: "900 sq. f." for the circular's "sq. ft." (a model slip, 11 Nov 2026). Two abbreviations in a row whose second is a CUT form of a longer abbreviation that the
//    circulars print after the same first one ("sq. ft.", "Asst. Mgr.", "Dy. Gen.") go back to the circular's form. Only when the circulars never print the cut form, print exactly one
//    longer form, and that form adds at most three letters. Any other text is never touched.
// Pure: no I/O, no model.

import type { SynthesisResult, SynthesisTable } from "./executiveSynthesis";
import { issuerColumn } from "./issuerFinding";
import { stripIdentifierSeparators } from "../ui/identifiers";

const NOT_NAMED = /^(?:not\s+(?:applicable|permitted|allowed|stated)|n\/?a|nil|none|-|—)/i;
const flat = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s: string) => (s || "").replace(/\s+/g, " ").trim();

export interface DiscretionFix { row: string; authority: string }

export function fixDiscretionIssuers(table: SynthesisTable, sourceText: string): { table: SynthesisTable; fixes: DiscretionFix[] } {
  const col = issuerColumn(table);
  if (col < 1) return { table, fixes: [] };
  const src = flat(sourceText);
  const fixes: DiscretionFix[] = [];
  const rows = table.rows.map((row) => {
    const cell = clip(row[col] ?? "");
    if (!cell || NOT_NAMED.test(cell)) return row;
    // the name, without a bracket; a cell that itself reads "Discretion of Head of Safety" (seen live, 11 Nov 2026) names the same holder of a discretion
    const saysDiscretion = /^discretion\s+of\s+(?:the\s+)?/i.test(cell);
    const authority = cell.replace(/^discretion\s+of\s+(?:the\s+)?/i, "").replace(/\s*[(\[].*$/, "").trim();
    const v = flat(authority);
    if (v.length < 3) return row;
    let n = 0, disc = 0;
    for (let at = src.indexOf(v); at >= 0; at = src.indexOf(v, at + v.length)) {
      n++;
      if (/discretion\s+of\s+(?:the\s+)?$/.test(src.slice(Math.max(0, at - 30), at))) disc++;
    }
    if (n === 0 || (disc < n && !saysDiscretion)) return row; // named somewhere as more than a discretion holder (or not found: not this guard's business)
    const out = [...row];
    out[col] = "Not stated in circular";
    const left = col - 1;
    if (left >= 1 && !/discretion\s+of/i.test(out[left] ?? "")) {
      const words = `Discretion of ${authority}`;
      const base = clip(out[left] ?? "");
      out[left] = /\[([^\]]*)\]\s*$/.test(base) ? base.replace(/\[([^\]]*)\]\s*$/, (_m, c) => `[${clip(c) ? `${clip(c)} / ` : ""}${words}]`) : `${base} [${words}]`.trim();
    }
    fixes.push({ row: clip(row[0] ?? ""), authority });
    return out;
  });
  return fixes.length ? { table: { ...table, rows }, fixes } : { table, fixes };
}

/** word → what the circular must contain for the word to be its own */
const FORCE_WORDS: Array<{ word: string; supported: RegExp }> = [
  { word: "immediately", supported: /\bimmediate/i },
  { word: "automatically", supported: /\bautomatic/i },
  { word: "directly", supported: /\bdirectly\b/i },
  { word: "instantly", supported: /\binstant/i },
];

/** Takes out the force words the circulars never use. Returns the text and the words removed. */
export function stripUnsupportedForce(text: string, sourceText: string): { text: string; removed: string[] } {
  let out = text || "";
  const removed: string[] = [];
  for (const { word, supported } of FORCE_WORDS) {
    if (supported.test(sourceText || "")) continue;
    // only in the middle of a sentence: a sentence that STARTS with the word is left as it is (taking it out would need a new capital letter)
    const re = new RegExp(`(?<=\\S)\\s+${word}\\b(?=[\\s,.;:)])`, "gi");
    if (re.test(out)) { out = out.replace(re, ""); removed.push(word); }
  }
  return { text: out.replace(/\s+,/g, ",").replace(/\s{2,}/g, " "), removed };
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const countWord = "(?:" + WORDS.slice(2).join("|") + "|\\d{1,3})";
const ADJ = "(?:(?:distinct|different|separate|individual|various|unique)\\s+)?";
const STOP = new Set(["name", "names", "item", "items", "title", "sl", "sno", "the", "of", "and", "for", "type", "types", "particulars", "details", "description", "no", "dsp", "sail"]);

/** the singular forms of the nouns the table is made of: the first column's header and the title ("Name of the Scheme", "Motivational Award Schemes of DSP" -> scheme, award, motivational). */
function tableNouns(table: SynthesisTable): string[] {
  const words = `${table.columns[0] || ""} ${table.title || ""}`.toLowerCase().match(/\p{L}{4,}/gu) || [];
  return [...new Set(words.map((w) => w.replace(/s$/, "")).filter((w) => !STOP.has(w) && w.length >= 4))];
}

/** Puts the table's row count where the text counts the items compared. Returns the text and the counts changed ("ten -> 12"). */
export function fixItemCount(text: string, table: SynthesisTable | null | undefined): { text: string; changed: string[] } {
  if (!text || !table || table.rows.length < 2) return { text, changed: [] };
  const labels = table.rows.map((r) => flat(r[0] ?? "")).filter(Boolean);
  const n = new Set(labels).size;
  if (n < 2 || n !== labels.length) return { text, changed: [] }; // rows that repeat their first cell are not one item each: not this guard's business
  const nouns = tableNouns(table);
  if (!nouns.length) return { text, changed: [] };
  const noun = `(?:${nouns.map((w) => `${w}s?`).join("|")})`;
  const word = (k: number) => (k <= 20 ? WORDS[k] : String(k));
  const changed: string[] = [];
  const swap = (m: string, pre: string, c: string, rest: string) => {
    const was = /^\d+$/.test(c) ? Number(c) : WORDS.indexOf(c.toLowerCase());
    if (was === n) return m;
    changed.push(`${c} -> ${n}`);
    const w = /^\d+$/.test(c) ? String(n) : word(n);
    return `${pre}${/^[A-Z]/.test(c) ? w[0].toUpperCase() + w.slice(1) : w}${rest}`;
  };
  const shapeA = new RegExp(`(\\b|\\*\\*)(${countWord})(\\s+${ADJ}(?:[\\p{L}-]+\\s+){0,3}?${noun}\\b(?:\\*\\*)?\\s+(?:are|were|have\\s+been)\\s+(?:compared|listed|covered|set\\s+out|detailed|shown|included|presented))`, "giu");
  const shapeB = new RegExp(`(\\b(?:compares|lists|covers|sets\\s+out|details|includes|shows|presents|describes)\\s+(?:all\\s+)?(?:\\*\\*)?)(${countWord})(\\s+${ADJ}(?:[\\p{L}-]+\\s+){0,3}?${noun}\\b)`, "giu");
  const out = text.replace(shapeA, (m, pre, c, rest) => swap(m, pre, c, rest)).replace(shapeB, (m, pre, c, rest) => swap(m, pre, c, rest));
  return { text: out, changed };
}

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One text: a cut abbreviation after another abbreviation put back as the circulars print it. */
export function restoreTruncatedAbbreviations(text: string, sourceText: string): { text: string; changed: string[] } {
  const src = (sourceText || "").toLowerCase().replace(/\s+/g, " ");
  const changed: string[] = [];
  const out = (text || "").replace(/\b([A-Za-z]{1,5}\.)\s+([A-Za-z]{1,3})\./g, (m, a: string, b: string) => {
    const a0 = a.toLowerCase(), b0 = b.toLowerCase();
    if (src.includes(`${a0} ${b0}.`)) return m; // the circulars print it so
    const re = new RegExp(`${escRe(a0)}\\s+(${escRe(b0)}[a-z]{1,3})\\.`, "g");
    const found = new Set<string>();
    for (let x = re.exec(src); x; x = re.exec(src)) found.add(x[1]);
    if (found.size !== 1) return m; // none, or two different longer forms: not sure, so not touched
    const ext = [...found][0];
    const shown = b === b.toUpperCase() && b.length > 1 ? ext.toUpperCase() : b[0] === b[0].toUpperCase() ? ext[0].toUpperCase() + ext.slice(1) : ext;
    changed.push(`${a} ${b}. -> ${a} ${shown}.`);
    return `${a} ${shown}.`;
  });
  return { text: out, changed };
}

/** The briefing with `fix` applied to every text of it (overview, headline, findings, tables, charts). The result is not changed in place. */
export function mapBriefingTexts(r: SynthesisResult, fix: (t: string) => string): SynthesisResult {
  const f = (t: string | undefined): string => fix(t ?? "");
  const fixTable = (t: SynthesisTable | null | undefined): SynthesisTable | null | undefined =>
    t ? { ...t, title: t.title === undefined ? undefined : f(t.title), columns: t.columns.map(f), rows: t.rows.map((row) => row.map(f)) } : t;
  return {
    ...r,
    overview: f(r.overview),
    headline: r.headline === undefined ? undefined : f(r.headline),
    keyFindings: (r.keyFindings ?? []).map((k) => ({ ...k, text: f(k.text) })),
    table: fixTable(r.table),
    extraTable: fixTable(r.extraTable),
    charts: (r.charts ?? []).map((c) => ({
      ...c,
      title: f(c.title),
      subtitle: c.subtitle === undefined ? undefined : f(c.subtitle),
      items: c.items.map((i) => ({ ...i, label: f(i.label), detail: i.detail === undefined ? undefined : f(i.detail) })),
    })),
  };
}

/** Every text of a briefing with cut abbreviations restored. The result is not changed in place. */
export function restoreAllAbbreviations(r: SynthesisResult, sourceText: string): { result: SynthesisResult; changed: string[] } {
  const changed: string[] = [];
  const result = mapBriefingTexts(r, (t) => { const o = restoreTruncatedAbbreviations(t, sourceText); changed.push(...o.changed); return o.text; });
  return { result, changed };
}

/** Every text of a briefing with the separators taken out of identifiers (account, policy, cheque numbers): src/lib/ui/identifiers.ts. The result is not changed in place. */
export function normaliseIdentifiers(r: SynthesisResult): { result: SynthesisResult; changed: string[] } {
  const changed: string[] = [];
  const result = mapBriefingTexts(r, (t) => { const o = stripIdentifierSeparators(t); changed.push(...o.changed); return o.text; });
  return { result, changed };
}

/**
 * "NOT APPLICABLE" IS A CLAIM. A table cell that says a case does not apply says something the circular must say; a case the circular's table merely does not list (an item given for
 * one duration only, a row given for one grade) is "Not stated in circular", not "Not applicable". When the circulars nowhere print "not applicable", "N/A", "not allowed",
 * "not permitted", "nil" or the like, a cell "Not applicable" becomes "Not stated in circular".
 */
export function fixUnprintedNotApplicable(r: SynthesisResult, sourceText: string): { result: SynthesisResult; changed: number } {
  if (/\bnot\s+applicable\b|\bn\/a\b|\bnot\s+(?:allowed|permitted|admissible|eligible|payable|available|entitled|required|applicable)\b|\bnil\b|\bno\s+(?:such|separate)\b/i.test(sourceText)) return { result: r, changed: 0 };
  let changed = 0;
  const fixTable = (t: SynthesisTable | null | undefined): SynthesisTable | null | undefined =>
    t ? { ...t, rows: t.rows.map((row) => row.map((cell, ci) => (ci > 0 && /^\s*(?:not\s+applicable|n\/?a)\.?\s*$/i.test(cell) ? (changed++, "Not stated in circular") : cell))) } : t;
  const result = { ...r, table: fixTable(r.table) ?? r.table, extraTable: fixTable(r.extraTable) ?? r.extraTable };
  return { result: changed ? result : r, changed };
}
