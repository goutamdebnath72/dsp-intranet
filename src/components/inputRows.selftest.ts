// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/inputRows.selftest.ts
// The height of the search box (27 Nov 2026): three lines by default; the question's own lines (one to six) when a long result needs the room. The line counting and the stability against the panel were proved in a real browser
// with a mock window (a one-line question over a tall result gives a 32 px box in place of 80 px; two lines 56 px; nine lines stop at six, 152 px; the panel's decision does not change when the box shrinks).
import { readFileSync } from "node:fs";
import { DEFAULT_ROWS, MAX_ROWS, MIN_ROWS, inputRows } from "./inputRows";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("the default is three lines, whatever is typed, up to six; more lines than that scroll inside the box", DEFAULT_ROWS === 3 && inputRows(1, false) === 3 && inputRows(2, false) === 3 && inputRows(3, false) === 3 && inputRows(4, false) === 4 && inputRows(6, false) === 6 && inputRows(30, false) === MAX_ROWS);
ok("when a long result needs the room the box takes exactly the question's lines: one, two, three ... six, never fewer than one or more than six", MIN_ROWS === 1 && inputRows(1, true) === 1 && inputRows(2, true) === 2 && inputRows(3, true) === 3 && inputRows(5, true) === 5 && inputRows(30, true) === 6 && inputRows(0, true) === 1 && inputRows(Number.NaN, true) === 1);
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8"), hook = readFileSync("src/components/useResultRoom.ts", "utf8");
ok("the omnibar counts the lines before the paint (and again when the window changes), sets the box's rows from them and from whether the panel has gone, and no longer caps the box at 96 px", /import \{ countLines, inputRows \} from "\.\/inputRows"/.test(modal) && /useLayoutEffect\(\(\) => \{\s*const el = textareaRef\.current;/.test(modal) && /const boxRows = inputRows\(lineCount, panelHidden\);/.test(modal) && /rows=\{boxRows\}/.test(modal) && !/rows=\{3\}/.test(modal) && !/overflow-y-auto max-h-24 py-1/.test(modal));
ok("the panel's decision is measured as if the box had its default rows (it is given the box and its default), so the box shrinking cannot bring the panel back and loop", /inputRef: textareaRef, defaultRows/.test(modal) && /Math\.max\(0, defaultRows - ta\.rows\) \* lineHeight/.test(hook) && /others \+ given/.test(hook));

console.log(`inputRows selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
