// src/components/inputRows.ts
//
// HOW TALL THE SEARCH BOX IS (my rule, 27 Nov 2026, from the owner). The box has a default height of THREE lines, whatever is typed in it. The room of a window is the room of its result, though: when a result is so long that it
// needs a scroll bar and the choices under the box have gone to make room (useResultRoom.ts), the box is no use at three lines when the question is one line, so it gives the empty lines back: it takes exactly the lines the question
// has (one, two, three ...), up to SIX, after which it scrolls inside. With no such result (the empty window, a prompt, a small answer that fits) it stays at its default, three lines, or the question's own lines when there are more.
// The line count is the number of lines the question really takes in the box, wrapped lines included, so it follows the width of the window and the size of the text.
export const DEFAULT_ROWS = 3;
export const MIN_ROWS = 1;
export const MAX_ROWS = 6;

/** The rows the box shows: its default (three, or the question's lines when more) normally; the question's own lines when the window needs the room. */
export function inputRows(lines: number, compact: boolean): number {
  const n = Math.max(1, Math.round(lines) || 1);
  return compact ? Math.min(MAX_ROWS, Math.max(MIN_ROWS, n)) : Math.min(MAX_ROWS, Math.max(DEFAULT_ROWS, n));
}

/**
 * The number of lines the text really takes in this box, wrapped lines included. I set the rows to one for a moment, read how tall the text is (scrollHeight) and put the rows back before anything is painted, so the box
 * does not flicker. An empty box is one line.
 */
export function countLines(el: HTMLTextAreaElement): number {
  const cs = getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1;
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const rows = el.rows;
  el.rows = 1;
  const height = el.scrollHeight - pad;
  el.rows = rows;
  return Math.max(1, Math.round(height / lineHeight));
}
