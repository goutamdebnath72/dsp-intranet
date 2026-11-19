// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/documentSummary.selftest.ts
// THE SUMMARY EVERY CIRCULAR OR ANNOUNCEMENT REPLY CARRIES: written by the model from the passages, verified by plain code, and, when that fails, the document's own opening. Never absent, never invented.

export {};
import { readFileSync } from "node:fs";
import { buildSummaryPrompt, openingSummary, parseSummary, summariseFromPassages, summaryIsFaithful } from "./documentSummary";
import { pickSummaryItems } from "../../hooks/useCircularAnswer";
import type { Passage } from "./circularAnswer";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
console.info = () => {};

const DSC = "Procedure for Issuance of Digital Signature Certificate. Applicants are advised to keep all required documents readily available. The OTPs remain valid for only five minutes and are to be shared immediately with the vendor's executive. Video verification will be conducted through a link sent to the registered e-mail ID. For any queries, please contact the DSC Coordinators in C&IT Department.";
const GATE = "Circular for Gate Pass No.-13 (valid from 01.01.2024 to 31.03.2024). The gate passes of series 13 are valid for entry of vehicles of contractors during the period.";
const P = (n: number, title: string, text: string, type: Passage["type"] = "announcement"): Passage => ({ n, type, id: 20 + n, title, date: "2026-11-17T04:00:00.000Z", page: 1, text, parts: [{ page: 1, text }] });
const dsc = P(1, "Procedure for Issuance of Digital Signature Certificate (DSC)", DSC);
const gate = P(2, "Circular for Gate Pass No.-13", GATE, "circular");

async function main() {
  // ---- the model's summary
  const good = JSON.stringify({ summary: "This announcement describes the procedure for issuing a Digital Signature Certificate. OTPs remain valid for only five minutes, and queries go to the DSC Coordinators in the C&IT Department.", addresses: true });
  const s1 = await summariseFromPassages("OTP valid for five minutes", [dsc], async () => good);
  ok("a good summary is shown as written, with whether it answers the question and the document it comes from", s1?.via === "model" && s1.addresses === true && /five minutes/.test(s1.text) && s1.sources.length === 1 && s1.sources[0].id === 21 && s1.sources[0].type === "announcement");
  const notAnswer = await summariseFromPassages("OTP valid for five minutes", [gate], async () => JSON.stringify({ summary: "This circular concerns gate pass No. 13, valid from 01.01.2024 to 31.03.2024, for contractors' vehicles.", addresses: false }));
  ok("a summary of a document that does not answer the question says so (addresses false)", notAnswer?.via === "model" && notAnswer.addresses === false);

  // ---- never invented
  const invented = await summariseFromPassages("OTP validity", [dsc], async () => JSON.stringify({ summary: "OTPs remain valid for only 10 minutes and the fee is Rs. 500.", addresses: true }));
  ok("a summary with a number that is not in the document is refused: the document's own opening is shown instead", invented?.via === "opening" && invented.addresses === null && /Procedure for Issuance/.test(invented.text) && !/Rs\. 500/.test(invented.text));
  ok("markup, links and lists are refused", !summaryIsFaithful("**Bold** summary of the document with five words more", [dsc]) && !summaryIsFaithful("See https://example.com for the whole document text here", [dsc]) && !summaryIsFaithful("- a list item that is long enough to count here now", [dsc]) && summaryIsFaithful("This announcement describes the procedure for issuing a certificate.", [dsc]));
  ok("a summary of a few words, or of far too many, is refused", !summaryIsFaithful("OTP five", [dsc]) && !summaryIsFaithful(("word ".repeat(200)).trim(), [dsc]));
  ok("the numbers in the document's title and date are allowed (the year of a circular's title)", summaryIsFaithful("This is the circular for the gate passes of 2024 for contractors and their vehicles.", [P(2, "Circular for Gate Pass 2024", GATE, "circular")]));

  // ---- always there
  const down = await summariseFromPassages("OTP", [dsc], async () => { throw new Error("no credit"); });
  ok("when the model cannot be reached a summary is still there: how the document begins, labelled as that", down?.via === "opening" && down.addresses === null && down.text.startsWith("Procedure for Issuance") && down.sources.length === 1);
  const junk = await summariseFromPassages("OTP", [dsc], async () => "not json at all");
  ok("an unreadable reply gives the opening too", junk?.via === "opening");
  ok("only a document with no text at all has no summary", (await summariseFromPassages("x", [P(1, "Empty", "  ")], async () => good)) === null && (await summariseFromPassages("x", [], async () => good)) === null);
  ok("the opening is cut at a sentence or a word, at most about 340 characters, and without table markers", (() => { const o = openingSummary([P(1, "T", "[TABLE]" + "Sentence one is here. ".repeat(40) + "[/TABLE]")]); return o.length <= 345 && o.endsWith(".") && !/TABLE/.test(o); })() && openingSummary([P(1, "T", "word ".repeat(200))]).endsWith("…"));

  // ---- the prompt and the parser
  const prompt = buildSummaryPrompt("OTP valid for five minutes", [dsc, gate]);
  ok("the prompt gives the question, each document with its title and date, and the rules: only the passages, exact numbers, say if it does not answer", /OTP valid for five minutes/.test(prompt) && /\[1\] Document: Procedure for Issuance/.test(prompt) && /\[2\] Document: Circular for Gate Pass/.test(prompt) && /ONLY the numbered passages/.test(prompt) && /never calculate/.test(prompt) && /"addresses"/.test(prompt) && /set "addresses" to false/.test(prompt) && /never as "Document 1"/.test(prompt) && /17 Nov 2026/.test(prompt));
  ok("the reply is read from plain JSON or from a fenced block; a reply with no summary is nothing", parseSummary('{"summary":"A b c d e f.","addresses":true}')?.addresses === true && parseSummary('```json\n{"summary":"A b c d e f.","addresses":false}\n```')?.addresses === false && parseSummary('{"summary":"","addresses":true}') === null && parseSummary("text") === null);

  // ---- which documents are summarised, the route, the hook and the card
  ok("a weaker reply is summarised from its best one or two circulars or announcements, whatever their match; a holiday note or a person is not", JSON.stringify(pickSummaryItems([{ id: 9, type: "holiday" }, { id: 7, type: "circular" }, { id: 3, type: "announcement" }, { id: 8, type: "circular" }])) === JSON.stringify([{ type: "circular", id: 7 }, { type: "announcement", id: 3 }]));
  const route = readFileSync("src/app/api/ai-search/answer/route.ts", "utf8");
  ok("the answer route reads a strong match for a precise answer, and otherwise (or when it cannot be proved) answers with a summary", /const strong = body\?\.strong === true/.test(route) && /summariseFromPassages\(q, passages/.test(route) && /if \(result\?\.ok\)/.test(route));
  const hook = readFileSync("src/hooks/useCircularAnswer.ts", "utf8");
  ok("the hook asks for a summary whenever a circular or announcement was found, except for a search for a person or an ID", /pickSummaryItems\(results\)/.test(hook) && /allowSummary/.test(hook) && /strong: latest\.current\.strong/.test(hook));
  const omni = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  ok("the documents a summary is drawn from are not listed a second time below it (its 'Summarised from' line is their link), as for a precise answer", /\.\.\.\(circularAnswer\.answer\?\.sources \?\? \[\]\), \.\.\.\(circularAnswer\.summary\?\.sources \?\? \[\]\)\]\.map\(\(s\) => `\$\{s\.type\}-\$\{s\.id\}`\)/.test(omni) && /!answeredKeys\.has\(`\$\{r\.type\}-\$\{r\.id\}`\)/.test(omni));
  ok("the search window does not ask for a summary for a name or an ID search", /allowSummary: !looksLikeNameSearch\(submittedQuery\) && !isIdQuery\(/.test(omni));

  console.log(`documentSummary selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("documentSummary selftest crashed:", e?.stack || e); process.exit(1); });
