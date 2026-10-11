// src/lib/search/sourceRefs.selftest.ts
// Run:  npx tsx src/lib/search/sourceRefs.selftest.ts      (no network, no database)
import { buildSourceNames, quotedTitle, replaceSourceIds, sanitizeSourceRefs } from "./sourceRefs";
import { circularLabel } from "./circularLabels";
import { buildSynthesisResultForTest } from "./executiveSynthesis";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// id 49 = serial 7 of 2026 (the corrigendum), id 51 = serial 8 of 2026. id 7 is ANOTHER circular (serial 5 of 2024): the trap for "007".
const citations = [
  { id: 49, headline: "Circular - Gift card corrigendum", publishedAt: "2026-08-08" },
  { id: 51, headline: "Circular - Online option for Gift Card Rs. 15000 to employees", publishedAt: "2026-08-03" },
  { id: 7, headline: "Notice for cancellation of JO written examination", publishedAt: "2022-02-22" },
];
const labels = new Map<number, string>([[49, "Circular 007 (2026)"], [51, "Circular 008 (2026)"], [7, "Circular 006 (2022)"]]);
const N = buildSourceNames(citations, labels);

// ---- the label itself ----
check("circularLabel: serial 7 of 2026 -> 'Circular 007 (2026)' (three digits, like the circulars modal)", circularLabel(7, 2026) === "Circular 007 (2026)" && circularLabel(12, 2025) === "Circular 012 (2025)" && circularLabel(123, 2024) === "Circular 123 (2024)");
check("circularLabel: no serial, no year or nonsense -> null (never '000')", circularLabel(null, 2026) === null && circularLabel(7, null) === null && circularLabel(0, 2026) === null && circularLabel(7, 12) === null && circularLabel(undefined, undefined) === null);

// ---- the exact wording from the screenshot, now with the serial number ----
const shot = replaceSourceIds("Corrected amount per Circular 49", N);
check("'Corrected amount per Circular 49' -> 'Corrected amount per Circular 007 (2026)'", shot === "Corrected amount per Circular 007 (2026)", shot);
check("the internal id is gone and the serial number is there", !/\b49\b/.test(shot) && /007/.test(shot));

// ---- the spellings a model uses ----
check("circular #49 / Circular no. 49 / circular number 49 / Circular id=49 / Circular id 49 / [Circular id=49] / CIRCULAR 49", ["circular #49", "Circular no. 49", "circular number 49", "Circular id=49", "Circular id 49", "[Circular id=49]", "CIRCULAR 49"].every((x) => replaceSourceIds(`per ${x} it is`, N) === "per Circular 007 (2026) it is"));
check("a year the model already wrote is not doubled: 'Circular 49 (2026)'", replaceSourceIds("see Circular 49 (2026) now", N) === "see Circular 007 (2026) now");
check("two sources: 'Circulars 49 and 51' and 'Circulars 49, 51'", replaceSourceIds("Circulars 49 and 51 agree", N) === "Circular 007 (2026) and Circular 008 (2026) agree" && replaceSourceIds("Circulars 49, 51", N) === "Circular 007 (2026) and Circular 008 (2026)");
check("a parenthetical id disappears: 'amount (id 49) is' and 'Rates (ids=49, 51) apply.'", replaceSourceIds("The amount (id 49) is final", N) === "The amount is final" && replaceSourceIds("Rates (ids=49, 51) apply.", N) === "Rates apply.");
check("no serial known -> the quoted title is used instead (never the id)", replaceSourceIds("per Circular 99", buildSourceNames([{ id: 99, headline: "Holiday policy note" }])) === 'per "Holiday policy note"');
check("a long title is shortened with an ellipsis", /\u2026"$/.test(quotedTitle("X".repeat(200))));

// ---- the trap: a serial number must never be read as an id ----
check("'Circular 007 (2026)' is a SERIAL, not the id 7: left alone even though a source has id 7", replaceSourceIds("per Circular 007 (2026)", N) === "per Circular 007 (2026)");
const once = replaceSourceIds("per Circular 49 and Circular 7", N);
check("running the clean-up twice gives the same text as once (idempotent)", replaceSourceIds(once, N) === once, once);
check("'Circular 7' IS the id 7 (a real source) and is replaced by ITS label, not by 49's", replaceSourceIds("per Circular 7", N) === "per Circular 006 (2022)");

// ---- what must NOT change ----
const same = (x: string) => replaceSourceIds(x, N) === x;
check("a PRINTED circular number is left alone: 'Circular No. 2026/51', 'Circular 2026/50', 'Circular 49/2026'", same("Circular No. 2026/51 dated 08-08-2026") && same("per Circular 2026/50") && same("Circular 49/2026"));
check("a number that is not a source is left alone: 'Circular 5', 'Circulars 12 and 13'", same("Circular 5 of last year") && same("Circulars 12 and 13"));
check("a source id outside the 'Circular' wording is left alone: '49 employees', 'Rs. 49', 'page 51'", same("49 employees were selected") && same("fee Rs. 49 only") && same("see page 51"));
check("text with no reference, empty text and an empty source list are safe", same("The amount is Rs.14,999/-") && replaceSourceIds("", N) === "" && replaceSourceIds("Circular 49", new Map()) === "Circular 49");
check("a mixed list keeps the unknown id: 'Circulars 49 and 12'", replaceSourceIds("Circulars 49 and 12", N) === "Circular 007 (2026) and 12");

// ---- deep clean of a whole result ----
const deep = sanitizeSourceRefs({ overview: "per Circular 49", charts: [{ title: "t", items: [{ label: "x", value: 1, detail: "Corrected amount per Circular 49" }] }], keyFindings: [{ text: "see Circular 51", sources: [49, 51] }] }, N);
const deepFlat = JSON.stringify(deep);
check("every nested string is cleaned; the numeric source ids in 'sources' and the values are untouched", !/Circular (49|51)\b/.test(deepFlat) && /Circular 007 \(2026\)/.test(deepFlat) && /Circular 008 \(2026\)/.test(deepFlat) && JSON.stringify(deep.keyFindings[0].sources) === "[49,51]" && deep.charts[0].items[0].value === 1);

// ---- the real builder, with a model answer shaped like the one on your screen ----
const sourceText = "the amount of the Gift Card (E-Multi Benefit Card) mentioned as Rs.15,000/- may please be read as Rs.14,999/-. last date 15.08.2026";
const modelJson = JSON.stringify({
  headline: "Gift Card amount corrected",
  overview: "The corrigendum revises the card value to Rs. 14,999 (down from Rs. 15,000), per Circular 49.",
  keyFindings: [{ text: "Corrigendum (Circular 49) changes the Gift Card amount to Rs.14,999/-", sources: [49] }],
  table: { columns: ["Parameter", "Original Amount", "Corrected Amount"], rows: [["Gift Card amount", "15000", "14999"]] },
  datasets: [{ intent: "kpi", title: "Gift Card amount (post-corrigendum)", unit: "\u20B9", items: [{ label: "Amount", value: 14999, detail: "Corrected amount per Circular 49" }] }],
});
const built = buildSynthesisResultForTest(modelJson, citations.slice(0, 2), new Set([49, 51]), sourceText, labels);
const flat = JSON.stringify(built);
check("builder: the card now reads 'Corrected amount per Circular 007 (2026)' and no internal id appears anywhere", /Corrected amount per Circular 007 \(2026\)/.test(flat) && !/Circular 49/.test(flat), flat.slice(0, 500));
check("builder: the finding that mentioned 'Circular 49' SURVIVES (it would be dropped as an ungrounded number if cleaned too late)", built.keyFindings.length === 1 && /Corrigendum \(Circular 007 \(2026\)\) changes the Gift Card amount to Rs\.14,999/.test(built.keyFindings[0].text) && built.keyFindings[0].sources[0] === 49, JSON.stringify(built.keyFindings));
check("builder: the real figures and the citation are intact", built.charts[0]?.items[0]?.value === 14999 && built.citations.length === 1 && built.citations[0].id === 49 && built.table?.rows[0][2] === "14999");
const noLabels = buildSynthesisResultForTest(modelJson, citations.slice(0, 2), new Set([49, 51]), sourceText);
check("builder: with no labels available it names the circular by its title, still never by the id", /Corrected amount per \\"Circular - Gift card corrigendum\\"/.test(JSON.stringify(noLabels)) && !/Circular 49/.test(JSON.stringify(noLabels)));

console.log(`\nsourceRefs selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
