/**
 * Replays logged answer attempts (see answerLog.ts) through the CURRENT verification rules: no model, no network, no database. For each attempt it
 * says what happened when it was logged and what happens now, so that a change to the rules is proved on every real reply ever seen.
 */
import { parseModelAnswer, verifyAnswer, type Passage } from "./circularAnswer";

export interface LoggedAttempt {
  at?: string;
  question: string;
  ok: boolean;
  reason?: string;
  reply: string;
  passages: Passage[];
}

export interface ReplayRow {
  question: string;
  before: string;
  now: string;
  wasOk: boolean;
  nowOk: boolean;
  /** Rows of the answer the current rules show as the assistant's own wording (their labels could not be tied to the document). */
  looseRows: number;
}

export function parseJsonl(text: string): LoggedAttempt[] {
  const out: LoggedAttempt[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.question === "string" && typeof r.reply === "string" && Array.isArray(r.passages)) out.push(r);
    } catch {
      /* a half-written last line */
    }
  }
  return out;
}

export function replay(attempts: LoggedAttempt[]) {
  const rows: ReplayRow[] = attempts.map((a) => {
    const parsed = parseModelAnswer(a.reply);
    const r = parsed ? verifyAnswer(parsed, a.passages) : ({ ok: false, reason: "unverified: the model's reply was not readable" } as const);
    return {
      question: a.question,
      before: a.ok ? "accepted" : a.reason ?? "refused",
      now: r.ok ? "accepted" : r.reason,
      wasOk: a.ok,
      nowOk: r.ok,
      looseRows: r.ok ? r.value.rows.filter((x) => x.linked === false).length : 0,
    };
  });
  return {
    rows,
    summary: {
      total: rows.length,
      nowAccepted: rows.filter((x) => x.nowOk).length,
      nowRefused: rows.filter((x) => !x.nowOk).length,
      refusedThenAccepted: rows.filter((x) => !x.wasOk && x.nowOk).length,
      acceptedThenRefused: rows.filter((x) => x.wasOk && !x.nowOk).length,
    },
  };
}
