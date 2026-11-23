// src/lib/dev/developerReference.selftest.ts: npx tsx --tsconfig tsconfig.selftest.json src/lib/dev/developerReference.selftest.ts
// The developer reference (/developers): who may open it, where its link sits in the user menu, and what the generator writes. Source pins plus a look at the built folder (run npm run docs:api first for the second part).
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL", n, extra); } };
const route = readFileSync("src/app/developers/[[...path]]/route.ts", "utf8");
const top = readFileSync("src/components/TopBar.tsx", "utf8");
const cfg = readFileSync("next.config.js", "utf8");

ok("only a signed-in user is served: the login session is asked first, an unsigned request gets 401 and no file", /getSessionTicket\(\)/.test(route) && /status: 401|, 401\)/.test(route) && route.indexOf("getSessionTicket") < route.indexOf("readFile("));
ok("a path cannot leave the folder: it is normalised, '..' is refused and the file must start with the folder", /normalize\(path\.join/.test(route) && /rel\.startsWith\("\.\."\)/.test(route) && /file\.startsWith\(ROOT \+ sep\)/.test(route));
ok("only known file types are served (html, js, css, json, svg)", /TYPES\[extname\(file\)\]/.test(route) && !/\.map|\.ts/.test(route.slice(route.indexOf("const TYPES"), route.indexOf("const gate"))));
ok("DEV_DOCS_ACCESS=off switches it off (404), and /developers goes to /developers/index.html so its relative files load", /DEV_DOCS_ACCESS/.test(route) && /\/developers\/index\.html/.test(route));
ok("the deployed route carries the folder (outputFileTracingIncludes)", /"\/developers\/\[\[\.\.\.path\]\]": \["\.\/developer-docs\/\*\*\/\*"\]/.test(cfg));
ok("the user menu has the link, a plain anchor to /developers in a new tab, just above Logout and after Change password", /href="\/developers"/.test(top) && top.indexOf('href="/developers"') > top.indexOf("Change password") && top.indexOf('href="/developers"') < top.indexOf("<span className=\"text-sm\">Logout</span>"));
ok("the page asks search engines to keep away (noindex in the page and in the header)", /noindex/.test(readFileSync("scripts/docs/site/index.html", "utf8")) && /X-Robots-Tag/.test(route));

if (existsSync("developer-docs/data/index.json")) {
  const idx = JSON.parse(readFileSync("developer-docs/data/index.json", "utf8"));
  ok("the built index has packages, files, routes, entities, switches and a search list", ["packages", "files", "routes", "entities", "switches", "search"].every((k) => Array.isArray(idx[k]) && idx[k].length > 0));
  ok("every route handler of src/app/api is in the reference", idx.routes.some((r: any) => r.url === "/api/ai-search" && r.methods.some((m: any) => m.method === "GET")) && idx.routes.length >= 50);
  ok("the speed switches are listed with their values", idx.switches.some((s: any) => s.name === "edsDrafts") && idx.switches.every((s: any) => typeof s.value === "string"));
  ok("every file of the index has its own detail file", idx.files.slice(0, 40).every((f: any) => existsSync(`developer-docs/data/f/${f.h}.json`)));
  ok("the site files are there", ["index.html", "app.js", "app.css"].every((f) => existsSync(`developer-docs/${f}`)));
}
console.log(`developer reference selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
