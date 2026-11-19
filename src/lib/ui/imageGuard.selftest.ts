// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/imageGuard.selftest.ts
// No photograph can be saved from the app: which elements are guarded, when a picture's address is answered, the rules in globals.css (no drag, nothing printed), the guard mounted in the layout, the middleware that refuses
// a picture opened on its own, and the same rule on the employees' photograph route.
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { imageFetchAllowed, isGuardedElement } from "./imageGuard";
import { config, middleware } from "../../middleware";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (o: Record<string, string>) => new Headers(o);
const el = (tagName: string, inFrame = false) => ({ tagName, closest: (s: string) => (inFrame && /data-photo/.test(s) ? {} : null) });

ok("a picture's elements are guarded: img, canvas, picture, video (any case)", ["IMG", "img", "CANVAS", "PICTURE", "VIDEO"].every((t) => isGuardedElement(el(t))));
ok("so is anything inside a picture's frame (data-photo, the Enlarge button, the page of a PDF viewer); a plain paragraph or button is not", isGuardedElement(el("SPAN", true)) && !isGuardedElement(el("P")) && !isGuardedElement(el("BUTTON")) && !isGuardedElement(null) && !isGuardedElement({}));
ok("a picture loaded into a page (Sec-Fetch-Dest: image) is answered; one opened on its own (document, empty, iframe, a download) is not", imageFetchAllowed(h({ "sec-fetch-dest": "image" })) && !imageFetchAllowed(h({ "sec-fetch-dest": "document" })) && !imageFetchAllowed(h({ "sec-fetch-dest": "empty" })) && !imageFetchAllowed(h({ "sec-fetch-dest": "iframe" })));
ok("a request that says nothing (an old browser, a program) is not refused by this rule", imageFetchAllowed(h({})));

const css = readFileSync("src/app/globals.css", "utf8");
ok("globals.css: pictures cannot be dragged, selected or long-pressed, and 'Print / Save as PDF' leaves every picture out (img, picture, canvas, video)", /-webkit-user-drag:\s*none/.test(css) && /-webkit-touch-callout:\s*none/.test(css) && /@media print\s*\{\s*img,\s*picture,\s*canvas,\s*video\s*\{\s*display:\s*none\s*!important/.test(css));
const layout = readFileSync("src/app/layout.tsx", "utf8");
ok("the root layout mounts the guard (so every page has it)", /import ImageGuard from "@\/components\/ImageGuard"/.test(layout) && /<ImageGuard \/>/.test(layout));
const guard = readFileSync("src/components/ImageGuard.tsx", "utf8");
ok("the guard refuses the right-click menu and the drag in the capture phase on the whole document, and cleans up after itself", /addEventListener\("contextmenu", refuse, true\)/.test(guard) && /addEventListener\("dragstart", refuse, true\)/.test(guard) && /removeEventListener\("contextmenu"/.test(guard) && /removeEventListener\("dragstart"/.test(guard));

const call = (path: string, dest?: string) => middleware(new NextRequest(`https://intranet.example${path}`, { headers: dest ? { "sec-fetch-dest": dest } : {} }));
const refused = call("/dsp-history/ks-sen-coke-oven-battery-1959.jpg", "document");
ok("the middleware refuses a public picture opened on its own (403, not cached) and lets a page show it", refused.status === 403 && /no-store/.test(refused.headers.get("cache-control") ?? "") && call("/dsp-history/ks-sen-coke-oven-battery-1959.jpg", "image").headers.get("x-middleware-next") === "1" && call("/Antoine_Leclerc.jpeg", "document").status === 403);
ok("it is set to run only on picture files (not the API, not the build's own files) and on Next's image optimiser, never on pages", config.matcher.length === 2 && config.matcher[1] === "/_next/image" && /\(\?!api\|_next\/static\)/.test(config.matcher[0]) && /jpg\|jpeg\|png\|gif\|webp\|avif/.test(config.matcher[0]) && !/html|js\b|css/.test(config.matcher[0]));
const route = readFileSync("src/app/api/employees/photo/route.ts", "utf8");
ok("the employees' photograph route applies the same rule (403 to a request that opens a picture on its own; the JSON data of a picture, meta=1, is not a picture)", /imageFetchAllowed\(request\.headers\)/.test(route) && /searchParams\.has\("meta"\)/.test(route));

console.log(`imageGuard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
