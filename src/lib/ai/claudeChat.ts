// src/lib/ai/claudeChat.ts
//
// One call to a Claude model (Anthropic Messages API). I kept it in the shape geminiGenerate already speaks: the same request (system, prompt, temperature, token budget, timeout) and the same reply ({ text, model, usage, finishReason }).
// geminiGenerate (src/lib/ai/geminiChat.ts) sends a model whose name starts with "claude" here and any other name to Gemini. So I change a briefing's writer or checker to Claude just by NAMING it (the switches
// PERF.edsDraftModel / PERF.edsVerifyModel in src/lib/perf/switches.js, or GEMINI_SYNTHESIS_MODEL / GEMINI_VERIFY_MODEL in the environment, e.g. claude-haiku-5-5) and nothing else; if it fails, the models after it in the chain are tried.
// The key is ANTHROPIC_API_KEY; I send it in a header, never in the address and never in the log. I do not ask for extended thinking (speed and cost), and the reply's text blocks are joined. Pure fetch: no SDK.
import { GeminiError, type GeminiReply, type GeminiRequest } from "./geminiChat";

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

/** True for a model name that belongs to Anthropic. */
export const isClaudeModel = (m: string): boolean => /^claude[-.]/i.test((m || "").trim());

// Models that answered "400 ... temperature": I do not ask them for one again in this process (some newer models fix it).
const noTemperatureModels = new Set<string>();

/** The JSON-only instruction. Claude has no "answer as JSON" switch here, so I say it in the system prompt (the engine's parsers read the first { to the last }). */
const JSON_ONLY = "\n\nReply with the JSON object only: no words before it, no words after it, no code fence.";

export async function claudeCall(model: string, prompt: string, req: GeminiRequest, timeoutMs: number): Promise<GeminiReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GeminiError("The AI service is not configured (ANTHROPIC_API_KEY missing).", { retryable: true, detail: `${model}: no ANTHROPIC_API_KEY` });
  const started = Date.now();
  const make = (withTemperature: boolean) => JSON.stringify({
    model,
    max_tokens: Math.min(16000, Math.round((req.maxOutputTokens ?? 4096) * 2)), // The caller's budget counts Gemini's tokens and its thinking; Claude's tokenizer counts more, and only the tokens used are paid for
    ...(req.system || req.json ? { system: `${req.system ?? ""}${req.json ? JSON_ONLY : ""}`.trim() } : {}),
    ...(withTemperature && !noTemperatureModels.has(model) ? { temperature: req.temperature ?? 0.1 } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  const post = (body: string) => fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": VERSION },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  let res: Response;
  try {
    res = await post(make(true));
  } catch (e: any) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new GeminiError(timedOut ? "The AI service took too long to answer. Please try again." : "The AI service could not be reached.", { detail: `${model}: ${e?.message || e}`, retryable: true });
  }
  if (res.status === 400) {
    const text = await res.clone().text().catch(() => "");
    if (/temperature/i.test(text) && !noTemperatureModels.has(model)) {
      noTemperatureModels.add(model);
      try { res = await post(make(false)); } catch (e: any) {
        throw new GeminiError("The AI service could not be reached.", { detail: `${model}: ${e?.message || e}`, retryable: true });
      }
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const status = res.status;
    const credit = /credit balance|billing|purchase credits/i.test(text);
    const retryable = status === 429 || status === 404 || status === 408 || status >= 500; // 529 = overloaded
    throw new GeminiError(
      credit
        ? "The AI service has run out of credit. Please tell the C&IT administrator to top up the Anthropic billing."
        : status === 429 || status === 529
          ? "The AI service is busy right now. Please try again in a moment."
          : status === 401 || status === 403
            ? "The AI service refused the request (check the API key and billing)."
            : "The AI service could not process this request.",
      { status, detail: `${model} HTTP ${status}: ${text.slice(0, 400)}`, retryable: retryable && !credit },
    );
  }
  const data: any = await res.json().catch(() => null);
  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text as string)
    .join("")
    .trim();
  const input = Number(data?.usage?.input_tokens ?? 0);
  const cached = Number(data?.usage?.cache_read_input_tokens ?? 0);
  const creation = Number(data?.usage?.cache_creation_input_tokens ?? 0);
  const out = Number(data?.usage?.output_tokens ?? 0);
  const promptTokens = input + cached + creation; // Anthropic reports the parts of the prompt separately.
  const usage = { prompt: promptTokens, completion: out, total: promptTokens + out, cached };
  const stop = String(data?.stop_reason || "");
  if (stop === "max_tokens") throw new GeminiError("The AI answer was cut off. Please try again or narrow the question.", { detail: `${model} stopped at max_tokens (${out} output)`, retryable: false });
  if (!text) throw new GeminiError("The AI service returned no answer.", { detail: `${model} empty text, stop_reason=${stop || "none"}`, retryable: true });
  console.info(`[${req.label || "claude"}] ${model}: ${promptTokens} prompt + ${out} completion = ${promptTokens + out} tokens${cached ? ` (${cached} cached)` : ""}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return { text, model, usage, finishReason: stop };
}
