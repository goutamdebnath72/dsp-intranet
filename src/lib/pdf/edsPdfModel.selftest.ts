// src/lib/pdf/edsPdfModel.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/lib/pdf/edsPdfModel.selftest.ts)
// The rules of the EDS PDF: text and scripts, symbols the fonts lack, table cells, chart geometry, file name, and the guards that keep the button on the EDS reply only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import {
  buildEdsPdfModel, chartModel, edsPdfFileName, hasPdfContent, inlineRuns, niceTicks, parseCell, pdfSafe, plainOf, slicePath, sourceName, splitScripts, tableModel, estimateTableHeight, tableFitsOnePage, PLOT_H, PLOT_W,
} from "./edsPdfModel";
import type { SynthesisResult } from "@/lib/search/executiveSynthesis";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) passed++; else { failed++; console.log(`  FAIL  ${name}${detail ? " -- " + detail : ""}`); } };
const now = DateTime.fromISO("2026-11-10T08:42:00", { zone: "Asia/Kolkata" });
const cites = [{ id: 6, headline: "Circular - Rules for Retention", publishedAt: "2022-12-26", label: "Circular 046 (2022)" }, { id: 21, headline: "Notice - GPAIS", publishedAt: "2024-08-20" }];

// ---- symbols the fonts lack, emoji
check("≥ ≤ → ≈ are written plainly", pdfSafe("a ≥ b ≤ c → d ≈ e") === "a >= b <= c -> d ~ e");
check("emoji and zero-width marks are removed (never an empty box)", pdfSafe("✅ Done​!") === " Done!".replace(/^ /, " ") || pdfSafe("✅ Done​!").trim() === "Done!");
check("the rupee sign, ×, dashes and curly quotes are kept (the fonts have them)", pdfSafe("₹5 × 2 – “x” — y") === "₹5 × 2 – “x” — y");

// ---- scripts
{
  const r = splitScripts("Pay ₹2,400 per month");
  check("a rupee sign is a run of its own, the number after it is latin", r.map((x) => `${x.script}:${x.text}`).join("|") === "latin:Pay |rupee:₹|latin:2,400 per month", JSON.stringify(r));
  const h = splitScripts("Hindi सेल स्थापना दिवस end");
  check("each Hindi word is a devanagari run; the spaces between are in the main font (the Hindi font has no space)", h.filter((x) => x.script === "devanagari").map((x) => x.text).join("|") === "सेल|स्थापना|दिवस" && h.every((x) => x.script === "devanagari" ? !/\s/.test(x.text) : true), JSON.stringify(h));
  const b = splitScripts("মেরিট ২০২৬ ok \"মেরিট\"");
  check("Bengali words and Bengali digits are bengali runs; quotes and spaces are latin", b.filter((x) => x.script === "bengali").map((x) => x.text).join("|") === "মেরিট|২০২৬|মেরিট" && b.filter((x) => x.script === "latin").every((x) => !/[\u0980-\u09FF]/.test(x.text)), JSON.stringify(b));
  check("a zero-width joiner stays inside its Hindi word", splitScripts("क्\u200Dष").length === 1);
  check("no characters are lost or changed by splitting", plainOf(splitScripts("Pay ₹2,400 / सेल / মেরিট ok").map((x) => ({ ...x }))) === "Pay ₹2,400 / सेल / মেরিট ok");
}

// ---- inline markdown
{
  const runs = inlineRuns("Pay **4x HRR** or *twice* the `base`: ₹ 2400/- today");
  check("bold, italic and code runs", runs.some((r) => r.bold && r.text === "4x HRR") && runs.some((r) => r.italic && r.text === "twice") && runs.some((r) => r.code && r.text === "base"));
  check("rupee amounts get the Indian digit grouping, '/-' stays", plainOf(runs).includes("₹ 2,400/-"), plainOf(runs));
  check("the markers themselves are not printed", !/\*|`/.test(plainOf(runs)));
}

// ---- table cells (the same reading as on screen)
{
  check("first column is a label", parseCell("Up to 2 months", 0).kind === "label");
  check("'Not stated in circular' / N/A / Nil are 'none' cells", ["Not stated in circular", "N/A", "Nil", "Not applicable", "-"].every((c) => parseCell(c, 1).kind === "none"));
  const rate = parseCell("4x Standard HRR (Head of P&A)", 1);
  check("rate + approver: the approver is its own line", rate.kind === "rate" && plainOf(rate.main) === "4x Standard HRR" && !!rate.authority && plainOf(rate.authority) === "Head of P&A" && rate.notes.length === 0);
  const note = parseCell("1.2x Monthly Rent (Concerned Functional Director) [Mumbai: up to the 4th month only]", 1);
  check("a [condition] becomes a note under the approver", !!note.authority && note.notes.length === 1 && plainOf(note.notes[0]).startsWith("Mumbai"));
  const plainBracket = parseCell("Phase-1 enrolment (Mandatory)", 1);
  check("a bracket that is not an approver is a note, not an approver", !plainBracket.authority && plainBracket.notes.length === 1);
  check("a bare amount gets Indian grouping and keeps decimals", plainOf(parseCell("13478.00", 1).main) === "13,478.00" && plainOf(parseCell("₹ 3350.00", 1).main) === "₹ 3,350.00" && parseCell("13478.00", 1).kind === "amount");
  check("a year is not an amount", parseCell("2025", 1).kind === "plain" && plainOf(parseCell("2025", 1).main) === "2025");
  check("an empty condition '[]' is nothing", plainOf(parseCell("Standard HRR []", 1).main) === "Standard HRR");
  const t = tableModel({ columns: ["Item", "A", "B", "C"], rows: [["x", "1", "2", "3"]], sources: [6] }, cites);
  check("column widths: the first 28%, the others share the rest", t.widths[0] === 28 && Math.abs(t.widths[1] - 24) < 1e-9 && Math.abs(t.widths.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  check("a table's sources are the archive's names", t.sources.join() === "Circular 046 (2022)");
}

// ---- sources
check("a source is named by its label, else the year, else 'Source'", sourceName(cites[0]) === "Circular 046 (2022)" && sourceName(cites[1]) === "2024" && sourceName({ id: 1, headline: "x", publishedAt: null }) === "Source");

// ---- chart geometry
{
  check("niceTicks start at 0 and end at or above the maximum", (() => { const t = niceTicks(1800, 15000, 4); return t[0] === 0 && t[t.length - 1] >= 15000 && t.every((v, i) => i === 0 || v > t[i - 1]); })(), JSON.stringify(niceTicks(1800, 15000, 4)));
  check("slicePath draws a full circle as a closed path (no zero-length arc)", /^M .*Z .*M .*Z$/.test(slicePath(70, 70, 66, 38, 0, Math.PI * 2)) || /Z$/.test(slicePath(70, 70, 66, 38, 0, Math.PI * 2)));
  const pie = chartModel({ type: "pie", title: "T", unit: "₹", items: [{ label: "A", value: 1200 }, { label: "B", value: 800 }, { label: "C", value: 400 }] }, cites);
  check("pie: percentages sum to 100 and carry the unit", pie?.type === "pie" && Math.abs(pie.slices.reduce((s, x) => s + parseFloat(x.percent), 0) - 100) < 0.2 && pie.slices[0].value === "₹1,200" && pie.total === "₹2,400");
  check("pie of zeros is not drawn", chartModel({ type: "pie", title: "T", items: [{ label: "A", value: 0 }] }, cites) === null);
  const bar = chartModel({ type: "bar", title: "T", unit: "₹", entityLabels: ["A", "B"], items: [{ label: "x", value: 100, secondaryValue: 50 }, { label: "y", value: 25 }] }, cites);
  check("bar: the longest bar is 100% wide and the others are in proportion", bar?.type === "bar" && bar.rows[0].bars[0].widthPct === 100 && bar.rows[0].bars[1].widthPct === 50 && bar.rows[1].bars[0].widthPct === 25);
  check("bar: two series are named, one series is not", bar?.type === "bar" && bar.series.length === 2 && (chartModel({ type: "bar", title: "T", items: [{ label: "x", value: 1 }] }, cites) as any).series.length === 0);
  const line = chartModel({ type: "line", title: "T", unit: "₹", items: [{ label: "2022", value: 1800 }, { label: "2025", value: 15000 }] }, cites);
  check("line: every point lies inside the drawing area, later points to the right, a larger value higher up", line?.type === "line" && line.points.every((p) => p.x >= 0 && p.x <= PLOT_W && p.y >= 0 && p.y <= PLOT_H) && line.points[1].x > line.points[0].x && line.points[1].y < line.points[0].y);
  check("line: a single point is drawn, not divided by zero", (() => { const l = chartModel({ type: "line", title: "T", items: [{ label: "a", value: 5 }] }, cites); return l?.type === "line" && Number.isFinite(l.points[0].x) && Number.isFinite(l.points[0].y) && l.path.startsWith("M"); })());
  check("scatter without a second value is not drawn", chartModel({ type: "scatter", title: "T", items: [{ label: "a", value: 1 }] }, cites) === null);
  check("scatter points lie inside the drawing area", (() => { const s = chartModel({ type: "scatter", title: "T", items: [{ label: "a", value: 3, secondaryValue: 4 }, { label: "b", value: 5, secondaryValue: 1.2 }] }, cites); return s?.type === "scatter" && s.points.every((p) => p.x >= 0 && p.x <= PLOT_W && p.y >= 0 && p.y <= PLOT_H); })());
  const kpi = chartModel({ type: "kpi", title: "T", unit: "₹", items: [{ label: "a", value: 3350.5 }, { label: "b", value: 15000 }] }, cites);
  check("kpi: values are formatted with the unit (paise shown for all when one has them)", kpi?.type === "kpi" && kpi.items[0].value === "₹3,350.50" && kpi.items[1].value === "₹15,000.00");
  check("a chart without items is not drawn; a timeline keeps its order and numbers", chartModel({ type: "bar", title: "T", items: [] }, cites) === null && (() => { const t = chartModel({ type: "timeline", title: "T", items: [{ label: "x", value: 0 }, { label: "y", value: 0, detail: "d" }] }, cites); return t?.type === "timeline" && t.items[1].n === 2 && t.items[1].detail === "d" && t.metric === undefined; })());
}

// ---- file name, document
{
  check("file name: ASCII, no spaces, dated", edsPdfFileName("Accommodation Retention: Type A vs B (₹)", now) === "EDS-Accommodation-Retention-Type-A-vs-B-2026-11-10.pdf", edsPdfFileName("Accommodation Retention: Type A vs B (₹)", now));
  const longName = edsPdfFileName("Accommodation Retention and GPAIS Premium Type A vs Type B amounts 2022 2026 and more words to cut", now);
  check("a long title is cut between words, never in the middle of a word or a year", /^EDS-[A-Za-z0-9-]+-2026-11-10\.pdf$/.test(longName) && !/-\d{1,3}-2026-11-10/.test(longName.replace("-2026-11-10", "")) && longName.length < 100, longName);
  check("a title with no ASCII letters falls back to 'Briefing'", edsPdfFileName("सेल", now) === "EDS-Briefing-2026-11-10.pdf" && edsPdfFileName(undefined, now) === "EDS-Briefing-2026-11-10.pdf");
}
{
  const data: SynthesisResult = {
    headline: "Holidays 2025 vs 2026", overview: "First **para**.\n\nSecond para.",
    keyFindings: [{ text: "A finding", sources: [6, 21, 999] }, { text: "   ", sources: [] }],
    table: { columns: ["Festival", "2025", "2026"], rows: [["Holi", "14th March", "3rd March"]], sources: [6] },
    extraTable: { columns: ["A", "B"], rows: [], sources: [] },
    charts: [{ type: "kpi", title: "K", items: [{ label: "x", value: 1 }] }, { type: "pie", title: "P", items: [] }],
    citations: cites, abbreviations: {},
  };
  const m = buildEdsPdfModel(data, { question: "  What changed?\n  ", now, abbreviations: [["HRR", "House Rent Recovery"]] });
  check("the question is trimmed and kept on one line", m.question === "What changed?");
  check("generated time is in IST", m.generatedAt === "10 November 2026, 08:42 IST", m.generatedAt);
  check("two paragraphs, one finding (an empty one is dropped), a source that does not exist is dropped from its chips", m.overview.length === 2 && m.findings.length === 1 && m.findings[0].refs.join() === "Circular 046 (2022),2024");
  check("an empty second table and a chart with nothing to draw are left out", m.tables.length === 1 && m.charts.length === 1);
  check("sources are numbered, with a display date (no time zone shift)", m.sources.length === 2 && m.sources[0].n === 1 && m.sources[0].date === "26 Dec 2022" && m.sources[1].date === "20 Aug 2024", JSON.stringify(m.sources));
  check("abbreviations are carried", m.abbreviations[0].abbr === "HRR");
  check("no question given -> no question block", buildEdsPdfModel(data, { now, abbreviations: [] }).question === null);
  check("hasPdfContent: a reply with content yes; an error, an empty reply and null no", hasPdfContent(data) && !hasPdfContent({ ...data, error: "boom" }) && !hasPdfContent({ overview: "", keyFindings: [], charts: [], citations: [] }) && !hasPdfContent(null));
}

// ---- guards: the button is on the EDS reply only, and the PDF library is loaded only on a click
{
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));
  const files = walk("src").filter((f) => !f.endsWith(".selftest.ts"));
  const users = files.filter((f) => /EdsPdfButton/.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
  check("the PDF button is used by the EDS reply (ExecutiveBriefing) and by nothing else", users.sort().join() === ["src/components/EdsPdfButton.tsx", "src/components/ExecutiveBriefing.tsx"].join(), users.join());
  const briefing = readFileSync("src/components/ExecutiveBriefing.tsx", "utf8");
  check("the button is drawn only when the reply has content", /hasPdfContent\(data\) && <EdsPdfButton/.test(briefing));
  const staticImporters = files.filter((f) => /from "@react-pdf\/renderer"/.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
  check("only the painter imports the PDF library statically", staticImporters.join() === "src/lib/pdf/edsPdfDocument.tsx", staticImporters.join());
  const button = readFileSync("src/components/EdsPdfButton.tsx", "utf8");
  check("the button loads the PDF code on the click, not at page load", /await import\("@\/lib\/pdf\/downloadEdsPdf"\)/.test(button) && !/^import .*downloadEdsPdf/m.test(button));
  const dl = readFileSync("src/lib/pdf/downloadEdsPdf.ts", "utf8");
  check("the library, the painter and the fonts are dynamic imports", /import\("@react-pdf\/renderer"\)/.test(dl) && /import\("\.\/edsPdfDocument"\)/.test(dl) && /import\("\.\/edsPdfFonts"\)/.test(dl) && !/^import .*react-pdf/m.test(dl));
  const omni = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  check("the asked question is handed to the EDS reply (it is printed in the PDF)", /question=\{submittedQuery\}/.test(omni));
  for (const f of ["source-sans-3-latin-400-normal.woff", "source-sans-3-latin-700-normal.woff", "source-sans-3-latin-ext-400-normal.woff", "poppins-latin-700-normal.woff", "noto-sans-devanagari-devanagari-400-normal.woff", "baloo-da-2-bengali-400-normal.woff", "baloo-da-2-bengali-700-normal.woff"]) {
    check(`font file ${f} is shipped`, readFileSync(`public/fonts/pdf/${f}`).length > 5000);
  }
}

{
  // fonts guard: the Indic fonts need an italic registration (a Hindi/Bengali question is printed in italics; without it the library stops), and Bengali must not go back to the font it mis-shapes
  const fonts = readFileSync(new URL("./edsPdfFonts.ts", import.meta.url), "utf8");
  check("the Indic fonts are also registered as italic (upright files), so an italic paragraph with Hindi or Bengali cannot stop the PDF", /fontStyle: "italic"/.test(fonts) && /upright\("baloo-da-2-bengali-400-normal\.woff"/.test(fonts) && /upright\("noto-sans-devanagari-devanagari-400-normal\.woff"/.test(fonts));
  check("Bengali is drawn in Baloo Da 2 (the PDF library mis-shapes conjuncts such as স্ক in Noto Sans Bengali)", !/noto-sans-bengali/.test(fonts) && /baloo-da-2-bengali-700-normal/.test(fonts));
}
{
  // painter guard: a page-level lineHeight makes the PDF library drop the footer ("Page x of y" and the AI note) from EVERY page; the line height lives on the body wrapper
  const painter = readFileSync(new URL("./edsPdfDocument.tsx", import.meta.url), "utf8");
  const pageStyle = (painter.match(/\n\s*page: \{[^}]*\}/) ?? [""])[0];
  check("the page style has no lineHeight (it would hide the footer)", pageStyle.length > 0 && !/lineHeight/.test(pageStyle), pageStyle);
  check("the footer is fixed and carries the page number", /<View style=\{s\.footer\} fixed>/.test(painter) && /Page \$\{pageNumber\} of \$\{totalPages\}/.test(painter));
  check("the line height is set on every text (not on the page, not on a wrapper View: that spaced the text out)", /const BODY_LINE_HEIGHT = 1\.45;/.test(painter) && /lineHeight: BODY_LINE_HEIGHT/.test(painter) && !/<View style=\{s\.body\}>/.test(painter) && !/body: \{ lineHeight/.test(painter));
  check("the footer says the language model behind the EDS search summarised the circulars for convenience, and that the circular is the authority; it does not say the app was built by AI", /Summarised for convenience by the language model behind the Executive Deep Synthesis search/.test(painter) && /not a substitute for the circular/.test(painter) && !/Written by an AI/i.test(painter));
  check("the footer's page number uses the library's own Text (a render text with ANY line height is dropped)", /<PdfText style=\{s\.footerRight\} render=/.test(painter));
  check("a text inside a text (the runs of a paragraph, the reference tags) carries no line height of its own: it compounds and spaces the text out", /<PdfText key=\{i\} style=\{\{ \.\.\.runStyle\(r, heading\)/.test(painter) && /<PdfText key=\{j\} style=\{runStyle\(r\)\}>/.test(painter));
  check("a reference tag starts with ONE space (two made the library put a hyphen at the end of the line)", /<PdfText key=\{`r\$\{j\}`\} style=\{s\.ref\}>\{` \[\$\{n\}\]`\}<\/PdfText>/.test(painter) && !/`  \[\$\{n\}\]`/.test(painter));
  check("the Sources heading travels with the first source (never alone at the foot of a page)", /<Section title="Sources" ahead=\{0\} \/>/.test(painter));
}
// a table is kept whole only if it FITS a page: found when an 11-row table of long rows (the Zero Tolerance answer) was taller than a page and the library drew the page on top of itself
{
  const long = "Disciplinary action in accordance with CDA Rules-1977/ Standing Orders-1997: As per applicability";
  const rule = "No person should work/get work done on or Near running machine without guard /Cover.";
  const rows = Array.from({ length: 11 }, () => [rule, "Fifth Stage", long, "Not stated in circular"]);
  const zt = tableModel({ columns: ["Nature of Violation", "Violation Stage", "Revised Consequence", "Issued through"], rows, sources: [29] }, cites);
  check("11 rows of long text in 4 columns are taller than a page body, so the table is NOT kept as one block", estimateTableHeight(zt) > 718 && !tableFitsOnePage(zt), String(estimateTableHeight(zt)));
  const small = tableModel({ columns: ["Item", "A", "B"], rows: [["x", "1", "2"], ["y", "3", "4"], ["z", "5", "6"]], sources: [6] }, cites);
  check("a short table is kept whole", tableFitsOnePage(small), String(estimateTableHeight(small)));
  const many = tableModel({ columns: ["Item", "A"], rows: Array.from({ length: 40 }, (_, i) => [`row ${i}`, `${i}`]), sources: [6] }, cites);
  check("a table of 40 short rows is not kept whole either", !tableFitsOnePage(many));
  const painter = readFileSync("src/lib/pdf/edsPdfDocument.tsx", "utf8");
  check("the painter decides by the estimated height, not by the number of rows", /tableFitsOnePage\(t\)/.test(painter) && /wrap=\{!whole\}/.test(painter) && /fixed=\{!whole\}/.test(painter) && !/LONG_TABLE_ROWS/.test(painter));
  check("a table too tall for a page STARTS ON A NEW PAGE (break), so the library cannot leave its repeated heading row alone at the foot of the previous page", /wrap=\{!whole\} break=\{!whole\}/.test(painter));
  const pen = parseCell("3rd) Financial penalty (officer Rs - 250/- and employees/CW-Rs- 100/-) [up to 3 violations]", 2);
  check("the penalty amounts stay in the value; only the condition is a note; no approver chip", plainOf(pen.main).includes("officer Rs - 250/-") && !pen.authority && pen.notes.length === 1 && plainOf(pen.notes[0]) === "up to 3 violations", JSON.stringify(pen));
  const cl = parseCell("CDA rule in accordance of with Section no: 5(Xii)", 2);
  check("a clause reference such as 5(Xii) is one text, drawn plain (not as a bold value with a note)", cl.kind === "plain" && plainOf(cl.main) === "CDA rule in accordance of with Section no: 5(Xii)" && cl.notes.length === 0, JSON.stringify(cl));
}
{
  const btn = readFileSync("src/components/EdsPdfButton.tsx", "utf8");
  check("a successful download shows no toast of ours (the browser's save window is the confirmation)", !/toast\.success/.test(btn) && !/PDF saved/.test(btn));
  check("a failure still tells the person, so a broken download is never silent", /toast\.error\("The PDF could not be made/.test(btn));
}
console.log(`eds pdf model selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
