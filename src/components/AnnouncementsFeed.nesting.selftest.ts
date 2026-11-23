// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/AnnouncementsFeed.nesting.selftest.ts
// My edit and delete buttons on an announcement card must NOT sit inside the button that opens the card (a button in a button is invalid HTML; React 19 reports a hydration error, and a click
// on the inner one is also a click on the outer one). I check this on the source of the card: the opening element closes BEFORE my buttons start, the card itself is a plain div, and the
// "New" chip lets a click through to the opening button.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = readFileSync("src/components/AnnouncementsFeed.tsx", "utf8");

const open = src.indexOf("<ClickTarget {...clickProps}>");
const close = src.indexOf("</ClickTarget>");
const owner = src.indexOf("{isOwner && (");
ok("the opening element exists once and closes before the owner's buttons begin", open > 0 && close > open && owner > close && src.split("<ClickTarget ").length === 2);
ok("the card itself is a plain div (not a button), so nothing is nested in a button", /<div \{\.\.\.cardProps\}>/.test(src) && !/<WrapperComponent/.test(src));
ok("the opening element is a button only when the card opens something, and then it is type=button", /const ClickTarget: React\.ElementType = clickable \? "button" : "div";/.test(src) && /type: "button" as const, onClick: onOpen/.test(src));
const ownerBlock = src.slice(owner, src.indexOf("{showNewChip && (", owner));
ok("the owner's two buttons are in the card, outside the opening element", (ownerBlock.match(/<button/g) ?? []).length === 2);
ok("the New chip does not catch clicks (they reach the opening button under it)", /pointer-events-none absolute bottom-3 right-3/.test(src));
console.log(`AnnouncementsFeed nesting selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
