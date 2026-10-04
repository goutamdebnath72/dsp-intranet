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

export function groqLlm(opts: { maxTokens?: number; maxWaitSeconds?: number; onUsage?: (u: TokenUsage) => void } = {}): LlmFn {
  return async (prompt: string) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not set");
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const maxWait = opts.maxWaitSeconds ?? 45;
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      // Large on purpose: reasoning models spend part of this budget thinking
      // before the visible JSON (a too-small budget was the root cause of an
      // earlier "empty output" failure in this app).
      max_tokens: opts.maxTokens ?? 6000,
      response_format: { type: "json_object" },
    });

    for (let attempt = 0; ; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
      });
      if (res.ok) {
        const data = await res.json();
        if (opts.onUsage && data.usage) {
          opts.onUsage({
            prompt: Number(data.usage.prompt_tokens ?? 0),
            completion: Number(data.usage.completion_tokens ?? 0),
            total: Number(data.usage.total_tokens ?? 0),
            // Groq reports cached prompt tokens here for models with prompt caching; absent -> 0.
            cached: Number(data.usage.prompt_tokens_details?.cached_tokens ?? 0),
          });
        }
        return String(data.choices?.[0]?.message?.content ?? "");
      }
      const text = await res.text();
      // 429 = "too many tokens/requests this minute": wait as told and retry.
      // (413 = this single request is bigger than the whole allowance: retrying cannot help.)
      if (res.status === 429 && attempt < 2) {
        const wait = retryAfterSeconds(res, text);
        if (wait !== null && wait <= maxWait) {
          await sleep(Math.ceil(wait * 1000) + 500);
          continue;
        }
      }
      throw new Error(`Groq API failed (${res.status}) using model "${model}": ${text.slice(0, 300)}`);
    }
  };
}
