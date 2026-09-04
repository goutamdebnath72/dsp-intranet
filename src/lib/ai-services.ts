// src/lib/ai-services.ts

export async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.AI_ENVIRONMENT === "cloud") {
    // Route to Nomic Cloud API
    const res = await fetch("https://api-atlas.nomic.ai/v1/embedding/text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOMIC_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-embed-text-v1.5",
        texts: [text],
        task_type: "search_query",
      }),
    });
    const data = await res.json();
    return data.embeddings[0];
  } else {
    // Route to local Ollama instance on your Mac
    const res = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
    });
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
    const data = await res.json();
    return data.choices[0].message.content;
  } else {
    // Route to local Ollama instance for Llama 3.1
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });
    const data = await res.json();
    return data.message.content;
  }
}
