/** Self-test of the Gemini reading check. Run: npx tsx src/lib/ingestion/geminiCheck.selftest.ts (no network, no database: scripted readers). */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STOPPED_MARKER, type PageReader } from "./pageReader";
import { attention, buildReport, checkCircularPages, geminiCacheFile, summarize, type CheckArgs, type CircularCheckInput } from "./geminiCheck";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { if (cond) pass++; else { fail++; console.log("FAIL", name, detail); } };

const pages: { id: string; pipeline: string; gemini: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const P = (id: string) => pages.find((p) => p.id === id)!;
const GOOD = P("football-trial"), GATE = P("gate-pass-13"), WAGE = P("wage-notice");

/** A reader that answers per image URL from a table, counting its calls; the image "bytes" are the URL itself. */
function scripted(table: Record<string, string | (() => string)>, name = "gemini:test") {
  const calls: string[] = [];
  const reader: PageReader = { name, async read(png: Buffer) { const url = png.toString(); calls.push(url); const v = table[url]; if (v === undefined) throw new Error("no script for " + url); return typeof v === "function" ? v() : v; } };
  return { reader, calls };
}
const tmp = () => mkdtempSync(join(tmpdir(), "gcheck-"));
function args(over: Partial<CheckArgs> & Pick<CheckArgs, "fileUrls" | "pageTexts" | "reader">): CheckArgs & { slept: number[]; waits: number[] } {
  const slept: number[] = [], waits: number[] = [];
  return {
    circularId: 1, fetchImage: async (u: string) => Buffer.from(u), cacheDir: tmp(), useCache: true, pauseMs: 6000, waitsMs: [65000, 65000],
    sleep: async (ms: number) => { slept.push(ms); }, budget: { liveCallsLeft: 100, liveCalls: 0, cacheHits: 0 }, onWait: (ms: number) => { waits.push(ms); }, slept, waits, ...over,
  } as any;
}

(async () => {
  // ---- statuses on real readings
  {
    const { reader } = scripted({ "u1": GOOD.gemini, "u2": GATE.gemini, "u3": WAGE.gemini });
    const a = args({ fileUrls: ["u1", "u2", "u3"], pageTexts: [GOOD.pipeline, GATE.pipeline, WAGE.pipeline], reader });
    const r = await checkCircularPages(a);
    ok("a page where every important number agrees is 'agreed'", r.outcomes[0].status === "agreed");
    ok("the gate pass is 'differences'", r.outcomes[1].status === "differences");
    const gate = r.outcomes[1] as any;
    ok("...and the pin code the pipeline read as 13203 is caught", gate.check.onlyFirst.includes("13203") && gate.check.onlySecond.includes("713203"), JSON.stringify(gate.check.onlyFirst));
    ok("each flagged number comes with the words around it", /13203/.test(gate.contexts.first["13203"] ?? "") && /713203/.test(gate.contexts.second["713203"] ?? ""), JSON.stringify(gate.contexts).slice(0, 200));
    ok("the full readings are kept only when asked", (gate as any).texts === undefined);
    ok("the wage notice keeps its three daily wages confirmed", ["808", "740", "809"].every((n) => (r.outcomes[2] as any).check.confirmed.includes(n)));
    ok("one pause after each LIVE call", a.slept.length === 3 && a.slept.every((m) => m === 6000), JSON.stringify(a.slept));
    ok("live calls are counted", a.budget.liveCalls === 3 && a.budget.cacheHits === 0);
  }
  // ---- a page with no pipeline reading is skipped with its reason, and costs no call
  {
    const { reader, calls } = scripted({ "u1": GOOD.gemini });
    const r = await checkCircularPages(args({ fileUrls: ["u1", "u2", "u3"], pageTexts: [GOOD.pipeline, "", "  "], notRead: { 1: "not in the page cache" }, reader }));
    ok("an empty reading is skipped, with the reason given", r.outcomes[1].status === "skipped" && (r.outcomes[1] as any).reason === "not in the page cache");
    ok("...and a default reason is given when none was", r.outcomes[2].status === "skipped" && /roster/.test((r.outcomes[2] as any).reason));
    ok("a skipped page makes no call", calls.length === 1);
  }
  // ---- the saved readings: a second run costs nothing
  {
    const dir = tmp();
    const { reader, calls } = scripted({ "u1": GOOD.gemini, "u2": GATE.gemini });
    await checkCircularPages(args({ fileUrls: ["u1", "u2"], pageTexts: [GOOD.pipeline, GATE.pipeline], reader, cacheDir: dir }));
    const again = args({ fileUrls: ["u1", "u2"], pageTexts: [GOOD.pipeline, GATE.pipeline], reader, cacheDir: dir });
    const r = await checkCircularPages(again);
    ok("a second run reads nothing from Gemini", calls.length === 2 && again.budget.cacheHits === 2 && again.budget.liveCalls === 0);
    ok("...and gives the same answers", r.outcomes[0].status === "agreed" && r.outcomes[1].status === "differences" && (r.outcomes[0] as any).cached === true);
    ok("...and does not pause for a saved reading", again.slept.length === 0);
    const other = scripted({ "u1": GOOD.gemini }, "gemini:another-model");
    await checkCircularPages(args({ fileUrls: ["u1"], pageTexts: [GOOD.pipeline], reader: other.reader, cacheDir: dir }));
    ok("a different model reads the page again", other.calls.length === 1);
    ok("the saved reading is one file per page, in a gemini/ folder", readdirSync(join(dir, "gemini")).length === 3);
    ok("the file name depends on the page, the reader and the instructions", geminiCacheFile("d", "u1", "a") !== geminiCacheFile("d", "u1", "b") && geminiCacheFile("d", "u1", "a") !== geminiCacheFile("d", "u2", "a"));
    const fresh = args({ fileUrls: ["u1"], pageTexts: [GOOD.pipeline], reader, cacheDir: dir, useCache: false });
    await checkCircularPages(fresh);
    ok("with the saved readings switched off, the page is read again", fresh.budget.liveCalls === 1);
  }
  // ---- an incomplete reading is shown but never kept
  {
    const dir = tmp();
    const cut = P("gpais-hindi").gemini.split("\n").slice(0, 12).join("\n") + "\n" + STOPPED_MARKER;
    const { reader, calls } = scripted({ "u1": cut });
    const r1 = await checkCircularPages(args({ fileUrls: ["u1"], pageTexts: [P("gpais-hindi").pipeline], reader, cacheDir: dir }));
    ok("a reading that stopped early is 'partial', not a disagreement", r1.outcomes[0].status === "partial", r1.outcomes[0].status);
    await checkCircularPages(args({ fileUrls: ["u1"], pageTexts: [P("gpais-hindi").pipeline], reader, cacheDir: dir }));
    ok("an incomplete reading is read again next time (it was not kept)", calls.length === 2);
  }
  // ---- errors
  {
    const { reader } = scripted({ "u1": () => { throw new Error("Gemini answered 404: model gone"); }, "u2": GOOD.gemini });
    const a = args({ fileUrls: ["u1", "u2"], pageTexts: [GOOD.pipeline, GOOD.pipeline], reader });
    const r = await checkCircularPages(a);
    ok("a failed page is an error, and the next page is still read", r.outcomes[0].status === "error" && /404/.test((r.outcomes[0] as any).error) && r.outcomes[1].status === "agreed");
    ok("a real error does not wait for the rate limit", a.waits.length === 0);
  }
  {
    let n = 0;
    const { reader } = scripted({ "u1": () => { if (n++ < 2) throw new Error("Gemini answered 429: RESOURCE_EXHAUSTED"); return GOOD.gemini; } });
    const a = args({ fileUrls: ["u1"], pageTexts: [GOOD.pipeline], reader });
    const r = await checkCircularPages(a);
    ok("a rate-limit refusal waits and then succeeds", r.outcomes[0].status === "agreed" && a.waits.length === 2);
    ok("...and the waits go through the injected clock (the test itself does not wait)", a.slept.filter((m) => m === 65000).length === 2, JSON.stringify(a.slept));
  }
  {
    const { reader } = scripted({ "u1": () => { throw new Error("Gemini answered 429: RESOURCE_EXHAUSTED"); }, "u2": GOOD.gemini });
    const a = args({ fileUrls: ["u1", "u2"], pageTexts: [GOOD.pipeline, GOOD.pipeline], reader });
    const r = await checkCircularPages(a);
    ok("a rate limit that does not clear stops the run and says so", r.stoppedForQuota && r.outcomes[0].status === "error" && r.outcomes[1].status === "skipped" && /rate limit/.test((r.outcomes[1] as any).reason));
  }
  // ---- the limit on live calls
  {
    const { reader, calls } = scripted({ "u1": GOOD.gemini, "u2": GOOD.gemini, "u3": GOOD.gemini });
    const a = args({ fileUrls: ["u1", "u2", "u3"], pageTexts: [GOOD.pipeline, GOOD.pipeline, GOOD.pipeline], reader, budget: { liveCallsLeft: 2, liveCalls: 0, cacheHits: 0 } });
    const r = await checkCircularPages(a);
    ok("the run stops at the limit on live calls", calls.length === 2 && r.stoppedForLimit && r.outcomes[2].status === "skipped" && /limit/.test((r.outcomes[2] as any).reason));
  }
  // ---- the full readings, for --dump-text, and not in the JSON
  {
    const { reader } = scripted({ "u1": GATE.gemini });
    const r = await checkCircularPages(args({ fileUrls: ["u1"], pageTexts: [GATE.pipeline], reader, keepTexts: true }));
    const o = r.outcomes[0] as any;
    ok("with keepTexts the outcome carries both full readings", o.texts && o.texts.first === GATE.pipeline.trim() && o.texts.second === GATE.gemini);
    const rep = buildReport([{ id: 1, serial: 1, headline: "h", outcomes: r.outcomes }], { reader: "x", startedAt: "t", liveCalls: 1, cacheHits: 0, stoppedForQuota: false, stoppedForLimit: false });
    ok("...but the JSON report does not hold them", !JSON.stringify(rep.json).includes("Distn") && JSON.stringify(rep.json).length < 6000, String(JSON.stringify(rep.json).length));
  }
  // ---- the report
  {
    const { reader } = scripted({ "u1": GOOD.gemini, "u2": GATE.gemini, "u3": P("mediclaim-hindi").gemini });
    const mk = async (id: number, headline: string, urls: string[], texts: string[]): Promise<CircularCheckInput> => {
      const r = await checkCircularPages(args({ circularId: id, fileUrls: urls, pageTexts: texts, reader }));
      return { id, serial: id + 100, headline, outcomes: r.outcomes };
    };
    const inputs = [await mk(10, "A | circular", ["u1"], [GOOD.pipeline]), await mk(11, "Gate pass", ["u2", "u3"], [GATE.pipeline, P("mediclaim-hindi").pipeline])];
    const sum = summarize(inputs);
    ok("the summary counts the pages", sum.pages === 3 && sum.agreed === 1 && sum.differences === 2 && sum.confirmedNumbers > 20, JSON.stringify(sum));
    const rep = buildReport(inputs, { reader: "gemini:test", startedAt: "2026-10-17", liveCalls: 3, cacheHits: 0, stoppedForQuota: false, stoppedForLimit: false });
    ok("the report lists the pages that need a look, with the numbers and the page image", /Pages to look at \(2\)/.test(rep.markdown) && /713203/.test(rep.markdown) && /\| u2 \|/.test(rep.markdown) && /20\.08\.2026/.test(rep.markdown));
    const order = rep.markdown.split("\n").filter((l) => /^\| 11 Gate pass \|/.test(l));
    ok("the page with more differences comes first", attention(inputs[1].outcomes[0]) >= attention(inputs[1].outcomes[1]) ? order[0].includes("| 1 |") : order[0].includes("| 2 |"));
    ok("the report shows the words around the flagged numbers", /What the flagged numbers look like/.test(rep.markdown) && /only Gemini has \*\*713203\*\*: ".*713203/.test(rep.markdown) && /only the pipeline has \*\*13203\*\*/.test(rep.markdown));
    ok("a '|' in a headline cannot break the table", !/A \| circular/.test(rep.markdown) && /A \/ circular/.test(rep.markdown));
    ok("the report says that nothing was written to the database", /Nothing was written to the database/.test(rep.markdown));
    const j: any = rep.json;
    ok("the JSON carries the meta, the summary and every circular", j.meta.reader === "gemini:test" && j.summary.pages === 3 && j.circulars.length === 2);
    const stopped = buildReport(inputs, { reader: "x", startedAt: "t", liveCalls: 1, cacheHits: 0, stoppedForQuota: true, stoppedForLimit: true });
    ok("a stopped run says so in the report", /STOPPED EARLY/.test(stopped.markdown) && /Stopped at the limit/.test(stopped.markdown));
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  rmSync(join(tmpdir(), "gcheck-nothing"), { force: true });
  process.exit(fail ? 1 : 0);
})();
