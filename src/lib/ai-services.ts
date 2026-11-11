// src/lib/ai-services.ts
//
// ============================================================
// AI MODELS USED IN THIS APP — quick reference
// (kept here since this is the shared AI-services module; update this
// block if any of the below ever changes, so it never goes stale)
// ============================================================
//
// (Updated 7 Nov 2026: Groq is no longer the default anywhere. The one place that talks to Gemini for text is
//  src/lib/ai/geminiChat.ts: timeout, thinking budget, finishReason check, key in a header, safe errors.)
//
// 1. Executive Deep Synthesis (search feature's answer-synthesis step)
//    File: src/lib/search/executiveSynthesis.ts -> geminiGenerate()
//    - Provider: Google Gemini
//    - Model: GEMINI_SYNTHESIS_MODEL (default gemini-3.1-pro-preview), then gemini-pro-latest, gemini-3.8-flash
//    - JSON mode, temperature 0.1, thinking "low" (GEMINI_SYNTHESIS_THINKING to change), 52 s total deadline
//    - Env var: GEMINI_API_KEY
//
// 2. generateChatResponse (this file, below) and the NL2SQL model (src/lib/nl2sql/llm.ts: chatLlm) -- used by the
//    employee/department question engine, the intent classifier and the holiday extraction code
//    - Provider: Gemini when GEMINI_API_KEY exists (LLM_PROVIDER=gemini|groq forces a choice); Groq only when it is
//      the only key present or LLM_PROVIDER=groq
//    - Model: GEMINI_CHAT_MODEL (default gemini-3.8-flash), then gemini-flash-latest; thinking "low"
//    - Groq path (unchanged): openai/gpt-oss-120b (GROQ_MODEL), GROQ_API_KEY
//    - Local-dev fallback: Ollama, model "llama3.1", when AI_ENVIRONMENT is not "cloud"
//
// 3. Embeddings: src/lib/ai/geminiEmbedding.ts (NOT this file)
//    - Provider: Google Gemini, model gemini-embedding-001, 768 dimensions (outputDimensionality)
//    - Stored text (circular chunks, circulars, announcements, holiday policy chunks) = RETRIEVAL_DOCUMENT;
//      only questions = RETRIEVAL_QUERY. (text-embedding-004, named here before, no longer exists for this key.)
//    - Env var: GEMINI_API_KEY

import { chatModels, geminiGenerate, preferGroq } from "@/lib/ai/geminiChat";

/** Kept so an old import still works: the one real implementation is in src/lib/ai/geminiEmbedding.ts (gemini-embedding-001, 768 dimensions). */
export { generateEmbedding } from "@/lib/ai/geminiEmbedding";

export async function generateChatResponse(
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  if (process.env.AI_ENVIRONMENT === "cloud" && !preferGroq()) {
    // Gemini is the default provider (Groq's free tier proved unusable and its paid tier is
    // closed): same JSON-mode contract, hardened adapter (timeout, thinking budget, finishReason).
    const r = await geminiGenerate(prompt, {
      json: !!options?.jsonMode,
      models: chatModels(),
      maxOutputTokens: options?.maxTokens ?? 3000,
      thinking: "low",
      label: "chat",
    });
    return r.text;
  } else if (process.env.AI_ENVIRONMENT === "cloud") {
    // Route to Groq Cloud API. Model + call shape (temperature, JSON mode)
    // match src/lib/search/executiveSynthesis.ts's already-proven-working
    // Groq call exactly -- that file was the source of truth here, not a
    // guess: this function used to hardcode "llama-3.1-8b-instant", which
    // Groq has since retired entirely (404 model_not_found), silently
    // breaking every feature depending on this function. GROQ_MODEL stays
    // overridable via env var in case this default is ever retired too --
    // check https://console.groq.com/docs/models if this starts 404ing
    // again.
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: options?.maxTokens ?? 3000,
    };
    if (options?.jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API failed (${res.status}) using model "${model}": ${errText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  } else {
    // Route to local Ollama instance
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local Chat API failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.message.content;
  }
}
