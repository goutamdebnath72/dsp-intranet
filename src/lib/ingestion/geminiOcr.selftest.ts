// Run (from the project root): npx tsx src/lib/ingestion/geminiOcr.selftest.ts
import { createGeminiOcr, readingSummary, geminiOcrReaders } from "./geminiOcr";
import type { PageReader } from "./pageReader";
import { STOPPED_MARKER } from "./pageReader";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const PAGE = "CIRCULAR The Gift Card of Rs.14,999/- may be exercised through the ESS portal by 15.08.2026 for all executives and non-executives of the plant.";
const reader = (name: string, f: (png: Buffer) => string | Error): PageReader => ({ name, read: async (png) => { const r = f(png); if (r instanceof Error) throw r; return r; } });
const png = (n: number) => Buffer.from([n]);
const run = async (p: PageReader, c: PageReader | null, pages: number[], extra: Partial<Parameters<typeof createGeminiOcr>[0]> = {}) => {
  const ocr = createGeminiOcr({ readers: { primary: p, checker: c }, deadlineAt: Date.now() + 60_000, ...extra });
  for (const n of pages) ocr.start(n, png(n));
  return ocr.finish();
};

(async () => {
  // 1. both agree: the primary is the text, the check confirms the numbers
  { const r = await run(reader("p", () => PAGE), reader("c", () => PAGE), [1]);
    ok("agreeing readers: the page is read and checked", r.texts.get(1) === PAGE && r.failedPages.length === 0 && r.checks.length === 1 && r.checks[0].unconfirmed.length === 0 && r.checks[0].confirmed.length >= 2, JSON.stringify(r.checks));
    ok("the summary says all pages agree", /all 1 page agree on every important number/.test(readingSummary(r.log)), readingSummary(r.log)); }
  // 2. the checker has a different number: the primary's number is recorded as unconfirmed
  { const r = await run(reader("p", () => PAGE), reader("c", () => PAGE.replace("14,999", "15,000")), [1]);
    ok("a number only the primary has is recorded unconfirmed", r.texts.get(1) === PAGE && r.checks[0].unconfirmed.includes("14999") && r.checks[0].secondOnly.includes("15000"), JSON.stringify(r.checks[0])); }
  // 3. the primary fails: the checker's reading is the text, no check is recorded
  { const r = await run(reader("p", () => new Error("Gemini answered 503")), reader("c", () => PAGE), [1]);
    ok("a failed primary falls back to the checker, unchecked", r.texts.get(1) === PAGE && r.checks.length === 0 && r.log.pages[0].source === "checker"); }
  // 4. the checker fails: the primary is the text, no check
  { const r = await run(reader("p", () => PAGE), reader("c", () => new Error("boom")), [1]);
    ok("a failed checker leaves the primary's text, unchecked", r.texts.get(1) === PAGE && r.checks.length === 0 && r.log.pages[0].source === "primary"); }
  // 5. both fail: the page is reported, never stored
  { const r = await run(reader("p", () => new Error("down")), reader("c", () => new Error("down")), [1, 2]);
    ok("a page neither reader could read is reported as failed", r.failedPages.length === 2 && r.texts.size === 0, JSON.stringify(r.failedPages)); }
  // 6. a cut-off reading is not a reading
  { const r = await run(reader("p", () => PAGE + "\n" + STOPPED_MARKER), reader("c", () => PAGE + "\n" + STOPPED_MARKER), [1]);
    ok("two cut-off readings leave the page failed", r.failedPages.length === 1 && r.texts.size === 0); }
  { const r = await run(reader("p", () => PAGE + "\n" + STOPPED_MARKER), reader("c", () => PAGE), [1]);
    ok("a cut-off primary uses the complete checker reading", r.texts.get(1) === PAGE && r.log.pages[0].source === "checker"); }
  // 7. the primary's daily allowance is used up on page 1: page 2 goes straight to the checker (the primary is not called again)
  { let calls = 0;
    const p = reader("p", () => { calls++; return new Error("Gemini answered 429 (daily limit reached - 250 for gemini-3.1-pro; it renews daily at midnight Pacific time): {}"); });
    const ocr = createGeminiOcr({ readers: { primary: p, checker: reader("c", () => PAGE) }, deadlineAt: Date.now() + 60_000, concurrency: 1 });
    ocr.start(1, png(1)); await ocr.finish(); ocr.start(2, png(2));
    const r = await ocr.finish();
    ok("after a daily-limit refusal the primary is not asked again", calls === 1 && r.texts.get(2) === PAGE, `calls ${calls}`); }
  // 8. two readings of different pages are not compared
  { const r = await run(reader("p", () => PAGE), reader("c", () => "completely unrelated words about football trial selection venue stadium players coach championship held"), [1]);
    ok("readings of different pages are not compared", r.checks.length === 0 && r.texts.get(1) === PAGE, JSON.stringify(r.log.pages[0])); }
  // 9. textOf gives the text as soon as it is read (the roster check needs it)
  { const ocr = createGeminiOcr({ readers: { primary: reader("p", () => PAGE), checker: reader("c", () => PAGE) }, deadlineAt: Date.now() + 60_000 });
    ocr.start(3, png(3));
    ok("textOf returns the page text", (await ocr.textOf(3)) === PAGE);
    let threw = false; try { await ocr.textOf(9); } catch { threw = true; }
    ok("textOf of a page never started throws", threw); }
  // 10. no time left: nothing is read, the page is failed (not silently empty)
  { const r = await run(reader("p", () => PAGE), reader("c", () => PAGE), [1], { deadlineAt: Date.now() - 1 });
    ok("past the deadline a page is failed, not stored empty", r.failedPages.length === 1 && r.texts.size === 0); }
  // 11. no key, no upload
  { let msg = ""; try { geminiOcrReaders({}); } catch (e) { msg = String((e as Error).message); }
    ok("without GEMINI_API_KEY the readers refuse to be created", /GEMINI_API_KEY is not set/.test(msg), msg); }
  { const r = geminiOcrReaders({ GEMINI_API_KEY: "x" });
    ok("the default readers are Pro (primary) and Flash (checker)", r.primary.name === "gemini:gemini-3.1-pro-preview" && r.checker?.name === "gemini:gemini-3.8-flash", `${r.primary.name} / ${r.checker?.name}`); }

  console.log(`geminiOcr selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
