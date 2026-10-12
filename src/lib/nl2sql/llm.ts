// src/lib/nl2sql/llm.ts
//
// Standalone model adapter (Groq's OpenAI-compatible endpoint), deliberately
// NOT importing the app's ai-services.ts so the experiment stays isolated and
// can run from a plain command line. Same model default and call shape as the
// app's own working Groq call.

import type { LlmFn } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds Groq asks us to wait: the Retry-After header, else "try again in 12.5s" in the message. */
function retryAfterSeconds(res: Response, bodyText: string): number | null {
  const h = Number(res.headers.get("retry-after"));
  if (Number.isFinite(h) && h > 0) return h;
  const m = bodyText.match(/try again in ([0-9.]+)\s*(ms|s|m)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2].toLowerCase() === "ms" ? v / 1000 : m[2].toLowerCase() === "m" ? v * 60 : v;
}

export interface TokenUsage { prompt: number; completion: number; total: number; cached: number }

/**
 * Groq adapter. Everything below is read at CALL time from the environment, and every lever is OFF unless you set it:
 *   GROQ_MODEL             the main model (default openai/gpt-oss-120b)
 *   GROQ_FALLBACK_MODELS   comma-separated backups used ONLY when the main model is rate-limited for more than ~2 s.
 *                          Each Groq model has its OWN free allowance, so a backup answers at once instead of waiting.
 *                          A backup may write weaker SQL than the main model: measure it with eval/run-live.ts first.
 *   GROQ_REASONING_EFFORT  low | medium | high -- how much a reasoning model "thinks" (less = fewer tokens, faster)
 * Every call prints one line with the tokens it used, so you can see how close the day's allowance is.
 */
export function groqLlm(opts: { maxTokens?: number; maxWaitSeconds?: number; onUsage?: (u: TokenUsage) => void } = {}): LlmFn {
  return async (prompt: string) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not set");
    const primary = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const backups = (process.env.GROQ_FALLBACK_MODELS || "").split(",").map((m) => m.trim()).filter((m) => m && m !== primary);
    const models = [primary, ...backups];
    const effort = (process.env.GROQ_REASONING_EFFORT || "").trim();
    const maxWait = opts.maxWaitSeconds ?? 45;
    const bodyFor = (model: string) =>
      JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        // Large on purpose: reasoning models spend part of this budget thinking
        // before the visible JSON (a too-small budget was the root cause of an
        // earlier "empty output" failure in this app).
        max_tokens: opts.maxTokens ?? 6000,
        response_format: { type: "json_object" },
        ...(effort ? { reasoning_effort: effort } : {}),
      });

    let mi = 0; // index of the model in use
    let waits = 0; // how many times we slept for a per-minute limit
    for (;;) {
      const model = models[mi];
      const started = Date.now();
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: bodyFor(model),
      });
      if (res.ok) {
        const data = await res.json();
        const usage = {
          prompt: Number(data.usage?.prompt_tokens ?? 0),
          completion: Number(data.usage?.completion_tokens ?? 0),
          total: Number(data.usage?.total_tokens ?? 0),
          // Groq reports cached prompt tokens here for models with prompt caching; absent -> 0.
          cached: Number(data.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        };
        const left = res.headers.get("x-ratelimit-remaining-tokens");
        console.info(
          `[nl2sql] ${model}: ${usage.prompt} prompt + ${usage.completion} completion = ${usage.total} tokens` +
            `${usage.cached ? ` (${usage.cached} cached)` : ""}, ${((Date.now() - started) / 1000).toFixed(1)} s` +
            `${left !== null ? `, ${left} tokens left this minute` : ""}${mi > 0 ? " [BACKUP MODEL]" : ""}`,
        );
        if (opts.onUsage && data.usage) opts.onUsage(usage);
        return String(data.choices?.[0]?.message?.content ?? "");
      }
      const text = await res.text();
      if (res.status === 429) {
        const daily = /per day|\bTPD\b|\bRPD\b/i.test(text);
        const wait = retryAfterSeconds(res, text);
        // Another model has its own allowance: use it NOW unless the wait is only a moment.
        if (mi + 1 < models.length && (daily || wait === null || wait > 2)) {
          console.warn(`[nl2sql] ${model} is rate-limited${daily ? " (daily allowance)" : wait !== null ? ` (wait ${wait.toFixed(1)} s)` : ""}: switching to ${models[mi + 1]}`);
          mi++;
          continue;
        }
        if (daily) {
          throw new Error(
            `The AI model's free daily allowance for ${model} is used up, so questions that need the model cannot be answered until it resets. Groq says: ${text.slice(0, 220)}`,
          );
        }
        // 429 = "too many tokens/requests this minute": wait as told and retry.
        // (413 = this single request is bigger than the whole allowance: retrying cannot help.)
        if (waits < 2 && wait !== null && wait <= maxWait) {
          waits++;
          console.warn(`[nl2sql] Groq rate limit (429): waiting ${wait.toFixed(1)} s before retry ${waits} of 2 -- this is why an answer can take long`);
          await sleep(Math.ceil(wait * 1000) + 500);
          continue;
        }
      }
      throw new Error(`Groq API failed (${res.status}) using model "${model}": ${text.slice(0, 300)}`);
    }
  };
}
