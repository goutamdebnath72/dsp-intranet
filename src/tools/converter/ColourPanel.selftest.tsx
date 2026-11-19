// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/converter/ColourPanel.selftest.tsx
// The colour converter's card: RGB on one side, HEX on the other, the colour under them; that it is a kind of the converter's dropdown; and that a typed line reaches it (and a plain number does not).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detectTool } from "@/lib/tools/detect";
import { ConverterCard } from "./ConverterCard";
import { ColourPanel } from "./ColourPanel";
import { CONV_KINDS, KIND_NAMES, optionsFor, defaultPair } from "./converterModel";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");
const count = (t: string, re: RegExp): number => (t.match(re) ?? []).length;
const hit = (q: string) => detectTool(q);

const card = h(<ConverterCard start={{ kind: "colour", from: "rgb", to: "hex", value: 0, colour: "#FF5733" }} rates={null} ratesState="idle" />);
ok("the converter has a Colour (RGB · HEX · HSL) kind, last but one (before currency), with no units of its own and rgb/hex as its pair", CONV_KINDS.includes("colour") && KIND_NAMES.colour === "Colour (RGB · HEX · HSL)" && CONV_KINDS.indexOf("colour") === CONV_KINDS.indexOf("currency") - 1 && optionsFor("colour").length === 0 && defaultPair("colour").join() === "rgb,hex");
ok("opened on a colour, the card shows the colour panel and the kind in its dropdown, not the two unit boxes", /data-colour-panel/.test(card) && /data-value="colour"/.test(card) && !/aria-label="Convert from"/.test(card));
ok("it opens on #FF5733: red 255, green 87, blue 51 in the three RGB boxes and #FF5733 in the HEX box", /aria-label="Red, 0 to 255"[^>]*value="255"/.test(card) && /aria-label="Green, 0 to 255"[^>]*value="87"/.test(card) && /aria-label="Blue, 0 to 255"[^>]*value="51"/.test(card) && /aria-label="HEX colour, 3 or 6 digits"[^>]*value="#FF5733"/.test(card));
ok("the colour itself is shown under them, with both written forms, #FF5733 and rgb(255, 87, 51), on the colour (the ink is white or black by brightness)", /data-colour-swatch[^>]*background-color:#FF5733/i.test(card) && /#FF5733<\/p>/.test(card) && /rgb\(255, 87, 51\)/.test(card) && /color:#(?:0f172a|ffffff)/i.test(card));
ok("it opens on #FF5733 as hsl(11, 100%, 60%): hue 11, saturation 100, lightness 60 in the three HSL boxes, and all three written forms under the colour", /aria-label="Hue, 0 to 360 degrees"[^>]*value="11"/.test(card) && /aria-label="Saturation, 0 to 100 per cent"[^>]*value="100"/.test(card) && /aria-label="Lightness, 0 to 100 per cent"[^>]*value="60"/.test(card) && /rgb\(255, 87, 51\) · hsl\(11, 100%, 60%\)/.test(card));
ok("the three panels are RGB, HEX and HSL in that order, each can be copied, nothing is shown as wrong at first, and the note says HSL is in whole numbers", (() => { const i = card.indexOf('data-colour-model="rgb"'), j = card.indexOf('data-colour-model="hex"'), k = card.indexOf('data-colour-model="hsl"'); return i > 0 && j > i && k > j && count(card, /aria-label="Copy/g) >= 3 && !/role="alert"/.test(card) && /data-colour-note[^>]*>[^<]*whole numbers/.test(card); })());
ok("a colour typed as HSL reaches the card: 'hsl(0, 100%, 50%)' opens on #FF0000 with hue 0, and 'hsl(11, 100%, 60%) to rgb' is answered by the colour card", (hit("hsl(0, 100%, 50%)") as { kind?: string; hex?: string } | null)?.hex === "#FF0000" && (hit("hsl(11, 100%, 60%) to rgb") as { kind?: string } | null)?.kind === "colour" && /value="#FF0000"/.test(h(<ColourPanel startHex="#FF0000" />)));
ok("a three-digit start (#f53) opens as #FF5533 and an invalid start falls back to the default colour", /value="#FF5533"/.test(h(<ColourPanel startHex="#f53" />)) && /value="#4F46E5"/.test(h(<ColourPanel startHex="nonsense" />)));
ok("the card's other kinds are unchanged: length still opens the two unit boxes", (() => { const x = h(<ConverterCard start={{ kind: "length", from: "km", to: "mi", value: 1 }} rates={null} ratesState="idle" />); return /aria-label="Convert from"/.test(x) && !/data-colour-panel/.test(x); })());

ok("each of the six boxes (red, green, blue, hue, saturation, lightness) has a spinner: an Increase and a Decrease arrow, which are hidden until the pointer is over the box or it is being typed in", count(card, /data-colour-spinner/g) === 6 && ["Red", "Green", "Blue", "Hue", "Saturation", "Lightness"].every((n) => new RegExp(`aria-label="Increase ${n}"`).test(card) && new RegExp(`aria-label="Decrease ${n}"`).test(card)) && count(card, /opacity-0[^"]*group-hover:opacity-100/g) === 12 && count(card, /group-focus-within:opacity-100/g) === 12);
ok("the arrows cannot be pressed while hidden (no stray taps), are buttons that are skipped by Tab, and the HEX box has none", count(card, /pointer-events-none[^"]*group-hover:pointer-events-auto/g) === 12 && count(card, /tabindex="-1"/g) === 12 && !/data-colour-model="hex"[\s\S]*data-colour-spinner/.test(card.slice(card.indexOf('data-colour-model="hex"'), card.indexOf('data-colour-model="hsl"'))));

// the typed line reaches the colour card
ok("'#ff5733 to rgb', 'rgb(255, 87, 51) to hex', '255,87,51 to hex' and 'rgb to hex' are answered as you type by the colour card", ["#ff5733 to rgb", "rgb(255, 87, 51) to hex", "255,87,51 to hex", "rgb to hex"].every((q) => (hit(q) as { kind?: string } | null)?.kind === "colour"));
ok("the answer carries the colour as a six-digit HEX: #ff5733 -> #FF5733, rgb(255,87,51) -> #FF5733, rgb to hex -> the default #4F46E5", (hit("#ff5733") as { hex?: string } | null)?.hex === "#FF5733" && (hit("rgb(255,87,51)") as { hex?: string } | null)?.hex === "#FF5733" && (hit("rgb to hex") as { hex?: string } | null)?.hex === "#4F46E5");
ok("other lines are not taken for a colour: a number, a unit conversion, a currency, a sum, a word of three hex letters", ["255 87 51", "5 km in miles", "100 usd to inr", "12*45+7", "bad", "add"].every((q) => (hit(q) as { kind?: string } | null)?.kind !== "colour"));
ok("a unit converter question still opens the unit converter's form, not the colour", (() => { const x = hit("unit converter") as { kind?: string; form?: string } | null; return !!x && x.kind !== "colour"; })());

console.log(`ColourPanel: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
