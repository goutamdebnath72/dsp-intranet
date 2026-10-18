/**
 * The Gemini reading check of a circular's pages: for each page the pipeline already read (its reading comes from the re-read tool's page cache),
 * a second reader (Gemini) reads the same page image, the two readings are compared (readingCheck.ts), and a report ranks the pages to look at.
 *
 * Gemini's readings are kept on disk, so a page is never paid for twice; a failed or incomplete reading is never kept. The calls are spaced out,
 * a rate-limit refusal waits for the window to clear, and a run stops after a limit on live calls, so one command cannot burn the quota.
 * Nothing here touches the database: it reads, compares and reports.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyWithQuotaWait } from "./embedThrottle";
import { PAGE_READER_PROMPT, STOPPED_MARKER, type PageReader } from "./pageReader";
import { checkReadings, numberContext, type PageCheck } from "./readingCheck";

export type PageOutcome =
  | { page: number; url: string; status: "skipped"; reason: string }
  | { page: number; url: string; status: "error"; error: string }
  | { page: number; url: string; status: PageCheck["status"]; check: PageCheck; secondChars: number; cached: boolean; contexts: { first: Record<string, string>; second: Record<string, string> }; texts?: { first: string; second: string } };

export interface CheckArgs {
  circularId: number;
  fileUrls: string[];
  /** The pipeline's reading of each page, aligned with fileUrls; "" for a page that was not read. */
  pageTexts: string[];
  /** Why a page has no reading (by page index), for the report. */
  notRead?: Record<number, string>;
  reader: PageReader;
  fetchImage(url: string): Promise<Buffer>;
  cacheDir: string;
  useCache: boolean;
  /** Wait after each LIVE call, to stay inside the service's per-minute limit. */
  pauseMs: number;
  /** Waits after a rate-limit refusal, one entry per retry. */
  waitsMs: number[];
  sleep(ms: number): Promise<void>;
  /** Live calls still allowed in this run (cache hits are free). Shared across circulars through the object. */
  budget: { liveCallsLeft: number; liveCalls: number; cacheHits: number };
  /** Keep both full readings in each outcome (for --dump-text). */
  keepTexts?: boolean;
  onPage?(o: PageOutcome): void;
  onWait?(ms: number, attempt: number, total: number): void;
}

export interface CheckResult {
  outcomes: PageOutcome[];
  stoppedForQuota: boolean;
  stoppedForLimit: boolean;
}

const promptId = createHash("sha1").update(PAGE_READER_PROMPT).digest("hex").slice(0, 10);
/** One file per (page image, reader, instructions): a changed model or prompt reads the page again. */
export function geminiCacheFile(dir: string, url: string, readerName: string): string {
  return join(dir, "gemini", createHash("sha1").update(`${url}|${readerName}|${promptId}`).digest("hex") + ".json");
}

export async function checkCircularPages(a: CheckArgs): Promise<CheckResult> {
  const outcomes: PageOutcome[] = [];
  let stoppedForQuota = false, stoppedForLimit = false;
  const push = (o: PageOutcome) => { outcomes.push(o); a.onPage?.(o); };
  for (let i = 0; i < a.fileUrls.length; i++) {
    const url = a.fileUrls[i], page = i + 1;
    if (stoppedForQuota) { push({ page, url, status: "skipped", reason: "stopped: the service kept refusing on its rate limit" }); continue; }
    const first = (a.pageTexts[i] || "").trim();
    if (!first) { push({ page, url, status: "skipped", reason: a.notRead?.[i] || "the pipeline has no reading of this page (a roster page is stored as rows)" }); continue; }

    let second: string | null = null, cached = false;
    const file = geminiCacheFile(a.cacheDir, url, a.reader.name);
    if (a.useCache && existsSync(file)) {
      try { const saved = JSON.parse(readFileSync(file, "utf8")); if (saved?.url === url && typeof saved?.text === "string") { second = saved.text; cached = true; a.budget.cacheHits++; } } catch { /* unreadable: read it again */ }
    }
    if (second === null) {
      if (a.budget.liveCallsLeft <= 0) { stoppedForLimit = true; push({ page, url, status: "skipped", reason: "the limit on live Gemini calls for this run was reached (run the same command again to continue)" }); continue; }
      a.budget.liveCallsLeft--;
      a.budget.liveCalls++;
      const res = await applyWithQuotaWait(async () => a.reader.read(await a.fetchImage(url)), { waitsMs: a.waitsMs, onWait: a.onWait, clock: { sleep: a.sleep, now: () => Date.now() } });
      if (!res.ok) {
        push({ page, url, status: "error", error: String((res.error as any)?.message ?? res.error).split("\n")[0].slice(0, 240) });
        if (res.quotaExhausted) stoppedForQuota = true;
        await a.sleep(a.pauseMs);
        continue;
      }
      second = res.value as string;
      // an incomplete reading is worth showing but not worth keeping: it is read again next time
      if (a.useCache && !second.includes(STOPPED_MARKER)) {
        mkdirSync(join(a.cacheDir, "gemini"), { recursive: true });
        writeFileSync(file, JSON.stringify({ url, reader: a.reader.name, savedAt: new Date().toISOString(), text: second }));
      }
      await a.sleep(a.pauseMs);
    }
    const check = checkReadings(first, second);
    const ctx = (nums: string[], text: string) => Object.fromEntries(nums.slice(0, 8).map((n) => [n, numberContext(text, n)]).filter(([, c]) => c) as [string, string][]);
    push({ page, url, status: check.status, check, secondChars: second.length, cached, contexts: { first: ctx(check.onlyFirst, first), second: ctx(check.onlySecond, second) }, ...(a.keepTexts ? { texts: { first, second } } : {}) });
  }
  return { outcomes, stoppedForQuota, stoppedForLimit };
}

// ---------------------------------------------------------------- the report
export interface CircularCheckInput { id: number; serial: number | string | null; headline: string; outcomes: PageOutcome[] }
export interface ReportMeta { reader: string; startedAt: string; liveCalls: number; cacheHits: number; stoppedForQuota: boolean; stoppedForLimit: boolean }

const checked = (o: PageOutcome): o is Extract<PageOutcome, { check: PageCheck }> => "check" in o;
/** How much a page needs a look: important numbers that only one reading has, and letters from a wrong script. */
export const attention = (o: PageOutcome): number => (checked(o) ? o.check.onlyFirst.length + o.check.onlySecond.length + o.check.oddScripts.length * 2 : 0);

export function summarize(inputs: CircularCheckInput[]) {
  const all = inputs.flatMap((c) => c.outcomes);
  const n = (s: string) => all.filter((o) => o.status === s).length;
  return {
    pages: all.length, agreed: n("agreed"), differences: n("differences"), partial: n("partial"), unusable: n("second_unusable"), errors: n("error"), skipped: n("skipped"),
    confirmedNumbers: all.reduce((t, o) => t + (checked(o) ? o.check.confirmed.length : 0), 0),
  };
}

const cell = (xs: string[], max = 10) => (xs.length ? xs.slice(0, max).join(", ") + (xs.length > max ? `, ... (+${xs.length - max})` : "") : "");

export function buildReport(inputs: CircularCheckInput[], meta: ReportMeta): { markdown: string; json: unknown } {
  const sum = summarize(inputs);
  const flagged = inputs.flatMap((c) => c.outcomes.filter((o) => checked(o) && (o.status === "differences" || o.status === "partial")).map((o) => ({ c, o: o as Extract<PageOutcome, { check: PageCheck }> })))
    .sort((x, y) => attention(y.o) - attention(x.o) || x.c.id - y.c.id || x.o.page - y.o.page);
  const errors = inputs.flatMap((c) => c.outcomes.filter((o) => o.status === "error").map((o) => ({ c, o: o as Extract<PageOutcome, { status: "error" }> })));
  const L: string[] = [];
  L.push(`# Reading check (Gemini against the pipeline) - ${meta.startedAt}`, "");
  L.push(`Second reader: **${meta.reader}**. The check itself reads and compares only; the database is written only if the command was run with --save.`);
  L.push(`- Circulars: **${inputs.length}**, pages: **${sum.pages}** (Gemini read live: ${meta.liveCalls}, from its saved readings: ${meta.cacheHits})`);
  L.push(`- Every important number agrees: **${sum.agreed}** | some differ: **${sum.differences}** | second reading stopped early (partial): ${sum.partial} | second reading unusable: ${sum.unusable} | errors: ${sum.errors} | skipped: ${sum.skipped}`);
  L.push(`- Numbers confirmed by both readers: **${sum.confirmedNumbers}**`);
  if (meta.stoppedForQuota) L.push(`- **STOPPED EARLY: the service kept refusing on its rate limit.** Run the same command again later: pages already read are kept.`);
  if (meta.stoppedForLimit) L.push(`- **Stopped at the limit on live calls.** Run the same command again to continue: pages already read are kept.`);
  L.push("", "How to read it: a number that BOTH readers have is confirmed. A number only the pipeline has may be a misreading in the stored text (or something Gemini missed); a number only Gemini has may be one the pipeline lost (or one Gemini invented). Open the page image to settle it. Small plain numbers (under 4 digits, no separator) are counted but never flagged; numbers inside handwriting only count as confirmation.", "");
  L.push(`## Pages to look at (${flagged.length}), most first`, "");
  if (flagged.length) {
    L.push("| circular | page | status | only the pipeline has | only Gemini has | wrong-script letters | page image |", "|---|---|---|---|---|---|---|");
    for (const { c, o } of flagged) L.push(`| ${c.id} ${c.headline.replace(/\|/g, "/").slice(0, 40)} | ${o.page} | ${o.status} | ${cell(o.check.onlyFirst)} | ${cell(o.check.onlySecond)} | ${o.check.oddScripts.map((x) => x.chars).join(" ")} | ${o.url} |`);
  } else L.push("None.");
  if (flagged.length) {
    L.push("", "## What the flagged numbers look like (the words around each, as read)", "");
    for (const { c, o } of flagged) {
      for (const [n, t] of Object.entries(o.contexts.first)) L.push(`- circular ${c.id} page ${o.page}, only the pipeline has **${n}**: "${t.replace(/\|/g, "/")}"`);
      for (const [n, t] of Object.entries(o.contexts.second)) L.push(`- circular ${c.id} page ${o.page}, only Gemini has **${n}**: "${t.replace(/\|/g, "/")}"`);
    }
  }
  if (errors.length) { L.push("", `## Errors (${errors.length})`, ""); for (const { c, o } of errors) L.push(`- circular ${c.id} page ${o.page}: ${o.error}`); }
  L.push("", "## Circulars", "", "| id | serial | headline | pages | agreed | differences | partial | unusable | errors | skipped |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const c of inputs) {
    const n = (s: string) => c.outcomes.filter((o) => o.status === s).length;
    L.push(`| ${c.id} | ${c.serial ?? ""} | ${c.headline.replace(/\|/g, "/").slice(0, 60)} | ${c.outcomes.length} | ${n("agreed")} | ${n("differences")} | ${n("partial")} | ${n("second_unusable")} | ${n("error")} | ${n("skipped")} |`);
  }
  const slim = inputs.map((c) => ({ ...c, outcomes: c.outcomes.map((o) => { const { texts: _t, ...rest } = o as any; return rest; }) }));
  return { markdown: L.join("\n") + "\n", json: { meta, summary: sum, circulars: slim } };
}
