// src/lib/ui/answerHeadline.ts
//
// THE CLEAN ANSWER FIRST (owner's standing rule, 26 Oct 2026, step 57b; extended to holiday and health check-up answers in step 61a):
// for every kind of question the ONE clean, to-the-point answer stands at the top as a single big bold statement (a green Yes, a red No, or the value asked for); related data comes after; long explanations are folded away.
// The hospital card has had its headline since step 57b; this is the same thing for the other answers. The type is shared by the backend payload and the screen (AnalyticsPayload.headline, AnalyticsAnswer.headline).

export type HeadlineTone = "yes" | "no" | "info" | "unknown";

export interface AnswerHeadline {
  text: string;
  tone: HeadlineTone;
}

/** The colours: the same as the hospital card's headline. */
export const HEADLINE_CLASS: Record<HeadlineTone, string> = {
  yes: "text-green-600",
  no: "text-red-600",
  info: "text-neutral-900",
  unknown: "text-amber-600",
};

/** Under a Yes or No headline the sentence does not repeat the word: "Yes — 23 October 2025 is a holiday." -> "23 October 2025 is a holiday."; "No, 5 July 2026 is not a holiday." -> "5 July 2026 is not a holiday." */
export function afterVerdict(text: string | undefined | null): string {
  const s = String(text ?? "");
  const m = /^(?:yes|no)\s*(?:[—–-]|,|:|\.)\s*(.+)$/is.exec(s.trim());
  if (!m || !m[1].trim()) return s;
  const rest = m[1].trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
