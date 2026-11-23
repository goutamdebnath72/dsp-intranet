// src/lib/ai/geminiChat.ts
//
// This is the one hardened place for every Gemini text/JSON generation call in the app
// (Executive Deep Synthesis, the NL2SQL model, the intent classifier, the query
// router). It exists because a review found the first inline version had:
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
// My rule for this file: it never throws a message that contains the provider's response body.
// The details go to the server log, and the caller gets a short safe sentence.

import { PERF } from "@/lib/perf/switches";
import { claudeCall, isClaudeModel } from "./claudeChat";
import { withoutPro, modelAllowed } from "./noPro"; // my rule, no Pro models (23 Nov 2026) // models named "claude-..." go to Anthropic // which models write and check an Executive Deep Search briefing
import { traceModelCall } from "../search/frontPathTrace";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiUsage {
  prompt: number;
  /** Answer tokens plus thinking tokens, because thinking is billed as output. */
  completion: number;
  total: number;
  cached: number;
}

export interface GeminiRequest {
  system?: string;
  /** I ask for application/json here (the model then returns bare JSON). */
  json?: boolean;
  /** Answer budget; thinking comes extra on top of this (see thinkingBudgetPad). */
  maxOutputTokens?: number;
  temperature?: number;
  /** A fixed seed makes repeated calls with the same prompt as alike as the provider allows; a model that rejects it is retried without. */
  seed?: number;
  /** I use "low" to keep Pro/Flash fast and to leave the budget for the visible answer. null = provider default. */
  thinking?: ThinkingLevel | null;
  /** Models to try in order (first = main). I remove duplicates. */
  models: string[];
  /** I let one HTTP attempt take at most this long. */
  attemptTimeoutMs?: number;
  /** All attempts together may take at most this long; keep it under the route's maxDuration. */
  totalTimeoutMs?: number;
  /**
   * Hedge: when the first request has not answered after this long, I send the same request a second time and use the first answer to arrive (the other is dropped). A call that hangs (a model that
   *  takes 45 s for what normally takes 12) then costs this long, not its whole timeout. I use it only when it is set; the second request is made only when the first is late, so it costs nothing on a normal call.
   */
  hedgeAfterMs?: number;
  /** Extra label for the server log. */
  label?: string;
  onUsage?: (u: GeminiUsage) => void;
}

export interface GeminiReply {
  text: string;
  model: string;
  usage: GeminiUsage;
  finishReason: string;
}

/** I made this error so that its .message is safe to show to a user; .detail is for the server log only. */
export class GeminiError extends Error {
  status: number | null;
  detail: string;
  /** True when another model might succeed (rate limit, overload, model missing, timeout). */
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

/** Thinking is billed and counted as output, so I leave room for it: the visible answer must never be cut. */
const THINKING_PAD: Record<ThinkingLevel, number> = { minimal: 256, low: 2048, medium: 6144, high: 12288 };

function pickText(parts: any[] | undefined): string {
  // I join every NON-thought text part, because a thought summary part can come first.
  return (parts || [])
    .filter((p) => p && typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("")
    .trim();
}

function usageOf(meta: any): GeminiUsage {
  const prompt = Number(meta?.promptTokenCount ?? 0);
  // candidatesTokenCount excludes thinking, so I add it; otherwise the trace undercounts the cost.
  const completion = Number(meta?.candidatesTokenCount ?? 0) + Number(meta?.thoughtsTokenCount ?? 0);
  return {
    prompt,
    completion,
    total: Number(meta?.totalTokenCount ?? prompt + completion),
    cached: Number(meta?.cachedContentTokenCount ?? 0),
  };
}

// Models that answered "400 ... seed": I do not ask them for a seed again in this process.
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
      // The pad covers thinking tokens when thinking is on, because they count against this limit.
      maxOutputTokens: (req.maxOutputTokens ?? 4096) + (withThinking && level ? pad : 0),
      ...(withThinking && level ? { thinkingConfig: { thinkingLevel: level } } : {}),
    },
  });
}

/**
 * I call Gemini here with a model fallback chain, a per-attempt timeout and a total deadline.
 * My fallback rules: 429 / 5xx / 404 / timeout -> next model. 400 mentioning thinking -> same
 * model once without thinkingConfig. Bad key (401/403) or any other 4xx -> stop at once.
 * A cut-off answer (finishReason MAX_TOKENS) is an error; I never return it as if it were complete.
 */
export async function geminiGenerate(prompt: string, req: GeminiRequest): Promise<GeminiReply> {
  const hedge = req.hedgeAfterMs ?? 0;
  if (!(hedge > 0)) return geminiGenerateOnce(prompt, req);
  const t0 = Date.now();
  const first = geminiGenerateOnce(prompt, req);
  return new Promise<GeminiReply>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = 1;
    let firstError: unknown = null;
    const lose = (e: unknown) => {
      firstError ??= e;
      pending--;
      // A failure before the hedge was due: the chain of models has already been tried, and a non-retryable one (credit, key) would fail again, so I send no second request.
      if (pending === 0 && timer !== null) { clearTimeout(timer); timer = null; }
      if (pending === 0 && timer === null) reject(firstError);
    };
    timer = setTimeout(() => {
      timer = null;
      if (pending === 0) return;
      pending++;
      const label = `${req.label || "gemini"}~hedge`;
      console.warn(`[${label}] no answer after ${((Date.now() - t0) / 1000).toFixed(0)} s: the same request is sent again, the first answer is used`);
      geminiGenerateOnce(prompt, { ...req, hedgeAfterMs: undefined, label, totalTimeoutMs: Math.max(5_000, (req.totalTimeoutMs ?? 55_000) - (Date.now() - t0)) }).then(resolve, lose);
    }, hedge);
    first.then((r) => { if (timer !== null) { clearTimeout(timer); timer = null; } resolve(r); }, lose);
  });
}

async function geminiGenerateOnce(prompt: string, req: GeminiRequest): Promise<GeminiReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !req.models.some(isClaudeModel)) throw new GeminiError("The AI service is not configured (GEMINI_API_KEY missing).", { retryable: false });

  const models = withoutPro(req.models.filter((m, i, a) => m && a.indexOf(m) === i), `geminiGenerate ${req.label || ""}`.trim());
  if (models.length === 0) throw new GeminiError("The AI service has no allowed model for this request (Pro models are refused).", { retryable: false });
  const attemptMs = req.attemptTimeoutMs ?? 40_000;
  const deadline = Date.now() + (req.totalTimeoutMs ?? 55_000);
  const label = req.label || "gemini";
  let last: GeminiError | null = null;

  for (const model of models) {
    // I call a Claude model (name starts with "claude") through src/lib/ai/claudeChat.ts; a failure that another model might survive moves on to the next one in the chain.
    if (isClaudeModel(model)) {
      const remainingC = deadline - Date.now();
      if (remainingC < 1500) throw last ?? new GeminiError("The AI service took too long to answer. Please try again.", { retryable: true });
      const startedC = Date.now();
      try {
        const r = await claudeCall(model, prompt, req, Math.min(attemptMs, remainingC));
        traceModelCall({ model, ...r.usage, ms: Date.now() - startedC });
        if (req.onUsage) req.onUsage(r.usage);
        return r;
      } catch (e: any) {
        if (!(e instanceof GeminiError)) throw e;
        console.warn(`[${label}] ${e.detail || e.message}`);
        if (!e.retryable) throw e;
        last = e;
        continue;
      }
    }
    if (!apiKey) { last ??= new GeminiError("The AI service is not configured (GEMINI_API_KEY missing).", { retryable: false }); continue; } // Only a Gemini model needs the key; a Claude one before it did not.
    for (const withThinking of [true, false]) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        throw last ?? new GeminiError("The AI service took too long to answer. Please try again.", { retryable: true });
      }
      if (!withThinking && (req.thinking === null)) break; // Thinking is already off, so there is nothing different to try.
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
        // This is the one retry I allow on the SAME model, because it rejected the thinking setting.
        if (status === 400 && withThinking && /thinking/i.test(text)) {
          console.warn(`[${label}] ${model} rejected thinkingConfig, retrying without it`);
          continue;
        }
        // This model rejected the seed, so I ask it again, once, without one.
        if (status === 400 && typeof req.seed === "number" && !noSeedModels.has(model) && /seed/i.test(text)) {
          console.warn(`[${label}] ${model} rejected the seed, retrying without it`);
          noSeedModels.add(model);
          return geminiGenerateOnce(prompt, { ...req, totalTimeoutMs: Math.max(1500, deadline - Date.now()) });
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
        if (!retryable) throw last; // A bad key or a bad request fails on every model, so I stop.
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

/** Model chains. Each can be overridden from the environment; geminiGenerate removes the duplicates. */
export function chatModels(): string[] {
  return [process.env.GEMINI_CHAT_MODEL || "gemini-3.8-flash", "gemini-flash-latest"];
}
/** I take the models of the writer of an Executive Deep Search briefing from the environment (GEMINI_SYNTHESIS_MODEL), else the switch PERF.edsDraftModel (src/lib/perf/switches.js; "" = the pro model, the previous way), then the fallbacks. */
export function synthesisModels(): string[] {
  // I ignore an environment value that names a Pro model (no Pro models: src/lib/ai/noPro.ts), so a leftover GEMINI_SYNTHESIS_MODEL=gemini-3.1-pro-preview cannot bring the dear model back.
  const envModel = (process.env.GEMINI_SYNTHESIS_MODEL || "").trim();
  const first = (envModel && modelAllowed(envModel) ? envModel : "") || PERF.edsDraftModel || "gemini-3.8-flash";
  if (envModel && !modelAllowed(envModel)) withoutPro([envModel], "GEMINI_SYNTHESIS_MODEL");
  return [modelAllowed(first) ? first : "gemini-3.8-flash", "gemini-flash-latest"].filter((m, i, a) => a.indexOf(m) === i);
}
/** I take the models of the second reading (the checker) from the environment (GEMINI_VERIFY_MODEL), else the switch PERF.edsVerifyModel ("" = the writer's own chain, the previous way), then the writer's chain as fallbacks. */
export function verifyModels(): string[] {
  const envV = (process.env.GEMINI_VERIFY_MODEL || "").trim();
  const v = (envV && modelAllowed(envV) ? envV : "") || PERF.edsVerifyModel;
  if (envV && !modelAllowed(envV)) withoutPro([envV], "GEMINI_VERIFY_MODEL");
  return v && modelAllowed(v) ? [v, ...synthesisModels()] : synthesisModels();
}

/**
 * This decides which provider the app's chat/JSON calls use (see chatLlm in nl2sql/llm.ts):
 *   LLM_PROVIDER=gemini | groq  explicit choice;
 *   otherwise I use Gemini whenever GEMINI_API_KEY exists, and Groq only when it is the only key present.
 */
export function preferGroq(): boolean {
  const want = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  return want === "groq" || (want !== "gemini" && !process.env.GEMINI_API_KEY && !!process.env.GROQ_API_KEY);
}
