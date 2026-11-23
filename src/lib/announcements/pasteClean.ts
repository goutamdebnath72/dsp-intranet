// src/lib/announcements/pasteClean.ts
//
// WHAT THE EDITOR DOES TO TEXT PASTED INTO IT: its colour is dropped. Text copied from a web page, a chat window, a document or a PDF carries its own colour (often a pale grey on a dark theme); the editor used to keep
// it, so the body looked dimmed and was saved that way. Bold, italic, underline, paragraphs and line breaks of the pasted text stay; I let the toolbar's swatches alone put the colour on.
// This is pure (no DOM), so it can be tested on the server.

/** Removes the `color` declaration from every style attribute of this HTML. I leave other declarations, such as background-color, because the saving code drops those anyway. An emptied style attribute goes. */
export function stripPastedColours(html: string): string {
  return String(html ?? "").replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) => {
    const kept = String(dq ?? sq ?? "")
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && d.split(":")[0].trim().toLowerCase() !== "color");
    return kept.length ? ` style="${kept.join("; ").replace(/"/g, "&quot;")}"` : "";
  });
}
