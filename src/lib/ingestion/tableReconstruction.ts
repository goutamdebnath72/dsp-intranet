// src/lib/ingestion/tableReconstruction.ts
//
// Reconstructs table structure from Tesseract's TSV word-position output,
// instead of relying only on its flattened reading-order `text` output.
//
// WHY THIS EXISTS: the OCR route (src/app/api/circulars/route.ts) only ever
// kept `data.text` from Tesseract's recognize() call -- a single flattened
// string in reading order. For a table with a merged, multi-line-wrapped
// header cell, Tesseract's own internal layout analysis can read that
// header's fragments in an order that does NOT match the column order of
// the data rows below it. This produced a real, confirmed error: a
// synthesis query reported a MONTHLY wage total (Rs 20,995.30) as if it
// were the DAILY wage (the real daily figure, Rs 808, sat in the very next
// column, correctly recognized, just mislabeled by the flattened reading
// order).
//
// THE FIX: request Tesseract's TSV output (already computed internally on
// every OCR pass, just never extracted before), which gives the pixel
// position of every recognized word. From that:
//   1. Detect genuine table ROWS by finding unusually large horizontal gaps
//      between words (real cell boundaries), calibrated relative to the
//      page's own median text height so it adapts to different scan
//      resolutions/font sizes rather than using a fixed pixel constant.
//   2. Detect COLUMN boundaries from the gap positions themselves (not raw
//      word start positions) -- a boundary between two columns sits in
//      roughly the same place on every row regardless of how many words
//      fill the cell on either side of it. This is what makes variable-
//      width text cells (e.g. a holiday-name column holding anything from
//      "Holi" to "Makar Sankranti / Magha Bihu / Pongal") reconstruct
//      correctly, where an earlier, simpler approach (clustering raw word
//      positions) broke down.
//   3. Classify each row as header-like or data-like by CONTENT (mostly
//      non-numeric vs mostly numeric), not by which row happens to have the
//      most cells -- a fragmented, wrapped header can otherwise outrank a
//      clean data row and get mistaken for one.
//   4. Serialize each data row as explicit "Header: Value" pairs, so the
//      header a number belongs to is stated immediately next to it in the
//      stored text -- removing the ambiguity that caused the original
//      error.
//
// VALIDATED (Stage 6/7 session) against real scanned circulars from this
// corpus, end to end -- OCR run for real, not simulated:
//   - The actual wage-rate table that caused the reported bug: correctly
//     recovers "TOTAL: 20995.30" and "Daily Wages...: 808" as distinct,
//     correctly-labeled fields.
//   - A pure-prose circular (no tables): correctly detects NO table --
//     zero false positives.
//   - The holiday Restricted-Holiday list (29 rows, variable-length text
//     cells like "Makar Sankranti /Magha Bihu" vs "Holi"): every row
//     reconstructs with the right value under the right semantic column
//     (SL. No / Holiday / Date / Day never cross into each other). One
//     disclosed cosmetic residual: a handful of multi-word holiday names
//     occasionally split across an extra adjacent field instead of staying
//     in one (e.g. "Makar Sankranti /Magha" + a separate "Bihu" field)
//     rather than one clean field -- never wrong, never crosses into the
//     Date or Day column, just not always fully merged into a single field.
//
// KNOWN, DISCLOSED LIMITATION NOT FIXED BY THIS ALGORITHM -- found by
// deliberately testing against a bilingual table (a GPAIS premium schedule
// with Hindi row/column labels and Latin numerals), not discovered later in
// production: neither OCR language pass alone reads this table's content
// cleanly enough to reconstruct with confidence. The English-only pass
// reads the numbers correctly but cannot read the Devanagari labels at all
// (they come through as unrelated noise); the trilingual pass reads the
// labels but corrupts the numbers themselves (e.g. "131.25" was recognized
// as "B12"). This is a genuine OCR RECOGNITION quality problem on that
// specific document, not a structural/column-detection problem -- no
// amount of position-clustering logic recovers a number OCR read
// incorrectly in the first place. Solving this properly needs a different
// approach in kind, not degree (most likely a vision-capable model reading
// the rasterized page image directly, immune to OCR's row/column-
// flattening entirely) -- intentionally not attempted here rather than
// shipping an unvalidated cross-language merge heuristic on top of data
// already shown to be too noisy to trust.
//
// SAFETY: this function is used ADDITIVELY in the OCR route -- the
// original flattened `text` is never replaced or altered. When a table is
// confidently detected, a `[TABLE]...[/TABLE]` block is appended alongside
// the untouched original text. If detection ever misfires on a table shape
// it wasn't built for (like the bilingual case above, where it correctly
// returns null rather than guessing), the worst case is no additional
// block -- never a regression of something that currently works.

interface Word {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
}

function parseTSV(tsv: string): Word[] {
  const lines = tsv.split("\n").filter(Boolean);
  return lines
    .slice(1) // header row
    .map((l) => {
      const c = l.split("\t");
      return {
        level: Number(c[0]),
        left: Number(c[6]),
        top: Number(c[7]),
        width: Number(c[8]),
        height: Number(c[9]),
        text: c[11] ?? "",
      };
    })
    .filter((w) => w.level === 5 && w.text && w.text.trim().length > 0)
    .map(({ left, top, width, height, text }) => ({ left, top, width, height, text }));
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Cluster a list of numbers into groups where consecutive (sorted) values
 *  are within `gap` of each other. Returns arrays of original indices. */
function clusterByGap(values: number[], gap: number): number[][] {
  if (values.length === 0) return [];
  const order = values.map((v, i): [number, number] => [v, i]).sort((a, b) => a[0] - b[0]);
  const clusters: number[][] = [];
  let cur: number[] = [order[0][1]];
  for (let i = 1; i < order.length; i++) {
    if (order[i][0] - order[i - 1][0] <= gap) cur.push(order[i][1]);
    else {
      clusters.push(cur);
      cur = [order[i][1]];
    }
  }
  clusters.push(cur);
  return clusters;
}

function groupIntoRows(words: Word[], rowGap = 8): Word[][] {
  const clusters = clusterByGap(
    words.map((w) => w.top),
    rowGap,
  );
  return clusters
    .map((idxs) => idxs.map((i) => words[i]).sort((a, b) => a.left - b.left))
    .sort((a, b) => a[0].top - b[0].top);
}

interface GapInfo {
  mid: number;
  size: number;
}

/** The large horizontal gaps within one row -- each one is a candidate cell
 *  boundary. `mid` is the x-position midway between the two words the gap
 *  separates. */
function bigGapsInRow(row: Word[], bigGap: number): GapInfo[] {
  const gaps: GapInfo[] = [];
  for (let i = 1; i < row.length; i++) {
    const g = row[i].left - (row[i - 1].left + row[i - 1].width);
    if (g >= bigGap) {
      gaps.push({ mid: (row[i].left + (row[i - 1].left + row[i - 1].width)) / 2, size: g });
    }
  }
  return gaps;
}

/** Does this row look like a table row (cells visually separated), as
 *  opposed to a line of flowing prose? Uses an ABSOLUTE count of large
 *  gaps, not a ratio -- a table cell can hold several words (e.g. "Makar
 *  Sankranti / Magha Bihu" as one holiday-name cell), which would fail a
 *  ratio test even though the row is genuinely tabular; what matters is
 *  that a couple of real cell BOUNDARIES exist in the row. */
function isTabularRow(row: Word[], bigGap: number, minCells: number, minBigGaps = 2): boolean {
  if (row.length < minCells) return false;
  return bigGapsInRow(row, bigGap).length >= minBigGaps;
}

function looksNumeric(text: string): boolean {
  // Tolerant of OCR punctuation noise around a number: "20995.30]",
  // "808,", "1750.00)", "0.00]" all count as numeric-looking.
  return /^[[(]?\d[\d.,]*[\])]?[.,]?$/.test(text);
}

export interface ReconstructedTable {
  firstRowIndex: number;
  lastRowIndex: number;
  headers: string[];
  dataRows: string[][];
}

function reconstructTable(
  rows: Word[][],
  opts: { bigGap: number; minCells?: number; boundaryTolerance?: number; minRunLength?: number },
): ReconstructedTable | null {
  const { bigGap } = opts;
  const minCells = opts.minCells ?? 4;
  const boundaryTolerance = opts.boundaryTolerance ?? 40;
  const minRunLength = opts.minRunLength ?? 2;

  const tabularFlags = rows.map((r) => isTabularRow(r, bigGap, minCells));

  // Find the longest run of consecutive tabular rows, tolerating a single
  // non-tabular row bridging two table rows (e.g. a rule/blank line).
  const runs: number[][] = [];
  let run: number[] = [];
  let gapUsed = false;
  for (let i = 0; i < rows.length; i++) {
    if (tabularFlags[i]) {
      run.push(i);
      gapUsed = false;
    } else if (run.length > 0 && !gapUsed) {
      gapUsed = true;
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
      gapUsed = false;
    }
  }
  if (run.length > 0) runs.push(run);

  const best = runs
    .map((r) => r.filter((i) => tabularFlags[i]))
    .filter((r) => r.length >= minRunLength)
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;

  const runRows = best.map((i) => rows[i]);

  // BOUNDARY-based columns: collect every big-gap midpoint from every row in
  // the run and cluster THOSE (not raw word positions) into agreed column
  // boundaries. A boundary between two columns sits in roughly the same
  // place regardless of how many words fill the cell to either side of it
  // -- this is what makes variable-length cells (unlike the fixed
  // single-token cells of a pure numeric table) reconstruct correctly.
  const allBoundaries = runRows.flatMap((r) => bigGapsInRow(r, bigGap).map((g) => g.mid));
  const boundaryClusters = clusterByGap(allBoundaries, boundaryTolerance);
  const boundaries = boundaryClusters
    .map((idxs) => idxs.reduce((s, i) => s + allBoundaries[i], 0) / idxs.length)
    .sort((a, b) => a - b);

  const edges = [-Infinity, ...boundaries, Infinity];
  const numCols = edges.length - 1;
  function colOf(x: number): number {
    for (let c = 0; c < numCols; c++) {
      if (x >= edges[c] && x < edges[c + 1]) return c;
    }
    return numCols - 1;
  }

  const table: string[][] = runRows.map((r) => {
    const cols: string[][] = Array.from({ length: numCols }, () => []);
    for (const w of r) cols[colOf(w.left)].push(w.text);
    return cols.map((toks) => toks.join(" ").trim());
  });

  // Classify each row as header-like (mostly non-numeric) or data-like
  // (mostly numeric-looking) by CONTENT -- a fragmented, wrapped header can
  // otherwise have more cells than a clean data row and get mistaken for
  // one if picked purely by cell count.
  const rowIsData = runRows.map((r) => {
    const numericCount = r.filter((w) => looksNumeric(w.text)).length;
    return numericCount / r.length >= 0.5;
  });

  const firstDataIdx = rowIsData.indexOf(true);
  const headerRowRange =
    firstDataIdx === -1 ? [] : Array.from({ length: firstDataIdx }, (_, i) => i);

  const headers = Array(numCols).fill("");
  for (const i of headerRowRange) {
    for (let c = 0; c < numCols; c++) {
      if (table[i][c]) headers[c] = (headers[c] + " " + table[i][c]).trim();
    }
  }

  const dataRows = firstDataIdx === -1 ? table : table.slice(firstDataIdx);

  return {
    firstRowIndex: best[0],
    lastRowIndex: best[best.length - 1],
    headers,
    dataRows,
  };
}

function serializeTable(t: ReconstructedTable): string {
  const lines = ["[TABLE]"];
  for (const row of t.dataRows) {
    const parts: string[] = [];
    for (let c = 0; c < t.headers.length; c++) {
      const h = t.headers[c] || `col${c + 1}`;
      const v = row[c] || "";
      if (v) parts.push(`${h}: ${v}`);
    }
    if (parts.length > 0) lines.push(parts.join(" | "));
  }
  lines.push("[/TABLE]");
  return lines.join("\n");
}

/**
 * Given Tesseract's TSV output for one page, detect the single strongest
 * table region (if any) and return its serialized
 * "[TABLE] Header: Value | Header: Value ..." form, or null if nothing
 * confidently table-shaped was found (a pure-prose page, or a table this
 * algorithm isn't built for -- see the module-level comment for the one
 * known case, bilingual Hindi-label/Latin-number tables). Never throws --
 * a malformed/empty TSV just yields null.
 */
export function reconstructTableFromTSV(tsv: string): string | null {
  if (!tsv || !tsv.trim()) return null;
  try {
    const words = parseTSV(tsv);
    if (words.length === 0) return null;
    const heights = words.map((w) => w.height).filter((h) => h > 0);
    const medianHeight = median(heights) || 12;
    // Empirically calibrated against real scanned circulars in this corpus:
    // ordinary prose word-spacing runs ~0.3-0.6x the text height; genuine
    // table-cell separation runs ~2.5-7x the text height. 1.8x sits
    // cleanly between the two on every page tested so far.
    const bigGap = medianHeight * 1.8;
    const rows = groupIntoRows(words);
    const table = reconstructTable(rows, { bigGap });
    return table ? serializeTable(table) : null;
  } catch {
    // Reconstruction is a best-effort ADDITION to the OCR text, never a
    // replacement -- a failure here must never break or block the upload.
    return null;
  }
}
