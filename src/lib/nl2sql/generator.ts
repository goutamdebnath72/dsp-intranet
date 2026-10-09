// src/lib/nl2sql/generator.ts
import type { LlmPlan } from "./types";

function safeDisplayHint(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  try {
    return JSON.stringify(v).length <= 2000 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Extract and validate the model's JSON reply. Tolerates markdown fences and
 *  stray prose around the object; returns null when it is unusable. */
export function parsePlan(raw: string): LlmPlan | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: any;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const sql = typeof obj.sql === "string" && obj.sql.trim() ? obj.sql.trim() : null;
  const understood = typeof obj.understood_as === "string" ? obj.understood_as.trim() : "";
  if (!understood && sql) return null; // a runnable query must explain itself
  const conf = obj.confidence === "high" || obj.confidence === "medium" || obj.confidence === "low" ? obj.confidence : "medium";
  return {
    sql,
    understood_as: understood,
    confidence: conf,
    needs_clarification: typeof obj.needs_clarification === "string" && obj.needs_clarification.trim() ? obj.needs_clarification.trim() : null,
    unanswerable_reason: typeof obj.unanswerable_reason === "string" && obj.unanswerable_reason.trim() ? obj.unanswerable_reason.trim() : null,
    out_of_scope: obj.out_of_scope === true,
    // the presentation suggestion is optional and NEVER makes a plan invalid: anything odd is simply dropped here,
    // and display.ts verifies what is left against the real result
    display: safeDisplayHint(obj.display),
  };
}
