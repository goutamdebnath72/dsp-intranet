#!/usr/bin/env node
// cleanup/apply-step54i.js -- Step 54i: the query modal is wider. It was `min(52rem, 92vw)`: a fixed width that looks narrow on a laptop next to a page that is 80vw wide.
// Now it is a share of the screen, so it holds at any browser zoom and on any monitor: 74vw (80vw for the executive mode), never narrower than the old 52rem, never wider than 1600px, never wider than 92vw.
// It stays centred, so it grows evenly on both sides. Three places of src/components/OmnibarModal.tsx change.
// ALL-OR-NOTHING and idempotent: if a place differs from what is expected, it prints NOT APPLIED and changes nothing.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = "src/components/OmnibarModal.tsx";
const EDITS = [
  [
    "const BASE_MODAL_WIDTH_REM = 52;\nconst EXECUTIVE_SCALE = 1.08;\n",
    "const BASE_MODAL_WIDTH_REM = 52; // the floor: never narrower than this\nconst BASE_MODAL_WIDTH_VW = 74; // the width on a laptop or a desktop: a share of the screen (the page itself is 80vw), so it holds at any zoom\nconst MODAL_MAX_PX = 1600; // never wider than this, even on a very large monitor\nconst EXECUTIVE_SCALE = 1.08;\n",
  ],
  [
    "  const currentMaxWidthRem =\n    mode === \"intellectual\"\n      ? (BASE_MODAL_WIDTH_REM * EXECUTIVE_SCALE).toFixed(2)\n      : BASE_MODAL_WIDTH_REM.toFixed(2);\n",
    "  const currentMaxWidthRem =\n    mode === \"intellectual\"\n      ? (BASE_MODAL_WIDTH_REM * EXECUTIVE_SCALE).toFixed(2)\n      : BASE_MODAL_WIDTH_REM.toFixed(2);\n  const currentWidthVw = mode === \"intellectual\" ? (BASE_MODAL_WIDTH_VW * EXECUTIVE_SCALE).toFixed(2) : String(BASE_MODAL_WIDTH_VW);\n",
  ],
  [
    "                maxWidth: `min(${currentMaxWidthRem}rem, 92vw)`,\n",
    "                maxWidth: `min(max(${currentMaxWidthRem}rem, ${currentWidthVw}vw), ${MODAL_MAX_PX}px, 92vw)`,\n",
  ],
];
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
const p = path.join(root, FILE);
if (!fs.existsSync(p)) refuse("cannot find " + FILE + " (run this from the project root)");
let src = fs.readFileSync(p, "utf8");
if (EDITS.every(([, to]) => src.includes(to))) { console.log("Nothing to do: step 54i is already applied."); process.exit(0); }
for (const [from] of EDITS) if (src.split(from).length !== 2) refuse(FILE + " differs from what I expect (a place to change is not there exactly once)");
for (const [from, to] of EDITS) src = src.replace(from, () => to);
fs.writeFileSync(p, src);
console.log("APPLIED: step 54i (3 places of " + FILE + " changed).");
