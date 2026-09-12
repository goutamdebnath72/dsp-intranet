// src/lib/ai-services.ts

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

export async function generateChatResponse(prompt: string): Promise<string> {
  if (process.env.AI_ENVIRONMENT === "cloud") {
    // Route to Groq Cloud API for Llama 3.1 8B
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API failed (${res.status}): ${errText}`);
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
