// src/lib/ingestion/schedule/rosterRows.ts
//
// The employee rows of a roster page, from the OCR'd WORDS and the table's own vertical rules (the column boundaries), in the page's
// straightened frame: a word belongs to the column whose rules enclose its centre, and to the row whose height it shares.

export interface Word {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
}

/** Words from tesseract's TSV (level 5 = a word). */
export function wordsFromTsv(tsv: string): Word[] {
  const out: Word[] = [];
  for (const line of (tsv || "").split("\n")) {
    const c = line.split("\t");
    if (c[0] !== "5" || c.length < 12) continue;
    const text = c.slice(11).join("\t").trim();
    if (!text) continue;
    out.push({ text, left: +c[6], top: +c[7], width: +c[8], height: +c[9], conf: +c[10] });
  }
  return out;
}

/**
 * A word that crosses a column rule belongs to two columns ("343275|NIRANJAN" = a ticket, a rule and a first name). It is cut at the rule: at the
 * "|" the OCR read there, or, when there is none, at the character that sits closest to the rule.
 */
export function splitAtRules(words: Word[], rules: number[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const cuts = rules.filter((x) => x > w.left + 0.12 * w.width && x < w.left + 0.88 * w.width && w.width > 20);
    if (cuts.length === 0 || w.text.length < 3) { out.push(w); continue; }
    let rest = w;
    for (const x of cuts) {
      const t = rest.text;
      let at = t.search(/[|!\\\/]/);
      let skip = 1;
      if (at <= 0 || at >= t.length - 1) { at = Math.round((t.length * (x - rest.left)) / rest.width); skip = 0; }
      if (at <= 0 || at >= t.length) break;
      const leftW = Math.max(1, Math.round((rest.width * at) / t.length));
      out.push({ ...rest, text: t.slice(0, at), width: leftW });
      rest = { ...rest, text: t.slice(at + skip), left: rest.left + leftW, width: Math.max(1, rest.width - leftW) };
    }
    out.push(rest);
  }
  return out.filter(keepWord);
}

/**
 * A word made only of punctuation is usually a rule mark ("|", "[", "!") and is dropped; but "&" and a lone "-" or "/" are part of department names
 * ("CO & CC (BATTERY)", "OPRN - ZONE II") and are kept (a hyphen left over at the start or end of a cell is trimmed later).
 */
export function keepWord(w: Word): boolean {
  return /[A-Za-z0-9]/.test(w.text) || /^[&\-\/]$/.test(w.text.trim());
}

export interface RosterRow {
  /** vertical centre of the row (straightened page, pixels) */
  y: number;
  /** other readings of a number cell that lost the vote (column -> readings), for the HR directory to judge */
  alt?: Record<number, string[]>;
  /** the text of each column, left to right (same count as the table's columns) */
  cells: string[];
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Rows of the table region. `rules` are the x of the vertical rules (left border ... right border); the columns are the spaces between them.
 * Words outside the table, rule artefacts ("|", "[") and empty cells are tolerated.
 */
export function rowsFromWords(words: Word[], rules: number[], top: number, bottom: number): RosterRow[] {
  const inside = splitAtRules(words, rules).filter((w) => {
    const cy = w.top + w.height / 2;
    const cx = w.left + w.width / 2;
    return cy > top && cy < bottom && cx > rules[0] && cx < rules[rules.length - 1] && keepWord(w);
  });
  if (inside.length === 0) return [];
  const mh = median(inside.map((w) => w.height));
  // rows: words whose vertical centres are close share a row
  const sorted = [...inside].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2));
  const groups: Word[][] = [];
  for (const w of sorted) {
    const cy = w.top + w.height / 2;
    const g = groups[groups.length - 1];
    if (g && cy - median(g.map((x) => x.top + x.height / 2)) <= 0.6 * mh) g.push(w);
    else groups.push([w]);
  }
  const ncol = rules.length - 1;
  const rows: RosterRow[] = [];
  for (const g of groups) {
    const cells: string[][] = Array.from({ length: ncol }, () => []);
    for (const w of [...g].sort((a, b) => a.left - b.left)) {
      const cx = w.left + w.width / 2;
      let c = ncol - 1;
      for (let i = 0; i < ncol; i++) if (cx < rules[i + 1]) { c = i; break; }
      cells[c].push(w.text);
    }
    rows.push({ y: median(g.map((x) => x.top + x.height / 2)), cells: cells.map((t) => t.join(" ").replace(/\s+/g, " ").replace(/^[\s&\-\/]+|[\s\-\/]+$/g, "").trim()) });
  }
  return rows;
}

/**
 * The page-wide OCR sometimes drops the narrow numeric columns (serial number, department code). They are therefore also read on their own, as a
 * strip holding only that column and only digits, and what that strip read is put into the rows: each word goes to the row whose height it shares.
 * A reading is used only when `accept` says it has the right shape (a ticket has 6 digits ...); otherwise the page-wide reading stays.
 * With `onlyFill`, the strip is used only where the page-wide reading is missing or has the wrong shape.
 * Returns how many rows got a new value for the column.
 */
/** Which text of a column strip belongs to which row: row index -> the digits read at that row's height (words far from every row are ignored). */
export function assignStripWords(rows: RosterRow[], words: Array<{ text: string; cy: number }>): Map<number, string> {
  const out = new Map<number, string>();
  if (rows.length === 0 || words.length === 0) return out;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i].y - rows[i - 1].y);
  const pitch = gaps.length ? median(gaps.filter((g) => g > 5)) || median(gaps) : 40;
  const perRow = new Map<number, Array<{ text: string; cy: number }>>();
  for (const w of words) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i].y - w.cy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > 0.6 * pitch) continue;
    if (!perRow.has(best)) perRow.set(best, []);
    perRow.get(best)!.push(w);
  }
  for (const [i, ws] of perRow) out.set(i, ws.sort((a, b) => a.cy - b.cy).map((w) => w.text.replace(/\D/g, "")).join(""));
  return out;
}

export function overlayColumn(rows: RosterRow[], col: number, words: Array<{ text: string; cy: number }>, accept: (t: string) => boolean, onlyFill = false): number {
  if (rows.length === 0 || words.length === 0) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i].y - rows[i - 1].y);
  const pitch = gaps.length ? median(gaps.filter((g) => g > 5)) || median(gaps) : 40;
  const perRow = new Map<number, Array<{ text: string; cy: number }>>();
  for (const w of words) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i].y - w.cy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > 0.6 * pitch) continue;
    if (!perRow.has(best)) perRow.set(best, []);
    perRow.get(best)!.push(w);
  }
  let changed = 0;
  for (const [i, ws] of perRow) {
    const text = ws.sort((a, b) => a.cy - b.cy).map((w) => w.text.replace(/\D/g, "")).join("");
    if (!text || !accept(text) || rows[i].cells[col] === text) continue;
    // onlyFill: the page-wide reading is kept when it already has the right shape; the strip only fills what is missing or malformed
    if (onlyFill && accept((rows[i].cells[col] ?? "").replace(/\D/g, ""))) continue;
    rows[i].cells[col] = text;
    changed++;
  }
  return changed;
}
