// src/lib/ingestion/crossCheck.ts
//
// THE TWO LANGUAGES OF ONE CIRCULAR CHECK EACH OTHER (step 40a). Most circulars of this plant come as a Hindi page and an English page that say the same
// thing with the same numbers and dates. When OCR reads a number differently on the two pages (seen: the mediclaim deadline, `20-0802` on the Hindi page and
// `20-08-2026` on the English page), at least one reading is wrong, and no external service is needed to see it: the twin page is the second reader.
// Free, offline, and it works on the text already stored.
//
// This module only FINDS: it pairs the pages that are twins and lists the important numbers that stand on one page and not on the other, with the nearest
// numbers paired as probable misreads. It decides nothing and changes nothing. Pure; unit-tested by crossCheck.selftest.ts.

import { pairDisputes, type Dispute } from "./pageVerify";
import { isMajor, numberContext, numbersOf } from "./readingCheck";

export interface PageText {
  page: number;
  text: string;
}

export type Script = "indic" | "latin" | "mixed" | "none";

/** The script a page is mainly written in (Devanagari or Bengali letters against Latin letters); "none" when there is too little text to say. */
export function dominantScript(text: string): Script {
  const indic = (String(text ?? "").match(/[\u0900-\u097F\u0980-\u09FF]/g) ?? []).length;
  const latin = (String(text ?? "").match(/[A-Za-z]/g) ?? []).length;
  if (indic + latin < 40) return "none";
  const share = indic / (indic + latin);
  return share >= 0.5 ? "indic" : share <= 0.2 ? "latin" : "mixed";
}

/** The important numbers of a page (4 or more digits, or one with a point), in canonical form. */
export function majorNumbers(text: string): Set<string> {
  return new Set([...numbersOf(text, true)].filter(isMajor));
}

/** Pages that are twins: one mainly Indic, one mainly Latin, with the same important numbers (at least 2 in common and at least half of the union). */
export const MIN_SHARED = 2;
export const MIN_OVERLAP = 0.5;

export interface Twin {
  indicPage: number;
  latinPage: number;
  shared: number;
  overlap: number;
}

export function findTwins(pages: PageText[]): Twin[] {
  const info = pages.map((p) => ({ ...p, script: dominantScript(p.text), nums: majorNumbers(p.text) }));
  const candidates: Twin[] = [];
  for (const a of info.filter((p) => p.script === "indic")) {
    for (const b of info.filter((p) => p.script === "latin")) {
      const shared = [...a.nums].filter((n) => b.nums.has(n)).length;
      const union = new Set([...a.nums, ...b.nums]).size;
      if (union === 0 || shared < MIN_SHARED || shared / union < MIN_OVERLAP) continue;
      candidates.push({ indicPage: a.page, latinPage: b.page, shared, overlap: Math.round((shared / union) * 100) / 100 });
    }
  }
  // each page belongs to one pair: the best overlaps first
  candidates.sort((x, y) => y.overlap - x.overlap || y.shared - x.shared);
  const usedI = new Set<number>(), usedL = new Set<number>();
  return candidates.filter((c) => (usedI.has(c.indicPage) || usedL.has(c.latinPage) ? false : (usedI.add(c.indicPage), usedL.add(c.latinPage), true)));
}

export interface Finding extends Twin {
  /** The same number read a little differently on the two pages (one or two digits apart): probably one of them is a misreading. */
  disputes: Dispute[];
  /** Important numbers only on the Indic page, and not part of a dispute. */
  onlyIndic: string[];
  /** Important numbers only on the Latin page, and not part of a dispute. */
  onlyLatin: string[];
  /** The words around each of those numbers on its own page, for a person to judge. */
  context: Record<string, string>;
}

/** Cross-checks every twin pair of one circular. */
export function crossCheck(pages: PageText[]): Finding[] {
  const text = new Map(pages.map((p) => [p.page, p.text]));
  return findTwins(pages).map((t) => {
    const a = text.get(t.indicPage) ?? "", b = text.get(t.latinPage) ?? "";
    const na = majorNumbers(a), nb = majorNumbers(b);
    const onlyA = [...na].filter((n) => !nb.has(n)), onlyB = [...nb].filter((n) => !na.has(n));
    // disputes: pairDisputes(pipeline = the Indic page, second = the Latin page)
    const disputes = pairDisputes(onlyA, onlyB, a, b);
    const inA = new Set(disputes.map((d) => d.pipeline)), inB = new Set(disputes.map((d) => d.second));
    // a bare year is written "2025" on one page and "JAN-25" on the other: that is not a disagreement
    const isYear = (n: string) => /^(19|20)\d{2}$/.test(n);
    const onlyIndic = onlyA.filter((n) => !inA.has(n) && !isYear(n)), onlyLatin = onlyB.filter((n) => !inB.has(n) && !isYear(n));
    const context: Record<string, string> = {};
    for (const n of onlyIndic) context[`indic:${n}`] = numberContext(a, n) ?? "";
    for (const n of onlyLatin) context[`latin:${n}`] = numberContext(b, n) ?? "";
    for (const d of disputes) context[`indic:${d.pipeline}`] = numberContext(a, d.pipeline) ?? "";
    return { ...t, disputes, onlyIndic, onlyLatin, context };
  });
}

export interface CircularFindings {
  id: number;
  serial: number | null;
  headline: string;
  pages: number;
  findings: Finding[];
}

/** Counts over a whole archive. A pair is "clean" when every important number is on both pages. */
export function summarize(items: CircularFindings[]) {
  const pairs = items.flatMap((item) => item.findings.map((finding) => ({ item, finding })));
  const disputed = pairs.filter((p) => p.finding.disputes.length > 0);
  const oneSided = pairs.filter((p) => p.finding.disputes.length === 0 && (p.finding.onlyIndic.length > 0 || p.finding.onlyLatin.length > 0));
  return {
    circulars: items.length,
    withTwoPages: items.filter((i) => i.pages >= 2).length,
    pairs: pairs.length,
    clean: pairs.length - disputed.length - oneSided.length,
    disputed,
    oneSided,
  };
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}\u2026` : s);

/** The report as Markdown: the probable misreads first, then the numbers that stand on one page only. */
export function renderReport(items: CircularFindings[]): string {
  const s = summarize(items);
  const out: string[] = [
    "# Hindi / English cross-check of the archive",
    "",
    `Circulars read: ${s.circulars} | with two or more pages: ${s.withTwoPages} | twin pairs found (an Indic page and a Latin page with the same important numbers): ${s.pairs}`,
    `- every important number on both pages: ${s.clean}`,
    `- **a number read differently on the two pages (probably a misreading on one of them): ${s.disputed.length}**`,
    `- numbers that stand on one page only: ${s.oneSided.length}`,
    "",
  ];
  if (s.disputed.length) {
    out.push("## A number read differently on the two pages", "");
    for (const { item, finding: f } of s.disputed) {
      out.push(`### Circular ${item.id}${item.serial != null ? ` (serial ${item.serial})` : ""}: ${cut(item.headline, 90)}`, `Indic page ${f.indicPage}, Latin page ${f.latinPage}, ${f.shared} numbers in common`);
      for (const d of f.disputes) out.push(`- Indic page \`${d.pipeline}\` (...${cut(f.context[`indic:${d.pipeline}`] ?? "", 80)}...) against Latin page \`${d.second}\` (...${cut(d.context, 80)}...)`);
      for (const n of f.onlyIndic) out.push(`- only on the Indic page: \`${n}\` (...${cut(f.context[`indic:${n}`] ?? "", 80)}...)`);
      for (const n of f.onlyLatin) out.push(`- only on the Latin page: \`${n}\` (...${cut(f.context[`latin:${n}`] ?? "", 80)}...)`);
      out.push("");
    }
  }
  if (s.oneSided.length) {
    out.push("## Numbers that stand on one page only", "");
    for (const { item, finding: f } of s.oneSided) {
      out.push(`### Circular ${item.id}${item.serial != null ? ` (serial ${item.serial})` : ""}: ${cut(item.headline, 90)}`, `Indic page ${f.indicPage}, Latin page ${f.latinPage}`);
      for (const n of f.onlyIndic) out.push(`- only on the Indic page: \`${n}\` (...${cut(f.context[`indic:${n}`] ?? "", 80)}...)`);
      for (const n of f.onlyLatin) out.push(`- only on the Latin page: \`${n}\` (...${cut(f.context[`latin:${n}`] ?? "", 80)}...)`);
      out.push("");
    }
  }
  return out.join("\n");
}

