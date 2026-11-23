// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/searchIndex/searchIndex.selftest.ts
// Here I test the pure parts of the announcement PDF index: the passages an announcement offers to a question, the text its own vector is made from, and the sentence the manager reads.

export {};
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

async function main() {
  const { announcementAnswerChunks } = await import("./answerChunks");
  const { describeOutcome, MAX_PAGES } = await import("./indexer");
  const { recordEmbeddingText, RECORD_EMBED_CHARS } = await import("../embedAnnouncement");

  // ---- the passages offered to a question
  const body = announcementAnswerChunks("The Guidelines are attached.", [
    { chunk_index: 1, page: 2, text: "Second passage on page two." },
    { chunk_index: 0, page: 1, text: "First passage on page one." },
    { chunk_index: 2, page: 0, text: "   " },
  ]);
  ok("the body comes first, then the PDF's passages in order, each with its page", body.length === 3 && body[0].page === null && body[0].text === "The Guidelines are attached." && body[1].page === 1 && body[2].page === 2 && body.map((c) => c.index).join() === "0,1,2");
  const pdfOnly = announcementAnswerChunks(null, [{ chunk_index: 0, page: 1, text: "Only the PDF." }]);
  ok("an announcement with no body offers just its PDF's passages", pdfOnly.length === 1 && pdfOnly[0].text === "Only the PDF." && pdfOnly[0].page === 1);
  const nothing = announcementAnswerChunks("", []);
  ok("an announcement with neither offers one empty passage (as before), which the answer path discards", nothing.length === 1 && nothing[0].text === "");
  ok("a passage with no page (0 or null) is page-less", announcementAnswerChunks("", [{ chunk_index: 0, page: 0, text: "x" }])[0].page === null && announcementAnswerChunks("", [{ chunk_index: "3", page: "4", text: "y" }])[0].page === 4);

  // ---- the text an announcement's own vector is made from
  ok("title, body and PDF text, in that order, as plain text", recordEmbeddingText("Title", "Body", "Pdf text") === "Title\nBody\nPdf text");
  ok("a title alone (a PDF not read, no body) still has a text", recordEmbeddingText("Only a title", null, null) === "Only a title" && recordEmbeddingText("", "", "") === "");
  ok("it is cut at the circulars' own limit (8192 characters), the title first", recordEmbeddingText("T", "b", "x".repeat(20000)).length === RECORD_EMBED_CHARS && recordEmbeddingText("T", "b", "x".repeat(20000)).startsWith("T\nb\n"));

  // ---- what the manager reads
  const pdfReady = (o: Partial<{ pages: number; textPages: number; ocrPages: number; chunks: number; note: string | null }> = {}) => ({ status: "ready" as const, pages: 1, textPages: 1, ocrPages: 0, chunks: 1, note: null, ...o });
  ok("a PDF read from its own text is described with its pages and passages", describeOutcome({ status: "ready", pdf: pdfReady() }) === "The PDF was read for the search bar: 1 page (from its own text), 1 passage." && /3 pages \(from its own text\), 7 passages/.test(describeOutcome({ status: "ready", pdf: pdfReady({ pages: 3, textPages: 3, chunks: 7 }) })));
  ok("pages read by AI are told apart from pages taken from the PDF's own text", /3 pages \(2 from its own text, 1 read by AI\)/.test(describeOutcome({ status: "ready", pdf: pdfReady({ pages: 3, textPages: 2, ocrPages: 1, chunks: 4 }) })) && /\(1 read by AI\)|0 from its own text, 1 read by AI/.test(describeOutcome({ status: "ready", pdf: pdfReady({ pages: 1, textPages: 0, ocrPages: 1 }) })));
  ok("a note (pages not read, pages left out) is added", /Page 2 could not be read\.$/.test(describeOutcome({ status: "ready", pdf: pdfReady({ pages: 2, textPages: 2, chunks: 2, note: "Page 2 could not be read." }) })));
  ok("a PDF failure says it was not read and why", describeOutcome({ status: "failed", pdf: { status: "failed", note: "GEMINI_API_KEY is not set" } }) === "The PDF could not be read for the search bar: GEMINI_API_KEY is not set");
  ok("the text is described, and its failure says its words are still found literally", describeOutcome({ status: "ready", body: { status: "ready", chunks: 2 } }) === "The text was indexed for the search bar (2 passages)." && /could not be indexed for the search bar \(quota\); its words are still found literally/.test(describeOutcome({ status: "failed", body: { status: "failed", note: "quota" } })));
  ok("both parts are described, the PDF first", /^The PDF was read[\s\S]*The text was indexed/.test(describeOutcome({ status: "ready", pdf: pdfReady(), body: { status: "ready", chunks: 1 } })));
  ok("nothing to prepare says nothing", describeOutcome({ status: "none", body: { status: "none" } }) === "");
  ok("the page limit is 40", MAX_PAGES === 40);

  // ---- THE READER: a true PDF is taken from its own text, with a picture of every page (no AI key is needed for that)
  const { textLayerIsGood, textLayerOf, readPdf, MIN_LAYER_CHARS } = await import("./reader");
  const long = "The Internal Committee must complete its inquiry within ninety days of the complaint and the committee shall keep the identity of the complainant confidential.";
  ok("a text layer of real words is good", textLayerIsGood(long) && long.length >= MIN_LAYER_CHARS);
  ok("a short text layer (a page number, a footer on a scanned page) is not trusted to be the page", !textLayerIsGood("Page 1 of 3") && !textLayerIsGood(""));
  ok("a text layer of symbols (a broken font encoding) is not good", !textLayerIsGood("(cid:12)(cid:45)(cid:77) ".repeat(30)) && !textLayerIsGood("#$%&*+-=<>?/\\|~^".repeat(20)));
  ok("text in Hindi counts as letters", textLayerIsGood("सेल की यह नीति सभी कर्मचारियों पर लागू होती है और इसका पालन करना प्रत्येक कर्मचारी के लिए अनिवार्य है। शिकायत आंतरिक समिति को दी जाएगी और समिति नब्बे दिनों के भीतर जांच पूरी करेगी।"));
  const fixture = readFileSync("src/lib/announcements/searchIndex/__fixtures__/true.pdf");
  const layer = await textLayerOf(fixture);
  ok("the text of a real PDF is taken page by page", layer.length === 2 && /Internal Committee must complete its inquiry within ninety days/.test(layer[0]) && /Annexure with the list of the members/.test(layer[1]), JSON.stringify(layer).slice(0, 200));
  ok("a file that is not a PDF has no text layer and does not throw", (await textLayerOf(Buffer.from("not a pdf at all"))).length === 0);
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const reading = await readPdf(fixture, Date.now() + 60_000);
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  ok("a true PDF is read from its own text, both pages, with no AI reading needed", reading.pages.length === 2 && reading.pages.every((p) => p.via === "text" && p.text.length > 50) && reading.totalPages === 2);
  ok("every page comes with its picture (a PNG)", reading.images.length === 2 && reading.images.every((b) => !!b && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))));

  console.log(`searchIndex selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("searchIndex selftest crashed:", e?.stack || e); process.exit(1); });
