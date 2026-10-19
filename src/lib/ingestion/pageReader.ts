// src/lib/ingestion/pageReader.ts
//
// THE SECOND READER. Tesseract reads a page one way; Gemini (a vision model) reads it another way and fails differently (Tesseract mixes up
// look-alike digits and loses columns; a vision model reads layout, Hindi, Bengali and symbols well but can invent a digit or stop early).
// Two readers that fail DIFFERENTLY are worth far more than one better reader: where they agree, a value is very probably right; where they
// disagree, it is flagged (readingCheck.ts). This file is only the connection to Gemini, kept behind one small interface.
//
//   PAGE_READER=gemini   (needs GEMINI_API_KEY; GEMINI_VISION_MODEL names the model, default below: model names are retired from time to time)
//   PAGE_READER unset or "none": no second reader
//
// A reading that is cut off (Gemini's finishReason is not STOP) or in which the model began repeating itself ends with STOPPED_MARKER, so that
// it is never mistaken for a complete reading.

/** One failed attempt of a read: which attempt, how long it ran and why it failed. */
export interface AttemptInfo {
  attempt: number;
  ms: number;
  error: string;
}

export interface ReadHooks {
  /** Called after every attempt that failed and will be retried (or was the last): for the log of an upload. */
  onAttempt?: (info: AttemptInfo) => void;
}

export interface PageReader {
  name: string;
  /** Plain words on how the reader is set up (for the upload log), e.g. that page images are shrunk. */
  note?: string;
  /** The text of one page image. Throws if the service fails. */
  read(png: Buffer, hooks?: ReadHooks): Promise<string>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
  }>;

/** The model Google named when it retired the previous one (17 Oct 2026). Model names change: GEMINI_VISION_MODEL in .env.local overrides this. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const PAGE_READER_PROMPT = `You are transcribing ONE page of a scanned official document of a steel plant. The page is in English, Hindi, sometimes Bengali.
Transcribe EVERYTHING you can read, exactly as printed, in reading order. Do not summarise, translate, correct or complete anything.
Rules:
- Copy every number, amount, date, reference and code exactly as printed. NEVER guess a digit. If a character or number is not clearly legible, write [illegible] in its place.
- Tables: write each row on ONE line as "Column heading: value | Column heading: value | ...", using the table's own column headings (for a heading over several columns use the lowest heading; repeat a merged cell's value on every row it covers).
- Hindi and Bengali: transcribe in their own script.
- Handwriting (signatures, handwritten dates): write [handwritten: ...] followed by your best reading and a question mark.
- Stamps, seals and logos: write [stamp] or [logo], and any legible text on them.
- A blank form or table to be filled in (rows with nothing written in them): do NOT write the blank rows out; write [blank form rows] once and go on with the rest of the page.
Output only the transcription.`;

/** Wait before a retry: 1.5 s, then 4 s. */
const BACKOFF_MS = [1500, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What a 429 ("You exceeded your current quota") says: which limit was hit and how long to wait. */
export interface QuotaInfo {
  /** per-day: today's allowance is used up, no wait helps. per-minute: wait and retry. other: no detail given. */
  kind: "per-day" | "per-minute" | "other";
  /** One plain line, without brackets, for logs and for the uploader. */
  summary: string;
  /** How long the service asked to wait before the next request. */
  retryAfterMs?: number;
}

/** Reads the body of a 429 (Google's error JSON: quotaId, quotaValue, retryDelay, or only the message "Please retry in 31.5s"). Never throws. */
export function parseQuotaError(body: string): QuotaInfo {
  const text = String(body ?? "");
  const id = /"quotaId"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "";
  const metric = /"quotaMetric"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "";
  const value = /"quotaValue"\s*:\s*"?(\d+)"?/.exec(text)?.[1];
  const model = /"model"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  const sec = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text)?.[1] ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(text)?.[1];
  const retryAfterMs = sec !== undefined ? Math.ceil(Number(sec) * 1000) : undefined;
  const hay = `${id} ${metric}`;
  const retry = retryAfterMs !== undefined ? `; the service says retry in ${Math.ceil(retryAfterMs / 1000)} s` : "";
  const what = `${value ? `${value} ` : ""}${model ? `for ${model}` : "for the model"}`;
  if (/PerDay|per_day/i.test(hay)) return { kind: "per-day", summary: `daily limit reached - ${what}; it renews daily at midnight Pacific time`, retryAfterMs };
  if (/PerMinute|per_minute/i.test(hay)) return { kind: "per-minute", summary: `per-minute limit reached - ${what}${retry}`, retryAfterMs };
  return { kind: "other", summary: `quota exceeded${retry}`, retryAfterMs };
}

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  /** Attempts per read, the first included (default 3: the first and two retries). */
  maxAttempts?: number;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Test hook: no real waiting between retries. */
  noWait?: boolean;
  /** The longest wait the service may ask for on a per-minute limit (default 30 s); a longer one fails at once. */
  maxRetryWaitMs?: number;
  /** For tests: replaces the real wait and is told how long it was asked to wait. */
  sleepImpl?: (ms: number) => Promise<unknown>;
}

/** The kind of an image from its first bytes (the archive's page images may be PNG, JPEG or WebP); PNG when unsure. */
export function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  return "image/png";
}

export function geminiReader(opts: GeminiOptions = {}): PageReader {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? "";
  const model = opts.model ?? (process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL);
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init as any) as any);
  return {
    name: `gemini:${model}`,
    async read(png: Buffer, hooks?: ReadHooks): Promise<string> {
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
      const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PAGE_READER_PROMPT }, { inline_data: { mime_type: sniffImageMime(png), data: png.toString("base64") } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      let lastErr = "";
      const attempts = Math.max(1, opts.maxAttempts ?? BACKOFF_MS.length + 1);
      for (let attempt = 0; attempt < attempts; attempt++) {
        const startedAt = Date.now();
        let waitMs: number | undefined; // set when a 429 says how long to wait
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 120_000);
        try {
          const res = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body, signal: ctl.signal });
          if (res.ok) {
            const data = await res.json();
            const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
            const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
            if (!text) throw new Error(`Gemini returned no text (${data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "no reason given"})`);
            // a reply that did not end normally (cut off at the length limit, stopped by a safety rule) or in which the model looped is marked
            const finish = data?.candidates?.[0]?.finishReason;
            let out = cutAtLoop(text);
            if (finish && finish !== "STOP" && !out.endsWith(STOPPED_MARKER)) out += "\n" + STOPPED_MARKER;
            return out;
          }
          const raw = await res.text();
          const quota = res.status === 429 ? parseQuotaError(raw) : null;
          const msg = raw.slice(0, res.status === 429 ? 1500 : 300); // a 429 keeps its whole body: the limit and the wait are in it
          lastErr = `Gemini answered ${res.status}${quota ? ` (${quota.summary})` : ""}: ${msg}${res.status === 404 ? ` (the model name "${model}" may be out of date: set GEMINI_VISION_MODEL in .env.local to a current model)` : ""}`;
          if (res.status !== 429 && res.status !== 500 && res.status !== 503) throw new Error(lastErr); // a wrong key or model is not worth retrying
          if (quota?.kind === "per-day") throw new Error(lastErr); // today's allowance is used up: no wait helps
          if (quota?.retryAfterMs !== undefined) {
            if (quota.retryAfterMs > (opts.maxRetryWaitMs ?? 30_000)) throw new Error(lastErr); // too long to wait here
            waitMs = quota.retryAfterMs + 500; // the wait the service asked for, not a guess
          }
        } catch (e) {
          if ((e as Error).message?.startsWith("Gemini")) throw e;
          lastErr = `Gemini request failed: ${(e as Error)?.message ?? e}`;
        } finally {
          clearTimeout(timer);
        }
        hooks?.onAttempt?.({ attempt: attempt + 1, ms: Date.now() - startedAt, error: lastErr });
        if (attempt < attempts - 1 && !opts.noWait) await (opts.sleepImpl ?? sleep)(waitMs ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
      }
      throw new Error(lastErr || "Gemini request failed");
    },
  };
}

/** Written at the end of a reading that did not reach the end of the page: cut off by the service, or the model began repeating the same line. */
export const STOPPED_MARKER = "[reading incomplete: the reply was cut off or the model began repeating itself]";
/** This many identical lines in a row (blank table rows count as identical) mean the model is looping. */
export const LOOP_RUN = 6;
/** A table row with no text in any cell. */
const BLANK_ROW = /^\|(\s*\|)+\s*$/;
function loopKey(line: string): string {
  const t = line.trim();
  return BLANK_ROW.test(t) ? "<blank table row>" : t;
}

/**
 * A reading cut where the model began repeating itself: from the first line of a run of LOOP_RUN identical lines (blank table rows count as
 * identical) the rest is dropped and STOPPED_MARKER is written. A text without such a run is returned unchanged.
 */
export function cutAtLoop(text: string): string {
  let scanned = 0, run = 0, lastKey = "", firstOfRunEnd = 0;
  for (;;) {
    const nl = text.indexOf("\n", scanned);
    if (nl < 0) return text;
    const key = loopKey(text.slice(scanned, nl));
    scanned = nl + 1;
    if (key && key === lastKey) run++;
    else { lastKey = key; run = key ? 1 : 0; firstOfRunEnd = scanned; }
    if (run >= LOOP_RUN) return text.slice(0, firstOfRunEnd).trimEnd() + "\n" + STOPPED_MARKER;
  }
}

/** The reader the settings ask for, or null for none. */
export function readerFromEnv(env: Record<string, string | undefined> = process.env): PageReader | null {
  const which = (env.PAGE_READER ?? "").trim().toLowerCase();
  if (which === "gemini") return geminiReader({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL });
  return null;
}
