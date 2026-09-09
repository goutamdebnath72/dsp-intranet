// src/lib/search/executiveSynthesis.ts
import { Agent } from "undici";
import { SearchResultRow } from "./titleSearch";

const ollamaDispatcher = new Agent({
  headersTimeout: 10 * 60 * 1000,
  bodyTimeout: 10 * 60 * 1000,
  connectTimeout: 60 * 1000,
});

interface SynthesisSchema {
  overview?: string;
  comparison?: {
    columns: [string, string, string];
    rows: Array<[string, string, string]>;
  };
  specificDetails?: string[];
}

export async function executeExecutiveSynthesis(
  q: string,
  records: SearchResultRow[],
): Promise<string> {
  const contextData = records
    .slice(0, 5)
    .map(
      (r, i) =>
        `[Circular ${i + 1}] Title: ${r.headline} (Date: ${r.publishedAt || "N/A"})\nContent:\n${r.chunkText?.slice(0, 1600) || r.chunkText || ""}`,
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are the Executive Intelligence Assistant for Durgapur Steel Plant (DSP).
Analyze the official circular records and synthesize a concise, high-impact executive briefing.
You must respond with a JSON object matching this schema:
{
  "overview": "1-2 sentences summarizing the core policy evolution or direct answer.",
  "comparison": {
    "columns": ["Parameter", "Category/Period A", "Category/Period B"],
    "rows": [
      ["Parameter Name", "Value A", "Value B"]
    ]
  },
  "specificDetails": [
    "Dedicated bullet points answering specific discrete sub-queries."
  ]
}

CRITICAL RULES:
- ACCURACY OVER INVENTION: Transcribe currency amounts (₹), percentages, and dates verbatim from the records. Never invent or hallucinate rates.
- NO ARTIFICIAL MIRRORING: If prior-period comparative figures (e.g. 2024 vs 2025) are not explicitly in the circular, state "Not stated in circular" or "Revised rate" rather than copying identical figures across columns.
- FINANCIAL UNITS: Distinguish clearly between daily wage rates and monthly gross totals (e.g., ₹22,047.40 is a monthly gross, not a daily rate).
- CONCISENESS & TO-THE-POINTNESS: Keep "specificDetails" strictly to 2 or 3 high-density bullets. Consolidate related clauses (such as combining award criteria and department quotas into a single bullet). Do not repeat items already captured in the table.
- Bold key dates, circular reference numbers, pass numbers, and amounts using markdown (**01.01.2024**, **₹22,047.40/month**).
- Output valid JSON only.`;

  const userPrompt = `Inquiry: "${q}"

Official Circular Records:
${contextData}

JSON Output:`;

  try {
    const useLocalOllama =
      process.env.AI_ENVIRONMENT === "local" &&
      process.env.NODE_ENV === "development";

    if (useLocalOllama) {
      const ollamaRes = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        dispatcher: ollamaDispatcher,
        body: JSON.stringify({
          model: "llama3.1:latest",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          format: "json",
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 800,
          },
        }),
      } as any);

      if (ollamaRes.ok) {
        const ollamaData = await ollamaRes.json();
        return renderMarkdown(ollamaData.message?.content || "");
      }
      const errText = await ollamaRes.text();
      return `Local Ollama error: ${errText}`;
    }

    if (!process.env.GROQ_API_KEY) {
      return "Executive synthesis unavailable: Missing GROQ_API_KEY configuration.";
    }

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 2500,
        }),
      },
    );

    if (groqRes.ok) {
      const groqData = await groqRes.json();
      const choice = groqData.choices?.[0];
      const rawPayload = (choice?.message?.content || "").trim();

      return renderMarkdown(rawPayload);
    } else {
      const errorPayload = await groqRes.text();
      return `Executive synthesis error (${groqRes.status}): ${errorPayload}`;
    }
  } catch (synthErr: any) {
    return `Executive synthesis network error: ${synthErr?.message || String(synthErr)}`;
  }
}

function renderMarkdown(rawJson: string): string {
  if (!rawJson)
    return "No synthesis could be derived from the selected circulars.";

  try {
    const cleaned = rawJson
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return rawJson;

    const data: SynthesisSchema = JSON.parse(jsonMatch[0]);
    const sections: string[] = [];

    // 1. Overview Paragraph
    if (data.overview) {
      sections.push(data.overview.trim());
    }

    // 2. Guaranteed GFM Comparison Table
    if (
      data.comparison &&
      Array.isArray(data.comparison.columns) &&
      Array.isArray(data.comparison.rows) &&
      data.comparison.rows.length > 0
    ) {
      const [c1, c2, c3] = data.comparison.columns;
      const tableLines = [
        `| ${c1} | ${c2} | ${c3} |`,
        `| :--- | :--- | :--- |`,
      ];

      for (const row of data.comparison.rows) {
        if (Array.isArray(row) && row.length >= 3) {
          tableLines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
        }
      }

      sections.push(tableLines.join("\n"));
    }

    // 3. Discrete Bullet Items
    if (
      Array.isArray(data.specificDetails) &&
      data.specificDetails.length > 0
    ) {
      const bullets = data.specificDetails
        .filter(Boolean)
        .map((b) => `* ${b.replace(/^\*\s*/, "").trim()}`);

      if (bullets.length > 0) {
        sections.push(bullets.join("\n\n"));
      }
    }

    return sections.join("\n\n");
  } catch {
    return rawJson.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }
}
