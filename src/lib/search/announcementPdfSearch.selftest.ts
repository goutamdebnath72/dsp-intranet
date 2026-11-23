// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/search/announcementPdfSearch.selftest.ts
// This tests search INSIDE the PDFs of announcements: how a passage of a PDF and an announcement's own title and body are put together into one row for each announcement, and the safety of the query.

export {};
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

async function main() {
  const { mergeAnnouncementHits, lexicalTokens, isLexicalHit, orTsQuery, wordsFound } = await import("./announcementSemanticSearch");
  const rec = (id: number, score: number, text = "body words", title = `Announcement ${id}`) => ({ id, type: "announcement" as const, headline: title, url: `/announcements/${id}`, publishedAt: "2026-11-17T00:00:00.000+05:30", similarity: Math.min(0.99, score), chunkText: text, internalScore: score });
  const hit = (id: number, o: Partial<{ page: number | null; text: string; similarity: number; literal: boolean; title: string; source: "body" | "pdf" }> = {}) => ({ source: (o.source ?? "pdf") as "body" | "pdf", id, title: o.title ?? `Announcement ${id}`, date: "2026-11-17", page: o.page === undefined ? 3 : o.page, text: o.text ?? "a passage of the PDF", similarity: o.similarity ?? 0.7, literal: o.literal ?? false });

  // a PDF-only announcement: nothing in its title or body matches, but a passage of its PDF does
  const only = mergeAnnouncementHits([], [hit(7, { page: 4, text: "The Internal Committee must finish the inquiry within ninety days.", similarity: 0.82 })]);
  ok("an announcement found only by its PDF becomes a result, with the passage, its page and the mark that it is in the PDF", only.length === 1 && only[0].id === 7 && only[0].type === "announcement" && only[0].matchInPdf === true && only[0].matchPage === 4 && JSON.stringify(only[0].matchPages) === "[4]" && /ninety days/.test(String(only[0].chunkText)) && only[0].url === "/announcements/7");
  ok("its title and date come from the announcement", only[0].headline === "Announcement 7" && !!only[0].publishedAt);

  // the same announcement found both ways gives one row
  const both = mergeAnnouncementHits([rec(7, 0.65)], [hit(7, { similarity: 0.8 })]);
  ok("one row for an announcement however it was found", both.length === 1);
  ok("when the PDF passage is the stronger evidence it is the row's text, with its page", both[0].matchInPdf === true && both[0].matchPage === 3 && both[0].chunkText === "a passage of the PDF");
  const bodyWins = mergeAnnouncementHits([rec(7, 2.9, "the exact words are in the body")], [hit(7, { similarity: 0.7 })]);
  ok("when the title and body are the better evidence the row stays as it was (no PDF mark, no page)", bodyWins.length === 1 && bodyWins[0].matchInPdf === undefined && bodyWins[0].matchPage === undefined && bodyWins[0].chunkText === "the exact words are in the body");

  // same rule as the record's own: a literal hit, or strongly similar
  ok("a passage that is only weakly similar and has not the words is not a result", mergeAnnouncementHits([], [hit(7, { similarity: 0.55 })]).length === 0);
  ok("a passage that holds the words counts however weak its vector", mergeAnnouncementHits([], [hit(7, { similarity: 0.51, literal: true })]).length === 1);
  const ranked = mergeAnnouncementHits([], [hit(1, { similarity: 0.7 }), hit(2, { similarity: 0.6, literal: true }), hit(1, { similarity: 0.9 })]);
  ok("of several passages of one PDF the best is kept; a literal hit outranks a close one", ranked.length === 2 && ranked.find((r) => r.id === 1)?.similarity === 0.9 && ranked.sort((a, b) => b.internalScore - a.internalScore)[0].id === 2);
  ok("a passage with no page (0 or none) gives a result with no page to jump to", (() => { const r = mergeAnnouncementHits([], [hit(5, { page: 0 })])[0]; return r.matchPage === null && r.matchPages === undefined && r.matchInPdf === true; })());
  ok("the similarity shown is a real cosine, at most 0.99", mergeAnnouncementHits([], [hit(5, { similarity: 1.2 })])[0].similarity === 0.99);

  // a passage of the announcement's OWN TEXT (source body) is evidence too, but it is never "in the PDF" and has no page
  const bodyPassage = mergeAnnouncementHits([rec(9, 0.62, "short body")], [hit(9, { source: "body", page: 0, text: "the long body, second part, with the words", similarity: 0.85 })]);
  ok("a passage of the announcement's own text can be the best evidence: it is the row's text, with no PDF mark and no page", bodyPassage.length === 1 && bodyPassage[0].chunkText === "the long body, second part, with the words" && bodyPassage[0].matchInPdf === undefined && bodyPassage[0].matchPage === null);
  ok("an announcement found only by a passage of its own text becomes a result, not marked as in the PDF", (() => { const r = mergeAnnouncementHits([], [hit(3, { source: "body", page: null, similarity: 0.8 })])[0]; return r.id === 3 && r.matchInPdf === undefined; })());


  // ---- THE WORDS OF A QUESTION, found wherever they stand ("OTP valid for five minutes" in "OTPs remain valid for only five minutes")
  const DSC_P = "The OTPs remain valid for only five minutes and are to be shared immediately with the vendor's executive. Video verification will be conducted through a link sent to the registered e-mail ID.";
  const GATE_P = "Circular for Gate Pass No.-13 (valid from 01.01.2024 to 31.03.2024). The gate passes of series 13 are valid for entry of vehicles of contractors.";
  const toks = lexicalTokens("OTP valid for five minutes");
  ok("the question's content words are taken, without 'for' and the like, each once", toks.includes("otp") && toks.includes("five") && toks.includes("minutes") && !toks.includes("for") && new Set(toks).size === toks.length, JSON.stringify(toks));
  ok("the passage that says it in other words is found (OTPs ... valid ... five minutes)", isLexicalHit(toks, DSC_P), JSON.stringify(toks));
  ok("a document that shares only one word ('valid') is not found", !isLexicalHit(toks, GATE_P) && wordsFound(toks, GATE_P) <= 1);
  ok("a word is found inside a longer one ('otp' in 'OTPs'); one long word alone counts, a short one alone does not", wordsFound(["otp"], "the OTPs are") === 1 && isLexicalHit(["password"], "your password must") && !isLexicalHit(["otp"], "the OTPs are") && isLexicalHit(["otp", "valid"], "OTP is valid"));
  ok("at least two words and at least 60% of them", !isLexicalHit(["alpha", "beta", "gamma", "delta"], "alpha beta") && isLexicalHit(["alpha", "beta", "gamma"], "alpha beta") && !isLexicalHit(["alpha", "beta", "gamma"], "alpha"));
  ok("the words go to the database as one safe text-search query, any of them: only letters and digits", orTsQuery(["otp", "valid", "five", "minutes"]) === "otp | valid | five | minutes" && orTsQuery(["a'b", "c;d", "e&f"]) === "ab | cd | ef" && orTsQuery([]) === "");
  const srcAll = readFileSync("src/lib/search/announcementSemanticSearch.ts", "utf8");
  ok("the search looks for them in the title and body and in every passage (text-search query, parameters only), and a quoted phrase keeps its own exact rule", /to_tsvector\('english', a\.title/.test(srcAll) && /to_tsvector\('english', c\.text\) @@ to_tsquery\('english', \$2\)/.test(srcAll) && /mode\.isQuoted \? \[\] : lexicalTokens\(safeQ\)/.test(srcAll));
  const routerSrc = readFileSync("src/lib/search/smartSemanticRouter.ts", "utf8");
  ok("an announcement found by its words keeps its place beside the circulars however low its passage's cosine is", /r\.lexicalHit \? 0\.9 : 0/.test(routerSrc) && /merged\.sort\(\(a, b\) => rankOf\(b\) - rankOf\(a\)\)/.test(routerSrc));
  ok("a passage found by its words is marked, and so is a title-and-body hit; a passage found only by meaning is not", mergeAnnouncementHits([], [hit(4, { literal: true })])[0].lexicalHit === true && mergeAnnouncementHits([], [hit(4, { similarity: 0.8 })])[0].lexicalHit === undefined);

  // the query itself: if it fails, the title and body results must not go down with it
  const src = readFileSync("src/lib/search/announcementSemanticSearch.ts", "utf8");
  ok("the PDF passages come from announcement_chunk, with the same literal rule (whole word when quoted, else substring) and the same 0.50 vector floor", /FROM public\.announcement_chunk c/.test(src) && /c\.source/.test(src) && /c\.text ~\* \$2/.test(src) && /c\.text ILIKE \$2/.test(src) && /> 0\.50/.test(src));
  ok("that query is in a try of its own: a missing table or a failure leaves the title and body results as they were", /try \{\s*const chunkRows = await chunkQuery\(\);[\s\S]*?\} catch \{\s*chunkHits = \[\];/.test(src) && /\.catch\(\(\) => null\)/.test(src));
  ok("the four queries are started together (one round trip of waiting, not four), each read afterwards in the original order; src/lib/perf/switches.js (parallelAnnouncementSearch: false) starts each only when it is read, as before", /const lexQuery = tsq/.test(src) && /const chunkQuery = later\(\(\) => dataSource/.test(src) && /const lexChunkQuery = tsq/.test(src) && src.indexOf("const lexQuery") < src.indexOf("const matches = await dataSource.query") && /PERF\.parallelAnnouncementSearch/.test(src));
  ok("everything is parameterised (the typed words never go into the SQL text)", !/\$\{cleanQ\}|\$\{safeQ\}|\$\{q\}/.test(src.slice(src.indexOf("FROM public.announcement_chunk") - 400, src.indexOf("FROM public.announcement_chunk") + 600)));

  // the route: the deep summary reads circulars AND announcements, the announcements under moved numbers (edsAnnouncements.selftest.ts tests that)
  const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
  ok("the deep summary takes its sources from circulars and announcements with numbers that cannot meet", /assembleEdsSources\(topPrimarySources/.test(route) && /fetchAnnouncementFullText\(/.test(route));
  const answer = readFileSync("src/app/api/ai-search/answer/route.ts", "utf8");
  ok("the answer path gives an announcement's PDF passages with its body text", /announcement_chunk/.test(answer) && /announcementAnswerChunks\(r\.contentText, pdfRows\)/.test(answer) && /source = 'pdf'/.test(answer));

  console.log(`announcementPdfSearch selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("announcementPdfSearch selftest crashed:", e?.stack || e); process.exit(1); });
