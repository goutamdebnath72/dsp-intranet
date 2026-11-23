// src/lib/announcements/palette.ts
//
// THE TEXT COLOURS OF AN ANNOUNCEMENT: the five swatches of the editor's toolbar (src/components/RichTextEditor.tsx) and, the same list, the only colours the saving code keeps (src/lib/announcements/contentProcessing.ts).
// I keep one list, so that what the toolbar can paint and what is allowed to be stored cannot drift apart. A colour that is not here (the pale grey that text copied from a web page, a chat or a document carries with it) is
// never saved or shown: it made an announcement's body look dimmed.

export const TEXT_COLOURS: ReadonlyArray<{ name: string; value: string }> = [
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Amber", value: "#d97706" },
  { name: "Purple", value: "#7c3aed" },
];

/** I build the patterns (for sanitize-html) that match exactly the palette: each colour as the editor writes it (#rrggbb) and as the browser gives it back when a saved announcement is opened for editing (rgb(r, g, b)). */
export function paletteColourPatterns(): RegExp[] {
  return TEXT_COLOURS.flatMap(({ value }) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    return [new RegExp(`^${value}$`, "i"), new RegExp(`^rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)$`, "i")];
  });
}
