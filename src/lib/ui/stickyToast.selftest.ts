// src/lib/ui/stickyToast.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/stickyToast.selftest.ts)
// Guard: the "upload finished" toast (top-centre, stays until its cross is clicked) was lost once when the admin dashboard page was retired. These checks keep it from being lost again.
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else { failed++; console.log(`  FAIL  ${name}`); } };
const read = (p: string) => readFileSync(p, "utf8");

const layout = read("src/app/layout.tsx");
const toaster = read("src/components/AppToaster.tsx");
const sticky = read("src/lib/ui/stickyToast.tsx");
const circular = read("src/components/CircularAdminPanel.tsx");
const announcement = read("src/components/AnnouncementAdminPanel.tsx");
const modal = read("src/components/CircularsModal.tsx");
const tailwind = read("tailwind.config.js");

check("the root layout mounts the toaster (without a container no toast can be seen anywhere)", /import AppToaster from "@\/components\/AppToaster"/.test(layout) && /<AppToaster \/>/.test(layout));
check("the toaster is at the top centre of the screen", /position="top-center"/.test(toaster));
check("the toaster is a client component", /^"use client";/.test(toaster));
check("a sticky toast has no timer and a close button", /duration: Infinity/.test(sticky) && /toast\.dismiss\(t\.id\)/.test(sticky) && /aria-label="Close this message"/.test(sticky));
check("a finished circular upload shows the sticky toast", /import \{ stickySuccess \}/.test(circular) && /stickySuccess\(warning \?/.test(circular));
check("the toast is shown after the upload response (the circular is saved), not before", circular.indexOf("axios.post") < circular.indexOf("stickySuccess("));
check("a published announcement shows the sticky toast", /stickySuccess\(`✅ Announcement published!/.test(announcement));
check("an updated announcement shows the sticky toast", /stickySuccess\("✅ Announcement updated successfully!"\)/.test(announcement));
check("a deleted circular shows the sticky toast (not the 2-second one)", /stickySuccess\("✅ Circular and associated files deleted\."\)/.test(modal) && !/toast\.success\("Circular and associated files deleted/.test(modal));
check("a failed delete is still an error toast", /toast\.error\(/.test(modal));
check("Tailwind scans src/lib/ui (the sticky toast's classes, e.g. -mr-3, exist only there: without it the cross is drawn unstyled / in the wrong place)", /src\/lib\/ui\/\*\*/.test(tailwind) && /className="[^"]*-mr-3/.test(sticky));
check("Tailwind scans every folder under src/lib whose files carry classes", (() => { const dirs = ["src/lib/ui", "src/lib/utils"]; return dirs.every((d) => new RegExp(d.replace(/\//g, "\\/") + "\\/\\*\\*").test(tailwind)); })());
check("the toasts are shown only on success (an error never says ✅)", !/stickySuccess\([^)]*(Failed|failed|error)/.test(circular + announcement));

console.log(`sticky toast selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
