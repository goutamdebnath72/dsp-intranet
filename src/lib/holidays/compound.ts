// src/lib/holidays/compound.ts
//
// Pure helpers (no database/model imports) for QUESTIONS WITH TWO PARTS, e.g.
//   "how many restricted holidays can category B take in 2025 and which of them fall in November".
// The structured holiday engine answers one thing. Without this, the second part was silently
// dropped and the answer looked complete. Now the person is told what was not answered.

import type { HolidayDetail } from "./format";

// A connector that starts a SECOND question: "... and which ...", "..., also what ...", "...; show ...", "...? list ...".
// The connector must be followed by an interrogative / request word, so "March and April", "restricted and
// festival", "compare 2024 and 2025" are NOT treated as two questions.
const SECOND_Q_RE =
  /(?:\s*[?;]\s*|\s*,?\s+\b(?:and|also|plus|then)\b\s+)(?=(?:which|what|when|how\s+many|how\s+much|who|whom|why|where|is|are|can|could|does|do|will|would|list|show|tell)\b)/i;

/** The text of the second question, or null when the query has only one part. */
export function findSecondQuestion(raw: string): string | null {
  const text = (raw ?? "").trim();
  const m = SECOND_Q_RE.exec(text);
  if (!m) return null;
  const first = text.slice(0, m.index).trim();
  const second = text.slice(m.index + m[0].length).replace(/[?\s]+$/, "").trim();
  if (!first || !second) return null;
  return second;
}

/**
 * True when the answer card ALREADY contains what the second part asks for, so no "not answered" note is
 * needed: who it applies to (the card shows categories), why (the card shows the reason), or its type.
 */
export function coveredByDetails(second: string, details: HolidayDetail[] | undefined): boolean {
  if (!details || details.length === 0) return false;
  const s = second.toLowerCase();
  const asksWho = /\bcategor(?:y|ies)\b|\bwho\b|\bwhom\b|\bwhich\s+(?:employees|staff)\b/.test(s);
  if (asksWho && details.some((d) => d.entries.some((e) => e.audience))) return true;
  const asksWhy = /\bwhy\b|\breason\b/.test(s);
  if (asksWhy && details.some((d) => d.explanation)) return true;
  const asksType = /\b(?:type|restricted|festival|closed)\b/.test(s);
  if (asksType) return true; // every card carries the type chips
  return false;
}

export function unansweredNotice(second: string): string {
  return `Only the first part of your question was answered. Not answered: “${second}”. Please ask it as a separate question.`;
}
