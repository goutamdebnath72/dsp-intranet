// src/lib/errorLog/digest.ts
//
// THE DAILY DIGEST (22 Nov 2026), run once a day by the host's scheduler (src/app/api/cron/error-digest/route.ts): it cleans the log (store.ts prune), and tells me in ONE notice what the log holds that
// I have not been told yet: the errors first seen since the last digest by rank, the serious ones still open, the errors nobody could rank, how many old entries were dropped, and which part of the log is nearly full.
// "Nearly full" is the warning I asked for before the log starts dropping its oldest entries (80% of the limit of a source). A quiet day sends nothing.

import { DateTime } from "luxon";
import { LIMIT_PER_SOURCE, digestFacts, ensureTables, getMeta, prune, setMeta, type Query } from "./store";
import { scrubText } from "./scrub";
import type { Send } from "./alert";

export async function runDigest(q: Query, send: Send): Promise<{ ran: boolean; sent: boolean; dropped: number; text: string | null }> {
  if (!(await ensureTables(q))) return { ran: false, sent: false, dropped: 0, text: null };
  const now = DateTime.now().toUTC();
  const since = (await getMeta(q, "last_digest")) ?? now.minus({ days: 1 }).toISO();
  const dropped = await prune(q);
  const f = await digestFacts(q, since as string);
  const sizes = await q(`SELECT source, count(*)::int AS n FROM public.app_error_log GROUP BY source`);
  const nearlyFull = sizes.filter((s) => Number(s.n) >= LIMIT_PER_SOURCE * 0.8).map((s) => `${String(s.source)} ${Number(s.n)}/${LIMIT_PER_SOURCE}`);
  const fresh = Object.values(f.fresh).reduce((a, b) => a + b, 0);
  const lines: string[] = [];
  if (fresh) lines.push(`${fresh} new since the last digest (serious ${f.fresh.serious ?? 0}, minor ${f.fresh.minor ?? 0}, noise ${f.fresh.noise ?? 0}, unrated ${f.fresh.unrated ?? 0})`);
  if (f.openSerious.length) lines.push(`open serious: ${f.openSerious.slice(0, 5).map((r) => `#${r.id} ${scrubText(r.message, 80).split("\n")[0]} (${r.occurrences}×, ${r.status})`).join("; ")}`);
  if (f.unrated) lines.push(`${f.unrated} not ranked yet (no pattern, model unavailable or over its hourly limit)`);
  if (dropped) lines.push(`LOG CLEANED: ${dropped} old entr${dropped === 1 ? "y was" : "ies were"} dropped`);
  if (nearlyFull.length) lines.push(`LOG NEARLY FULL: ${nearlyFull.join(", ")} (the oldest entries are dropped at the limit): resolve or review them`);
  await setMeta(q, "last_digest", now.toISO() as string);
  if (!lines.length) return { ran: true, sent: false, dropped, text: null };
  const text = `[DSP intranet] Error digest — ${lines.join(" | ")} | read: npm run errors`;
  return { ran: true, sent: await send(text), dropped, text };
}
