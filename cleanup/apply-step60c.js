#!/usr/bin/env node
// cleanup/apply-step60c.js -- Step 60 (cumulative: 59a, 60a, 60b and the safety-net engine + other-plant guard): CHRD and the Training Department are former names of the Centre for L & D (CL&D).
//   - departmentAliases.ts: the old names, the confirmed full forms and the new name all mean the five L & D rows; another plant's CHRD (bsp, bhilai, bokaro, rourkela ...) does not
//   - context.ts: the matcher skips a group whose `unlessText` matches the question
//   - sailDepartments.ts: the OLDER rule-based engine (the safety net when the model is down or rate-limited) knows the CL&D names too, with the same rule
//   - OmnibarModal.tsx: a question that uses an OLD name is answered with the CURRENT name first (the note above the results)
//   - links.js and menu-data.ts: the intranet link and the Circulars menu entry show the OFFICIAL current name
//   - siteSearch.ts: the old names stay searchable (a link may carry aliases; the result carries the official title)
// Seven existing files change in place; everything else of the patch is a new or replaced file (unzip). Each change is checked on its own: already there: skipped; an EARLIER version of it (step 60b) there: upgraded;
// missing: made; place not recognised: nothing is written. Safe to run again, from a tree that has none, the earlier steps or all of it.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/lib/search/formerNames.ts", "src/components/FormerNameNotice.tsx"];
const EDITS = {
 "src/components/OmnibarModal.tsx": [
  [
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\n",
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\nimport { FormerNameNotice } from \"@/components/FormerNameNotice\";\nimport { formerNameNotice } from \"@/lib/search/formerNames\";\n",
   "import { formerNameNotice } from \"@/lib/search/formerNames\";"
  ],
  [
   "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n",
   "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n  // Step 59a: a question that uses a FORMER name of a department (\"CHRD\", \"Training Department\") is answered with the CURRENT name first: shown above the results, whatever the kind of answer.\n  const nameNotice = useMemo(() => formerNameNotice(submittedQuery || \"\"), [submittedQuery]);\n",
   "const nameNotice = useMemo(() => formerNameNotice(submittedQuery"
  ],
  [
   "              {loginHint && <OmniLoginHint hint={loginHint} />}\n",
   "              {nameNotice && <FormerNameNotice notice={nameNotice} />}\n              {loginHint && <OmniLoginHint hint={loginHint} />}\n",
   "{nameNotice && <FormerNameNotice notice={nameNotice} />}"
  ]
 ],
 "src/lib/menu-data.ts": [
  [
   "                    { label: \"CHRD\", href: \"#\" },\n",
   "                    { label: \"Centre for L & D (CL&D)\", href: \"#\" }, // formerly CHRD (step 60a)\n",
   "{ label: \"Centre for L & D (CL&D)\", href: \"#\" }"
  ]
 ],
 "src/lib/search/siteSearch.ts": [
  [
   "/**\n * Search the static site directory (links.js) by name.\n",
   "/**\n * A link may carry `aliases` (a renamed department keeps its old names: \"CHRD\", \"Training Department\"). Each alias is searched like a title of its own, but the result is ALWAYS the link's official title,\n * an alias hit ranks a notch below the same hit on the title, and a link is ONE result however many of its names match (step 60a).\n */\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nfunction withAliases(list: any[]): any[] {\n  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n  return list.flatMap((l: any) => [l, ...((l.aliases as string[] | undefined) ?? []).map((a) => ({ ...l, title: a, officialTitle: l.title, sourceLink: l }))]);\n}\n\n/**\n * Search the static site directory (links.js) by name.\n",
   "function withAliases(list: any[]): any[] {"
  ],
  [
   "  const out: SiteResult[] = [];\n",
   "  const out: SiteResult[] = [];\n  const bySource = new Map<object, SiteResult>(); // one result per link, whichever of its names matched\n",
   "const bySource = new Map<object, SiteResult>();"
  ],
  [
   "  for (const link of links) {\n    const title = link.title || \"\";\n",
   "  for (const link of withAliases(links)) {\n    const title = link.title || \"\";\n",
   "for (const link of withAliases(links)) {"
  ],
  [
   "      const hasLink = !!link.href && link.href !== \"#\";\n      out.push({\n        title,\n        subtitle: link.subtitle,\n        href: link.href || \"#\",\n        category: link.category,\n        hasLink,\n        score: score + (hasLink ? 1 : 0) + Math.max(0, 5 - nTitle.length) * 0.1,\n      });\n",
   "      const hasLink = !!link.href && link.href !== \"#\";\n      const result: SiteResult = {\n        title: link.officialTitle ?? title,\n        subtitle: link.subtitle,\n        href: link.href || \"#\",\n        category: link.category,\n        hasLink,\n        score: score - (link.officialTitle ? 2 : 0) + (hasLink ? 1 : 0) + Math.max(0, 5 - nTitle.length) * 0.1,\n      };\n      const source: object = link.sourceLink ?? link;\n      const had = bySource.get(source);\n      if (!had) { bySource.set(source, result); out.push(result); }\n      else if (result.score > had.score) Object.assign(had, result);\n",
   "const source: object = link.sourceLink ?? link;"
  ],
  [
   "      else if (ws.some((w) => w.startsWith(q))) score = 60;\n      else if (ws.some((w) => w.includes(q))) score = 40;\n",
   "      // an ALIAS matches as a whole (exact, as a prefix, or spelled out in the question), never by one of its common words (\"training\", \"department\" would match every question about a department)\n      else if (!link.officialTitle && ws.some((w) => w.startsWith(q))) score = 60;\n      else if (!link.officialTitle && ws.some((w) => w.includes(q))) score = 40;\n",
   "else if (!link.officialTitle && ws.some((w) => w.startsWith(q))) score = 60;"
  ],
  [
   "    if (score === 0 && link.subtitle) {\n",
   "    if (score === 0 && link.subtitle && !link.aliases && !link.officialTitle) { // a link with aliases is found by them, not by the words of its history line\n",
   "!link.aliases && !link.officialTitle"
  ]
 ],
 "src/lib/links.js": [
  [
   "  { title: \"CHRD\", href: \"http://10.141.4.76/chrd/home/\", icon: \"UserCog\", category: \"department\" },\n",
   "  // step 60a: the Training Department -> CHRD (Centre for Human Resource Development) -> Centre for L & D (CL&D, Learning and Development). The link shows the CURRENT name; the old names, the full forms and the short forms are `aliases` that the site search matches (siteSearch.ts).\n  { title: \"Centre for L & D (CL&D)\", subtitle: \"(formerly CHRD, earlier the Training Department)\", aliases: [\"CHRD\", \"C.H.R.D\", \"Centre for Human Resource Development\", \"Center for Human Resource Development\", \"Training Department\", \"Training Dept\", \"Training Deptt\", \"CL&D\", \"L&D\", \"L & D\", \"Centre for L & D\", \"Center for L & D\", \"Centre for Learning and Development\", \"Center for Learning and Development\", \"Learning and Development\"], href: \"http://10.141.4.76/chrd/home/\", icon: \"UserCog\", category: \"department\" },\n",
   "step 60a: the Training Department -> CHRD (Centre for Human Resource Development)"
  ]
 ],
 "src/lib/nl2sql/departmentAliases.ts": [
  [
   "//   - CHRD / Training Institute: which HR row(s)?   (the intranet site list has CHRD; the 300 HR rows have no row of that name; L & D is a candidate)\n",
   "//   - (CLOSED on 26 Oct 2026 by the owner's list of the CL&D employees: CHRD = the Training Department = Centre for L & D (CL&D) = the five L & D rows, see the first group below. The legacy \"CHRD INDUSTRIAL 2 / training institute\"\n//     of employees/departments.ts (code 10143) has no row in the 300 and is NOT part of CL&D.)\n",
   "CLOSED on 26 Oct 2026 by the owner's list of the CL&D employees"
  ],
  [
   "export interface DepartmentGroup {\n  name: string;\n  aliases: string[];\n  prefixes: string[];\n  stems?: string[];\n}\n",
   "import { OTHER_PLANT } from \"@/lib/search/formerNames\";\n\nexport interface DepartmentGroup {\n  name: string;\n  aliases: string[];\n  prefixes: string[];\n  stems?: string[];\n  /** The group does NOT apply when the question matches this (step 60c: another plant's CHRD, \"bsp chrd\", is not the Durgapur department). */\n  unlessText?: RegExp;\n}\n",
   "unlessText?: RegExp;"
  ],
  [
   "export const DEPARTMENT_GROUPS: DepartmentGroup[] = [\n",
   "export const DEPARTMENT_GROUPS: DepartmentGroup[] = [\n  // step 59a: the Training Department was renamed CHRD and is now the Centre for L & D (CL&D). People still say the old names: ALL of them mean the five L & D rows (107, 9001, 9003, 10770, 9008: the sections of the\n  // owner's list of 26 Oct 2026). \"l & d\" itself is found by the department's own name. The notice \"CHRD is now called ...\" is src/lib/search/formerNames.ts; the link and the menu entry carry the same names.\n  // The FULL FORMS are the ones CONFIRMED on 26 Oct 2026: L & D = Learning and Development (the HOD), CHRD = Centre for Human Resource Development. NOT \"Centre for HRD\": it is not used at the plant.\n  // Another plant's CHRD (Bhilai, Bokaro, Rourkela ...) is not this department: the group does not apply to a question that names the plant (unlessText).\n  { name: \"CL&D (Centre for L & D = Centre for Learning and Development, formerly CHRD = Centre for Human Resource Development, formerly the Training Department)\", aliases: [\"cl&d\", \"cl & d\", \"cl and d\", \"c l & d\", \"centre for l&d\", \"centre for l & d\", \"center for l&d\", \"center for l & d\", \"learning and development\", \"centre for learning and development\", \"center for learning and development\", \"chrd\", \"c h r d\", \"c.h.r.d\", \"centre for human resource development\", \"center for human resource development\", \"training department\", \"training dept\", \"training deptt\"], prefixes: [\"l and d\"], unlessText: OTHER_PLANT },\n",
   "prefixes: [\"l and d\"], unlessText: OTHER_PLANT }",
   false,
   "export const DEPARTMENT_GROUPS: DepartmentGroup[] = [\n  // step 59a: the Training Department was renamed CHRD and is now the Centre for L & D (CL&D). People still say the old names: ALL of them mean the five L & D rows (107, 9001, 9003, 10770, 9008: the sections of the\n  // owner's list of 26 Oct 2026). \"l & d\" itself is found by the department's own name. The notice \"CHRD is now called ...\" is src/lib/search/formerNames.ts; the link and the menu entry carry the same names.\n  // The FULL FORMS are the ones CONFIRMED on 26 Oct 2026: L & D = Learning and Development (the HOD), CHRD = Centre for Human Resource Development. NOT \"Centre for HRD\": it is not used at the plant.\n  // Another plant's CHRD is not this department.\n  { name: \"CL&D (Centre for L & D = Centre for Learning and Development, formerly CHRD = Centre for Human Resource Development, formerly the Training Department)\", aliases: [\"cl&d\", \"cl & d\", \"cl and d\", \"c l & d\", \"centre for l&d\", \"centre for l & d\", \"center for l&d\", \"center for l & d\", \"learning and development\", \"centre for learning and development\", \"center for learning and development\", \"chrd\", \"c h r d\", \"c.h.r.d\", \"centre for human resource development\", \"center for human resource development\", \"training department\", \"training dept\", \"training deptt\"], prefixes: [\"l and d\"] },\n"
  ]
 ],
 "src/lib/nl2sql/context.ts": [
  [
   "    if (!f.aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) continue;\n",
   "    if (f.unlessText?.test(qNorm)) continue; // e.g. another plant's CHRD (step 60c)\n    if (!f.aliases.some((a) => qNorm.includes(\" \" + normText(a) + \" \"))) continue;\n",
   "if (f.unlessText?.test(qNorm)) continue;"
  ]
 ],
 "src/lib/employees/sailDepartments.ts": [
  [
   "import { getDb } from \"@/lib/db\";\n",
   "import { getDb } from \"@/lib/db\";\nimport { OTHER_PLANT } from \"@/lib/search/formerNames\";\n",
   "import { OTHER_PLANT } from \"@/lib/search/formerNames\";"
  ],
  [
   "const CONFIRMED_GROUPS: { name: string; codes: number[]; aliases: string[] }[] = [\n",
   "const CONFIRMED_GROUPS: { name: string; codes: number[]; aliases: string[]; unlessText?: RegExp }[] = [\n  {\n    // step 60c: the Training Department -> CHRD -> Centre for L & D (CL&D): the five L & D rows of the owner's list of 26 Oct 2026 (107 L & D, 9001 L & D OFFICE, 9003 L & D, 10770 L & D (TECH), 9008 L & D IND).\n    // Full forms CONFIRMED by the owner (26 Oct 2026): L & D = Learning and Development, CHRD = Centre for Human Resource Development; \"Centre for HRD\" is not used. The same names as in nl2sql/departmentAliases.ts.\n    // Another plant's CHRD is not this department (unlessText).\n    name: \"CL&D\",\n    codes: [107, 9001, 9003, 10770, 9008],\n    aliases: [\"cl&d\", \"cl & d\", \"cl and d\", \"c l & d\", \"centre for l&d\", \"centre for l & d\", \"center for l&d\", \"center for l & d\", \"learning and development\", \"centre for learning and development\", \"center for learning and development\", \"chrd\", \"c h r d\", \"c.h.r.d\", \"centre for human resource development\", \"center for human resource development\", \"training department\", \"training dept\", \"training deptt\", \"l & d\", \"l and d\"],\n    unlessText: OTHER_PLANT,\n  },\n",
   "step 60c: the Training Department -> CHRD -> Centre for L & D (CL&D)"
  ],
  [
   "  for (const g of CONFIRMED_GROUPS) {\n    for (const c of [g.name, ...g.aliases]) {\n",
   "  for (const g of CONFIRMED_GROUPS) {\n    if (g.unlessText?.test(nq)) continue; // another plant's CHRD (step 60c)\n    for (const c of [g.name, ...g.aliases]) {\n",
   "if (g.unlessText?.test(nq)) continue;"
  ]
 ]
};
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of NEEDS) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const plan = [];
let todo = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) refuse("cannot find " + file + " (run this from the project root)");
  const src = fs.readFileSync(p, "utf8");
  const make = [];
  for (const [from, to, marker, optional, upgradeFrom] of edits) {
    if (src.includes(marker)) continue; // already there
    if (upgradeFrom && src.split(upgradeFrom).length === 2) { make.push([upgradeFrom, to]); continue; } // the earlier version of this change (step 60b)
    if (src.split(from).length === 2) { make.push([from, to]); continue; }
    if (optional) continue; // a place that only exists in some trees
    refuse(file + " differs from what I expect (a place to change is not there exactly once: " + JSON.stringify(from.slice(0, 70)) + ")");
  }
  todo += make.length;
  plan.push([p, src, make]);
}
if (!todo) { console.log("Nothing to do: step 60c is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 60c (" + todo + " changes in " + files + " files).");
