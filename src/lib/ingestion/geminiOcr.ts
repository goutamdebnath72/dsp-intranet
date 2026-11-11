// src/lib/ingestion/geminiOcr.ts
//
// THE OCR OF AN UPLOAD, Gemini only. Each page image is read by a PRIMARY Gemini model (default gemini-3.1-pro-preview) and, at the
// same time, by a CHECKER Gemini model (default gemini-3.8-flash). The primary reading is the page's text. The two readings are compared number by number
// (readingCheck.ts); the numbers only the primary has are recorded as UNCONFIRMED (the answer card refuses a number nobody confirmed) and the numbers only the checker has
// are recorded too. Nothing is ever decided silently.
//
// WHAT HAPPENS WHEN A READER FAILS (the upload must never store a page it did not read):
//   - the primary fails, is cut off, or its daily allowance is used up  -> the checker's reading is the text (and no check is recorded: the page was read once);
//   - the checker fails                                                  -> the primary's reading is the text (read once);
//   - both fail, or both were cut off                                    -> the page is reported in `failedPages`; the caller must refuse the upload (a circular
//                                                                           with an unread page is not stored, and nothing is left behind).
// Pages are read at most `concurrency` readings at a time. Pure of any database; the readers are passed in, so it is tested with fake readers.

import { DEFAULT_GEMINI_MODEL, STOPPED_MARKER, geminiReader, type AttemptInfo, type PageReader } from "./pageReader";
import { SHRINK_EDGE, SHRINK_QUALITY, shrinkForReading } from "./pageImage";
import { checkReadings } from "./readingCheck";
import { MIN_SHARED_WORDS, cleanSecondReading, pairDisputes, type Dispute } from "./readingCompare";
import { canonicalIndic, repairIndic } from "./indicRepair";
import type { NewCheck } from "../search/pageChecks";

export const DEFAULT_PRIMARY_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_CHECK_MODEL = "gemini-3.8-flash";

export interface OcrReaders { primary: PageReader; checker: PageReader | null }

/** The two Gemini readers of an upload. Throws when there is no key: an upload cannot be read without Gemini. */
export function geminiOcrReaders(env: Record<string, string | undefined> = process.env): OcrReaders {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set: circulars are read by Gemini, so an upload cannot be read without it");
  const make = (model: string): PageReader => {
    const reader = geminiReader({ apiKey, model, timeoutMs: 50_000 });
    return {
      name: reader.name,
      note: `page images shrunk to a JPEG (long side ${SHRINK_EDGE} px, quality ${SHRINK_QUALITY})`,
      read: async (png, hooks) => reader.read(await shrinkForReading(png), hooks),
    };
  };
  const primaryModel = (env.OCR_PRIMARY_MODEL || env.GEMINI_VISION_MODEL || DEFAULT_PRIMARY_MODEL).trim();
  const checkModel = (env.OCR_CHECK_MODEL || DEFAULT_CHECK_MODEL).trim();
  return { primary: make(primaryModel), checker: checkModel && checkModel !== primaryModel ? make(checkModel) : null };
}

export interface OcrPageLog {
  page: number;
  /** which reading is the page's text */
  source: "primary" | "checker" | "none";
  reason: string;
  readMs?: number;
  attempts?: AttemptInfo[];
  confirmed: number;
  onlyPrimary: number;
  onlyChecker: number;
  disputes: Dispute[];
  /** true when a second reading was compared with the text */
  checked?: boolean;
  /** Hindi/Bengali letter slips of the reader (a letter of another script, an impossible letter sequence): repaired from the other reading, or left and reported */
  indicRepaired?: Array<{ from: string; to: string }>;
  indicUnresolved?: string[];
}
export interface OcrLog { primary: string; checker: string | null; ms: number; pages: OcrPageLog[] }

export interface OcrResult {
  /** the text of each page that was read, by 1-based page number */
  texts: Map<number, string>;
  /** rows for circular_page_check (fingerprints are added once the chunks are known: checkRowsFor) */
  checks: NewCheck[];
  /** pages that could not be read by either reader */
  failedPages: Array<{ page: number; reason: string }>;
  log: OcrLog;
}

type Outcome = { text?: string; error?: string; ms?: number };
type Entry = { primary: Promise<Outcome>; checker: Promise<Outcome>; attempts: AttemptInfo[] };

const complete = (o: Outcome): o is Outcome & { text: string } => typeof o.text === "string" && o.text.trim().length > 0 && !o.text.includes(STOPPED_MARKER);
const words = (s: string): Set<string> => new Set(String(s ?? "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const isQuota = (m: string) => /\b429\b|quota|rate.?limit/i.test(m);
const isDaily = (m: string) => /daily limit|per.?day/i.test(m);

export function createGeminiOcr(o: { readers: OcrReaders; deadlineAt: number; concurrency?: number; graceMs?: number; now?: () => number }) {
  const { primary, checker } = o.readers;
  const now = o.now ?? Date.now;
  const limit = Math.max(1, o.concurrency ?? 3);
  const grace = o.graceMs ?? 150_000;
  const startedAt = now();
  let active = 0;
  const waiting: Array<() => void> = [];
  let primaryOff = false; // the primary's daily allowance is used up: later pages go straight to the checker
  let checkerOff = false;
  const entries = new Map<number, Entry>();

  const schedule = <T,>(job: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const go = () => { active++; job().then(resolve, reject).finally(() => { active--; waiting.shift()?.(); }); };
      if (active < limit) go(); else waiting.push(go);
    });

  const run = (reader: PageReader, png: Buffer, attempts: AttemptInfo[], skip: () => boolean, onFail: (m: string) => void): Promise<Outcome> =>
    schedule<Outcome>(async () => {
      if (skip()) return { error: "skipped: this reader's allowance was used up earlier in this upload" };
      if (now() >= o.deadlineAt) return { error: "skipped: no time was left" };
      const t0 = now();
      try {
        const text = await reader.read(png, { onAttempt: (a) => attempts.push({ attempt: a.attempt, ms: a.ms, error: a.error.slice(0, 300) }) });
        return { text, ms: now() - t0 };
      } catch (e) {
        const message = String((e as Error)?.message ?? e).slice(0, 400);
        onFail(message);
        return { error: message };
      }
    });

  const waitFor = async <T,>(p: Promise<T>, label: string, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), Math.max(0, Math.min(o.deadlineAt, now() + grace) - now())); });
    const r = await Promise.race([p, t]);
    if (timer) clearTimeout(timer);
    void label;
    return r === "timeout" ? fallback : (r as T);
  };

  const decideRaw = (entry: Entry, page: number, p: Outcome, c: Outcome) => {
    const pOk = complete(p), cOk = complete(c);
    const why = (x: Outcome) => (x.error ?? (x.text !== undefined && x.text.includes(STOPPED_MARKER) ? "the reading was cut off or repeated itself" : "the reply was empty"));
    if (!pOk && !cOk) {
      const reason = `neither reader could read page ${page}: primary - ${why(p)}; checker - ${checker ? why(c) : "none configured"}`;
      return { text: null as string | null, log: { page, source: "none" as const, reason, confirmed: 0, onlyPrimary: 0, onlyChecker: 0, disputes: [] as Dispute[], ...(entry.attempts.length ? { attempts: entry.attempts } : {}) }, check: null as NewCheck | null };
    }
    if (!pOk) {
      return { text: cleanSecondReading(c.text!), log: { page, source: "checker" as const, reason: `the primary reading failed (${why(p)}), so the checker's reading is the text; the page was read once`, readMs: c.ms, confirmed: 0, onlyPrimary: 0, onlyChecker: 0, disputes: [] as Dispute[], ...(entry.attempts.length ? { attempts: entry.attempts } : {}) }, check: null as NewCheck | null };
    }
    const text = cleanSecondReading(p.text!);
    if (!cOk) {
      return { text, log: { page, source: "primary" as const, reason: checker ? `the checker could not read the page (${why(c)}); the page was read once` : "no checker is configured; the page was read once", readMs: p.ms, confirmed: 0, onlyPrimary: 0, onlyChecker: 0, disputes: [] as Dispute[], ...(entry.attempts.length ? { attempts: entry.attempts } : {}) }, check: null as NewCheck | null };
    }
    // both readings are complete: do they describe the same page, and which important numbers differ?
    const g = words(cleanSecondReading(c.text!)), t = words(text);
    if (g.size >= 8 && t.size >= 8) {
      const share = [...g].filter((w) => t.has(w)).length / g.size;
      if (share < MIN_SHARED_WORDS) {
        return { text, log: { page, source: "primary" as const, reason: `the two readings do not describe the same page (${Math.round(share * 100)}% of the checker's words are in the primary's); the primary's text is kept, unchecked`, readMs: p.ms, confirmed: 0, onlyPrimary: 0, onlyChecker: 0, disputes: [] as Dispute[] }, check: null as NewCheck | null };
      }
    }
    const chk = checkReadings(p.text!, c.text!);
    if (chk.status === "second_unusable") {
      return { text, log: { page, source: "primary" as const, reason: `the checker's reading is unusable (${chk.secondProblem ?? "too short"}); the page was read once`, readMs: p.ms, confirmed: 0, onlyPrimary: 0, onlyChecker: 0, disputes: [] as Dispute[] }, check: null as NewCheck | null };
    }
    const differ = chk.onlyFirst.length > 0 || chk.onlySecond.length > 0;
    return {
      text,
      log: { page, source: "primary" as const, reason: differ ? "the primary reading is the text; the readers differ on some important numbers" : "the primary reading is the text; every important number is confirmed by the checker", readMs: p.ms, confirmed: chk.confirmed.length, onlyPrimary: chk.onlyFirst.length, onlyChecker: chk.onlySecond.length, disputes: pairDisputes(chk.onlyFirst, chk.onlySecond, p.text!, c.text!).slice(0, 12), ...(entry.attempts.length ? { attempts: entry.attempts } : {}) },
      check: { page, status: chk.status, confirmed: chk.confirmed, unconfirmed: chk.onlyFirst, secondOnly: [...chk.onlySecond, ...chk.minorOnlySecond], reader: checker!.name } as NewCheck,
    };
  };

  /** decideRaw, then the Hindi/Bengali letter slips of the chosen text are repaired from the other reading (or reported): see indicRepair.ts */
  const decide = (entry: Entry, page: number, p: Outcome, c: Outcome) => {
    const d = decideRaw(entry, page, p, c);
    if (d.text === null) return d;
    const other = d.log.source === "primary" ? (complete(c) ? cleanSecondReading(c.text!) : null) : complete(p) ? cleanSecondReading(p.text!) : null;
    const r = repairIndic(canonicalIndic(d.text), other ? canonicalIndic(other) : null);
    if (!r.repairs.length && !r.unresolved.length) return { ...d, text: r.text };
    return {
      ...d,
      text: r.text,
      log: { ...d.log, ...(r.repairs.length ? { indicRepaired: r.repairs.map(({ from, to }) => ({ from, to })) } : {}), ...(r.unresolved.length ? { indicUnresolved: r.unresolved.map((u) => u.token) } : {}) },
    };
  };

  return {
    /** Starts reading one page (1-based): the primary and the checker at the same time. */
    start(page: number, png: Buffer): void {
      if (entries.has(page)) return;
      const attempts: AttemptInfo[] = [];
      entries.set(page, {
        attempts,
        primary: run(primary, png, attempts, () => primaryOff, (m) => { if (isQuota(m) && isDaily(m)) primaryOff = true; }),
        checker: checker ? run(checker, png, [], () => checkerOff, (m) => { if (isQuota(m) && isDaily(m)) checkerOff = true; }) : Promise.resolve({ error: "no checker configured" }),
      });
    },

    /** The text of one page as soon as a reading is back (the roster check needs it before the upload ends). Rejects when the page could not be read. */
    async textOf(page: number): Promise<string> {
      const e = entries.get(page);
      if (!e) throw new Error(`page ${page} was never started`);
      const [p, c] = await Promise.all([waitFor(e.primary, "primary", { error: "not back in time" } as Outcome), waitFor(e.checker, "checker", { error: "not back in time" } as Outcome)]);
      const d = decide(e, page, p, c);
      if (d.text === null) throw new Error(d.log.reason);
      return d.text;
    },

    /** Waits for every started page (until the deadline) and returns the page texts, the checks and the pages that failed. Never throws. */
    async finish(): Promise<OcrResult> {
      const texts = new Map<number, string>();
      const checks: NewCheck[] = [];
      const failedPages: OcrResult["failedPages"] = [];
      const pages: OcrPageLog[] = [];
      for (const page of [...entries.keys()].sort((a, b) => a - b)) {
        const e = entries.get(page)!;
        const [p, c] = await Promise.all([waitFor(e.primary, "primary", { error: "not back in the time available" } as Outcome), waitFor(e.checker, "checker", { error: "not back in the time available" } as Outcome)]);
        const d = decide(e, page, p, c);
        pages.push({ ...d.log, checked: !!d.check });
        if (d.text === null) failedPages.push({ page, reason: d.log.reason }); else texts.set(page, d.text);
        if (d.check) checks.push(d.check);
      }
      return { texts, checks, failedPages, log: { primary: primary.name, checker: checker?.name ?? null, ms: now() - startedAt, pages } };
    },
  };
}

const pagesWord = (n: number) => `${n} page${n === 1 ? "" : "s"}`;

/** One plain sentence for the person who uploaded: how well the circular was read. */
export function readingSummary(log: OcrLog | null | undefined): string {
  const base = readingSummaryBase(log);
  if (!base || !log) return base;
  const fixed = log.pages.reduce((n, p) => n + (p.indicRepaired?.length ?? 0), 0);
  const left = log.pages.reduce((n, p) => n + (p.indicUnresolved?.length ?? 0), 0);
  const extra = [fixed ? `${fixed} Hindi/Bengali letter slip${fixed === 1 ? "" : "s"} of the reader corrected from the second reading` : "", left ? `${left} word${left === 1 ? "" : "s"} with a letter slip could not be corrected (see the upload log)` : ""].filter(Boolean).join("; ");
  return extra ? `${base} ${extra[0].toUpperCase()}${extra.slice(1)}.` : base;
}

function readingSummaryBase(log: OcrLog | null | undefined): string {
  if (!log || log.pages.length === 0) return "";
  const total = log.pages.length;
  const checked = log.pages.filter((p) => p.checked).length;
  const differing = log.pages.filter((p) => p.onlyPrimary > 0 || p.onlyChecker > 0).length;
  if (checked === 0) return `Read by Gemini; the second reader could not be used for ${pagesWord(total)}, so each page was read once.`;
  if (checked < total) return `Read by Gemini and checked by a second reader on ${checked} of ${pagesWord(total)}; the others were read once.`;
  if (differing === 0) return `Read by Gemini and checked by a second reader: all ${pagesWord(total)} agree on every important number.`;
  return `Read by Gemini and checked by a second reader: ${pagesWord(total)}; on ${differing} of them the two readers differed on a number (those numbers are marked unconfirmed; see the upload log).`;
}

export { DEFAULT_GEMINI_MODEL };
