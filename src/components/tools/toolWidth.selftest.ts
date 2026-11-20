// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/toolWidth.selftest.ts
// The PF page takes the wide box (the width an answer with a table of 4+ columns gets); no other calculator, the menu or no form does, so the box narrows the moment the PF form is closed.
import { readFileSync } from "node:fs";
import { toolFormIsWide, toolFormMaxRem } from "./toolWidth";
import { PF_BOX_REM } from "@/tools/pf/ui";
import { TOPIC_UIS } from "@/tools/registry.ui";
import { WIDE_TABLE_COLUMNS, needsWideModal } from "@/lib/search/edsLayout";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

ok("the PF page asks for the wide box, and for a width of its own in rem (PF_BOX_REM), which follows the text size and the zoom and is never more than the page", toolFormIsWide("pf") && toolFormMaxRem("pf") === PF_BOX_REM && PF_BOX_REM >= 52 && PF_BOX_REM <= 100);
ok("no other form, the menu or no form asks for a width in rem", ["gratuity", "calc", "menu"].every((f) => toolFormMaxRem(f) === null) && toolFormMaxRem(null) === null);
ok("no other calculator page does (gratuity, leave encashment, dates, converter, tyre, EV, VIN, BH, calculator), nor the menu, nor no form", ["gratuity", "encashment", "dates", "converter", "tyre", "ev", "vin", "bh", "calc", "menu"].every((f) => !toolFormIsWide(f)) && !toolFormIsWide(null) && !toolFormIsWide(undefined) && !toolFormIsWide("nonsense"));
ok("exactly one form asks for the wide box today", TOPIC_UIS.filter((t) => t.form?.wide).map((t) => t.id).join() === "pf");
// the box takes the same width as the Deep Synthesis answer with a table of 4+ columns: one switch, one width, written once
const src = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the omnibar's wide switch is the Deep Synthesis rule OR a form that asks for the wide box; a page with its own width gets min(rem, the page, 100%), every other wide box is the page's width", /const wideModal = \(mode === "intellectual" && needsWideModal\(synthesis\)\) \|\| toolFormIsWide\(toolForm\);/.test(src) && /toolRem !== null \? `min\(\$\{toolRem\}rem, \$\{PAGE_WIDTH_VAR\}, 100%\)` : wideModal \? `min\(\$\{PAGE_WIDTH_VAR\}, 100%\)` : normalMaxWidth/.test(src));
ok("the shared omnibar file names no topic for this (no 'pf' in the width rule)", !/wideModal[^\n]*\bpf\b/.test(src) && !/toolFormIsWide\("pf"\)/.test(src));
ok("a table of 4 columns is where the Deep Synthesis box turns wide (the same rule the PF page now follows)", WIDE_TABLE_COLUMNS === 4 && needsWideModal({ table: { columns: ["a", "b", "c", "d"], rows: [[1]] } }) && !needsWideModal({ table: { columns: ["a", "b", "c"], rows: [[1]] } }));

console.log(`toolWidth selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
