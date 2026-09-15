// src/lib/search/executiveSynthesis.ts
import { Agent } from "undici";
import { SearchResultRow } from "./titleSearch";

const ollamaDispatcher = new Agent({
  headersTimeout: 10 * 60 * 1000,
  bodyTimeout: 10 * 60 * 1000,
  connectTimeout: 60 * 1000,
});

/* ------------------------------------------------------------------ *
 * TYPED SYNTHESIS CONTRACT
 * The frontend consumes this object directly — no markdown string, no
 * embedded HTML-comment chart directive. Every claim-bearing element
 * carries a `sources[]` array of circular ids so the UI can render
 * citation chips that open the existing CircularViewerLightbox.
 *
 * The LLM NEVER names a chart type. It emits typed datasets tagged with
 * an `intent`; the chart type is chosen deterministically here.
 * ------------------------------------------------------------------ */

export type ChartType =
  | "pie" // parts of one whole
  | "bar" // same measure across 2+ entities/periods (grouped columns)
  | "line" // ordered numeric value over time (trend)
  | "timeline" // ordered milestones / phased rollouts
  | "scatter" // correlation between two numeric axes
  | "kpi"; // standalone headline numbers (metric cards)

export interface SynthesisChartItem {
  label: string;
  value: number;
  secondaryValue?: number; // second series (bar) OR y-axis (scatter)
  detail?: string;
}

export interface SynthesisChart {
  type: ChartType;
  title: string;
  subtitle?: string;
  entityLabels?: [string, string]; // bar (series names) / scatter (axis names)
  unit?: string; // e.g. "₹", "days", "%"
  items: SynthesisChartItem[];
}

export interface SynthesisFinding {
  text: string;
  sources: number[]; // circular ids backing this finding
}

export interface SynthesisTable {
  columns: string[]; // 2 or 3 columns
  rows: string[][];
}

export interface SynthesisCitation {
  id: number;
  headline: string;
  publishedAt: string | null;
}

export interface SynthesisResult {
  overview: string;
  headline?: string; // short striking title for the briefing
  keyFindings: SynthesisFinding[];
  table?: SynthesisTable | null;
  charts: SynthesisChart[];
  citations: SynthesisCitation[];
  error?: string;
}

/* ------------------------------------------------------------------ *
 * What the LLM returns — a data-only payload.
 * ------------------------------------------------------------------ */

type RawIntent =
  | "breakdown"
  | "comparison"
  | "trend"
  | "timeline"
  | "correlation"
  | "kpi";

interface RawFinding {
  text?: string;
  sources?: number[];
}

interface RawDataset {
  intent?: RawIntent;
  title?: string;
  subtitle?: string;
  entityLabels?: [string, string];
  unit?: string;
  items?: Array<{
    label?: string;
    value?: number | string;
    secondaryValue?: number | string;
    detail?: string;
  }>;
}

interface RawPayload {
  headline?: string;
  overview?: string;
  keyFindings?: RawFinding[];
  table?: { columns?: string[]; rows?: string[][] } | null;
  datasets?: RawDataset[];
}

function emptyResult(msg: string): SynthesisResult {
  return {
    overview: msg,
    keyFindings: [],
    table: null,
    charts: [],
    citations: [],
  };
}

// Per-circular context budget for the synthesis prompt. The route now supplies
// the FULL circular text, which can be long; we keep the most information-dense
// portion within budget. When over budget, numeric lines (rate tables, ₹
// amounts, dates, codes) are prioritised over plain prose so figures the
// executive asked about are never truncated away.
const SYNTH_CONTEXT_BUDGET = 3500;

function condenseForSynthesis(text: string): string {
  const t = (text || "").trim();
  if (t.length <= SYNTH_CONTEXT_BUDGET) return t;

  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const numeric: string[] = [];
  const prose: string[] = [];
  for (const l of lines) {
    // "numeric-dense" = contains ₹/Rs, a decimal, a 3+ digit run, a date, or a
    // code — the stuff a figures question needs.
    if (
      /[₹]|\bRs\.?\b/i.test(l) ||
      /\d+\.\d+/.test(l) ||
      /\d{3,}/.test(l) ||
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(l) ||
      /[A-Za-z]+[-/][A-Za-z0-9]+/.test(l)
    ) {
      numeric.push(l);
    } else {
      prose.push(l);
    }
  }

  // Lead with the opening prose (context/headline area), then pack numeric
  // lines, then any remaining prose — all clamped to budget.
  const ordered = [...prose.slice(0, 6), ...numeric, ...prose.slice(6)];
  let out = "";
  for (const l of ordered) {
    if (out.length + l.length + 1 > SYNTH_CONTEXT_BUDGET) break;
    out += (out ? "\n" : "") + l;
  }
  return out || t.slice(0, SYNTH_CONTEXT_BUDGET);
}

export async function executeExecutiveSynthesis(
  q: string,
  records: SearchResultRow[],
): Promise<SynthesisResult> {
  const sources = records.slice(0, 5);

  const citations: SynthesisCitation[] = sources.map((r) => ({
    id: r.id,
    headline: r.headline,
    publishedAt: r.publishedAt ?? null,
  }));

  const validIds = new Set(sources.map((r) => r.id));

  const contextData = sources
    .map(
      (r) =>
        `[Circular id=${r.id}] Title: ${r.headline} (Date: ${
          r.publishedAt || "N/A"
        })\nContent:\n${condenseForSynthesis(r.chunkText || "")}`,
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are the Senior Executive Intelligence Architect for Durgapur Steel Plant (DSP).
Produce a TERSE, high-signal executive briefing that answers the inquiry directly from the circular records. Every sentence must earn its place — no filler, no restating the question, no generic corporate prose.

Return a STRICT JSON object (data only — you do NOT choose any chart type; you tag each dataset with an INTENT and we render the right chart):
{
  "headline": "<=8 word striking title for the briefing",
  "overview": "2-3 sentences MAX. The direct conclusion the executive needs. Bold key figures/dates with **markdown**.",
  "keyFindings": [
    { "text": "one tight, specific finding (a figure, rule, cutoff, or contrast)", "sources": [<circular id>] }
  ],
  "table": {
    "columns": ["Parameter", "Entity/Period A", "Entity/Period B"],
    "rows": [["...","...","..."]]
  },
  "datasets": [
    {
      "intent": "breakdown | comparison | trend | timeline | correlation | kpi",
      "title": "Short chart title",
      "subtitle": "brief context (optional)",
      "unit": "\u20b9 | days | % | count (optional)",
      "entityLabels": ["A","B"],
      "items": [
        { "label":"...", "value": <number>, "secondaryValue": <number optional>, "detail":"..." }
      ]
    }
  ]
}

DATASET INTENT RULES — choose the intent that matches the DATA you actually have. Emit a dataset ONLY when the records contain the real numbers to fill it; omit it otherwise. Multiple datasets are encouraged when several distinct visuals genuinely help.
- "breakdown": parts of ONE whole — allowance/budget shares (Basic, HRA, VDA...). Same unit. value = each part. -> pie
- "comparison": the SAME measure across two entities/periods (Executives vs Contract Workers; 2023 vs 2024). Provide entityLabels; value = A, secondaryValue = B for each label. -> grouped columns
- "trend": ONE numeric measure moving over ordered time points (wage 2022->2025; premium year on year). label = period, value = number. Needs >=3 points. -> line
- "timeline": ordered MILESTONES / phased rollouts / validity cutoffs where the point is the sequence, not a magnitude. label = date/phase, detail = what happened. -> timeline rail
- "correlation": two numeric axes to show relationship (e.g. course duration vs bond amount). value = x, secondaryValue = y, entityLabels = [xAxisName, yAxisName]. -> scatter
- "kpi": standalone headline numbers — quotas, pass numbers, daily counts (200 workers/day, Gate Pass #13, 2 awards/month). value = number, detail = unit/context. -> metric cards

HARD ACCURACY RULES:
- Transcribe figures, \u20b9 amounts, dates, circular numbers VERBATIM from the records. NEVER invent or interpolate a number.
- CADENCE DISCIPLINE: Do NOT label an amount "per day / daily", "per month / monthly", or "per annum" unless the circular explicitly says so for THAT amount. If the cadence is not stated, call it simply "wage" or "total" without a time unit. Never assume daily.
- HEADLINE THE TOTAL, NOT A COMPONENT: When a wage is broken into components (Basic, VDA, allowances...) with a stated or sum total, the headline figure is the TOTAL — never a single component. Do NOT call "Basic" (or any one line) "the wage". State the total, then list components.
- MAGNITUDE SANITY: If a figure's magnitude is implausible for the cadence the query implies (e.g. a "daily" wage in the tens of thousands), do NOT assert that cadence. Report the figure as a total without inventing a time unit; flag it "as printed" if it looks like an OCR artifact. Do not swing to the opposite error of quoting a small component as the whole.
- RECONCILE TOTALS: If the circular lists components (Basic, VDA, HRA, ...) AND a stated total, and the components sum to a different number, report the components and the ARITHMETIC SUM; flag the stated total as "as printed" rather than asserting it. Never present a total that contradicts its own components without noting the mismatch.
- COLUMN FIDELITY: Only report an area / entity / period column (Works, Town, Projects, Executives, a year, ...) whose NAME appears VERBATIM in the records. Never rename one column to another (e.g. do not relabel "Town" as "Projects") and never introduce a column the text does not name. If you cannot tell which area a number belongs to, omit that number rather than guessing its column.
- NO DERIVED COLUMNS OR VALUES: Every number you output must be READ from the text. Never compute one column from another (e.g. copying Works and zeroing one allowance to fabricate a second area), never subtract/add across columns to fill a cell, never synthesize a second entity by modifying the first. A derived number is a fabricated number — forbidden.
- FIGURES MUST EXIST IN THE TEXT: Only build a table row, a chart item, or a numeric finding from a number that literally appears in the provided circular text. If the records contain only narrative prose and NOT the actual figures the inquiry asks for (e.g. the rate table was not captured), do NOT manufacture numbers, a components table, or a chart. Instead: give a short overview of what the prose DOES say, and state plainly in one finding that the specific figures are not present in the retrieved text. An honest "the rate table is not in the retrieved circular text" is REQUIRED over an invented table.
- If a comparison value is genuinely absent, put "Not stated in circular" in the TABLE cell — do NOT copy a number across periods, and do NOT fabricate a dataset item for it.
- Every keyFinding.sources id MUST be one of the provided [Circular id=...] values. Cite the circular the fact actually came from.
- 2 or 3 table columns only. Keep the table to the rows that matter.
- Output strictly parseable JSON. No prose outside the JSON.`;

  const userPrompt = `Inquiry: "${q}"

Official Circular Records:
${contextData}

JSON Output:`;

  try {
    const useLocalOllama =
      process.env.AI_ENVIRONMENT === "local" &&
      process.env.NODE_ENV === "development";

    let rawPayload = "";

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
          options: { temperature: 0.1, num_predict: 1500 },
        }),
      } as any);

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        return emptyResult(`Local Ollama error: ${errText}`);
      }
      const ollamaData = await ollamaRes.json();
      rawPayload = ollamaData.message?.content || "";
    } else {
      if (!process.env.GROQ_API_KEY) {
        return emptyResult(
          "Executive synthesis unavailable: Missing GROQ_API_KEY configuration.",
        );
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

      if (!groqRes.ok) {
        const errorPayload = await groqRes.text();
        return emptyResult(
          `Executive synthesis error (${groqRes.status}): ${errorPayload}`,
        );
      }
      const groqData = await groqRes.json();
      rawPayload = (groqData.choices?.[0]?.message?.content || "").trim();
    }

    const sourceText = sources.map((r) => r.chunkText || "").join("\n");
    return buildResult(rawPayload, citations, validIds, sourceText);
  } catch (synthErr: any) {
    return emptyResult(
      `Executive synthesis network error: ${
        synthErr?.message || String(synthErr)
      }`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Parse the model payload -> typed SynthesisResult.
 * Chart TYPE is decided here, deterministically, from dataset.intent
 * and the shape of the data — never by the LLM.
 * ------------------------------------------------------------------ */

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function chartTypeFor(intent: RawIntent | undefined): ChartType | null {
  switch (intent) {
    case "breakdown":
      return "pie";
    case "comparison":
      return "bar";
    case "trend":
      return "line";
    case "timeline":
      return "timeline";
    case "correlation":
      return "scatter";
    case "kpi":
      return "kpi";
    default:
      return null;
  }
}

function buildChart(ds: RawDataset): SynthesisChart | null {
  const type = chartTypeFor(ds.intent);
  if (!type) return null;

  const rawItems = Array.isArray(ds.items) ? ds.items : [];
  const items: SynthesisChartItem[] = [];

  for (const it of rawItems) {
    const label = (it?.label || "").toString().trim();

    if (type === "timeline") {
      if (!label) continue;
      const v = coerceNumber(it.value);
      items.push({
        label,
        value: v ?? items.length + 1,
        detail: it.detail?.toString().trim() || undefined,
      });
      continue;
    }

    if (type === "scatter") {
      const x = coerceNumber(it.value);
      const y = coerceNumber(it.secondaryValue);
      if (x === null || y === null) continue;
      items.push({
        label: label || `${x}`,
        value: x,
        secondaryValue: y,
        detail: it.detail?.toString().trim() || undefined,
      });
      continue;
    }

    // pie / bar / line / kpi: primary value must be numeric
    if (!label) continue;
    const v = coerceNumber(it.value);
    if (v === null) continue;

    const item: SynthesisChartItem = { label, value: v };
    const sv = coerceNumber(it.secondaryValue);
    if (sv !== null) item.secondaryValue = sv;
    if (it.detail) item.detail = it.detail.toString().trim();
    items.push(item);
  }

  const min: Record<ChartType, number> = {
    pie: 2,
    bar: 1,
    line: 3,
    timeline: 2,
    scatter: 2,
    kpi: 1,
  };
  if (items.length < min[type]) return null;

  let finalType: ChartType = type;
  let finalItems = items;

  // Deterministic bar -> pie reclassification.
  // A "comparison" with only ONE category but a two-series item (value +
  // secondaryValue) is really a breakdown of that single thing into two
  // parts (e.g. one award: Winner vs Runner-up). A grouped bar with one
  // x-group reads as two floating bars; a pie of the two parts is clearer.
  if (
    type === "bar" &&
    items.length === 1 &&
    typeof items[0].secondaryValue === "number"
  ) {
    const [aLabel, bLabel] =
      Array.isArray(ds.entityLabels) && ds.entityLabels.length === 2
        ? [String(ds.entityLabels[0]), String(ds.entityLabels[1])]
        : ["Value", "Comparison"];
    finalType = "pie";
    finalItems = [
      { label: aLabel, value: items[0].value, detail: items[0].label },
      { label: bLabel, value: items[0].secondaryValue as number, detail: items[0].label },
    ];
  }

  const chart: SynthesisChart = {
    type: finalType,
    title: (ds.title || "").toString().trim() || "Overview",
    items: finalItems,
  };
  if (ds.subtitle) chart.subtitle = ds.subtitle.toString().trim();
  if (ds.unit) chart.unit = ds.unit.toString().trim();
  if (
    (finalType === "bar" || finalType === "scatter") &&
    Array.isArray(ds.entityLabels) &&
    ds.entityLabels.length === 2
  ) {
    chart.entityLabels = [
      String(ds.entityLabels[0]),
      String(ds.entityLabels[1]),
    ];
  }
  return chart;
}

/* Build the comparison table, applying three sparsity guards:
 *  (a) drop any comparison column (index >= 1) whose every body cell is empty;
 *  (b) drop rows left with no informative value after (a);
 *  (c) drop the whole table if it is still mostly empty (< 40% informative
 *      body cells) — a wall of "Not stated" is noise, the overview already
 *      states the gap.
 */
function buildTable(
  raw: { columns?: string[]; rows?: string[][] } | null | undefined,
): SynthesisTable | null {
  if (
    !raw ||
    !Array.isArray(raw.columns) ||
    raw.columns.length < 2 ||
    !Array.isArray(raw.rows) ||
    raw.rows.length === 0
  ) {
    return null;
  }

  let columns = raw.columns.map((c) => (c ?? "").toString().trim());
  const colCount = columns.length;

  let rows = raw.rows
    .filter((r) => Array.isArray(r) && r.length >= 2)
    .map((r) =>
      Array.from({ length: colCount }, (_, i) => (r[i] ?? "").toString().trim()),
    );
  if (rows.length === 0) return null;

  // (a) Identify value columns (index >= 1) that are entirely empty.
  const keepCol = columns.map((_, ci) => {
    if (ci === 0) return true; // always keep the parameter/label column
    return rows.some((r) => !isEmptyCell(r[ci]));
  });

  if (keepCol.some((k) => !k)) {
    columns = columns.filter((_, ci) => keepCol[ci]);
    rows = rows.map((r) => r.filter((_, ci) => keepCol[ci]));
  }

  // If only the label column survives, there is nothing to compare.
  if (columns.length < 2) return null;

  // (b) Drop rows whose value cells are all empty.
  rows = rows.filter((r) => r.slice(1).some((c) => !isEmptyCell(c)));
  if (rows.length === 0) return null;

  // (c) Overall informativeness of the remaining value cells.
  let valueCells = 0;
  let informative = 0;
  for (const r of rows) {
    for (let ci = 1; ci < columns.length; ci++) {
      valueCells++;
      if (!isEmptyCell(r[ci])) informative++;
    }
  }
  if (valueCells === 0 || informative / valueCells < 0.4) return null;

  // Drop DERIVED columns. A fabricated area (e.g. "Projects") is often produced
  // by copying a real column and zeroing one component. Detect a value column
  // that equals an earlier value column on every row except where one side is
  // zero/empty — that is not independent data, it is manufactured.
  const numAt = (v: string): number | null => {
    const c = v.replace(/[^0-9.\-]/g, "");
    if (c === "" || c === "-" || c === ".") return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  };
  const isTotalLabel = (label: string): boolean =>
    /total|grand|sum|net|gross/i.test(label);

  // Pure identical copy of another column (including any total rows).
  const isExactCopy = (bi: number, ai: number): boolean => {
    let real = 0;
    for (const r of rows) {
      const a = numAt(r[ai]);
      const b = numAt(r[bi]);
      if (a === null && b === null) continue;
      real++;
      if (a === null || b === null || Math.abs(a - b) >= 0.005) return false;
    }
    return real >= 3;
  };

  // Column B is DERIVED from A if, ignoring TOTAL rows (which are just the
  // consequence of the components), B equals A on the component rows except
  // where B zeroes out a component A has. A differing TOTAL is expected and is
  // NOT evidence of independence. Requires >=1 zeroed component so a genuine
  // second area (all components independently different) is never flagged.
  const isDerivedOf = (bi: number, ai: number): boolean => {
    let equalRows = 0;
    let dropRows = 0;
    let realRows = 0;
    for (const r of rows) {
      if (isTotalLabel(String(r[0]))) continue;
      const a = numAt(r[ai]);
      const b = numAt(r[bi]);
      if (a === null && b === null) continue;
      realRows++;
      if (a !== null && b !== null && Math.abs(a - b) < 0.005) {
        equalRows++;
      } else if (
        a !== null &&
        a !== 0 &&
        (b === null || b === 0 || isEmptyCell(r[bi]))
      ) {
        dropRows++; // b dropped a component that a has
      } else {
        return false; // a genuine independent value -> not derived
      }
    }
    return (
      realRows >= 3 &&
      equalRows >= 1 &&
      dropRows >= 1 &&
      equalRows + dropRows === realRows
    );
  };

  const dropCols = new Set<number>();
  for (let bi = columns.length - 1; bi >= 1; bi--) {
    for (let ai = 1; ai < bi; ai++) {
      if (dropCols.has(ai)) continue;
      if (isDerivedOf(bi, ai) || isExactCopy(bi, ai)) {
        dropCols.add(bi);
        break;
      }
    }
  }
  if (dropCols.size > 0) {
    columns = columns.filter((_, ci) => !dropCols.has(ci));
    rows = rows.map((r) => r.filter((_, ci) => !dropCols.has(ci)));
    if (columns.length < 2) return null; // nothing real left to compare
  }

  return { columns, rows };
}

/* A cell / finding that conveys no information — "Not stated in circular",
 * "N/A", "-", "—", "not available", empty, etc. */
function isEmptyCell(v: string): boolean {
  const t = v.trim().toLowerCase().replace(/[.\s]+$/g, "");
  if (t === "") return true;
  if (t === "-" || t === "—" || t === "–" || t === "n/a" || t === "na")
    return true;
  return (
    t.startsWith("not stated") ||
    t.startsWith("not specified") ||
    t.startsWith("not available") ||
    t.startsWith("not mentioned") ||
    t.startsWith("not disclosed") ||
    t.startsWith("not provided")
  );
}

/* A "finding" that is really just a statement of absence — e.g.
 * "Number of awards per month: not stated in circular". Unlike a table cell,
 * the non-informative phrase can sit anywhere in the sentence (often after a
 * colon), so we scan the whole text rather than only its start. */
function isNonFinding(text: string): boolean {
  if (isEmptyCell(text)) return true;
  const t = text.toLowerCase();
  // "... not stated / not specified / not available / not mentioned ..."
  if (/\bnot\s+(stated|specified|available|mentioned|disclosed|provided)\b/.test(t))
    return true;
  // "no figures / no data / no premium amount ... (are) specified"
  if (/\bno\s+\w+(\s+\w+)?\s+(is|are|were|was)?\s*(stated|specified|available|provided|given|disclosed)\b/.test(t))
    return true;
  return false;
}

function buildResult(
  rawJson: string,
  citations: SynthesisCitation[],
  validIds: Set<number>,
  sourceText: string,
): SynthesisResult {
  if (!rawJson) return emptyResult("No synthesis could be derived.");

  let parsed: RawPayload;
  try {
    const cleaned = rawJson
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return emptyResult("Synthesis returned no structured output.");
    parsed = JSON.parse(match[0]);
  } catch {
    return emptyResult("Synthesis output could not be parsed.");
  }

  const overview = (parsed.overview || "").toString().trim();

  // ---- NUMBER GROUNDING ----------------------------------------------------
  // Every figure shown to the executive must literally exist in the retrieved
  // circular text. Build a set of the numbers actually present in the source,
  // then strip any figure the model produced that is NOT grounded. This kills
  // hallucinated tables/charts/findings when the real table was never OCR'd,
  // without needing embeddings. Small integers (<= 31, e.g. dates/counts/step
  // numbers) are exempt from stripping to avoid false positives — the concern
  // is invented rupee amounts and rates, not "3 stages" or "24 January".
  const groundedNumbers = extractGroundedNumbers(sourceText);
  const numberIsGrounded = (n: number): boolean => {
    if (Number.isInteger(n) && Math.abs(n) <= 31) return true; // dates/small counts
    return groundedNumbers.has(normalizeNum(n));
  };
  // A string cell/finding is "figure-safe" if every substantial number in it is
  // grounded. Text with no numbers is always safe.
  const figuresSafe = (text: string): boolean => {
    const nums = extractNumbersFromText(text);
    for (const n of nums) {
      if (!numberIsGrounded(n)) return false;
    }
    return true;
  };

  const keyFindings: SynthesisFinding[] = (parsed.keyFindings || [])
    .map((f) => {
      const text = (f?.text || "").toString().trim();
      const srcs = Array.isArray(f?.sources)
        ? f!.sources!
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && validIds.has(n))
        : [];
      return { text, sources: srcs };
    })
    // Drop empty findings, pure "not stated" non-findings, AND findings that
    // assert an ungrounded figure (a hallucinated amount).
    .filter(
      (f) =>
        f.text.length > 0 && !isNonFinding(f.text) && figuresSafe(f.text),
    );

  let table: SynthesisTable | null = buildTable(parsed.table);
  if (table) table = groundTable(table, numberIsGrounded);

  const charts: SynthesisChart[] = (parsed.datasets || [])
    .map(buildChart)
    .filter((c): c is SynthesisChart => c !== null)
    .map((c) => groundChart(c, numberIsGrounded))
    .filter((c): c is SynthesisChart => c !== null);

  return {
    overview: overview || "No synthesis could be derived.",
    headline: parsed.headline?.toString().trim() || undefined,
    keyFindings,
    table,
    charts,
    citations,
  };
}

/* ---- number grounding utilities ---- */

// Normalize a number to a canonical key so 20995.30, 20995.3, "20,995.30" and
// "20995.300" all compare equal. Keep up to 2 decimals (rupee paise).
function normalizeNum(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// All numbers literally present in the source text, as a Set of normalized keys.
function extractGroundedNumbers(text: string): Set<string> {
  const set = new Set<string>();
  if (!text) return set;
  // strip thousands separators inside digit groups so "20,995.30" -> "20995.30"
  const normalized = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
  for (const m of matches) {
    const n = Number(m);
    if (Number.isFinite(n)) set.add(normalizeNum(n));
  }
  return set;
}

// Extract the substantial numbers from a piece of model text (same
// thousands-separator handling), for grounding checks.
function extractNumbersFromText(text: string): number[] {
  if (!text) return [];
  const normalized = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

// Drop table rows whose value cells contain an ungrounded number. A cell that
// is text-only (e.g. "Discontinued") is kept. If a value column ends up all
// empty, buildTable's caller already handled emptiness; here we re-run the
// emptiness guard after grounding.
function groundTable(
  table: SynthesisTable,
  ok: (n: number) => boolean,
): SynthesisTable | null {
  const rows = table.rows.filter((r) =>
    r.slice(1).every((cell) => {
      const nums = extractNumbersFromText(cell);
      return nums.every(ok);
    }),
  );
  if (rows.length === 0) return null;
  // re-check informativeness
  let valueCells = 0;
  let informative = 0;
  for (const r of rows) {
    for (let ci = 1; ci < table.columns.length; ci++) {
      valueCells++;
      if (r[ci] && r[ci].trim() !== "" && r[ci] !== "-") informative++;
    }
  }
  if (valueCells === 0 || informative / valueCells < 0.4) return null;
  return { columns: table.columns, rows };
}

// Drop chart items whose numeric value(s) are ungrounded. If too few remain for
// the chart type, drop the whole chart.
function groundChart(
  chart: SynthesisChart,
  ok: (n: number) => boolean,
): SynthesisChart | null {
  // Timeline items are label/date driven, not magnitude — keep as-is.
  if (chart.type === "timeline") return chart;

  const items = chart.items.filter((it) => {
    if (!ok(it.value)) return false;
    if (typeof it.secondaryValue === "number" && !ok(it.secondaryValue))
      return false;
    return true;
  });

  const min: Record<string, number> = {
    pie: 2,
    bar: 1,
    line: 3,
    scatter: 2,
    kpi: 1,
    timeline: 2,
  };
  if (items.length < (min[chart.type] ?? 1)) return null;
  return { ...chart, items };
}
