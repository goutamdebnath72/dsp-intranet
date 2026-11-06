// src/lib/search/agentRouter.ts
//
// Agentic LLM Semantic Router for DSP Intranet Omnibar.
// Replaces fragile regexes and hardcoded keyword gates with natural language intent understanding.
// Uses Groq (LLaMA 3.3 70B / gpt-oss-120b) to semantically classify queries across DSP domains:
//   - hospital: Main hospital, doctors, OPD schedules, clinic timings, units, qualifications, employment
//   - employee_roster: employees, workforce, designations, departments, headcounts, HODs, NL2SQL
//   - circular_search: policies, rules, circulars, schemes, safety rules, PF, accommodation
//   - executive_synthesis: deep multi-document synthesis & comparison across circulars (EDS)
//   - holiday_calendar: plant holidays, restricted holidays, festival dates, calendar days off
//   - pax_directory: intercom numbers, telecom exchange extensions, office phones
//   - conversational: greetings, capability questions, direct pleasantries

export type AgentTool =
  | "hospital"
  | "employee_roster"
  | "circular_search"
  | "executive_synthesis"
  | "holiday_calendar"
  | "pax_directory"
  | "conversational";

export interface AgentRouteDecision {
  tool: AgentTool;
  confidence: number;
  reasoning: string;
  conversationalReply?: string | null;
  /** Latency in ms for classification */
  durationMs: number;
  /** Model used for classification */
  model: string;
}

const SYSTEM_PROMPT = `You are the AI Semantic Router for the Durgapur Steel Plant (DSP) Intranet Omnibar.
Your job is to understand the user's intent and select the single best tool to answer their query.
DSP is a major steel manufacturing plant of SAIL with its own township, Main Hospital, departments, and workforce.

Available Tools:
1. "hospital":
   Use for queries about DSP Hospital, doctors, OPD clinics, OPD schedules, doctor availability, room numbers, unit heads, doctor qualifications (MBBS, MD, MS, DNB, DrNB, etc.), doctor specializations, or employment status (permanent, regular, on-roll vs contractual, non-permanent, temporary, visiting).
   Examples:
   - "list the permanent doctors with their specializations"
   - "list the permanent doctors with their qualifications"
   - "who is in medicine opd on tuesday"
   - "is dr rajeev kumar permanent"
   - "contractual doctors of surgery"
   - "opd token timings"
   - "list of DNB doctors"
   - "super specialty doctors"

2. "employee_roster":
   Use for queries about DSP employees, workforce statistics, designations, grades (E-1, S-11, etc.), departments (C&IT, Blast Furnace, Coke Ovens, SMS, etc.), HODs, reporting officers, employee lookups by ticket number or name, seniority, joining or retirement queries.
   Examples:
   - "how many employees work in C&IT"
   - "who is the HOD of C&IT"
   - "senior most non-executive in Blast Furnace"
   - "find employee 498301"
   - "list executive engineers in Coke Oven"

3. "circular_search":
   Use for queries about company policies, rules, circulars, office orders, schemes, standard operating procedures, disciplinary rules, allowances, quarters, welfare schemes, pass rules, attendance policies.
   Examples:
   - "How do I return my provident fund advance before the due date?"
   - "Can a retired employee keep their company quarters in Kolkata or Mumbai?"
   - "What is the punishment if I am caught using my mobile phone while walking on the shop floor?"
   - "Does the company provide money or study leave to do an MBA or engineering degree?"
   - "How to get the cash reward for passing Hindi language exams?"
   - "Pre-Mature Repayment of Refundable PF Loan"
   - "Zero Tolerance Safety Rules"
   - "Contactless Attendance System"
   - "Gate Pass #13"

4. "executive_synthesis":
   Use ONLY for deep, multi-document synthesis questions that compare, contrast, trace evolution, or synthesize figures and timelines across multiple separate circulars.
   Examples:
   - "Trace the evolution of DSP's attendance and access control policies from 2023 to 2024..."
   - "Synthesize the financial and welfare adjustments made for contract workers between 2022 and 2025..."
   - "Compare the financial assistance and bond requirements for higher education with Hindi Teaching Scheme incentives..."
   - "Provide a briefing on mandatory employee compliance cross-referencing ZTSR with SIR Format B..."

5. "holiday_calendar":
   Use for queries about company holidays, plant holidays, restricted holidays (RH), festival dates (Durga Puja, Diwali, Eid, Republic Day), calendar days off, or number of holidays in a month or year.
   Examples:
   - "when is Durga Puja in 2026"
   - "list of holidays in November"
   - "is tomorrow a holiday"
   - "how many restricted holidays in 2026"

6. "pax_directory":
   Use for queries about DSP internal telephone extensions (PAX), land-line numbers, intercom numbers, exchange extensions, or Telecom numbers.
   Examples:
   - "pax number of fire service"
   - "who has intercom 42046"
   - "pax numbers outside plant"
   - "telecom phone number of central store"

7. "conversational":
   Use for general greetings, questions about capabilities, pleasantries, or questions that don't need database lookup.
   Examples:
   - "hi"
   - "hello"
   - "who are you"
   - "what can you help me with"

Respond STRICTLY in JSON format with this exact schema:
{
  "tool": "hospital" | "employee_roster" | "circular_search" | "executive_synthesis" | "holiday_calendar" | "pax_directory" | "conversational",
  "confidence": number between 0.0 and 1.0,
  "reasoning": "brief explanation of intent",
  "conversationalReply": "helpful direct response if conversational, otherwise null"
}`;

const VALID_TOOLS = new Set<AgentTool>([
  "hospital",
  "employee_roster",
  "circular_search",
  "executive_synthesis",
  "holiday_calendar",
  "pax_directory",
  "conversational",
]);

/**
 * Fast deterministic heuristics used ONLY as safety fallback if LLM endpoint is offline or times out.
 */
function fallbackClassification(q: string): AgentTool {
  const s = q.toLowerCase().trim();
  if (/^(hi|hello|hey|help|who are you|good morning|good afternoon)\b/i.test(s)) {
    return "conversational";
  }
  if (/\b(pax|intercom|extension|landline|phone number|telephone)\b/i.test(s)) {
    return "pax_directory";
  }
  if (/\b(holiday|holidays|rh|puja|diwali|eid|republic day|independence day|calendar off)\b/i.test(s)) {
    return "holiday_calendar";
  }
  if (/\b(doctor|doctors|dr\b|opd|clinic|specialization|qualification|dnb|mbbs|mch|mds)\b/i.test(s)) {
    return "hospital";
  }
  if (/\b(trace the evolution|synthesize|cross-referenc|compare the financial assistance|provide a briefing on mandatory)\b/i.test(s)) {
    return "executive_synthesis";
  }
  // Circular policy topics take precedence over generic word "employee"
  if (/\b(quarters?|accommodation|policy|policies|advance|provident fund|\bpf\b|loan|rules?|scheme|punishment|penalt|reward|study leave|attendance system|gate pass|safety rule)\b/i.test(s)) {
    return "circular_search";
  }
  if (/\b(employee|employees|hod|designation|ticket|roster|staff|c&it|blast furnace|coke oven)\b/i.test(s)) {
    return "employee_roster";
  }
  return "circular_search";
}

/**
 * Classifies a user query into the appropriate DSP domain tool using Groq LLM.
 */
export async function routeQueryWithAgent(
  query: string,
  opts: {
    timeoutMs?: number;
    mockLlm?: (prompt: string) => Promise<string>;
  } = {},
): Promise<AgentRouteDecision> {
  const started = Date.now();
  const q = query.trim();

  // Empty or 1-character query
  if (!q || q.length < 2) {
    return {
      tool: "conversational",
      confidence: 1.0,
      reasoning: "Empty or single-character query",
      conversationalReply: "How can I assist you with DSP intranet information today?",
      durationMs: Date.now() - started,
      model: "local",
    };
  }

  const primaryModel = process.env.AGENT_ROUTER_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const apiKey = process.env.GROQ_API_KEY;

  if (opts.mockLlm) {
    const raw = await opts.mockLlm(q);
    try {
      const parsed = JSON.parse(raw);
      return {
        tool: VALID_TOOLS.has(parsed.tool) ? parsed.tool : "circular_search",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
        reasoning: parsed.reasoning || "Mocked route",
        conversationalReply: parsed.conversationalReply ?? null,
        durationMs: Date.now() - started,
        model: "mock",
      };
    } catch {
      return {
        tool: fallbackClassification(q),
        confidence: 0.8,
        reasoning: "Fallback from invalid mock output",
        durationMs: Date.now() - started,
        model: "mock-fallback",
      };
    }
  }

  if (!apiKey) {
    const fb = fallbackClassification(q);
    return {
      tool: fb,
      confidence: 0.7,
      reasoning: "Fallback classification (GROQ_API_KEY not configured)",
      conversationalReply: fb === "conversational" ? "Hello! How can I help you navigate DSP information today?" : null,
      durationMs: Date.now() - started,
      model: "fallback",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: primaryModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Route this query: "${q}"` },
        ],
        temperature: 0.0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const chosenTool: AgentTool = VALID_TOOLS.has(parsed.tool) ? parsed.tool : fallbackClassification(q);

      return {
        tool: chosenTool,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95,
        reasoning: parsed.reasoning || "Classified by Agent Router",
        conversationalReply: parsed.conversationalReply ?? null,
        durationMs: Date.now() - started,
        model: primaryModel,
      };
    } else {
      console.warn(`[agentRouter] Groq API returned status ${res.status}; falling back.`);
    }
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[agentRouter] Call failed: ${err.message}; using fallback.`);
  }

  const fbTool = fallbackClassification(q);
  return {
    tool: fbTool,
    confidence: 0.75,
    reasoning: "Safety fallback classification",
    conversationalReply: fbTool === "conversational" ? "Hello! I am your DSP AI assistant. How can I help you today?" : null,
    durationMs: Date.now() - started,
    model: "fallback",
  };
}
