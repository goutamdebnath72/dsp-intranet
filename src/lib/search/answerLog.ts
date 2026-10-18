/**
 * The log of answer attempts (server only; nothing is written unless ANSWER_LOG_FILE is set, e.g. ANSWER_LOG_FILE=reread-reports/answers.jsonl in
 * .env.local; that folder is ignored by Git). One JSON line per attempt: the question, the verdict, the model's own reply and the exact passages the
 * model was shown. `scripts/answer-replay.ts` re-runs the whole file through the CURRENT rules with no model call, so a refusal is understood, fixed
 * and proved from the file instead of one query at a time.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Passage, VerifyResult } from "./circularAnswer";

export interface LoggedAnswer {
  at: string;
  question: string;
  ok: boolean;
  reason?: string;
  reply: string;
  passages: Passage[];
}

export function appendAnswerLog(file: string, rec: LoggedAnswer): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(rec) + "\n");
  } catch {
    /* a log must never break an answer */
  }
}

/** Records the attempt when ANSWER_LOG_FILE is set and the model really replied (nothing to replay otherwise). */
export function logAnswer(question: string, passages: Passage[], result: VerifyResult): void {
  const file = process.env.ANSWER_LOG_FILE;
  if (!file || !result.reply) return;
  appendAnswerLog(file, { at: new Date().toISOString(), question, ok: result.ok, reason: result.ok ? undefined : result.reason, reply: result.reply, passages });
}
