// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/ImageLightbox.selftest.tsx
// I want a picture to open over the page in its own layer (not in a new tab): a cross, Escape and a click outside close it, and Escape closes the picture only, never the search window behind it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LightboxView, fitSize, onEscape, type LightboxPicture } from "./ImageLightbox";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const pic: LightboxPicture = { src: "/dsp-history/panorama-inception.jpg", alt: "Panoramic view", title: "Panoramic view of Durgapur Steel Plant during its inception phase", tag: "1959", credit: "Photograph: SAIL" };

const html = renderToStaticMarkup(<LightboxView picture={pic} onClose={() => {}} size={{ w: 1209, h: 795 }} />);
ok("the layer is a modal dialog named by the picture's title, above everything (z 400, over the search window's own layers), dark, full screen", /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-label="Panoramic view of Durgapur Steel Plant during its inception phase"/.test(html) && /fixed inset-0 z-\[400\]/.test(html) && /bg-black\/90/.test(html));
ok("it has a cross that closes it, with a name a screen reader can read", /<button[^>]*data-lightbox-close/.test(html) && (html.match(/aria-label="Close the picture"/g) ?? []).length === 2);
ok("it shows the picture itself, as large as the screen allows and never cropped (object-contain, max height and width of the layer), with its title, its date tag and its credit", /<img[^>]*src="\/dsp-history\/panorama-inception\.jpg"/.test(html) && /object-contain/.test(html) && /max-h-full max-w-full/.test(html) && html.includes("Panoramic view of Durgapur Steel Plant during its inception phase") && html.includes(">1959<") && html.includes("Photograph: SAIL"));
ok("it says the size of the picture as it is, so that a small original is not mistaken for a poor display (1209 × 795 px)", /data-lightbox-size/.test(html) && html.includes("1209 × 795 px"));
ok("the enlarged picture has no background colour of its own (a white one showed as a pale fringe where the picture's edge fell on a half pixel); the dark layer shows round it", !/<img[^>]*bg-white/.test(html) && /<img[^>]*data-lightbox-image/.test(html));
ok("a link to open the file in a new tab is NOT there: the picture stays in the layer (no anchor, no target=_blank)", !/<a[\s>]/.test(html) && !/target="_blank"/.test(html));
ok("a click on the dark area closes it: the area is a button behind the picture (out of the tab order, named Close the picture), and the picture and its credit sit above it and do not close it", /<button[^>]*data-lightbox-backdrop/.test(html) && /tabindex="-1"/.test(html) && /pointer-events-none/.test(html) && /pointer-events-auto/.test(html) && /absolute inset-0/.test(html));

// the size it is shown at
const f1 = fitSize({ w: 606, h: 438 }, { w: 1300, h: 800 });
ok("a small picture (606 × 438) is enlarged to fill the room, the height being the limit here: 1.83 times, 1107 × 800, never cropped", !!f1 && Math.abs(f1.scale - 800 / 438) < 1e-9 && f1.w === 1107 && f1.h === 800);
const f2 = fitSize({ w: 200, h: 200 }, { w: 1300, h: 800 });
ok("a very small picture is enlarged at most twice (200 × 200 -> 400 × 400), so that it is not stretched into a blur", !!f2 && f2.scale === 2 && f2.w === 400 && f2.h === 400);
const f3 = fitSize({ w: 1209, h: 795 }, { w: 1300, h: 800 });
ok("a picture about as large as the room is shown at about its own size (1209 × 795 -> 1217 × 800)", !!f3 && f3.scale > 1 && f3.scale < 1.01 && f3.h === 800);
const f4 = fitSize({ w: 1209, h: 795 }, { w: 600, h: 500 });
ok("a picture larger than the room is shrunk to fit, with the same proportions (1209 × 795 into 600 × 500 -> 600 × 395)", !!f4 && f4.w === 600 && f4.h === 395 && f4.scale < 1);
ok("no room or no size yet gives nothing (the picture then shows at its own size, limited to the layer)", fitSize({ w: 0, h: 0 }, { w: 100, h: 100 }) === null && fitSize({ w: 10, h: 10 }, { w: -5, h: 100 }) === null);
const big = renderToStaticMarkup(<LightboxView picture={pic} onClose={() => {}} size={{ w: 606, h: 438 }} display={f1} />);
ok("the caption says the real size and that the picture is shown enlarged ('606 × 438 px, shown 1.8 times larger'); the picture takes the computed size", big.includes("606 × 438 px, shown 1.8 times larger") && /style="width:1107px;height:800px"/.test(big));
ok("a picture shown at about its own size does not claim to be enlarged", !/times larger/.test(renderToStaticMarkup(<LightboxView picture={pic} onClose={() => {}} size={{ w: 1209, h: 795 }} display={f3} />)));

// I take Escape for the picture and stop it, so the handler of the search window (which closes it on Escape) never sees it
const target = new EventTarget();
let closed = 0, windowSaw = 0;
// (Node's EventTarget has no capture and bubble phases, only the order of the listeners; in a browser the capture handler on window runs before any bubble handler whatever the order, so I put the lightbox first here)
const letGo = onEscape(target, () => { closed++; });
target.addEventListener("keydown", () => { windowSaw++; }); // the search window's own handler
const key = (k: string) => Object.assign(new Event("keydown", { cancelable: true }), { key: k });
target.dispatchEvent(key("a"));
ok("another key does nothing to the picture and reaches the page as usual", closed === 0 && windowSaw === 1);
const esc = key("Escape");
target.dispatchEvent(esc);
ok("Escape closes the picture and is NOT seen by the search window's handler (it stays open; the next Escape closes it)", closed === 1 && windowSaw === 1 && esc.defaultPrevented);
letGo();
target.dispatchEvent(key("Escape"));
ok("once the picture is closed, Escape goes back to the page (the handler is let go)", closed === 1 && windowSaw === 2);

// The search window closes on Escape in TopBar (a capture handler on window, registered long before this layer) unless the key comes from inside an element that owns Escape, so I mark the layer as one (found in a real browser: without the mark the window closed with the picture)
const topbar = readFileSync("src/components/TopBar.tsx", "utf8");
ok("the layer is marked data-escape-own, and TopBar leaves an Escape that comes from inside such an element alone (as it does for an open dropdown)", /data-escape-own="true"/.test(html) && /closest\('\[data-select-open="true"\], \[data-escape-own="true"\]'\)/.test(topbar));

// I wired this into the story card: every picture and every head's portrait opens in the layer
const card = readFileSync("src/tools/dsphistory/DspHistoryCard.tsx", "utf8");
ok("the story card opens its pictures and portraits in this layer: no link to a picture file with target=_blank is left", /ImageLightbox/.test(card) && (card.match(/<ImageLightbox /g) ?? []).length === 2 && !/<a href=\{photoSrc/.test(card));

console.log(`ImageLightbox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
