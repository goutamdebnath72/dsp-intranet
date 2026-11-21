// src/lib/search/nameHint/config.ts
//
// THE SWITCH of the search bar's "Looks like a name" hint (src/lib/search/nameHint/nameHint.ts), kept in one place so the two sources can be tried one at a time:
//   "both"    the built-in Indian names AND the plant's own name words (the default)
//   "builtin" only the built-in list: no word list is fetched from the server at all
//   "plant"   only the plant's name words (fetched once when the search bar opens)
//   "off"     no hint
// Change the value, save, and the page reloads with it. A plain constant with no imports: the screen reads it.

export type NameHintMode = "both" | "builtin" | "plant" | "off";

export const NAME_HINT_MODE: NameHintMode = "both";

export const nameHintSources = (mode: NameHintMode): { useBuiltin: boolean; usePlant: boolean } => ({
  useBuiltin: mode === "both" || mode === "builtin",
  usePlant: mode === "both" || mode === "plant",
});
