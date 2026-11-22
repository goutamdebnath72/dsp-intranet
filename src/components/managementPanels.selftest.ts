// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/managementPanels.selftest.ts </dev/null
// The management pages and the written-summary view are fetched on first need, not carried by the search window; the lazy tools are written once (src/lib/ui/lazyLoad.tsx).
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const panels = readFileSync("src/components/managementPanels.ts", "utf8");
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
const topBar = readFileSync("src/components/TopBar.tsx", "utf8");
const lazy = readFileSync("src/lib/ui/lazyLoad.tsx", "utf8");
const NAMES = ["PaxAdminPanel", "EmployeeAdminPanel", "HolidayAdminPanel", "CircularAdminPanel", "AnnouncementAdminPanel", "AccessLogAdminPanel", "ExecutiveBriefing"];

ok("each management page and the briefing is a lazy component of its own file, through the one helper", NAMES.every((n) => new RegExp(`export const ${n} = lazyComponent\\(load\\w+, "${n}"\\)`).test(panels)) && /from "@\/lib\/ui\/lazyLoad"/.test(panels));
ok("the loaders import each file once, by the loader and nowhere else in the list", NAMES.every((n) => panels.includes(`import("@/components/${n}")`)));
ok("the six management pages are preloaded together; the briefing is not part of that", /const PANELS = \[loadPax, loadEmployee, loadHoliday, loadCircular, loadAnnouncement, loadAccessLog\];/.test(panels) && !/PANELS = \[[^\]]*loadBriefing/.test(panels));
ok("the search window imports all seven from this one file and from no other (no static import of a panel, no second dynamic() list)", NAMES.every((n) => !modal.includes(`from "@/components/${n}"`)) && /from "@\/components\/managementPanels"/.test(modal) && !/dynamic\(/.test(modal));
ok("the moment the pages are fetched ahead is a switch (pointer, idle or now)", /PERF\.managementPanelsLoad === "now"/.test(panels) && /PERF\.managementPanelsLoad === "idle"/.test(panels));
ok("the pointer on the Admin button warms the management pages", /onAdminHint=\{\(\) => \{ if \(authStatus === "authenticated"\) preloadManagementPanels\(\);/.test(modal));
ok("the top bar loads the search window and the guide lazily, through the same helper, at the moments src/lib/perf/switches.js chooses, and the guide also when the pointer reaches its button", /lazyComponent\(loadOmnibar, "OmnibarModal", PERF\.searchWindowLoad\)/.test(topBar) && /lazyComponent\(loadHelp, "default", PERF\.guideLoad\)/.test(topBar) && /onPointerEnter=\{\(\) => void loadHelp\(\)\}/.test(topBar) && !/import \{ OmnibarModal \}/.test(topBar) && !/import HelpManualModal/.test(topBar));
ok("the helper never loads on the server (a window opened by a click) and idles through requestIdleCallback with a timeout, falling back to a timer", /ssr: false/.test(lazy) && /requestIdleCallback/.test(lazy) && /setTimeout/.test(lazy));
ok("only the helper and nobody else calls next/dynamic in these two shared files", !/next\/dynamic/.test(topBar) && !/next\/dynamic/.test(panels));

console.log(`managementPanels selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
