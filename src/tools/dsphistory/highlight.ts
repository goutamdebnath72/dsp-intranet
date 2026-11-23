// src/tools/dsphistory/highlight.ts
//
// Where the words of a quote are on a PDF page (pure, no pdf.js in it, so it can be tested): the viewer (PdfPageView.tsx) hands over the page's text pieces with their places, and gets back the rectangles to paint
// behind the quoted words. A manual's text layer cuts a sentence into pieces (a word, half a line, a line) and breaks lines anywhere, so I put both the page and the quote in one plain form first (lower case, straight
// quotes, no spaces at all: a raised "th" of "26th" is a piece of its own, and where a space falls between two pieces is not reliable), look for the quote in the page's text as a whole, and each piece it touches
// gives a rectangle for the part of it that the quote covers (by the width of the text, measured by the caller, or by character count).
// I guess nothing: if the words are not on the page the answer is no rectangles, and the viewer says so.

/** I describe a text piece of the page as the text and the box it fills, in the page as drawn (pixels, top left origin) */
export interface Piece { str: string; x: number; y: number; w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** I give the page's text and the quote the same straight quotes and hyphens */
const straight = (t: string): string => t.replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '"').replace(/[\u2010-\u2015]/g, "-");

/** This is the plain form I compare both the page and the quote in: lower case, straight quotes and hyphens, and no spaces */
export function plain(t: string): string {
  return straight(t).replace(/\s+/g, "").toLowerCase();
}

/** I use the same 2-D matrix product as pdf.js (a b c d e f) */
export const multiply = (m: number[], n: number[]): number[] => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** I turn a pdf.js text item into a piece of the page drawn with the viewport's transform and scale */
export function pieceOf(item: { str: string; transform: number[]; width: number }, viewportTransform: number[], scale: number): Piece {
  const t = multiply(viewportTransform, item.transform);
  const h = Math.hypot(t[2], t[3]);
  return { str: item.str, x: t[4], y: t[5] - h, w: item.width * scale, h };
}

/**
 * The pieces of a page in the order a reader reads them, column by column, when the page has columns: a book page set in two columns is cut by pdf.js line by line across both columns, so a sentence that runs from one line to
 * the next is broken by a line of the other column. I find the columns from the left edges of the long pieces (the lines of a column start at one place; four or more lines starting together make a column); each piece
 * goes to the nearest column edge at or before it, and I read each column from its top to its bottom. A page without two such columns comes back as it was.
 */
export function readingOrder(pieces: readonly Piece[]): Piece[] {
  const pageW = Math.max(1, ...pieces.map((p) => p.x + p.w));
  const xs = pieces.filter((p) => p.w >= 0.2 * pageW && p.str.trim().length > 8).map((p) => p.x).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of xs) { const g = groups[groups.length - 1]; if (g && x - g[g.length - 1] <= 10) g.push(x); else groups.push([x]); }
  const edges = groups.filter((g) => g.length >= 4).map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  if (edges.length < 2) return [...pieces];
  const columnOf = (p: Piece): number => { let c = 0; edges.forEach((e, i) => { if (e <= p.x + 10) c = i; }); return c; };
  return pieces.map((p, i) => ({ p, i, c: columnOf(p) })).sort((a, b) => a.c - b.c || a.p.y - b.p.y || a.p.x - b.p.x || a.i - b.i).map((x) => x.p);
}

/** Gives the rectangles behind every place the quote is written on the page (empty when it is not there): I try the order the pieces came in first and, if it is not found so, reading order (columns) */
export function findQuote(pieces: readonly Piece[], quote: string, measure: (text: string) => number = (t) => t.length): Rect[] {
  const direct = findIn(pieces, quote, measure);
  if (direct.length) return direct;
  const ordered = readingOrder(pieces);
  const byColumn = ordered.some((p, i) => p !== pieces[i]) ? findIn(ordered, quote, measure) : [];
  if (byColumn.length) return byColumn;
  // A stray one-letter piece in the page's text (the book sets a decorative "I" at the start of a line, which its text layer keeps between two words) breaks a sentence that is otherwise there, so I leave such pieces out
  const plainPieces = pieces.filter((p) => p.str.trim().length > 1);
  if (plainPieces.length === pieces.length) return [];
  const a = findIn(plainPieces, quote, measure);
  return a.length ? a : findIn(readingOrder(plainPieces), quote, measure);
}

function findIn(pieces: readonly Piece[], quote: string, measure: (text: string) => number = (t) => t.length): Rect[] {
  const q = plain(quote);
  if (!q) return [];
  // I build the page as one string of plain characters, each remembering the piece and the place in the piece it came from
  let text = "";
  const owner: number[] = [];
  const at: number[] = [];
  const push = (ch: string, piece: number, idx: number) => { text += ch; owner.push(piece); at.push(idx); };
  pieces.forEach((p, pi) => {
    const t = straight(p.str).toLowerCase();
    for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) push(t[i], pi, i);
  });
  const rects: Rect[] = [];
  for (let from = text.indexOf(q); from >= 0; from = text.indexOf(q, from + q.length)) {
    const spans = new Map<number, [number, number]>();
    for (let k = from; k < from + q.length; k++) {
      const pi = owner[k];
      const cur = spans.get(pi);
      if (cur) cur[1] = at[k] + 1; else spans.set(pi, [at[k], at[k] + 1]);
    }
    spans.forEach(([a, b], pi) => {
      // Where inside the piece the quote starts and ends: I work it out in proportion to the width of the text before it and of the text itself (`measure`; the number of characters when not given)
      const p = pieces[pi], whole = Math.max(1e-9, measure(p.str));
      rects.push({ x: p.x + (p.w * measure(p.str.slice(0, a))) / whole, y: p.y, w: (p.w * measure(p.str.slice(a, b))) / whole, h: p.h });
    });
  }
  return rects;
}
