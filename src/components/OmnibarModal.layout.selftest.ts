// Run (from the project root): npx tsx --tsconfig tsconfig.json src/components/OmnibarModal.layout.selftest.ts
// Step 62a: the omnibar box must not carry the framer-motion `layout` prop. In Chrome with a classic (always visible) scrollbar the scroll lock changes the page width, the box's layout
// animation then fought its own exit animation and AnimatePresence deleted the NEW box right after it appeared: the click on the search bar did nothing after the first closing and the
// first Ctrl+K only "closed" the hidden box. (Found by driving the real home page in Chromium with classic scrollbars; the stand-in without a scrollbar never showed it.)

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const src = readFileSync("src/components/OmnibarModal.tsx", "utf8");
const lines = src.split("\n");

// a bare JSX prop `layout` (alone on its line) or `layout={...}` on any motion element of the file
const bare = lines.map((l, i) => ({ l, n: i + 1 })).filter((x) => /^\s*layout(=\{[^}]*\})?\s*$/.test(x.l) || /<motion\.[a-z]+[^>]*\slayout(\s|=|>)/.test(x.l));
ok("the omnibar file has no `layout` prop on any motion element", bare.length === 0, bare.map((x) => `line ${x.n}`).join(", "));

// the box is still drawn with its fade and slide, inside AnimatePresence
ok("the box still fades and slides in (initial opacity 0, scale .95, y -20)", src.includes("initial={{ opacity: 0, scale: 0.95, y: -20 }}"));
ok("the box still leaves with an exit animation", src.includes("exit={{ opacity: 0, scale: 0.95, y: -20 }}"));
ok("the box is still inside AnimatePresence", /<AnimatePresence>\s*\{isOpen && !selectedCircularId && !selectedAnnouncement && \(/.test(src));

// the reason is written next to the place, so nobody puts `layout` back by habit
ok("the reason for having no `layout` is written in the file", src.includes("Step 62a: NO `layout` prop on this box"));

console.log(`OmnibarModal layout selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
