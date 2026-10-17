// src/lib/ingestion/pageReader.ts
//
// THE SECOND READER. Tesseract reads a page one way; a vision model reads it another way and fails differently (Tesseract mixes up
// look-alike digits and loses columns; a vision model reads layout, Hindi, Bengali and symbols well but can invent a digit). Two readers that
// fail DIFFERENTLY are worth far more than one better reader: where they agree, a value is very probably right; where they disagree, it is
// flagged. This file is only the connection to such a reader, kept behind one small interface so that Gemini (an online service, fine while
// the app is in development) can later be replaced by a model running inside SAIL's closed network (Ollama with a Qwen-VL model, say) by
// changing a setting, with no other change.
//
//   PAGE_READER=gemini   (needs GEMINI_API_KEY; GEMINI_VISION_MODEL names the model, default below)
//   PAGE_READER=ollama   (needs PAGE_READER_OLLAMA_MODEL, e.g. qwen2.5vl:7b; the server is PAGE_READER_OLLAMA_URL, else OLLAMA_HOST, else http://localhost:11434.
//                         These are NOT the OLLAMA_MODEL of the embeddings, which is a different kind of model)
//   PAGE_READER unset or "none": no second reader
//
// Nothing in the app calls this yet: the pilot (scripts/ocr-pilot.ts) measures each reader against pages transcribed by hand first.

export interface PageReader {
  name: string;
  /** The text of one page image. Throws if the service fails. */
  read(png: Buffer): Promise<string>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}>;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const PAGE_READER_PROMPT = `You are transcribing ONE page of a scanned official document of a steel plant. The page is in English, Hindi, sometimes Bengali.
Transcribe EVERYTHING you can read, exactly as printed, in reading order. Do not summarise, translate, correct or complete anything.
Rules:
- Copy every number, amount, date, reference and code exactly as printed. NEVER guess a digit. If a character or number is not clearly legible, write [illegible] in its place.
- Tables: write each row on ONE line as "Column heading: value | Column heading: value | ...", using the table's own column headings (for a heading over several columns use the lowest heading; repeat a merged cell's value on every row it covers).
- Hindi and Bengali: transcribe in their own script.
- Handwriting (signatures, handwritten dates): write [handwritten: ...] followed by your best reading and a question mark.
- Stamps, seals and logos: write [stamp] or [logo], and any legible text on them.
Output only the transcription.`;

/** Wait before a retry: 1.5 s, then 4 s. */
const BACKOFF_MS = [1500, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Test hook: no real waiting between retries. */
  noWait?: boolean;
}

export function geminiReader(opts: GeminiOptions = {}): PageReader {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? "";
  const model = opts.model ?? (process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL);
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init as any) as any);
  return {
    name: `gemini:${model}`,
    async read(png: Buffer): Promise<string> {
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
      const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PAGE_READER_PROMPT }, { inline_data: { mime_type: "image/png", data: png.toString("base64") } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      let lastErr = "";
      for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 120_000);
        try {
          const res = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body, signal: ctl.signal });
          if (res.ok) {
            const data = await res.json();
            const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
            const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
            if (!text) throw new Error(`Gemini returned no text (${data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "no reason given"})`);
            return text;
          }
          const msg = (await res.text()).slice(0, 300);
          lastErr = `Gemini answered ${res.status}: ${msg}`;
          if (res.status !== 429 && res.status !== 500 && res.status !== 503) throw new Error(lastErr); // a wrong key or model is not worth retrying
        } catch (e) {
          if ((e as Error).message?.startsWith("Gemini")) throw e;
          lastErr = `Gemini request failed: ${(e as Error)?.message ?? e}`;
        } finally {
          clearTimeout(timer);
        }
        if (attempt < BACKOFF_MS.length && !opts.noWait) await sleep(BACKOFF_MS[attempt]);
      }
      throw new Error(lastErr || "Gemini request failed");
    },
  };
}

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** A model running on SAIL's own machine (Ollama): the same job, no internet. */
export function ollamaReader(opts: OllamaOptions = {}): PageReader {
  const base = (opts.baseUrl ?? process.env.PAGE_READER_OLLAMA_URL ?? process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/+$/, "");
  const model = opts.model ?? process.env.PAGE_READER_OLLAMA_MODEL ?? "";
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init as any) as any);
  return {
    name: `ollama:${model || "(no model set)"}`,
    async read(png: Buffer): Promise<string> {
      if (!model) throw new Error("PAGE_READER_OLLAMA_MODEL is not set");
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 600_000); // a local model without a GPU can take minutes per page
      try {
        const res = await doFetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, stream: false, options: { temperature: 0 }, messages: [{ role: "user", content: PAGE_READER_PROMPT, images: [png.toString("base64")] }] }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const text = String((await res.json())?.message?.content ?? "").trim();
        if (!text) throw new Error("Ollama returned no text");
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The reader the settings ask for, or null for none. */
export function readerFromEnv(env: Record<string, string | undefined> = process.env): PageReader | null {
  const which = (env.PAGE_READER ?? "").trim().toLowerCase();
  if (which === "gemini") return geminiReader({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL });
  if (which === "ollama") return ollamaReader({ baseUrl: env.PAGE_READER_OLLAMA_URL || env.OLLAMA_HOST, model: env.PAGE_READER_OLLAMA_MODEL });
  return null;
}
