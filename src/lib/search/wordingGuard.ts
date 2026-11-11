// src/lib/search/wordingGuard.ts
//
// TWO PLAIN-CODE GUARDS on what the model writes, found on the Zero Tolerance answer (11 Nov 2026), both general:
//
// 1. fixDiscretionIssuers: an authority the circular names only as the holder of a DISCRETION ("... / Discretion of Head of Safety") is not the one who ISSUES. The model put "Head of Safety" in
//    the "Issued through" column and dropped the words "Discretion of". Where every place the circular names that authority is "discretion of <authority>", the issuer cell says "Not stated in
//    circular" and the words go back into the consequence cell (the cell just left of the issuer column), where the circular has them.
// 2. stripUnsupportedForce: "immediately", "automatically", "directly", "instantly" add speed or force the circular did not write ("the penalty is imposed DIRECTLY on the contractor" for "imposed on
//    the contractor"). When the circulars never use the word, it is taken out of a sentence (the rest of the sentence is untouched). A word the circular uses is left alone.
// Pure: no I/O, no model.

import type { SynthesisTable } from "./executiveSynthesis";
import { issuerColumn } from "./issuerFinding";

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
    const authority = cell.replace(/\s*[(\[].*$/, "").trim(); // the name, without a bracket
    const v = flat(authority);
    if (v.length < 3) return row;
    let n = 0, disc = 0;
    for (let at = src.indexOf(v); at >= 0; at = src.indexOf(v, at + v.length)) {
      n++;
      if (/discretion\s+of\s+(?:the\s+)?$/.test(src.slice(Math.max(0, at - 30), at))) disc++;
    }
    if (n === 0 || disc < n) return row; // named somewhere as more than a discretion holder (or not found: not this guard's business)
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
