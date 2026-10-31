// src/lib/nl2sql/healthHeadline.ts
//
// THE CLEAN ANSWER FIRST for a health check-up lookup of ONE person (step 61a): "when is the health check-up of ticket 266288?" -> the date (or the dates), big and bold, above the row;
// "which department is ticket 228757 in for the January 2026 health check-up?" -> the department. Computed from the rows the SQL returned (never by the model), only when ALL the rows are
// about one ticket (or one name) and the question plainly asks WHEN or WHICH DEPARTMENT. A list ("who has the health check-up on 5 January 2026") keeps its count; anything else gets no headline.

import { DateTime } from "luxon";
import type { AnswerHeadline } from "@/lib/ui/answerHeadline";

const ASKS_WHEN = /^\s*(?:when|on\s+what\s+(?:date|day)|what\s+(?:date|day)|which\s+(?:date|day))\b|\bwhen\s+(?:is|are|will|does|do|did)\b/i;
const ASKS_DEPARTMENT = /\b(?:which|what)\s+(?:department|section)\b|\bdepartment\s+(?:is|does)\b|\bsection\s+is\b/i;

const clean = (v: unknown): string => String(v ?? "").trim();

/** 2026-01-05 (or a Date) -> "05 Jan 2026". Anything that is not a date -> null. */
export function formatCheckupDate(v: unknown): string | null {
  const iso = v instanceof Date ? DateTime.fromJSDate(v).toISODate() : clean(v).slice(0, 10);
  const d = iso ? DateTime.fromISO(iso) : null;
  return d && d.isValid ? d.toFormat("dd LLL yyyy") : null;
}

export function healthHeadline(question: string, columns: string[], rows: Record<string, unknown>[]): AnswerHeadline | null {
  if (!/check\s*-?\s*up/i.test(question) || !rows.length || rows.length > 6) return null;
  const who = columns.includes("ticket_no") ? "ticket_no" : columns.includes("name") ? "name" : null;
  if (!who || new Set(rows.map((r) => clean(r[who]))).size !== 1 || !clean(rows[0][who])) return null; // one person only
  if (columns.includes("checkup_date") && ASKS_WHEN.test(question)) {
    const dates = [...new Set(rows.map((r) => clean(r.checkup_date).slice(0, 10)).filter(Boolean))].sort().map(formatCheckupDate);
    if (!dates.length || dates.some((d) => d === null)) return null;
    return { text: (dates as string[]).join(" and "), tone: "info" };
  }
  if (columns.includes("department") && ASKS_DEPARTMENT.test(question)) {
    const deps = [...new Set(rows.map((r) => clean(r.department)).filter(Boolean))];
    if (deps.length === 1) return { text: deps[0], tone: "info" };
  }
  return null;
}
