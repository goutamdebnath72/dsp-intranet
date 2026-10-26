// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/omniScale.selftest.tsx
// Step 56b: the text of the query modal keeps its OLD proportion to the modal's width (the modal got wider in step 54i, the text did not). This guards the three things that can silently go wrong:
// the factor, a text size that has no rule (it would simply not grow), and a wide table that is scaled with the rest (it would break again).

import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { OMNI_BASE_PX, OMNI_MAX_SCALE, omniScaleFor } from "./omniScale";
import { HospitalAnswerCard } from "../../components/HospitalAnswerCard";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ---- the factor
ok("the old width is 52rem = 832 px", OMNI_BASE_PX === 832);
ok("at the old width or narrower the text is untouched (1)", omniScaleFor(832) === 1 && omniScaleFor(700) === 1 && omniScaleFor(0) === 1);
ok("it grows in proportion to the width: 1026 px (60% of a 1710 px screen) = 1.23, 1040 px = 1.25", omniScaleFor(1026) === 1.23 && omniScaleFor(1040) === 1.25);
ok("864 px (60% of a 1440 px screen) = 1.04", omniScaleFor(864) === 1.04);
ok(`never more than ${OMNI_MAX_SCALE}, however wide`, omniScaleFor(1600) === 1.5 && omniScaleFor(5000) === OMNI_MAX_SCALE);
ok("nonsense gives 1, never NaN", omniScaleFor(NaN) === 1 && omniScaleFor(Infinity) === 1 && omniScaleFor(1000, 0) === 1 && omniScaleFor(1000, NaN) === 1);
ok("another root size: at 20 px per rem the old width is 1040 px", omniScaleFor(1040, 52 * 20) === 1 && omniScaleFor(1300, 52 * 20) === 1.25);

// ---- every text size the modal's components use has a rule
const css = readFileSync("src/components/omniScale.css", "utf8");
const seen = new Set<string>();
const queue = ["src/components/OmnibarModal.tsx"];
while (queue.length) {
  const f = queue.pop() as string;
  if (seen.has(f)) continue;
  seen.add(f);
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/from\s+["'](?:@\/components\/|\.\/)([A-Za-z0-9_]+)["']/g)) {
    if (/CircularViewerLightbox/.test(m[1])) continue; // its own full-screen layer, not inside the modal card
    for (const ext of [".tsx", ".ts"]) { const p = `src/components/${m[1]}${ext}`; if (existsSync(p)) { queue.push(p); break; } }
  }
}
const all = [...seen].map((f) => readFileSync(f, "utf8")).join("\n");
ok("the crawl reached the cards of the modal", seen.size >= 10 && [...seen].some((f) => f.endsWith("HospitalAnswerCard.tsx")) && [...seen].some((f) => f.endsWith("CircularAnswerCard.tsx")), [...seen].join(","));
const uniq = (re: RegExp) => [...new Set([...all.matchAll(re)].map((m) => m[0]))];
const rule = (selector: string) => css.includes(selector);
for (const c of uniq(/(?<![\w:\[-])text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g)) ok(`a rule for ${c}`, rule(`.omni-scale .${c} {`), c);
for (const c of uniq(/text-\[[0-9.]+(?:px|rem)\]/g)) ok(`a rule for ${c}`, rule(`.omni-scale .${c.replace(/[[\]]/g, "\\$&")} {`), c);
for (const c of uniq(/\b[a-z-]+:text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g)) ok(`a rule for ${c} (and only the sm breakpoint exists in the modal)`, c.startsWith("sm:") && rule(`.omni-scale .${c.replace(":", "\\:")} {`), c);
for (const c of uniq(/\bleading-(?:none|tight|snug|normal|relaxed|loose)\b/g)) ok(`a rule for ${c}`, rule(`.omni-scale .${c} {`), c);
ok("no fixed-size leading class (leading-5, leading-[18px]) that would not follow the new font size", uniq(/\bleading-(?:[0-9]+|\[[^\]]+\])/g).length === 0, uniq(/\bleading-(?:[0-9]+|\[[^\]]+\])/g).join(" "));
ok("no other unit of arbitrary font size that has no rule (px and em are handled: em follows its parent)", uniq(/text-\[[0-9.]+rem\]/g).length === 0);

// ---- the stylesheet itself
ok("the stylesheet scales the root of the modal and lets a table opt out (the variable is 1 inside it)", /\.omni-scale \{\s*font-size: calc\(1rem \* var\(--omni-k, 1\)\);\s*\}/.test(css) && /\.omni-scale \.omni-noscale \{\s*--omni-k: 1;\s*font-size: 1rem;\s*\}/.test(css));
ok("every size rule multiplies by the variable, with 1 as the fallback (no variable, no change)", (css.match(/var\(--omni-k, 1\)/g) ?? []).length === 28 && !/var\(--omni-k\)/.test(css));
ok("the leading classes come BEFORE the sm: rules, as in Tailwind's own sheet", css.indexOf(".omni-scale .leading-relaxed") > 0 && css.indexOf(".omni-scale .leading-relaxed") < css.indexOf("@media (min-width: 640px)"));

// ---- the wiring
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the modal imports the stylesheet and the factor, measures its own width and sets the variable on the card", /import "\.\/omniScale\.css";/.test(modal) && /omniScaleFor\(el\.offsetWidth, BASE_MODAL_WIDTH_REM \* rootPx\)/.test(modal) && /style=\{\{ "--omni-k": omniK \} as React\.CSSProperties\}/.test(modal) && /className="omni-scale relative w-full/.test(modal));
ok("it measures the layout width (offsetWidth), not the animated one", !/getBoundingClientRect\(\)\.width/.test(modal.slice(modal.indexOf("omniScaleFor(el"), modal.indexOf("omniScaleFor(el") + 200)));
const card = renderToStaticMarkup(<HospitalAnswerCard answer={{ title: "t", table: { columns: ["Unit", "Days", "Room", "Doctor", "Ticket", "Discipline"], rows: [["Unit I", "Wed, Sat", "OPD 3", "Dr. A", "499120", "Medicine"]] } }} />);
ok("the doctors' table is inside an omni-noscale wrapper (it keeps its size and the room it needs)", /<div class="omni-noscale[^"]*"><table/.test(card), card.slice(0, 300));
const withExtra = renderToStaticMarkup(<HospitalAnswerCard answer={{ title: "t", extraTables: [{ title: "x", table: { columns: ["a", "b"], rows: [["1", "2"]] } }] }} />);
ok("...and so is every extra table", /<div class="omni-noscale[^"]*"><table/.test(withExtra), withExtra.slice(0, 300));

console.log(`omniScale selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
