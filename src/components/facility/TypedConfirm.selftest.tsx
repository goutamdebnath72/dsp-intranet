// Run (from the project root):  npx tsx --tsconfig tsconfig.selftest.json src/components/facility/TypedConfirm.selftest.tsx
// Step 69a: the shared "type it to confirm" box of every deletion: the value to type appears nowhere, pasting and dropping are refused, the box is an ordinary text box otherwise.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TypedConfirm } from "./TypedConfirm";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const noop = () => undefined;
const h = (el: React.ReactElement) => renderToStaticMarkup(el);

const m = h(<TypedConfirm id="emp-confirm" label="Type his ticket number to confirm" value="" onChange={noop} className="box" maxLength={6} mark={{ name: "data-emp-field", value: "confirm" }} />);
ok("the label says what to type, in words, and the box starts empty", m.includes(">Type his ticket number to confirm<") && /value=""/.test(m));
ok("it carries the mark of the tool for its tests and scripts, and the box is linked to its label", m.includes('data-emp-field="confirm"') && /for="emp-confirm"/.test(m) && /id="emp-confirm"/.test(m));
ok("it is a numeric text box of the length asked, with no autocomplete and no spell check", /inputmode="numeric"/i.test(m) && /maxlength="6"/i.test(m) && /autocomplete="off"/i.test(m) && /spellcheck="false"/i.test(m));
ok("it says plainly that pasting is switched off (and the hint is linked to the box for screen readers)", m.includes("Type it from memory: pasting is switched off.") && /aria-describedby="emp-confirm-hint"/.test(m));
ok("what is typed is shown as typed (it is the person's own typing), and nothing else is written in the box", h(<TypedConfirm id="x" label="L" value="342461" onChange={noop} className="b" />).includes('value="342461"'));
ok("a tool without a mark gets none (no stray attribute)", !/data-emp-field|data-pax-field/.test(h(<TypedConfirm id="x" label="L" value="" onChange={noop} className="b" />)));
const src = readFileSync("src/components/facility/TypedConfirm.tsx", "utf8");
ok("pasting, dropping and dragging over the box are all refused (the events are cancelled)", /onPaste=\{stop\}/.test(src) && /onDrop=\{stop\}/.test(src) && /onDragOver=\{stop\}/.test(src) && /const stop = \(e: React\.SyntheticEvent\) => e\.preventDefault\(\)/.test(src));
const propsBody = src.slice(src.indexOf("export interface TypedConfirmProps"), src.indexOf("export function TypedConfirm"));
ok("the component never receives the value to type, so it cannot print it: its props have no 'expected', 'answer' or 'target' field", !/\b(expected|answer|target|secret|correct)\b/i.test(propsBody.replace(/\/\*\*[^]*?\*\//g, "")));
ok("the value is cleared only by its owner (the component keeps no state of its own)", !/useState|useEffect/.test(src));
console.log(`TypedConfirm selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
