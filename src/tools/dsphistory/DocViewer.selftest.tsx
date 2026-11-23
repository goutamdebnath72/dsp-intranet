// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/dsphistory/DocViewer.selftest.tsx
// I check here the viewer of a JO Manual: what it shows for each answer of the route (signed in, not signed in, not uploaded, error), the strip with "page 34 of 102", the Title page / Cited page buttons, and the page the PDF opens at.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocViewerView, layerShown, stateOfStatus, viewSrc } from "./DocViewer";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");
const noop = () => undefined;
const view = (state: Parameters<typeof DocViewerView>[0]["state"], page = 34, cited = 34, onSignIn?: () => void, doc = "jo-086") => h(<DocViewerView open={{ doc, page: cited }} state={state} page={page} onPage={noop} onClose={noop} onSignIn={onSignIn} />);

ok("the route's answer decides the state: 200 ready, 401 sign in, 404 not uploaded, anything else an error", stateOfStatus(200) === "ready" && stateOfStatus(401) === "signin" && stateOfStatus(404) === "missing" && stateOfStatus(500) === "error" && stateOfStatus(403) === "error");
ok("the PDF opens at the cited page, thumbnails closed, 150%: /api/history-docs/jo-086#page=34&navpanes=0&zoom=150 (a page below 1 is page 1)", viewSrc("jo-086", 34) === "/api/history-docs/jo-086#page=34&navpanes=0&zoom=150" && viewSrc("jo-089", 0) === "/api/history-docs/jo-089#page=1&navpanes=0&zoom=150");

const ready = view("ready");
ok("signed in: the page view is there at that page (the manual's page drawn with the quote marked, not the whole file in a frame), and the strip names the manual and says 'page 34 of 102'", /data-doc-page-view/.test(ready) && /data-doc-page="34"/.test(ready) && !/<iframe/.test(ready) && /data-doc-pageof[^>]*>page 34 of 102</.test(ready) && /Industry &amp; Company Awareness/.test(ready) && !/data-doc-state/.test(ready));
ok("the strip has Previous page and Next page (not Previous on page 1, not Next on the last page) and 'Open the whole manual', a link to the browser's own viewer at that page", /data-doc-prev/.test(ready) && /data-doc-next/.test(ready) && !/data-doc-prev/.test(view("ready", 1, 1)) && !/data-doc-next/.test(view("ready", 102, 34)) && /data-doc-whole[^>]*/.test(ready) && /href="\/api\/history-docs\/jo-086#page=34"[^>]*data-doc-whole/.test(ready));
ok("on the cited page the strip offers 'Title page' (the proof that it is the right manual) and not 'Cited page'; on the title page it offers 'Cited page' and not 'Title page'; elsewhere both", /data-doc-title-page/.test(ready) && !/data-doc-cited-page/.test(ready) && !/data-doc-title-page/.test(view("ready", 1, 34)) && /data-doc-cited-page/.test(view("ready", 1, 34)) && /data-doc-title-page/.test(view("ready", 7, 34) ) && /data-doc-cited-page/.test(view("ready", 7, 34)));
ok("the DSP manual says its own length: 'page 12 of 49'", /page 12 of 49/.test(view("ready", 12, 12, undefined, "jo-089")));
const signin = view("signin", 34, 34, noop);
ok("not signed in: no PDF, a notice that says to sign in and why (internal), and a Sign in button", !/data-doc-page-view/.test(signin) && /data-doc-state="signin"/.test(signin) && /Sign in to read this document/.test(signin) && /internal to SAIL/.test(signin) && /data-doc-signin/.test(signin));
ok("without a way to open the sign-in window there is the notice but no button", !/data-doc-signin/.test(view("signin")));
ok("not uploaded, checking and error each say so, and show no PDF", /has not been uploaded yet/.test(view("missing")) && /Opening the document/.test(view("checking")) && /could not be opened just now/.test(view("error")) && ["missing", "checking", "error"].every((s) => !/data-doc-page-view/.test(view(s as "missing"))));
ok("a published PDF whose copy is not in storage yet says so and offers the publisher's own file at the cited page meanwhile; an internal manual offers nothing of the kind", (() => { const pub = view("missing", 36, 36, undefined, "steel-cities"), jo = view("missing", 3, 3, undefined, "jo-089"); return /data-doc-at-source/.test(pub) && /href="https:\/\/www\.sail\.co\.in\/sites\/default\/files\/publication\/2020-06\/sail_steel_cities\.pdf#page=36"/.test(pub) && /Open the publisher&#x27;s file at page 36 meanwhile/.test(pub) && !/data-doc-at-source/.test(jo); })());
ok("a published PDF's strip says 'page 36' without a total until the document is read, then 'page 36 of 70'; 'Open the whole document' leads to the publisher's file at that page", (() => { const a = view("ready", 36, 36, undefined, "steel-cities"), b = h(<DocViewerView open={{ doc: "steel-cities", page: 36 }} state="ready" page={36} total={70} onPage={noop} onClose={noop} />); return /data-doc-pageof[^>]*>page 36</.test(a) && /page 36 of 70/.test(b) && /href="https:\/\/www\.sail\.co\.in[^"]*sail_steel_cities\.pdf#page=36"[^>]*data-doc-whole/.test(a); })());
ok("while the reader is away signing in the viewer's layer is not drawn (the sign-in window must be on top of everything, and the layer is above the search window); it is drawn again afterwards, and never without an open document", layerShown({ doc: "jo-089", page: 3 }, false) && !layerShown({ doc: "jo-089", page: 3 }, true) && !layerShown(null, false) && !layerShown(null, true));
ok("the layer is the app's own full-screen viewer: closable, on top of the search window, taking Escape for itself", /role="dialog"/.test(ready) && /aria-label="Close the document"/.test(ready) && /data-escape-own/.test(ready) && /z-\[400\]/.test(ready));

console.log(`DocViewer: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
