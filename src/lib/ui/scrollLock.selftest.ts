// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/scrollLock.selftest.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lockHolders, lockPageScroll, type LockEnv } from "./scrollLock";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const page = (): LockEnv => ({ html: { style: { overflow: "", paddingRight: "" }, clientWidth: 1145 }, innerWidth: 1160 });
const state = (e: LockEnv) => `${e.html.style.overflow}|${e.html.style.paddingRight}`;

// one window
{ const e = page(); const a = lockPageScroll(e);
  ok("the first window locks the page and pads for the scrollbar", state(e) === "hidden|15px" && a.scrollBarWidth === 15);
  a.release(); ok("and the page is as it was when it lets go", state(e) === "|" && lockHolders() === 0); }

// two windows closed in either order (the fault: the last to restore put back an already locked page)
for (const order of ["first-then-second", "second-then-first"]) {
  const e = page(); const a = lockPageScroll(e);
  e.html.clientWidth = 1160; // the page has no scrollbar now, as in the real page once locked
  const b = lockPageScroll(e);
  ok(`a window opened over another still knows the scrollbar width (${order})`, b.scrollBarWidth === 15 && state(e) === "hidden|15px");
  if (order === "first-then-second") { a.release(); b.release(); } else { b.release(); a.release(); }
  ok(`the page is free again whatever the order of closing (${order})`, state(e) === "|" && lockHolders() === 0, state(e));
}

// still locked while any window remains
{ const e = page(); const a = lockPageScroll(e); const b = lockPageScroll(e); a.release();
  ok("the page stays locked while one window is still open", state(e) === "hidden|15px" && lockHolders() === 1);
  b.release(); ok("and is freed by the last", state(e) === "|"); }

// letting go twice must not free a lock that another window still holds
{ const e = page(); const a = lockPageScroll(e); const b = lockPageScroll(e); a.release(); a.release();
  ok("letting go twice does nothing the second time", state(e) === "hidden|15px" && lockHolders() === 1);
  b.release(); }

// a page that had its own styles gets them back
{ const e = page(); e.html.style.overflow = "auto"; e.html.style.paddingRight = "3px"; const a = lockPageScroll(e); a.release();
  ok("the page's own styles come back as they were", state(e) === "auto|3px"); }

// a page without a scrollbar adds no padding
{ const e = page(); e.html.clientWidth = 1160; const a = lockPageScroll(e);
  ok("no scrollbar, no padding", state(e) === "hidden|" && a.scrollBarWidth === 0); a.release(); }

// repeated open and close cycles leave nothing behind
{ const e = page(); for (let i = 0; i < 50; i++) { const a = lockPageScroll(e); const b = lockPageScroll(e); (i % 2 ? a : b).release(); (i % 2 ? b : a).release(); }
  ok("fifty open-and-close rounds leave the page untouched", state(e) === "|" && lockHolders() === 0); }

// nobody else writes <html>'s overflow or padding any more
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(n) && !/selftest/.test(n) ? [p] : []; });
const offenders = walk("src").filter((f) => !f.endsWith("src/lib/ui/scrollLock.ts") && /(?:style\.overflow|style\.paddingRight)\s*=/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
ok("only the shared lock writes the page's overflow and padding (every window uses it)", offenders.length === 0, offenders.join(", "));
const users = ["OmnibarModal", "AnnouncementModal", "HelpManualModal", "CircularsModal", "HomePageClient"].every((n) => /lockPageScroll\(\)/.test(readFileSync(`src/components/${n}.tsx`, "utf8")));
ok("the search window, the guide, the circulars list, the announcement and the home page all use it", users);

// the search window leaves nothing of its own behind when it closes
const om = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("closing the search window clears a viewer or announcement left open over it", /if \(isOpen\) return;\s*setSelectedCircularId\(null\);\s*setSelectedAnnouncement\(null\);/.test(om));

console.log(`scrollLock selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
