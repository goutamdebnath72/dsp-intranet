// src/lib/ai/geminiChat.ts
//
// ONE hardened place for every Gemini text/JSON generation call in the app
// (Executive Deep Synthesis, the NL2SQL model, the intent classifier, the query
// router). Written after a review found the first inline version had:
//   * no timeout (the route's maxDuration is 60 s: Vercel killed the request),
//   * no control of "thinking" (on Gemini 3 thinking tokens are counted against
//     maxOutputTokens: measured, Pro with a 256 cap answered "{" and stopped with
//     finishReason MAX_TOKENS),
//   * finishReason never read (a cut-off JSON looked like a normal answer),
//   * only parts[0] read (a thought part can come first),
//   * the API key in the URL (it ends up in logs) and the raw error body sent to
//     the browser,
//   * every failure (even a bad key or a bad request) re-sent the whole prompt to
//     the next model.
//
// This file never throws a message that contains the provider's response body:
// the details go to the server log, the caller gets a short safe sentence.

import { traceModelCall } from "../search/frontPathTrace";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiUsage {
  prompt: number;
  /** answer tokens PLUS thinking tokens (thinking is billed as output) */
  completion: number;
  total: number;
  cached: number;
}

export interface GeminiRequest {
  system?: string;
  /** ask for application/json (the model then returns bare JSON) */
  json?: boolean;
  /** answer budget; thinking is extra on top of this (see thinkingBudgetPad) */
  maxOutputTokens?: number;
  temperature?: number;
  /** a fixed seed makes repeated calls with the same prompt as alike as the provider allows (a model that rejects it is retried without) */
  seed?: number;
  /** "low" keeps Pro/Flash fast and leaves the budget for the visible answer. null = provider default. */
  thinking?: ThinkingLevel | null;
  /** models to try in order (first = main). Duplicates are removed. */
  models: string[];
  /** one HTTP attempt may take at most this long */
  attemptTimeoutMs?: number;
  /** all attempts together may take at most this long (keep under the route's maxDuration) */
  totalTimeoutMs?: number;
  /** extra label for the server log */
  label?: string;
  onUsage?: (u: GeminiUsage) => void;
}

export interface GeminiReply {
  text: string;
  model: string;
  usage: GeminiUsage;
  finishReason: string;
}

/** An error whose .message is safe to show to a user; .detail is for the server log only. */
export class GeminiError extends Error {
  status: number | null;
  detail: string;
  /** true when another model might succeed (rate limit, overload, model missing, timeout) */
  retryable: boolean;
  constructor(message: string, opts: { status?: number | null; detail?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = opts.status ?? null;
    this.detail = opts.detail ?? "";
    this.retryable = opts.retryable ?? false;
  }
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Thinking is billed and counted as output: leave room for it so the visible answer is never cut. */
const THINKING_PAD: Record<ThinkingLevel, number> = { minimal: 256, low: 2048, medium: 6144, high: 12288 };

function pickText(parts: any[] | undefined): string {
  // Join every NON-thought text part (a thought summary part can come first).
  return (parts || [])
    .filter((p) => p && typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("")
    .trim();
}

function usageOf(meta: any): GeminiUsage {
  const prompt = Number(meta?.promptTokenCount ?? 0);
  // candidatesTokenCount EXCLUDES thinking: add it, or the trace undercounts the cost.
  const completion = Number(meta?.candidatesTokenCount ?? 0) + Number(meta?.thoughtsTokenCount ?? 0);
  return {
    prompt,
    completion,
    total: Number(meta?.totalTokenCount ?? prompt + completion),
    cached: Number(meta?.cachedContentTokenCount ?? 0),
  };
}

// Models that answered "400 ... seed": not asked for a seed again in this process.
const noSeedModels = new Set<string>();

function bodyFor(prompt: string, req: GeminiRequest, withThinking: boolean, model: string): string {
  const level = req.thinking === undefined ? "low" : req.thinking;
  const pad = withThinking && level ? THINKING_PAD[level] : 0;
  return JSON.stringify({
    ...(req.system ? { system_instruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      temperature: req.temperature ?? 0.1,
      ...(typeof req.seed === "number" && !noSeedModels.has(model) ? { seed: req.seed } : {}),
      // pad covers thinking tokens when thinking is on (they count against this limit)
      maxOutputTokens: (req.maxOutputTokens ?? 4096) + (withThinking && level ? pad : 0),
      ...(withThinking && level ? { thinkingConfig: { thinkingLevel: level } } : {}),
    },
  });
}

/**
 * Call Gemini with a model fallback chain, a per-attempt timeout and a total deadline.
 * Fallback rules: 429 / 5xx / 404 / timeout -> next model. 400 mentioning thinking -> same
 * model once without thinkingConfig. Bad key (401/403) or any other 4xx -> stop at once.
 * A cut-off answer (finishReason MAX_TOKENS) is an error, never returned as if complete.
 */
export async function geminiGenerate(prompt: string, req: GeminiRequest): Promise<GeminiReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("The AI service is not configured (GEMINI_API_KEY missing).", { retryable: false });

  const models = req.models.filter((m, i, a) => m && a.indexOf(m) === i);
  const attemptMs = req.attemptTimeoutMs ?? 40_000;
  const deadline = Date.now() + (req.totalTimeoutMs ?? 55_000);
  const label = req.label || "gemini";
  let last: GeminiError | null = null;

  for (const model of models) {
    for (const withThinking of [true, false]) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        throw last ?? new GeminiError("The AI service took too long to answer. Please try again.", { retryable: true });
      }
      if (!withThinking && (req.thinking === null)) break; // thinking was already off: nothing different to try
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: bodyFor(prompt, req, withThinking, model),
          signal: AbortSignal.timeout(Math.min(attemptMs, remaining)),
        });
      } catch (e: any) {
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        last = new GeminiError(
          timedOut ? "The AI service took too long to answer. Please try again." : "The AI service could not be reached.",
          { detail: `${model}: ${e?.message || e}`, retryable: true },
        );
        console.warn(`[${label}] ${model} ${timedOut ? "timed out" : "network error"}: ${last.detail}`);
        break; // next model
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const status = res.status;
        // The one retry on the SAME model: this model rejected the thinking setting.
        if (status === 400 && withThinking && /thinking/i.test(text)) {
          console.warn(`[${label}] ${model} rejected thinkingConfig, retrying without it`);
          continue;
        }
        // This model rejected the seed: ask it again, once, without one.
        if (status === 400 && typeof req.seed === "number" && !noSeedModels.has(model) && /seed/i.test(text)) {
          console.warn(`[${label}] ${model} rejected the seed, retrying without it`);
          noSeedModels.add(model);
          return geminiGenerate(prompt, { ...req, totalTimeoutMs: Math.max(1500, deadline - Date.now()) });
        }
        const retryable = status === 429 || status === 404 || status >= 500;
        last = new GeminiError(
          status === 429
            ? "The AI service is busy right now. Please try again in a moment."
            : status === 402 || /prepayment|credits are depleted|billing/i.test(text)
              ? "The AI service has run out of credit. Please tell the C&IT administrator to top up the Gemini billing."
              : status === 401 || status === 403 || /API_KEY_INVALID/.test(text)
              ? "The AI service refused the request (check the API key and billing)."
              : "The AI service could not process this request.",
          { status, detail: `${model} HTTP ${status}: ${text.slice(0, 400)}`, retryable },
        );
        console.warn(`[${label}] ${last.detail}`);
        if (!retryable) throw last; // a bad key / bad request will fail on every model: stop
        break; // next model
      }

      const data: any = await res.json().catch(() => null);
      const cand = data?.candidates?.[0];
      const usage = usageOf(data?.usageMetadata);
      traceModelCall({ model, ...usage, ms: Date.now() - started }); // front-path trace (passive)
      if (req.onUsage) req.onUsage(usage);
      const finishReason = String(cand?.finishReason || "");
      const text = pickText(cand?.content?.parts);

      if (finishReason === "MAX_TOKENS") {
        last = new GeminiError("The AI answer was cut off. Please try again or narrow the question.", {
          detail: `${model} stopped at MAX_TOKENS (${usage.completion} output incl. thinking)`,
          retryable: false,
        });
        console.warn(`[${label}] ${last.detail}`);
        throw last;
      }
      if (!text) {
        last = new GeminiError("The AI service returned no answer.", {
          detail: `${model} empty text, finishReason=${finishReason || "none"}${data?.promptFeedback?.blockReason ? `, blocked=${data.promptFeedback.blockReason}` : ""}`,
          retryable: true,
        });
        console.warn(`[${label}] ${last.detail}`);
        break; // next model
      }
      console.info(
        `[${label}] ${model}: ${usage.prompt} prompt + ${usage.completion} completion = ${usage.total} tokens` +
          `${usage.cached ? ` (${usage.cached} cached)` : ""}, ${((Date.now() - started) / 1000).toFixed(1)} s`,
      );
      return { text, model, usage, finishReason };
    }
  }
  throw last ?? new GeminiError("The AI service is unavailable.", { retryable: true });
}

/** Model chains. Each is overridable from the environment; duplicates are removed by geminiGenerate. */
export function chatModels(): string[] {
  return [process.env.GEMINI_CHAT_MODEL || "gemini-3.8-flash", "gemini-flash-latest"];
}
export function synthesisModels(): string[] {
  return [process.env.GEMINI_SYNTHESIS_MODEL || "gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash"];
}

/**
 * Which provider the app's chat/JSON calls use (see chatLlm in nl2sql/llm.ts):
 *   LLM_PROVIDER=gemini | groq  explicit choice;
 *   otherwise Gemini whenever GEMINI_API_KEY exists; Groq only when it is the only key present.
 */
export function preferGroq(): boolean {
  const want = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  return want === "groq" || (want !== "gemini" && !process.env.GEMINI_API_KEY && !!process.env.GROQ_API_KEY);
}
