// src/lib/errorLog/report.ts
//
// ONE ERROR IN, EVERYTHING DECIDED (22 Nov 2026): mask it (scrub.ts), find its group (fingerprint), count it (store.ts), rank it when it is new (triage.ts: patterns first, the AI model for what the patterns do not know),
// and announce it when it is serious and nobody has looked (alert.ts). It never throws and never uses console.error (the server's error hook would report its own report). A flood cannot cost anything: the callers
// limit what reaches here, and the model is asked once per distinct error and at most 20 times an hour.

import { createHash } from "node:crypto";
import { createLimiter } from "@/lib/security/rateLimit";
import { pathOnly, fingerprintSource, scrubText } from "./scrub";
import { aiVerdict, ruleVerdict, type ErrorFacts } from "./triage";
import { claimAlert, ensureTables, record, setTriage, type Query } from "./store";
import { seriousNotice, type Send } from "./alert";

export interface RawError { source: "browser" | "server"; message: unknown; stack?: unknown; page?: unknown; agent?: unknown }
export interface Deps { query: Query; ask?: ((prompt: string) => Promise<string>) | null; send: Send; aiAllowed?: () => boolean }

const aiBudget = createLimiter({ max: 20, windowMs: 3_600_000 });
const defaultAiAllowed = (): boolean => aiBudget.take("ai").ok;

/** counts how many reports are being handled right now: the server's console.error hook ignores errors raised meanwhile, because they would be the report's own */
let handling = 0;
export const isReporting = (): boolean => handling > 0;

export const cleanError = (raw: RawError): { facts: ErrorFacts; stack: string; agent: string; fingerprint: string } => {
  const message = scrubText(raw.message, 1000) || "(no message)";
  const stack = scrubText(raw.stack, 3000);
  const page = pathOnly(raw.page);
  const agent = scrubText(raw.agent, 160);
  const fingerprint = createHash("sha1").update(fingerprintSource(raw.source, message, stack)).digest("hex");
  return { facts: { source: raw.source, message, stack, page }, stack, agent, fingerprint };
};

export async function reportError(raw: RawError, deps: Deps): Promise<{ id: number; severity: string; inserted: boolean } | null> {
  handling++;
  try {
    if (!(await ensureTables(deps.query))) return null;
    const c = cleanError(raw);
    const rec = await record(deps.query, { fingerprint: c.fingerprint, source: raw.source, message: c.facts.message, stack: c.stack, page: c.facts.page ?? "/", agent: c.agent });
    let severity = rec.severity;
    let note = rec.note;
    if (severity === "unrated") {
      const v = ruleVerdict(c.facts) ?? (deps.ask && (deps.aiAllowed ?? defaultAiAllowed)() ? await aiVerdict(c.facts, deps.ask) : null);
      if (v) {
        await setTriage(deps.query, rec.id, v);
        severity = v.severity;
        note = v.note;
      }
    }
    if (severity === "serious") {
      const claimed = await claimAlert(deps.query, rec.id);
      if (claimed) await deps.send(seriousNotice({ ...claimed, note: note ?? claimed.note }));
    }
    return { id: rec.id, severity, inserted: rec.inserted };
  } catch (e) {
    console.warn("error log: could not record an error:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    handling--;
  }
}
