// src/lib/errorLog/alert.ts
//
// TELLING THE DEVELOPER (22 Nov 2026). One outgoing channel, off until the owner sets it: ERROR_ALERT_WEBHOOK_URL, a web address that accepts a JSON POST (Slack, Teams, Discord, ntfy, a Telegram bridge, a mail relay's
// webhook ...). The body is {"text": "...", "content": "..."} (two names for one text, so the common services all read it). The notice is short and made of masked text only (scrub.ts): the rank, the count, the page's
// path, the first line of the masked message and the log id; never a ticket, a name, an address or a stack. Until the address is set nothing leaves the application and the developer reads the log by `npm run errors`.
// The closed intranet has no mail or SMS gateway yet (see the security assessment, decision on OTP); when it has, this is the one place to add it.

import { scrubText } from "./scrub";

export type Send = (text: string) => Promise<boolean>;

export function alertConfigured(): boolean {
  return !!(process.env.ERROR_ALERT_WEBHOOK_URL || "").trim();
}

/** posts the notice; false when no address is set or the service did not accept it. Never throws, waits at most 5 seconds. */
export const sendAlert: Send = async (text) => {
  const url = (process.env.ERROR_ALERT_WEBHOOK_URL || "").trim();
  if (!url || !/^https:\/\//i.test(url)) return false;
  try {
    const body = scrubText(text, 900);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body, content: body }), signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
};

export function seriousNotice(e: { id: number; source: string; occurrences: number; message: string; page: string | null; note: string | null }): string {
  const first = scrubText(e.message, 200).split("\n")[0];
  return `[DSP intranet] SERIOUS error #${e.id} (${e.source}, ${e.occurrences}×)${e.page ? ` on ${e.page}` : ""}: ${first}${e.note ? ` — ${e.note}` : ""} | read it: npm run errors -- show ${e.id}`;
}
