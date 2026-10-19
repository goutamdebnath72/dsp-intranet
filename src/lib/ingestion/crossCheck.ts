// src/lib/ingestion/crossCheck.ts
//
// THE LANGUAGES OF ONE CIRCULAR CHECK EACH OTHER (step 40a, made trilingual in step 42a). A circular of this plant comes in English and Hindi, and
// sometimes in Bengali too: the pages say the same thing with the same numbers and dates. OCR reads each page on its own, so when two pages have the
// same number it is read twice, independently: that is a second reading, free, offline, and it works on the text already stored. When one page has a
// number that another page has a little differently (seen: `20-0802` on the Hindi page and `20-08-2026` on the English page; `(215,000)` for
// `(Rs 15,000)`, the rupee sign read as a 2), at least one reading is wrong.
//
// WHAT IS FOUND. Pages are put in a GROUP when they are in different scripts (English, Hindi, Bengali) and have the same important numbers (at least 2 in
// common and at least half of their union). A group holds 2 or 3 pages: English + Hindi, English + Bengali, English + Hindi + Bengali (Hindi and Bengali
// pages join through the English page when they do not share enough numbers with each other). In a group:
//   - a number that stands on this page AND on another page of the group is CONFIRMED (two independent readings);
//   - a number on this page only that is a little different (one or two digits) from a number another page has and this page lacks is a DISAGREEMENT:
//     one page against one (`20.0802` on the Hindi page, `20.08.2026` on the English page), or one page against two that agree with each other;
//   - a number on this page only that is a longer form of a number this page has elsewhere and another page confirms is a VARIANT (`215000` next to
//     `15000`: a stray digit in front);
//   - any other number on one page only is a SINGLE: nothing is concluded about it.
//
// WHAT IS RECORDED (the checks of the answer card's gate, circularAnswer.ts, which REFUSES an answer whose value holds an unconfirmed number): the
// confirmed numbers of each page, and as UNCONFIRMED only the readings the evidence points at: both sides of a disagreement between one page and one other
// page (at least one of them is wrong and nothing says which), the lone page when two pages agree against it, and a variant. The owner's rule is that an
// honest "not found" is better than a confident wrong answer, so neither side is trusted by its language (English-page OCR does read numbers far better
// than Hindi or Bengali OCR: in the first archive report almost all the garbage was on the Indic pages; set TRUST_ENGLISH to true to keep a lone English
// reading in a one-against-one disagreement). A second reading that confirms a number lifts it again (combineChecks). A single is never marked: a number
// that stands on one page only is often right.
//
// Pure; unit-tested by crossCheck.selftest.ts.

import { storedPageTexts, type NewCheck, type NewCheckRow } from "../search/pageChecks";
import { isMajor, numberContext, numbersOf } from "./readingCheck";

export interface PageText {
  page: number;
  text: string;
}

export type Script = "latin" | "devanagari" | "bengali" | "mixed" | "none";

const LANGUAGE: Record<string, string> = { latin: "English", devanagari: "Hindi", bengali: "Bengali" };
const LANGUAGE_ORDER = ["latin", "devanagari", "bengali"];

/** The script a page is mainly written in; "mixed" when neither the Indic scripts nor Latin dominate, "none" when there is too little text to say. */
export function scriptOf(text: string): Script {
  const t = String(text ?? "");
  const dev = (t.match(/[\u0900-\u097F]/g) ?? []).length;
  const ben = (t.match(/[\u0980-\u09FF]/g) ?? []).length;
  const lat = (t.match(/[A-Za-z]/g) ?? []).length;
  if (dev + ben + lat < 40) return "none";
  const indicShare = (dev + ben) / (dev + ben + lat);
  if (indicShare <= 0.2) return "latin";
  if (indicShare < 0.5) return "mixed";
  return ben > dev ? "bengali" : "devanagari";
}

/** The important numbers of a page (4 or more digits, or one with a point), in one canonical form. What a second reader wrote in [handwritten: ...] is not part of the page. */
export function majorNumbers(text: string): Set<string> {
  return new Set([...numbersOf(text, false)].filter(isMajor));
}

/** Not worth concluding about when it stands on one page only: a clause number (2.3, 4.91) or a bare year of our time (written 2025 on one page and JAN-25 on the other). */
const isNoise = (n: string) => /^\d{1,2}\.\d{1,2}$/.test(n) || /^(199\d|20[0-3]\d)$/.test(n);
const digitsOf = (n: string) => n.replace(/\D/g, "");

/** Edit distance between two digit strings (insert, delete, change one digit). */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const MIN_SHARED = 2;
export const MIN_OVERLAP = 0.5;
export const TWIN_READER = "twin-pages";
/** false (the owner's rule: honest "not found" over a confident wrong answer): in a disagreement between one page and one other page, both readings are unconfirmed. true: an English reading is kept. */
export const TRUST_ENGLISH = false;

export interface Side {
  page: number;
  script: Script;
  value: string;
  context: string;
}
export interface Disagreement {
  /** The page whose number differs from a number the other pages have. */
  a: Side;
  /** One of the pages that have the other number. */
  b: Side;
  /** How many pages have the other number (1: page against page; 2: page against two that agree). */
  support: number;
}
export interface Variant extends Side {
  /** The number this one is a longer form of. */
  base: string;
}
export interface Group {
  pages: { page: number; script: Script }[];
  /** e.g. "English + Hindi + Bengali". */
  languages: string;
  /** Per page: its important numbers that stand on another page of the group too. */
  confirmed: Record<number, string[]>;
  disagreements: Disagreement[];
  variants: Variant[];
  singles: Side[];
}

interface Info {
  page: number;
  text: string;
  script: Script;
  nums: Set<string>;
}

/** Pages with the same important numbers in different scripts, joined into groups (a page joins through any page it matches). */
function groupPages(pages: PageText[]): Info[][] {
  const info: Info[] = pages.map((p) => ({ page: p.page, text: p.text, script: scriptOf(p.text), nums: majorNumbers(p.text) }));
  const usable = info.filter((p) => p.script === "latin" || p.script === "devanagari" || p.script === "bengali");
  const parent = new Map<number, number>(usable.map((p) => [p.page, p.page]));
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r) as number; return r; };
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j];
      if (a.script === b.script) continue;
      const shared = [...a.nums].filter((n) => b.nums.has(n)).length;
      const union = new Set([...a.nums, ...b.nums]).size;
      if (union === 0 || shared < MIN_SHARED || shared / union < MIN_OVERLAP) continue;
      parent.set(find(a.page), find(b.page));
    }
  }
  const byRoot = new Map<number, Info[]>();
  for (const p of usable) { const r = find(p.page); byRoot.set(r, [...(byRoot.get(r) ?? []), p]); }
  return [...byRoot.values()].filter((g) => g.length >= 2).map((g) => g.sort((x, y) => x.page - y.page)).sort((x, y) => x[0].page - y[0].page);
}

/** `215000` is a longer form of `15000`: the same digits with one to three stray digits in front. */
const isLongerForm = (n: string, base: string) => {
  const dn = digitsOf(n), db = digitsOf(base);
  return db.length >= 4 && dn.length > db.length && dn.length - db.length <= 3 && dn.endsWith(db);
};

const languagesOf = (scripts: Script[]) =>
  LANGUAGE_ORDER.filter((s) => scripts.includes(s as Script)).map((s) => LANGUAGE[s]).join(" + ");

/** Cross-checks every group of pages of one circular. */
export function crossCheck(pages: PageText[]): Group[] {
  return groupPages(pages).map((g) => {
    const text = new Map(g.map((p) => [p.page, p.text]));
    const confirmed: Record<number, string[]> = {};
    const only = new Map<number, string[]>();
    for (const p of g) {
      const others = g.filter((q) => q.page !== p.page);
      confirmed[p.page] = [...p.nums].filter((n) => others.some((q) => q.nums.has(n)));
      only.set(p.page, [...p.nums].filter((n) => !confirmed[p.page].includes(n) && !isNoise(n)));
    }
    const scriptOfPage = new Map(g.map((p) => [p.page, p.script]));
    const side = (page: number, value: string): Side => ({ page, script: scriptOfPage.get(page) as Script, value, context: numberContext(text.get(page) ?? "", value) ?? "" });

    // disagreements: a number on this page only against the numbers the other pages have and this page lacks
    const disagreements: Disagreement[] = [];
    const used = new Set<string>(); // "page:value"
    for (const x of g) {
      for (const n of only.get(x.page) ?? []) {
        if (used.has(`${x.page}:${n}`)) continue;
        const dn = digitsOf(n);
        let best: { m: string; d: number; holders: Info[] } | null = null;
        for (const m of new Set(g.filter((q) => q.page !== x.page).flatMap((q) => [...q.nums]))) {
          if (x.nums.has(m) || isNoise(m)) continue;
          const dm = digitsOf(m);
          if (Math.min(dn.length, dm.length) < 3) continue;
          const d = editDistance(dn, dm);
          const holders = g.filter((q) => q.page !== x.page && q.nums.has(m));
          if (d < 3 && (!best || d < best.d || (d === best.d && holders.length > best.holders.length))) best = { m, d, holders };
        }
        if (!best) continue;
        const holder = best.holders[0];
        used.add(`${x.page}:${n}`);
        if (best.holders.length === 1 && (only.get(holder.page) ?? []).includes(best.m)) used.add(`${holder.page}:${best.m}`); // page against page: found once
        disagreements.push({ a: side(x.page, n), b: side(holder.page, best.m), support: best.holders.length });
      }
    }
    // variants: a number on one page only that is a longer form of a number the page has elsewhere and another page confirms
    const variants: Variant[] = [];
    for (const p of g) {
      for (const n of only.get(p.page) ?? []) {
        if (used.has(`${p.page}:${n}`)) continue;
        const base = confirmed[p.page].find((m) => isLongerForm(n, m));
        if (base) { used.add(`${p.page}:${n}`); variants.push({ ...side(p.page, n), base }); }
      }
    }
    const singles: Side[] = [];
    for (const p of g) for (const n of only.get(p.page) ?? []) if (!used.has(`${p.page}:${n}`)) singles.push(side(p.page, n));

    const scripts = g.map((p) => p.script);
    return { pages: g.map((p) => ({ page: p.page, script: p.script })), languages: languagesOf(scripts), confirmed, disagreements, variants, singles };
  });
}

// ------------------------------------------------------------------------------------------------ the checks the answer card's gate uses

/** What the groups record per page: the confirmed numbers, and as unconfirmed only a non-English side of a disagreement and a non-English variant. */
export function twinChecks(groups: Group[]): NewCheck[] {
  const out: NewCheck[] = [];
  for (const g of groups) {
    for (const p of g.pages) {
      const confirmed = g.confirmed[p.page] ?? [];
      const unconfirmed = new Set<string>();
      for (const d of g.disagreements) {
        // two other pages agree against this one: this one is the odd one out. One page against one: nothing says which is wrong, so both.
        const trusted = (s: Side) => TRUST_ENGLISH && s.script === "latin";
        if (d.a.page === p.page && (d.support >= 2 || !trusted(d.a))) unconfirmed.add(d.a.value);
        if (d.support === 1 && d.b.page === p.page && !trusted(d.b)) unconfirmed.add(d.b.value);
      }
      for (const v of g.variants) if (v.page === p.page && v.script !== "latin") unconfirmed.add(v.value);
      const un = [...unconfirmed].filter((n) => !confirmed.includes(n));
      if (!confirmed.length && !un.length) continue;
      out.push({ page: p.page, status: "twin", confirmed, unconfirmed: un, secondOnly: [], reader: TWIN_READER });
    }
  }
  return out.sort((a, b) => a.page - b.page);
}

/** The twin checks of a circular from its stored chunks (the same input as checkRowsFor). */
export function twinChecksFor(chunks: { page: number | null; index: number; text: string }[]): NewCheck[] {
  const pages = [...storedPageTexts(chunks)].map(([page, text]) => ({ page, text }));
  return twinChecks(crossCheck(pages));
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

/** The second reading's checks and the twin checks of the same circular as one set: a page's confirmed numbers are those either one confirmed; a number is unconfirmed only if neither confirmed it. */
export function combineChecks(second: NewCheck[], twin: NewCheck[]): NewCheck[] {
  const by = new Map<number, NewCheck>(second.map((c) => [c.page, c]));
  for (const t of twin) {
    const s = by.get(t.page);
    if (!s) { by.set(t.page, t); continue; }
    const confirmed = union(s.confirmed, t.confirmed);
    by.set(t.page, {
      page: t.page,
      status: s.status,
      confirmed,
      unconfirmed: union(s.unconfirmed, t.unconfirmed).filter((n) => !confirmed.includes(n)),
      secondOnly: s.secondOnly,
      reader: s.reader.includes(TWIN_READER) ? s.reader : `${s.reader}+${TWIN_READER}`,
    });
  }
  return [...by.values()].sort((a, b) => a.page - b.page);
}

export interface StoredCheck {
  page: number;
  status: string;
  confirmed: string[];
  unconfirmed: string[];
  secondOnly: string[];
  reader: string;
  textHash: string;
}

/** For the archive: a twin check merged into what is already stored for the page. A stored check about OTHER text (its fingerprint differs) is replaced, never kept. */
export function mergeIntoStored(existing: StoredCheck | null, twin: NewCheck, textHash: string): NewCheckRow {
  const fresh = existing && existing.textHash === textHash ? existing : null;
  if (!fresh) return { ...twin, textHash };
  const [merged] = combineChecks([{ page: fresh.page, status: fresh.status, confirmed: fresh.confirmed, unconfirmed: fresh.unconfirmed, secondOnly: fresh.secondOnly, reader: fresh.reader }], [twin]);
  return { ...merged, textHash };
}

// ------------------------------------------------------------------------------------------------ the report

export interface CircularFindings {
  id: number;
  serial: number | null;
  headline: string;
  pages: number;
  groups: Group[];
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}\u2026` : s);
const langOf = (s: Script) => LANGUAGE[s] ?? s;

/** Counts over a whole archive, and what recording the twin checks would do. */
export function summarize(items: CircularFindings[]) {
  const groups = items.flatMap((item) => item.groups.map((group) => ({ item, group })));
  const byLanguages = new Map<string, number>();
  for (const { group } of groups) byLanguages.set(group.languages, (byLanguages.get(group.languages) ?? 0) + 1);
  const flagged = groups.filter(({ group }) => group.disagreements.length > 0 || group.variants.length > 0);
  const clean = groups.filter(({ group }) => group.disagreements.length === 0 && group.variants.length === 0 && group.singles.length === 0);
  const checks = items.flatMap((item) => twinChecks(item.groups));
  return {
    circulars: items.length,
    withTwoPages: items.filter((i) => i.pages >= 2).length,
    groups: groups.length,
    byLanguages: [...byLanguages].sort((a, b) => b[1] - a[1]),
    clean: clean.length,
    flagged,
    pagesRecorded: checks.length,
    numbersConfirmed: checks.reduce((n, c) => n + c.confirmed.length, 0),
    numbersUnconfirmed: checks.reduce((n, c) => n + c.unconfirmed.length, 0),
  };
}

const ctx = (s: Side) => `...${cut(s.context, 80)}...`;
const where = (s: Side) => `${langOf(s.script)} page ${s.page}`;

/** The report as Markdown: the readings that disagree or look garbled first (they are what gets recorded as unconfirmed), then the numbers on one page only. */
export function renderReport(items: CircularFindings[]): string {
  const s = summarize(items);
  const out: string[] = [
    "# English / Hindi / Bengali cross-check of the archive",
    "",
    `Circulars read: ${s.circulars} | with two or more pages: ${s.withTwoPages} | groups of pages that say the same thing in different scripts: ${s.groups}`,
    ...s.byLanguages.map(([l, n]) => `- ${l}: ${n}`),
    `- groups where every important number stands on more than one page: ${s.clean}`,
    `- **groups with a reading that disagrees with another page, or a garbled longer form of a number: ${s.flagged.length}**`,
    "",
    `What recording the checks would do: ${s.pagesRecorded} pages get a check, ${s.numbersConfirmed} numbers are recorded as confirmed (two readings agree), ${s.numbersUnconfirmed} readings are recorded as unconfirmed (the answer card then refuses an answer that rests on them).`,
    "",
  ];
  if (s.flagged.length) {
    out.push("## Readings that disagree with another page, or look garbled", "");
    for (const { item, group: g } of s.flagged) {
      out.push(`### Circular ${item.id}${item.serial != null ? ` (serial ${item.serial})` : ""}: ${cut(item.headline, 90)}`, `${g.languages}: pages ${g.pages.map((p) => `${p.page} (${langOf(p.script)})`).join(", ")}`);
      for (const d of g.disagreements) out.push(`- ${where(d.a)} \`${d.a.value}\` ${ctx(d.a)} against ${where(d.b)} \`${d.b.value}\` ${ctx(d.b)}`);
      for (const v of g.variants) out.push(`- ${where(v)} \`${v.value}\` ${ctx(v)} is a longer form of \`${v.base}\``);
      out.push("");
    }
  }
  const withSingles = items.flatMap((item) => item.groups.filter((g) => g.singles.length > 0).map((group) => ({ item, group })));
  if (withSingles.length) {
    out.push("## Numbers that stand on one page only (nothing is recorded for them)", "");
    for (const { item, group: g } of withSingles) {
      out.push(`### Circular ${item.id}${item.serial != null ? ` (serial ${item.serial})` : ""}: ${cut(item.headline, 90)}`, `${g.languages}`);
      const english = g.singles.filter((x) => x.script === "latin"), other = g.singles.filter((x) => x.script !== "latin");
      for (const x of english) out.push(`- only on the ${where(x)}: \`${x.value}\` ${ctx(x)}`);
      if (other.length) out.push(`- only on the Hindi or Bengali pages (mostly garbled digits or details the English page leaves out): ${other.map((x) => `\`${x.value}\` (${langOf(x.script)} p.${x.page})`).join(", ")}`);
      out.push("");
    }
  }
  return out.join("\n");
}
