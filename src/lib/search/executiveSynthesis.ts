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
  chart?: {
    title: string;
    subtitle?: string;
    type: "donut" | "comparison_bars" | "timeline" | "metric_cards";
    entityLabels?: [string, string];
    items: Array<{
      label: string;
      value: number | string;
      secondaryValue?: number | string;
      detail?: string;
    }>;
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

  const systemPrompt = `You are the Senior Executive Intelligence Architect for Durgapur Steel Plant (DSP).
Generate an actionable, high-density executive briefing with an intelligent visual chart selection based on the inquiry and circular records.

OUTPUT FORMAT: Strict JSON object only.

SCHEMA:
{
  "overview": "1-2 direct sentences stating the core operational conclusion or shift.",
  "comparison": {
    "columns": ["Parameter", "Category/Period A", "Category/Period B"],
    "rows": [["...", "...", "..."]]
  },
  "chart": {
    "title": "Short, striking title",
    "subtitle": "Brief context tag",
    "type": "donut | comparison_bars | timeline | metric_cards",
    "entityLabels": ["Entity A", "Entity B"], // only for comparison_bars
    "items": [
      { "label": "...", "value": 123, "secondaryValue": 456, "detail": "..." }
    ]
  },
  "specificDetails": [
    "2-3 high-density bullet points answering specific discrete sub-queries."
  ]
}

INTELLIGENT CHART SELECTION RULES:
1. "donut": Select when analyzing financial breakdowns, allowances, or budget shares (e.g. Basic ₹2,600, HRA ₹1,086, VDA ₹277, FDA ₹18.40). Use purely numeric "value" fields.
2. "comparison_bars": Select when directly comparing quantities or measurable metrics across two categories/dates (e.g. 2023 vs 2024, or Executives vs Contract Workers).
3. "timeline": Select when the inquiry traces progressive milestones, sequential phased rollouts, validity cutoffs, or pass transitions (e.g. 01.01.2023 Face Rec trial -> 01.01.2024 mandatory -> 06.07.2024 biometric enrollment).
4. "metric_cards": Select for high-level KPIs, quotas, and pass numbers (e.g. 200 Workers/day, 2 Awards/month, Gate Pass #13).
5. If the record data is insufficient to populate a chart cleanly, set "chart": null.

ACCURACY & BREVITY RULES:
- Transcribe figures, amounts (₹), dates, circular numbers, and colors verbatim. Never invent rates.
- If comparison values are not in the text, use "Not stated in circular" instead of copying identical numbers across periods.
- Distinguish between daily wage rates and monthly gross totals.
- Output strictly parseable JSON.`;

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
            num_predict: 1000,
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
          max_tokens: 3000,
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

    // 3. Embedded Intelligent Chart Directive
    if (
      data.chart &&
      Array.isArray(data.chart.items) &&
      data.chart.items.length > 0
    ) {
      sections.push(
        `<!--CHART_DATA:${JSON.stringify(data.chart)}:CHART_DATA-->`,
      );
    }

    // 4. Discrete Bullet Items
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
