// Run (from the project root): npx tsx src/lib/search/edsLayout.selftest.ts
// The omnibar box widens only while an answer shows a table of 4+ columns, and it is a pure function of that answer.
import { readFileSync } from "node:fs";
import { answerNeedsWideModal, needsWideModal } from "./edsLayout";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}`); } };

const rows = [["a", "b", "c", "d"]];
ok("no answer: normal width", needsWideModal(null) === false && needsWideModal(undefined) === false);
ok("no tables: normal width", needsWideModal({}) === false && needsWideModal({ table: null, extraTable: null }) === false);
ok("a 2-column table: normal width", needsWideModal({ table: { columns: ["P", "A"], rows: [["x", "y"]] } }) === false);
ok("a 3-column table: normal width", needsWideModal({ table: { columns: ["P", "A", "B"], rows: [["x", "y", "z"]] } }) === false);
ok("a 4-column table with rows: wide", needsWideModal({ table: { columns: ["P", "A", "B", "C"], rows } }) === true);
ok("a 5-column table with rows: wide", needsWideModal({ table: { columns: ["P", "A", "B", "C", "D"], rows } }) === true);
ok("a 4-column table with no rows: normal width", needsWideModal({ table: { columns: ["P", "A", "B", "C"], rows: [] } }) === false);
ok("the second table alone can widen it", needsWideModal({ table: { columns: ["P", "A"], rows: [["x", "y"]] }, extraTable: { columns: ["P", "A", "B", "C"], rows } }) === true);
ok("missing columns do not throw", needsWideModal({ table: { rows } }) === false);

// an answer CARD (hospital tables, model/finder table) follows the same rule
const wide4 = { columns: ["A", "B", "C", "D"], rows: [["1", "2", "3", "4"]] };
const narrow2 = { columns: ["A", "B"], rows: [["1", "2"]] };
ok("card: no answer / no table: normal", !answerNeedsWideModal(null) && !answerNeedsWideModal({}) && !answerNeedsWideModal({ hospital: {} }));
ok("card: hospital table of 4+ columns: wide (the weekly OPD schedule has 7)", answerNeedsWideModal({ hospital: { table: { columns: ["Room", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], rows: [["OPD 46", "-", "-", "-", "-", "-", "-"]] } } }));
ok("card: hospital table of 2 columns: normal", !answerNeedsWideModal({ hospital: { table: narrow2 } }));
ok("card: a wide extra table widens it", answerNeedsWideModal({ hospital: { table: narrow2, extraTables: [{ table: wide4 }] } }));
ok("card: a model/finder table of 4+ columns: wide, of 3: normal", answerNeedsWideModal({ nl2sql: { table: wide4 } }) && !answerNeedsWideModal({ nl2sql: { table: { columns: ["A", "B", "C"], rows: [["1", "2", "3"]] } } }));

// the screen takes the answer being shown, so it narrows when that answer goes (a new query or an edit makes `synthesis` null)
const src = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the box width is computed from the synthesis shown now (and from a calculator page that asks for the wide box: toolWidth.selftest.ts)", src.includes('const wideModal = (mode === "intellectual" && needsWideModal(synthesis)) || (!isLoading && answerNeedsWideModal(analytics)) || toolFormIsWide(toolForm);'));
ok("the wide box is exactly the page's width (--omni-page-width), and no other box is wider than the page", src.includes("wideModal ? `min(${PAGE_WIDTH_VAR}, 100%)` : normalMaxWidth;") && src.includes("${PAGE_WIDTH_VAR}, 100%)`") && src.includes("maxWidth: currentMaxWidth,"));
ok("the box's row leaves the scrollbar's room on its right, so the box and the page behind share one centre", src.includes('html.style.setProperty("--scrollbar-comp"') && src.includes('html.style.removeProperty("--scrollbar-comp")') && src.includes('style={{ paddingRight: "calc(1rem + var(--scrollbar-comp, 0px))" }}'));
ok("the blur covers only the page's footprint; the dimming covers the screen (a screen-wide blur smeared the page's dark edge outside the box)", src.includes('className="fixed inset-0 bg-neutral-900/40"') && src.includes('className="fixed inset-y-0 left-0 mx-auto backdrop-blur-sm"') && src.includes('style={{ right: "var(--scrollbar-comp, 0px)", width: PAGE_WIDTH_VAR, maxWidth: "100%" }}') && !/bg-neutral-900\/40 backdrop-blur-sm/.test(src));
ok("the text scale of the card is the screen's scale times MODAL_TEXT_FACTOR (3% smaller), in the wide box and in the normal box alike", /const MODAL_TEXT_FACTOR = 0\.97;/.test(src) && src.includes('"--omni-k": Number((omniK * MODAL_TEXT_FACTOR).toFixed(4))') && !/wideModal \? Number\(\(omniK/.test(src));
ok("the stored text scale state (omniK) is not changed by the factor (the factor is applied only where the variable is set)", !/setOmniK\([^)]*MODAL_TEXT_FACTOR/.test(src));
ok("no fixed wide width is left in the modal (76rem / 88vw / 96vw / 2000px)", !/WIDE_MODAL_WIDTH|WIDE_MODAL_MAX|96 : 92/.test(src));
const css = readFileSync("src/app/globals.css", "utf8");
ok("--omni-page-width is the full width below md and --content-width from md up", /--omni-page-width: 100vw;/.test(css) && /@media \(min-width: 768px\) \{\s*:root \{\s*--omni-page-width: var\(--content-width\);/.test(css));
ok("the page wrappers use the same breakpoint rule (w-full md:w-[var(--content-width)])", readFileSync("src/components/HomepageNew.tsx", "utf8").includes("w-full md:w-[var(--content-width)]"));
ok("nothing stores the wide state (no useState for it)", !/useState[^\n]*[wW]ide/.test(src));
ok("the text scale does not follow the wide state", !/getExpectedK[\s\S]{0,600}wideModal/.test(src.split("const getExpectedK")[1]?.split("const [omniK")[0] ?? ""));

console.log(`edsLayout selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
