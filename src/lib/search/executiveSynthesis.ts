// src/lib/search/executiveSynthesis.ts
import { Agent } from "undici";
import { SearchResultRow } from "./titleSearch";

const ollamaDispatcher = new Agent({
  headersTimeout: 10 * 60 * 1000,
  bodyTimeout: 10 * 60 * 1000,
  connectTimeout: 60 * 1000,
});

export async function executeExecutiveSynthesis(
  q: string,
  records: SearchResultRow[],
): Promise<string> {
  const contextData = records
    .slice(0, 5)
    .map(
      (r, i) =>
        `[Record ${i + 1}] Title: ${r.headline} (Date: ${r.publishedAt || "N/A"})\nContent:\n${r.chunkText?.slice(0, 1200)}`,
    )
    .join("\n\n====================\n\n");

  const systemPrompt = `You are the Executive Intelligence Assistant for Durgapur Steel Plant (DSP). 
Synthesize a formal, executive-grade briefing in professional English directly answering the user's inquiry based ONLY on the provided official circular records.

LANGUAGE & FORMATTING CONSTRAINTS:
- Output strictly and exclusively in English. Translate any Hindi or Bengali circular data into English. Never output Devanagari or Bengali script.
- Group your briefing logically using clear markdown headings (###) and bullet points directly addressing each part of the user query.

GROUND TRUTH & ACCURACY RULES:
- Directly extract and detail specific figures, numbers, dates, and amounts requested. Do NOT give a generic table-of-contents summary.
- Attribute all rules, benefits, and figures strictly to the specific circular where they appear.
- Do NOT combine or confuse policies of different personnel classes (e.g., regular employees vs contract workers).
- Transcribe calendar dates, circular reference numbers, currency values (₹), and percentages verbatim from the records without guessing or modifying digits.
- If a detail requested in the query is NOT present in the provided records, state clearly: "(Note: [Detail] is not explicitly stated in the provided circulars)".

Query: "${q}"

Source Records:
${contextData}`;

  try {
    if (process.env.NODE_ENV === "development") {
      const ollamaRes = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        dispatcher: ollamaDispatcher,
        body: JSON.stringify({
          model: "llama3.1:latest",
          messages: [
            {
              role: "system",
              content:
                "You are an executive intelligence assistant for Durgapur Steel Plant (DSP). You must respond strictly and exclusively in English. Translate any Hindi or Bengali text into English. Copy numerical amounts (₹), dates, and percentages verbatim from the records without inventing or altering numbers.",
            },
            {
              role: "user",
              content: `${systemPrompt}\n\nIMPORTANT: Write your complete briefing in English only.`,
            },
          ],
          stream: false,
          options: {
            temperature: 0.0,
            top_p: 0.1,
            num_ctx: 3072,
          },
        }),
      } as any);

      if (ollamaRes.ok) {
        const ollamaData = await ollamaRes.json();
        return ollamaData.message?.content || "";
      }
      const errText = await ollamaRes.text();
      console.error(`Ollama error (${ollamaRes.status}):`, errText);
      return "Executive synthesis unavailable via local Ollama.";
    }

    // PRODUCTION (Vercel): Groq (Llama 3.1 8B Instant)
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "You are an executive intelligence assistant for DSP. Respond strictly in English.",
            },
            { role: "user", content: systemPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
      },
    );

    if (groqRes.ok) {
      const groqData = await groqRes.json();
      return groqData.choices[0]?.message?.content || "";
    }
    return "Cloud executive synthesis could not be completed at this time.";
  } catch (synthErr) {
    console.error("Executive synthesis connection error:", synthErr);
    return "Executive synthesis encountered a connection issue. Direct circular matches are shown below.";
  }
}
