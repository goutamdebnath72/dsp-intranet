// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/useResultRoom.selftest.ts
// The rule that keeps or takes away the button panel over a result (27 Nov 2026). The measuring itself was proved in a real browser with a mock window (a 500 px window, a 100 px box, a 120 px panel).
import { readFileSync } from "node:fs";
import { HYSTERESIS, panelKeepsPlace } from "./useResultRoom";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("a result that fits with the panel (no scroll bar) keeps it; one that would need a scroll bar sends it away", panelKeepsPlace(200, 278, true) && panelKeepsPlace(278, 278, true) && !panelKeepsPlace(279, 278, true));
ok("a panel that left comes back only when the result is shorter than the room by the margin: no flicker around the line", !panelKeepsPlace(260, 278, false) && !panelKeepsPlace(278 - HYSTERESIS + 1, 278, false) && panelKeepsPlace(278 - HYSTERESIS, 278, false) && panelKeepsPlace(100, 278, false));
ok("the same result, in a window the same height, gives the same answer whether the panel is shown or not once it is clear of the margin (the decision cannot chase itself)", [100, 200, 400, 600].every((h) => panelKeepsPlace(h, 278, true) === panelKeepsPlace(h, 278, false) || (h > 278 - HYSTERESIS && h <= 278)));
const hook = readFileSync("src/components/useResultRoom.ts", "utf8"), modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("it is measured before the paint (a layout effect), with a resize observer for what changes by itself, from the window's max-height and everything in the window but the scroll area, remembering the panel's height while it is away", /useLayoutEffect/.test(hook) && /ResizeObserver/.test(hook) && /getComputedStyle\(modal\)\.maxHeight/.test(hook) && /modal\.offsetHeight - scroll\.offsetHeight/.test(hook) && /panelHeight\.current/.test(hook));
ok("the omnibar uses it: the panel's wrapper, the scroll area's ref, and the deep answer always takes the panel away", /useResultRoom\(\{ active: !pageAlone && resultsShown && !deepAnswerShown, modalRef, scrollRef: scrollAreaRef, panelRef, inputRef: textareaRef, defaultRows \}\)/.test(modal) && /<div ref=\{scrollAreaRef\} className="scrollbar-thin/.test(modal) && /const panelHidden = !pageAlone && resultsShown && \(deepAnswerShown \|\| !resultRoom\);/.test(modal));

console.log(`useResultRoom selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
