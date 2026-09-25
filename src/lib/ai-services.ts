// src/lib/ai-services.ts
//
// ============================================================
// AI MODELS USED IN THIS APP — quick reference
// (kept here since this is the shared AI-services module; update this
// block if any of the below ever changes, so it never goes stale)
// ============================================================
//
// 1. Executive Deep Synthesis (search feature's answer-synthesis step)
//    File: src/lib/search/executiveSynthesis.ts (its OWN independent fetch
//    call -- does NOT go through generateChatResponse below)
//    - Provider: Groq
//    - Model: openai/gpt-oss-120b
//    - Endpoint: https://api.groq.com/openai/v1/chat/completions
//    - response_format: { type: "json_object" }
//    - temperature: 0.1
//    - max_tokens: 3000
//    - Local-dev fallback: Ollama, model "llama3.1:latest", used when
//      AI_ENVIRONMENT=local AND NODE_ENV=development
//    - Env var: GROQ_API_KEY
//
// 2. generateChatResponse (this file, below) -- used by the holiday
//    circular extraction pipeline (src/lib/holidays/extraction.ts)
//    - Provider: Groq, same endpoint as above
//    - Model: openai/gpt-oss-120b by default -- matches #1 above exactly,
//      since that was the proven-working reference this was fixed against
//      (see the "used to be hardcoded to llama-3.1-8b-instant" note below)
//    - Overridable via GROQ_MODEL env var if this default is ever retired
//      by Groq too -- check https://console.groq.com/docs/models
//    - temperature: 0.1 (fixed, matches #1)
//    - max_tokens / response_format: caller-supplied via the optional
//      `options` parameter (jsonMode, maxTokens) -- no fixed default
//      values baked in beyond the ones passed at each call site
//    - Local-dev fallback: Ollama, model "llama3.1" (note: no ":latest"
//      suffix here, unlike #1 -- pre-existing, not something this note
//      is asserting is correct or intentionally different)
//    - Env var: GROQ_API_KEY (same variable as #1)
//
// 3. generateEmbedding (this file, below) -- used across the circular
//    search pipeline (chunk embeddings, whole-document embeddings) and
//    the holiday-name matching cache
//    - Provider: Google Gemini
//    - Model: text-embedding-004
//    - Env var: GEMINI_API_KEY
//    - Local-dev fallback: Ollama, model "all-minilm", used when
//      AI_ENVIRONMENT is not "cloud" and no GEMINI_API_KEY is set

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (process.env.AI_ENVIRONMENT === "cloud" || apiKey) {
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not defined in environment variables.",
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: {
          parts: [{ text }],
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Gemini Embedding API failed (${res.status}): ${errText}`,
      );
    }

    const data = await res.json();
    return data.embedding.values;
  } else {
    // Local fallback route to Ollama instance
    const res = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "all-minilm", prompt: text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local Embedding failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.embedding;
  }
}

export async function generateChatResponse(
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  if (process.env.AI_ENVIRONMENT === "cloud") {
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
