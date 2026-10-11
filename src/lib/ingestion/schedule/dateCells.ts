// src/lib/ingestion/schedule/dateCells.ts
//
// The DATE column of a roster: the rightmost box of the table, cut by horizontal rules into merged cells, one per check-up day. The date is
// printed inside each cell; the cell's top and bottom rules say exactly which rows it covers.
import { clusterLines, findHorizontalLines, findVerticalLines, type Gray, type Line } from "./lines";

export interface Frame {
  /** x of every vertical rule of the table, left to right (left border, column rules, right border) */
  rules: number[];
  top: number;
  bottom: number;
}

/** The table frame: the vertical rules that run (nearly) the whole height of the table. */
export function findFrame(g: Gray): Frame | null {
  const minLen = Math.round(0.06 * g.height);
  const vs = clusterLines(findVerticalLines(g, { minLen, maxGap: 6 }), 8).filter((l) => l.pos > 8 && l.pos < g.width - 8); // (a table can reach almost to the edge; scanner-edge artefacts are short and dropped below)
  if (vs.length < 3) return null;
  // the table is the biggest set of rules that share (about) the same vertical extent
  const longest = Math.max(...vs.map((l) => l.to - l.from));
  const rules = vs.filter((l) => l.to - l.from >= 0.6 * longest);
  if (rules.length < 3) return null;
  return {
    rules: rules.map((l) => l.pos),
    top: Math.min(...rules.map((l) => l.from)),
    bottom: Math.max(...rules.map((l) => l.to)),
  };
}

export interface DateCell {
  y0: number;
  y1: number;
  /** true when the cell is cut by the top or the bottom of the table (it goes on over the page break) */
  openTop: boolean;
  openBottom: boolean;
}

/** The merged cells of the DATE column: the space between two consecutive horizontal rules that cross the whole column. */
export function findDateCells(g: Gray, frame: Frame): { band: { xL: number; xR: number }; cells: DateCell[]; rules: Line[] } | null {
  const n = frame.rules.length;
  if (n < 2) return null;
  const xL = frame.rules[n - 2];
  const xR = frame.rules[n - 1];
  const width = xR - xL;
  if (width < 0.04 * g.width || width > 0.25 * g.width) return null; // not a date-column-sized box
  const margin = Math.max(6, Math.round(0.03 * width));
  const hl = clusterLines(
    findHorizontalLines(g, {
      minLen: Math.round(0.85 * (width - 2 * margin)),
      maxGap: 4,
      windowFrom: Math.round(xL + margin),
      windowTo: Math.round(xR - margin),
      rowFrom: Math.max(0, Math.round(frame.top) - 12),
      rowTo: Math.min(g.height - 1, Math.round(frame.bottom) + 12),
    }),
    10,
  );
  const ys = hl.map((l) => l.pos);
  const edges = [frame.top, ...ys.filter((y) => y > frame.top + 15 && y < frame.bottom - 15), frame.bottom];
  const cells: DateCell[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    cells.push({ y0: edges[i], y1: edges[i + 1], openTop: i === 0 && !hl.some((l) => Math.abs(l.pos - edges[0]) < 15), openBottom: i + 2 === edges.length && !hl.some((l) => Math.abs(l.pos - edges[edges.length - 1]) < 15) });
  }
  return { band: { xL, xR }, cells, rules: hl };
}
