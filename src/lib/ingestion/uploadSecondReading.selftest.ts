/**
 * Self-test of the second reading inside the upload. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/uploadSecondReading.selftest.ts
 * No network, no database: the reader is a fake that answers from the pilot's real readings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageUnits, planChunks } from "./chunking";
import type { AttemptInfo, PageReader } from "./pageReader";
import { DEFAULT_GRACE_MS, createSecondReading, readingLine, uploadSecondReader, type SecondReadingLog } from "./uploadSecondReading";
import { checkRowsFor, freshChecks } from "../search/pageChecks";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const pilot: { id: string; pipeline: string; gemini: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const pg = (id: string) => pilot.find((p) => p.id === id) as { id: string; pipeline: string; gemini: string };
const PAGES = ["wage-notice", "gpais-english", "football-trial", "gift-card-corrigendum", "merit-scholarship"];
/** A fake reader: the "image" is the page's id; it answers with the pilot's real second reading after a delay, and records how many reads ran at once. */
function fakeReader(opts: { delay?: number; fail?: (id: string) => string | null } = {}) {
  const state = { active: 0, max: 0, calls: 0 };
  const reader: PageReader = {
    name: "fake:gemini",
    async read(png) {
      const id = png.toString();
      state.calls++; state.active++; state.max = Math.max(state.max, state.active);
      try {
        await sleep(opts.delay ?? 20);
        const err = opts.fail?.(id);
        if (err) throw new Error(err);
        return pg(id).gemini;
      } finally { state.active--; }
    },
  };
  return { reader, state };
}
const far = () => Date.now() + 60_000;

(async () => {
  // ---- off
  {
    const sr = createSecondReading({ reader: null, deadlineAt: far() });
    sr.start(1, Buffer.from("wage-notice"));
    const text = ["PIPELINE TEXT"];
    const r = await sr.finish(text);
    ok("off (no reader): nothing is read, the text is untouched, the summary says so", !sr.enabled && !r.enabled && r.changedPages === 0 && text[0] === "PIPELINE TEXT" && r.checks.length === 0 && r.log.enabled === false);
    ok("off: no line for the uploader", readingLine(r.log) === "");
  }
  ok("uploadSecondReader: UPLOAD_SECOND_READING=false switches it off", uploadSecondReader({ GEMINI_API_KEY: "k", UPLOAD_SECOND_READING: "false" }) === null && uploadSecondReader({ GEMINI_API_KEY: "k", UPLOAD_SECOND_READING: " FALSE " }) === null);
  ok("uploadSecondReader: no key, no reader", uploadSecondReader({}) === null);
  ok("uploadSecondReader: with a key it is on by default, named by its model", /^gemini:/.test(uploadSecondReader({ GEMINI_API_KEY: "k" })?.name ?? ""));
  ok("uploadSecondReader: GEMINI_VISION_MODEL names the model", uploadSecondReader({ GEMINI_API_KEY: "k", GEMINI_VISION_MODEL: "my-model" })?.name === "gemini:my-model");

  // ---- parallel, bounded, and the pages are replaced
  {
    const { reader, state } = fakeReader({ delay: 40 });
    const sr = createSecondReading({ reader, deadlineAt: far(), concurrency: 2 });
    const text: string[] = PAGES.map((id) => pg(id).pipeline);
    const t0 = Date.now();
    PAGES.forEach((id, i) => sr.start(i + 1, Buffer.from(id)));
    sr.start(1, Buffer.from("wage-notice")); // the same page twice: ignored
    const r = await sr.finish(text);
    const took = Date.now() - t0;
    ok("never more than two reads at once (five pages)", state.max === 2 && state.calls === 5, JSON.stringify(state));
    ok("five reads of 40 ms with two at a time take about 120 ms, not 200 (they overlap)", took < 190, String(took));
    ok("a page started twice is read once", state.calls === 5);
    ok("every page's text is now the second reading", text.every((t, i) => /\S/.test(t) && t !== pg(PAGES[i]).pipeline) && r.changedPages === 5, String(r.changedPages));
    ok("one check row per page, with the reader's name", r.checks.length === 5 && r.checks.every((c) => c.reader === "fake:gemini" && c.unconfirmed.length === 0));
    ok("the log counts the pages", r.log.pagesRead === 5 && r.log.pagesFromSecond === 5 && r.log.pagesKept === 0 && r.log.pages.length === 5 && typeof r.log.ms === "number");
  }

  // ---- a failure costs only that page
  {
    const { reader } = fakeReader({ fail: (id) => (id === "gpais-english" ? "Gemini answered 500: boom" : null) });
    const sr = createSecondReading({ reader, deadlineAt: far() });
    const text = PAGES.slice(0, 3).map((id) => pg(id).pipeline);
    PAGES.slice(0, 3).forEach((id, i) => sr.start(i + 1, Buffer.from(id)));
    const r = await sr.finish(text);
    ok("the page whose read failed keeps the pipeline's text; the others are replaced", text[1] === pg("gpais-english").pipeline && text[0] !== pg("wage-notice").pipeline && text[2] !== pg("football-trial").pipeline && r.changedPages === 2);
    ok("...and the log says why", /Gemini answered 500/.test(r.log.pages.find((p) => p.page === 2)?.reason ?? ""));
    ok("...and it gets no check row", !r.checks.some((c) => c.page === 2) && r.checks.length === 2);
    ok("the uploader's line says 2 of 3 pages and why", /2 of 3 pages/.test(readingLine(r.log)) && /Gemini answered 500/.test(readingLine(r.log)), readingLine(r.log));
  }

  // ---- a rate limit stops further reads
  {
    const { reader, state } = fakeReader({ delay: 10, fail: (id) => (id === "wage-notice" ? "Gemini answered 429: quota exceeded" : null) });
    const sr = createSecondReading({ reader, deadlineAt: far(), concurrency: 1 });
    const text = PAGES.slice(0, 4).map((id) => pg(id).pipeline);
    PAGES.slice(0, 4).forEach((id, i) => sr.start(i + 1, Buffer.from(id)));
    const r = await sr.finish(text);
    ok("after a 429 no further read is started (only the first page was asked)", state.calls === 1, JSON.stringify(state));
    ok("every page keeps the pipeline's text", r.changedPages === 0 && text.every((t, i) => t === pg(PAGES[i]).pipeline));
    ok("the skipped pages say it was the rate limit", r.log.pages.filter((p) => /rate limit/.test(p.reason)).length === 3, JSON.stringify(r.log.pages.map((p) => p.reason.slice(0, 40))));
    ok("the uploader's line says the second reader could not be used", /could not be used/.test(readingLine(r.log)), readingLine(r.log));
  }

  // ---- the deadline
  {
    const { reader } = fakeReader({ delay: 400 });
    const sr = createSecondReading({ reader, deadlineAt: Date.now() + 80 });
    const text = [pg("wage-notice").pipeline];
    sr.start(1, Buffer.from("wage-notice"));
    const t0 = Date.now();
    const r = await sr.finish(text);
    const took = Date.now() - t0;
    ok("a read not back by the deadline is given up: finish returns at the deadline, not at the end of the read", took < 300, String(took));
    ok("...the page keeps the pipeline's text and the log says so", text[0] === pg("wage-notice").pipeline && /not back in the time available/.test(r.log.pages[0].reason), r.log.pages[0]?.reason);
    await sleep(350); // let the abandoned read end quietly
  }
  {
    const { reader, state } = fakeReader();
    const sr = createSecondReading({ reader, deadlineAt: Date.now() - 1 });
    sr.start(1, Buffer.from("wage-notice"));
    const r = await sr.finish([pg("wage-notice").pipeline]);
    ok("with the deadline already passed no read is started", state.calls === 0 && /no time was left/.test(r.log.pages[0].reason));
  }
  {
    const odd: PageReader = { name: "odd", read: async () => { throw "a plain string, not an Error"; } };
    const sr = createSecondReading({ reader: odd, deadlineAt: far() });
    sr.start(1, Buffer.from("x"));
    const r = await sr.finish(["text"]);
    ok("a reader that throws something that is not an Error never breaks finish", r.enabled && r.changedPages === 0);
  }

  // ---- a page the pipeline could not read at all
  {
    const { reader } = fakeReader();
    const sr = createSecondReading({ reader, deadlineAt: far() });
    const text: string[] = [];
    sr.start(2, Buffer.from("football-trial"));
    const r = await sr.finish(text);
    ok("page 2 with no pipeline text at all (OCR failed) takes the second reading", r.changedPages === 1 && (text[1] ?? "").length > 100 && text[0] === undefined);
  }

  // ---- a stalled service costs a bounded wait, and the log says what happened (step 39c)
  {
    ok("the wait after the OCR is 150 s by default", DEFAULT_GRACE_MS === 150_000);
    const stalled: PageReader = { name: "stalled", read: () => new Promise<string>((r) => setTimeout(() => r("late"), 600)) };
    const sr = createSecondReading({ reader: stalled, deadlineAt: far(), graceMs: 80 });
    const text = [pg("wage-notice").pipeline];
    sr.start(1, Buffer.from("wage-notice"));
    const t0 = Date.now();
    const r = await sr.finish(text);
    const took = Date.now() - t0;
    ok("a read still not back after the grace is given up (about 80 ms here, not the 600 ms of the read, not the far deadline)", took >= 60 && took < 350, String(took));
    ok("...the page keeps the pipeline's text", text[0] === pg("wage-notice").pipeline && r.changedPages === 0);
    ok("...the reason says how long it waited", /not back in the time available \(waited \d+ s/.test(r.log.pages[0].reason) && /the first was still waiting/.test(r.log.pages[0].reason), r.log.pages[0].reason);
    ok("...and the uploader's line has no nested brackets", readingLine(r.log) === "The second reader could not be used for this circular (not back in the time available): it was read once, as before.", readingLine(r.log));
    await sleep(550);

    const failing: PageReader = {
      name: "hung-then-hung",
      read: (_png, hooks) => {
        hooks?.onAttempt?.({ attempt: 1, ms: 50_000, error: "Gemini request failed: This operation was aborted" });
        return new Promise<string>((res) => setTimeout(() => res("late"), 600));
      },
    };
    const sr2 = createSecondReading({ reader: failing, deadlineAt: far(), graceMs: 60 });
    sr2.start(1, Buffer.from("x"));
    const r2 = await sr2.finish(["text"]);
    ok("a stall after an earlier failed attempt: the reason names that attempt, how long it ran and why it failed", /attempt 1 failed after 50 s: Gemini request failed: This operation was aborted/.test(r2.log.pages[0].reason), r2.log.pages[0].reason);
    ok("...and the attempt is in the page's log", r2.log.pages[0].attempts?.length === 1 && r2.log.pages[0].attempts?.[0].attempt === 1, JSON.stringify(r2.log.pages[0].attempts));
    await sleep(550);

    const retried: PageReader = {
      name: "retried",
      read: async (_png, hooks) => {
        const a: AttemptInfo = { attempt: 1, ms: 50_000, error: "Gemini request failed: This operation was aborted" };
        hooks?.onAttempt?.(a);
        await sleep(15);
        return pg("football-trial").gemini;
      },
    };
    const sr3 = createSecondReading({ reader: retried, deadlineAt: far(), graceMs: 5_000 });
    sr3.start(1, Buffer.from("x"));
    const text3 = [pg("football-trial").pipeline];
    const r3 = await sr3.finish(text3);
    ok("a read that succeeded after a failed attempt is used, and the failed attempt stays in the log with the read time", r3.changedPages === 1 && r3.log.pages[0].attempts?.length === 1 && typeof r3.log.pages[0].readMs === "number" && (r3.log.pages[0].readMs as number) >= 10, JSON.stringify(r3.log.pages[0]).slice(0, 220));
    const fastOk = fakeReader({ delay: 10 });
    const sr4 = createSecondReading({ reader: fastOk.reader, deadlineAt: far(), graceMs: 2_000 });
    sr4.start(1, Buffer.from("wage-notice"));
    const r4 = await sr4.finish([pg("wage-notice").pipeline]);
    ok("a read that returns within the grace is not cut", r4.changedPages === 1 && r4.log.pages[0].attempts === undefined && typeof r4.log.pages[0].readMs === "number");
    ok("the grace never extends past the absolute deadline", await (async () => {
      const slow: PageReader = { name: "slow", read: () => new Promise<string>((res) => setTimeout(() => res("late"), 500)) };
      const s5 = createSecondReading({ reader: slow, deadlineAt: Date.now() + 70, graceMs: 60_000 });
      s5.start(1, Buffer.from("x"));
      const t = Date.now();
      await s5.finish(["text"]);
      const d = Date.now() - t;
      await sleep(450);
      return d < 300;
    })());
  }

  // ---- the round trip: the saved checks are about exactly the text that gets stored
  {
    const { reader } = fakeReader();
    const sr = createSecondReading({ reader, deadlineAt: far() });
    const ids = ["wage-notice", "gpais-english", "football-trial"];
    const text = ids.map((id) => pg(id).pipeline);
    ids.forEach((id, i) => sr.start(i + 1, Buffer.from(id)));
    const r = await sr.finish(text);
    const chunks = planChunks(buildPageUnits(text, "")).map((c) => ({ page: c.page, index: c.index, text: c.text }));
    const rows = checkRowsFor(r.checks, chunks);
    ok("a fingerprint row for every second-read page", rows.length === 3 && rows.every((x) => /^[0-9a-f]{40}$/.test(x.textHash)));
    const asDb = rows.map((x) => ({ page_number: x.page, confirmed: x.confirmed, unconfirmed: x.unconfirmed, text_hash: x.textHash }));
    const fresh = freshChecks(asDb, chunks);
    ok("the answer step's loader sees all three checks as FRESH for the stored chunks", Object.keys(fresh).length === 3 && fresh[1].confirmed.length > 0, JSON.stringify(Object.keys(fresh)));
    const tampered = chunks.map((c) => (c.page === 2 ? { ...c, text: c.text + " 999999" } : c));
    ok("if a page's stored text is not the checked text, its check is no longer used", Object.keys(freshChecks(asDb, tampered)).sort().join() === "1,3");
    ok("a page with no stored chunks gets no row", checkRowsFor(r.checks, chunks.filter((c) => c.page !== 3)).length === 2);
  }

  // ---- the line for the uploader
  {
    const mk = (pages: Partial<SecondReadingLog["pages"][number]>[], enabled = true): SecondReadingLog => {
      const full = pages.map((p, i) => ({ page: i + 1, used: "second" as const, reason: "", confirmed: 5, onlyPipeline: 0, onlySecond: 0, disputes: [], dropped: [], ...p }));
      return { enabled, pagesRead: full.length, pagesFromSecond: full.filter((p) => p.used === "second").length, pagesKept: full.filter((p) => p.used !== "second").length, pages: full };
    };
    ok("line: one page, all agree", readingLine(mk([{}])) === "Checked by a second reader: all 1 page agree on every important number.", readingLine(mk([{}])));
    ok("line: three pages, all agree", readingLine(mk([{}, {}, {}])) === "Checked by a second reader: all 3 pages agree on every important number.");
    ok("line: a difference is said, with the kept reading", /on 1 of them the two readers differed on a number, and the better reading was kept/.test(readingLine(mk([{}, { onlyPipeline: 1 }]))));
    ok("line: nothing read gives no line", readingLine(mk([])) === "" && readingLine(null) === "" && readingLine(undefined) === "");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
