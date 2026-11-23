// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/calculator/CalculatorCard.selftest.tsx
// This tests the calculator's card with its number bases: the DEC/BIN/OCT/HEX switch (scientific only), A-F in the place of the six trig keys in HEX, the keys a base does not have greyed, the other bases under the number,
// and, above all, that I get the same size of panel and the same keys in the same places in every base.
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalculatorCard, displayScale } from "./CalculatorCard";
import { TOPIC_UIS } from "@/tools/registry.ui";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");
const count = (t: string, re: RegExp): number => (t.match(re) ?? []).length;

const dec = h(<CalculatorCard start="sci" />);
const hex = h(<CalculatorCard start="sci" startBase={16} startValue={255} />);
const bin = h(<CalculatorCard start="sci" startBase={2} startValue={255} />);
const basic = h(<CalculatorCard start="basic" />);
const grid = (t: string): string => (/data-calc-grid[^>]*>/.exec(t) ?? [""])[0];
const panel = (t: string): string => (/aria-label="(?:Scientific|Basic) calculator"[\s\S]*?style="([^"]*)"/.exec(t) ?? ["", ""])[1];
const buttons = (t: string): string[] => (t.match(/<button[^>]*aria-label="[^"]*"/g) ?? []).map((x) => /aria-label="([^"]*)"/.exec(x)?.[1] ?? "");
const keysOf = (t: string): string[] => buttons(t.slice(t.indexOf("data-calc-grid")));

ok("the scientific calculator has the base switch with DEC, BIN, OCT, HEX, in that order; the basic one does not", count(dec, /data-calc-base="[^"]*"/g) === 1 && ["DEC", "BIN", "OCT", "HEX"].every((l) => dec.includes(`>${l}</span>`)) && dec.indexOf(">DEC</span>") < dec.indexOf(">BIN</span>") && dec.indexOf(">BIN</span>") < dec.indexOf(">OCT</span>") && dec.indexOf(">OCT</span>") < dec.indexOf(">HEX</span>") && !/data-calc-base="[^"]*"/.test(basic));
ok("the switch shows the base in use: DEC selected at first, HEX selected when opened on a hex number", /aria-selected="true"[^>]*aria-label="Decimal"/.test(dec) && /aria-selected="true"[^>]*aria-label="Hexadecimal"/.test(hex) && /aria-selected="false"[^>]*aria-label="Decimal"/.test(hex));
ok("THE PANEL KEEPS ITS SIZE AND KEYS: the same width and height, the same grid of 10 columns and 5 rows, and the same number of keys, in DEC, BIN and HEX (only the six keys' faces change)", panel(dec) === panel(hex) && panel(dec) === panel(bin) && panel(dec).length > 20 && grid(dec) === grid(hex) && grid(dec) === grid(bin) && /repeat\(10, var\(--calc-bw\)\)/.test(grid(hex)) && keysOf(dec).length === keysOf(hex).length && keysOf(dec).length === keysOf(bin).length && keysOf(dec).length === 50);
ok("in HEX the six trig keys (Sine, Cosine, Tangent, Hyperbolic sine, cosine, tangent) are the digits A to F, in the same places in the grid", (() => { const d = keysOf(dec), x = keysOf(hex); const at = (n: string) => d.indexOf(n); const places = ["Sine", "Cosine", "Tangent", "Hyperbolic sine", "Hyperbolic cosine", "Hyperbolic tangent"].map(at); return places.every((i) => i >= 0) && ["A", "B", "C", "D", "E", "F"].every((c, k) => x[places[k]] === `Digit ${c}`) && x.every((n, i) => places.includes(i) || n === d[i]); })());
ok("in DEC the digits A to F do not exist; in BIN the trig keys stay (greyed)", !/aria-label="Digit [A-F]"/.test(dec) && !/aria-label="Digit [A-F]"/.test(bin) && /aria-label="Sine"/.test(bin));
ok("BIN: the digits 2 to 9 are greyed (disabled) and 0 and 1 are not; the point, sin, √ and π are greyed; the four rules and = are live", (() => { const off = (n: string) => new RegExp(`disabled=""[^>]*aria-label="${n}"`).test(bin); const on = (n: string) => new RegExp(`aria-label="${n}"`).test(bin) && !off(n); return ["2", "3", "9", "Decimal point", "Sine", "Square root", "Pi", "Percent"].every(off) && ["0", "1", "Add", "Subtract", "Multiply", "Divide", "Equals", "Square", "Factorial"].every(on); })());
ok("HEX: A to F and 0 to 9 are live; the point and π are greyed", (() => { const off = (n: string) => new RegExp(`disabled=""[^>]*aria-label="${n}"`).test(hex); return ["A", "F"].every((c) => !off(`Digit ${c}`)) && ["0", "9"].every((d) => !off(d)) && off("Decimal point") && off("Pi"); })());
ok("DEC: no key is greyed, as before", count(dec, /disabled=""/g) === 0 && count(basic, /disabled=""/g) === 0);
ok("a number in HEX is shown in HEX (FF), with a HEX badge, and the other bases under it: DEC 255 · BIN 1111 1111 · OCT 377", /aria-label="Display"[^>]*>FF</.test(hex) && /data-calc-base-badge[^>]*>HEX</.test(hex) && /data-calc-bases[^>]*>DEC 255  ·  BIN 1111 1111  ·  OCT 377</.test(hex));
ok("in BIN the number is grouped in fours (1111 1111) and the line under it gives DEC, OCT and HEX; the copy button copies it without the spaces", /aria-label="Display"[^>]*>1111 1111</.test(bin) && /data-calc-bases[^>]*>DEC 255  ·  OCT 377  ·  HEX FF</.test(bin));
ok("in DEC the line under the number is still the Indian words (255: two hundred fifty-five), not the bases, and there is no base badge", (() => { const x = h(<CalculatorCard start="sci" startBase={10} startValue={100000} />); return /≈ 1 lakh/i.test(x) && !/data-calc-bases/.test(x) && !/data-calc-base-badge/.test(x); })());
ok("the card opened on a typed number does not take the keyboard from the search line (autoFocus false), and does when opened as a form (the default)", (() => { const src = fs.readFileSync(path.join(__dirname, "CalculatorCard.tsx"), "utf8"); const hit = (TOPIC_UIS.find((t) => t.id === "calc")?.hits ?? []).length; return /if \(autoFocus\) panel\.current\?\.focus/.test(src) && /autoFocus = true/.test(src) && hit >= 2; })());
ok("a long number gets smaller to fit its one line: 66 characters of DEC go to 0.34 of a key (the floor), of BIN to 0.35 (its narrow digits take more characters: 24 where decimal holds 15, measured in a browser), and never below 0.22; a short one keeps 0.95", displayScale("1".repeat(66), true) === 0.34 && Math.abs(displayScale("1".repeat(66), true, 2) - 0.95 * 24 / 66) < 1e-9 && displayScale("1".repeat(200), true, 2) === 0.22 && displayScale("FF", true, 16) === 0.95 && displayScale("12", false) === 0.95);
ok("a 53-digit binary number is on the display whole (grouped, 66 characters), with its other bases under it", (() => { const x = h(<CalculatorCard start="sci" startBase={2} startValue={9007199254740991} />); const g = "1".repeat(53).replace(/(?=(?:1{4})+$)/g, " ").trim(); return x.includes(`>${g}<`) && /DEC 9,00,71,99,25,47,40,991/.test(x); })());

console.log(`CalculatorCard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
