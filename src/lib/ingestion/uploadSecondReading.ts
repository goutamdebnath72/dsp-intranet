// src/lib/ingestion/uploadSecondReading.ts
//
// THE SECOND READING INSIDE THE UPLOAD (step 39a). The upload route renders each page, Tesseract reads it, and now, at the same time, a second
// reader (Gemini, looking at the page image) reads it too; after the last page the two readings are reconciled page by page (pageVerify.ts) and the
// result replaces the page's text before the circular is chunked, embedded and stored.
//
// DESIGN RULES (the upload must never become worse than before):
//   - the second reads run IN PARALLEL with Tesseract (a network wait next to a CPU job), at most two at a time, so a one-page circular costs about the
//     longer of the two and not the sum;
//   - a read that fails, is refused on the rate limit (then no further read is started), or is not back by the deadline costs only that page's
//     second reading: the page keeps the pipeline's text, exactly as before. The upload itself never fails because of this step;
//   - a failure is recorded in the log (circular_ingest_log) with its reason, so "this circular was not second-read, and why" can be asked afterwards.
//
// Switched off with UPLOAD_SECOND_READING=false, and off when there is no GEMINI_API_KEY. Unit-tested by uploadSecondReading.selftest.ts with fake readers.

import { DEFAULT_GEMINI_MODEL, geminiReader, type PageReader } from "./pageReader";
import { reconcilePage, type Dispute } from "./pageVerify";
import type { NewCheck } from "../search/pageChecks";

/** The reader of an upload, or null when the step is switched off or has no key. A single read may take at most 75 s. */
export function uploadSecondReader(env: Record<string, string | undefined> = process.env): PageReader | null {
  if ((env.UPLOAD_SECOND_READING ?? "").trim().toLowerCase() === "false") return null;
  if (!env.GEMINI_API_KEY) return null;
  return geminiReader({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL, timeoutMs: 75_000 });
}

export interface PageLog {
  page: number;
  used: "second" | "pipeline";
  reason: string;
  confirmed: number;
  onlyPipeline: number;
  onlySecond: number;
  disputes: Dispute[];
  dropped: string[];
}

export interface SecondReadingLog {
  enabled: boolean;
  reader?: string;
  ms?: number;
  pagesRead: number;
  pagesFromSecond: number;
  pagesKept: number;
  pages: PageLog[];
}

export interface SecondReadingSummary {
  enabled: boolean;
  /** Pages whose text was replaced by the second reading. */
  changedPages: number;
  /** The rows for circular_page_check (their fingerprints are added once the chunks are known: checkRowsFor). */
  checks: NewCheck[];
  log: SecondReadingLog;
}

type Outcome = { text?: string; error?: string };

export function createSecondReading(o: { reader: PageReader | null; deadlineAt: number; concurrency?: number; now?: () => number }) {
  const reader = o.reader;
  const now = o.now ?? Date.now;
  const limit = Math.max(1, o.concurrency ?? 2);
  let active = 0;
  const waiting: Array<() => void> = [];
  let refusedOnRate = false;
  const startedAt = now();
  const entries = new Map<number, Promise<Outcome>>();

  const schedule = <T,>(job: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const go = () => {
        active++;
        job().then(resolve, reject).finally(() => {
          active--;
          waiting.shift()?.();
        });
      };
      if (active < limit) go();
      else waiting.push(go);
    });

  return {
    enabled: !!reader,

    /** Starts the second reading of one page (1-based). Does nothing when the step is off or the page was already started. */
    start(page: number, png: Buffer): void {
      if (!reader || entries.has(page)) return;
      entries.set(
        page,
        schedule<Outcome>(async () => {
          if (refusedOnRate) return { error: "skipped: the service had refused on its rate limit" };
          if (now() >= o.deadlineAt) return { error: "skipped: no time was left" };
          try {
            return { text: await reader.read(png) };
          } catch (e) {
            const message = String((e as Error)?.message ?? e);
            if (/\b429\b|quota|rate.?limit/i.test(message)) refusedOnRate = true;
            return { error: message.slice(0, 200) };
          }
        }),
      );
    },

    /**
     * Waits for the reads (until the deadline), reconciles every page, and REPLACES perPageText[page - 1] where the second reading is the better text.
     * Never throws.
     */
    async finish(perPageText: string[]): Promise<SecondReadingSummary> {
      if (!reader) return { enabled: false, changedPages: 0, checks: [], log: { enabled: false, pagesRead: 0, pagesFromSecond: 0, pagesKept: 0, pages: [] } };
      const pages = [...entries.keys()].sort((a, b) => a - b);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), Math.max(0, o.deadlineAt - now()));
      });
      const results = await Promise.all(
        pages.map(async (page) => {
          const r = await Promise.race([entries.get(page) as Promise<Outcome>, timeout]);
          return { page, ...(r === "timeout" ? { error: "not back in the time available" } : r) } as { page: number } & Outcome;
        }),
      );
      if (timer) clearTimeout(timer);

      const checks: NewCheck[] = [];
      const logPages: PageLog[] = [];
      let changed = 0;
      for (const r of results) {
        const v = reconcilePage(perPageText[r.page - 1], r.text, reader.name, r.error);
        if (v.source === "second") {
          perPageText[r.page - 1] = v.text;
          changed++;
        }
        if (v.check) checks.push({ page: r.page, status: v.check.status, confirmed: v.check.confirmed, unconfirmed: v.check.unconfirmed, secondOnly: v.check.secondOnly, reader: v.check.reader });
        logPages.push({ page: r.page, used: v.source, reason: v.reason, confirmed: v.stats.confirmed, onlyPipeline: v.stats.onlyPipeline, onlySecond: v.stats.onlySecond, disputes: v.disputes, dropped: v.dropped });
      }
      return {
        enabled: true,
        changedPages: changed,
        checks,
        log: { enabled: true, reader: reader.name, ms: now() - startedAt, pagesRead: results.length, pagesFromSecond: changed, pagesKept: results.length - changed, pages: logPages },
      };
    },
  };
}

const pagesWord = (n: number) => `${n} page${n === 1 ? "" : "s"}`;

/** One plain sentence for the person who uploaded: how well the circular was read. "" when the step is off or nothing was read. */
export function readingLine(log: SecondReadingLog | null | undefined): string {
  if (!log || !log.enabled || log.pagesRead === 0) return "";
  const total = log.pagesRead;
  const used = log.pagesFromSecond;
  const differing = log.pages.filter((p) => p.used === "second" && (p.onlyPipeline > 0 || p.onlySecond > 0)).length;
  const why = (log.pages.find((p) => p.used === "pipeline")?.reason ?? "").replace(/^no second reading: /, "").replace(/\.$/, "");
  if (used === 0) return `The second reader could not be used for this circular${why ? ` (${why})` : ""}: it was read once, as before.`;
  if (used < total) return `Checked by a second reader: ${used} of ${pagesWord(total)}; the others were read once, as before${why ? ` (${why})` : ""}.`;
  if (differing === 0) return `Checked by a second reader: all ${pagesWord(total)} agree on every important number.`;
  return `Checked by a second reader: ${pagesWord(total)}; on ${differing} of them the two readers differed on a number, and the better reading was kept (see the upload log).`;
}
