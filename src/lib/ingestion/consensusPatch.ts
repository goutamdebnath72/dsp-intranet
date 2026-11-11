// src/lib/ingestion/consensusPatch.ts
//
// CONSENSUS PATCHING of a stored page text. The stored text of a page (read by the pipeline's OCR) is compared, word by word, with the readings of
// two OTHER independent readers of the same page image (Gemini Pro and Gemini Flash). A word of the stored text is replaced ONLY when BOTH other readers
// propose the same replacement for the same place, and only for a token that carries a digit (a number, date, amount, phone, id or clause number): a word the
// readers spell differently is reported, never changed (a model may silently correct a typo that is really in the original, and the original must stay as printed).
// Pure functions, no I/O: every rule is testable (consensusPatch.selftest.ts).

export interface Tok {
  raw: string;
  pre: string;
  core: string;
  suf: string;
  start: number;
  end: number;
  norm: string;
  content: boolean;
}

const PRE = /^[\s"“”‘’'(\[{<*_|]+/u;
const SUF = /[\s"“”‘’')\]}>*_|,;:.!?/\-–]+$/u;

export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const pre = (raw.match(PRE) ?? [""])[0];
    const rest = raw.slice(pre.length);
    const suf = (rest.match(SUF) ?? [""])[0];
    const core = rest.slice(0, rest.length - suf.length);
    out.push({ raw, pre, core, suf, start: m.index, end: m.index + raw.length, norm: core.normalize("NFC").toLowerCase(), content: /[\p{L}\p{N}]/u.test(core) });
  }
  return out;
}

export const hasDigit = (s: string) => /\d/.test(s);
export const digitsOf = (s: string) => s.replace(/\D/g, "");

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export interface Hunk { i1: number; i2: number; j1: number; j2: number }

/** The non-equal regions between two token arrays (longest common subsequence). */
export function diffHunks(A: string[], B: string[]): Hunk[] {
  let lo = 0;
  while (lo < A.length && lo < B.length && A[lo] === B[lo]) lo++;
  let ea = A.length, eb = B.length;
  while (ea > lo && eb > lo && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const a = A.slice(lo, ea), b = B.slice(lo, eb);
  const n = a.length, m = b.length;
  if (!n && !m) return [];
  if (!n || !m) return [{ i1: lo, i2: lo + n, j1: lo, j2: lo + m }];
  const W = m + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const hunks: Hunk[] = [];
  let i = 0, j = 0, hi = -1, hj = -1;
  const flush = () => { if (hi >= 0) { hunks.push({ i1: lo + hi, i2: lo + i, j1: lo + hj, j2: lo + j }); hi = -1; hj = -1; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; continue; }
    if (hi < 0) { hi = i; hj = j; }
    if (j >= m || (i < n && dp[(i + 1) * W + j] >= dp[i * W + j + 1])) i++; else j++;
  }
  flush();
  return hunks;
}

export interface Patch {
  kind: "replace" | "insert";
  /** char offsets in the page text (replace: [start,end) is replaced; insert: text goes at start) */
  start: number;
  end: number;
  from: string;
  to: string;
}

const CLAUSE = /^\d{1,2}\.\d{1,2}$/;

/** The local-hunk rule: small, digit-bearing, and the same in every reader. */
function candidates(S: Tok[], sIdx: number[], reader: string): Map<string, { h: Hunk; rep: Tok[] }> {
  const R = tokenize(reader).filter((t) => t.content);
  const hunks = diffHunks(sIdx.map((k) => S[k].norm), R.map((t) => t.norm));
  const out = new Map<string, { h: Hunk; rep: Tok[] }>();
  for (const h of hunks) {
    const rep = R.slice(h.j1, h.j2);
    if (h.i2 - h.i1 > 3 || rep.length > 3 || !rep.length) continue; // only small replace/insert hunks (a deletion is never patched)
    out.set(`${h.i1}:${h.i2}|${rep.map((t) => t.norm).join(" ")}`, { h, rep });
  }
  return out;
}

export interface PatchPlan {
  patches: Patch[];
  /** hunks the readers did not settle between them, or that are words: reported, never applied */
  unsettled: Array<{ stored: string; readers: string[]; start?: number; end?: number; candidates?: string[] }>;
}

export function proposePatches(stored: string, readers: string[]): PatchPlan {
  const S = tokenize(stored);
  const sIdx = S.map((t, k) => (t.content ? k : -1)).filter((k) => k >= 0);
  const per = readers.map((r) => candidates(S, sIdx, r));
  const patches: Patch[] = [];
  const unsettled: PatchPlan["unsettled"] = [];
  const seen = new Set<string>();
  for (const key of new Set(per.flatMap((m) => [...m.keys()]))) {
    const agree = per.filter((m) => m.has(key)).length;
    const first = per.find((m) => m.has(key))!.get(key)!;
    const { h, rep } = first;
    const sTok = sIdx.slice(h.i1, h.i2).map((k) => S[k]);
    const storedText = sTok.map((t) => t.core).join(" ");
    const repText = rep.map((t) => t.core).join(" ");
    const digitBearing = hasDigit(storedText) || hasDigit(repText);
    // the DIGITS are what matters: a difference of spacing, dash type, a superscript ordinal ("22nd" / "22ⁿᵈ") or punctuation is cosmetic, not an error
    if (digitsOf(storedText) === digitsOf(repText)) continue;
    if (agree < readers.length || readers.length < 2 || !digitBearing) {
      if (storedText !== repText && digitBearing) {
        const item: PatchPlan["unsettled"][number] = { stored: storedText, readers: per.map((m) => (m.has(key) ? repText : "(other)")) };
        if (h.i2 > h.i1) {
          const f0 = sTok[0], l0 = sTok[sTok.length - 1], lr = rep[rep.length - 1];
          const suf0 = lr.suf.length > l0.suf.length && lr.suf.startsWith(l0.suf) ? lr.suf : l0.suf;
          item.start = f0.start; item.end = l0.end; item.candidates = [f0.pre + repText + suf0];
        }
        unsettled.push(item);
      }
      continue;
    }
    if (h.i1 === h.i2) {
      // an insertion: only a clause-style number (e.g. "5.0"), at an anchor both readers agree on
      if (!rep.every((t) => CLAUSE.test(t.core)) || h.i1 >= sIdx.length) continue;
      const anchor = S[sIdx[h.i1]];
      patches.push({ kind: "insert", start: anchor.start, end: anchor.start, from: "", to: rep.map((t) => t.core).join(" ") + " " });
    } else {
      if (!hasDigit(repText)) continue; // never turn a number into a word
      const limit = Math.max(3, Math.ceil(0.6 * Math.max(storedText.length, repText.length)));
      if (lev(storedText, repText) > limit) { unsettled.push({ stored: storedText, readers: [repText, repText] }); continue; }
      const first0 = sTok[0], last0 = sTok[sTok.length - 1], lastR = rep[rep.length - 1];
      const suf = lastR.suf.length > last0.suf.length && lastR.suf.startsWith(last0.suf) ? lastR.suf : last0.suf;
      const to = first0.pre + repText + suf;
      const from = stored.slice(first0.start, last0.end);
      if (from === to) continue;
      patches.push({ kind: "replace", start: first0.start, end: last0.end, from, to });
    }
  }
  const unique = patches.filter((p) => { const k = `${p.kind}:${p.start}:${p.end}:${p.to}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // overlapping patches are not applied (neither is trusted)
  unique.sort((a, b) => a.start - b.start || a.end - b.end);
  const clean: Patch[] = [];
  for (const p of unique) {
    const prev = clean[clean.length - 1];
    if (prev && p.start < prev.end) { unsettled.push({ stored: `${prev.from} / ${p.from}`, readers: ["overlapping patches"] }); clean.pop(); continue; }
    clean.push(p);
  }
  return { patches: clean, unsettled };
}

/** Applies patches (offsets in the page text) to the page text. */
export function applyToText(text: string, patches: Patch[]): string {
  let out = text;
  for (const p of [...patches].sort((a, b) => b.start - a.start)) out = out.slice(0, p.start) + p.to + out.slice(p.end);
  return out;
}

/**
 * The page text is its chunks joined with one space. Applies page-level patches to the chunks; a patch that crosses a chunk boundary is refused
 * (returned in `refused`). Returns the new chunk texts in the same order.
 */
export function applyToChunks(chunks: string[], patches: Patch[]): { chunks: string[]; refused: Patch[] } {
  const starts: number[] = [];
  let off = 0;
  for (const c of chunks) { starts.push(off); off += c.length + 1; }
  const refused: Patch[] = [];
  const perChunk: Patch[][] = chunks.map(() => []);
  for (const p of patches) {
    let k = starts.length - 1;
    while (k > 0 && starts[k] > p.start) k--;
    const lo = starts[k], hi = lo + chunks[k].length;
    if (p.start < lo || p.end > hi) { refused.push(p); continue; }
    perChunk[k].push({ ...p, start: p.start - lo, end: p.end - lo });
  }
  return { chunks: chunks.map((c, k) => applyToText(c, perChunk[k])), refused };
}

export interface Coverage {
  digitTokens: number;
  confirmed: number;
  /** digit tokens of the stored text that NEITHER reader has */
  unconfirmed: string[];
  /** digit tokens that BOTH readers have and the stored text lacks */
  missing: string[];
  words: number;
  wordsConfirmed: number;
}

export function coverage(stored: string, readers: string[]): Coverage {
  const S = tokenize(stored).filter((t) => t.content);
  const sets = readers.map((r) => new Set(tokenize(r).filter((t) => t.content).map((t) => t.norm)));
  const inAny = (n: string) => sets.some((s) => s.has(n));
  const digit = S.filter((t) => hasDigit(t.core));
  const word = S.filter((t) => !hasDigit(t.core));
  const storedSet = new Set(S.map((t) => t.norm));
  const both = sets.length ? [...sets[0]].filter((n) => hasDigit(n) && sets.every((s) => s.has(n))) : [];
  return {
    digitTokens: digit.length,
    confirmed: digit.filter((t) => inAny(t.norm)).length,
    unconfirmed: [...new Set(digit.filter((t) => !inAny(t.norm)).map((t) => t.core))],
    missing: both.filter((n) => !storedSet.has(n)),
    words: word.length,
    wordsConfirmed: word.filter((t) => inAny(t.norm)).length,
  };
}
