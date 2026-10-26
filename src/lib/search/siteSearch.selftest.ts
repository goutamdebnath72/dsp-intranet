// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/siteSearch.selftest.ts
// Step 60a: the intranet link of the Centre for L & D shows its OFFICIAL current name (owner, 26 Oct 2026: "the intranet link and the menu still say CHRD: it must officially show the current name as link"), and
// the old names stay searchable: the site search matches the `aliases` of a link, and the result always carries the official title. Renaming the title alone would have made "chrd" find nothing.

import { readFileSync } from "node:fs";
import { links } from "@/lib/links";
import { searchSites } from "./siteSearch";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const OFFICIAL = "Centre for L & D (CL&D)";
const all = links as { title: string; subtitle?: string; aliases?: string[]; href: string; icon?: string; category: string }[];
const cld = all.filter((l) => l.title === OFFICIAL);

// ---- the link itself
ok("exactly one link carries the official name; it keeps its address, icon and category", cld.length === 1 && cld[0].href === "http://10.141.4.76/chrd/home/" && cld[0].icon === "UserCog" && cld[0].category === "department", JSON.stringify(cld));
ok("it says what it was called: (formerly CHRD, earlier the Training Department)", cld[0].subtitle === "(formerly CHRD, earlier the Training Department)");
ok("the old names, the full forms and the short forms are its aliases: CHRD, C.H.R.D, Training Department, Training Dept, Training Deptt, Centre for Human Resource Development, CL&D, L&D, Centre for Learning and Development, Learning and Development", ["CHRD", "C.H.R.D", "Training Department", "Training Dept", "Training Deptt", "Centre for Human Resource Development", "CL&D", "L&D", "Centre for L & D", "Centre for Learning and Development", "Learning and Development"].every((a) => cld[0].aliases?.includes(a)));
ok("no link is still titled just 'CHRD'; Bhilai's 'BSP CHRD' is a different department and stays", !all.some((l) => l.title === "CHRD") && all.some((l) => l.title === "BSP CHRD" && l.category === "sail"));
ok("'Centre for HRD' is not an alias (it is not used at the plant)", !(cld[0].aliases ?? []).some((a) => /\bhrd\b/i.test(a) && !/^c\.?h\.?r\.?d$/i.test(a)));

// ---- the old and the new names all find it, and the result carries the OFFICIAL title
for (const q of ["chrd", "CHRD", "c.h.r.d", "training department", "Training Dept", "training deptt", "cl&d", "CL & D", "l&d", "L & D", "centre for l&d", "centre for human resource development", "Centre for Learning and Development", "learning and development", "list the employees of chrd", "executives in the training department"]) {
  const r = searchSites(q);
  ok(`"${q}" finds the link first, as "${OFFICIAL}"`, r[0]?.title === OFFICIAL && r[0].href === "http://10.141.4.76/chrd/home/", JSON.stringify(r.map((x) => x.title)));
}
ok("a link is ONE result however many of its names match: 'chrd' and 'cl&d' list it once", ["chrd", "cl&d", "training department", "centre for l&d"].every((q) => searchSites(q).filter((x) => x.title === OFFICIAL).length === 1));
ok("Bhilai's CHRD is still found first by 'bsp chrd' (the DSP department comes second, as before)", searchSites("bsp chrd")[0]?.title === "BSP CHRD");

// ---- no noise: common words of the history line or of the aliases do not bring the link into every question
for (const q of ["department", "dept", "deptt", "the", "formerly", "earlier", "hr", "it", "list of employees", "holiday list", "leave rules"]) ok(`"${q}" does not show the link`, !searchSites(q).some((x) => x.title === OFFICIAL), JSON.stringify(searchSites(q).map((x) => x.title)));

// ---- nothing else changed: every other link is still found by its own title
const others = all.filter((l) => l.title !== OFFICIAL && l.title.trim().length >= 2);
const missing = others.filter((l) => !searchSites(l.title, 12).some((r) => r.title === l.title && r.href === (l.href || "#")));
ok(`every other link (${others.length}) is still found by its own title`, missing.length === 0, missing.slice(0, 5).map((l) => l.title).join(" | "));
ok("some well-known ones are still the first result: C & IT, CEM, CCM", ["c&it", "cem", "ccm"].every((q) => !!searchSites(q)[0]) && searchSites("cem")[0]?.title === "CEM" && searchSites("ccm")[0]?.title === "CCM");

// ---- the menu
const menu = readFileSync("src/lib/menu-data.ts", "utf8");
ok("the Circulars menu shows the official name, not 'CHRD'", menu.includes('{ label: "Centre for L & D (CL&D)", href: "#" }') && !menu.includes('label: "CHRD"'));
console.log(`siteSearch selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
